import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Play, Share2, Video } from 'lucide-react';
import { Modal, Spinner } from '../ui';
import { downloadBlob, matchSlug } from '../../services/export';
import {
  DEFAULT_GOAL_CARD,
  DURATION,
  GOAL_CARD_SIZES,
  buildGoalCardData,
  createRenderer,
  renderMp4,
  renderPng,
  type GoalCardData,
  type GoalCardOptions,
  type GoalCardRenderer,
} from '../../services/goalCard';
import { formatMinute } from '../../services/score';
import { useApp } from '../../store/appStore';
import type { Match } from '../../types';

const PREFS_KEY = 'goalCardPrefs';

function loadPrefs(): GoalCardOptions {
  try {
    return { ...DEFAULT_GOAL_CARD, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_GOAL_CARD;
  }
}

export function GoalCardModal({ match, goalId, onClose }: { match: Match; goalId: string; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const toast = useApp((s) => s.toast);
  const [opts, setOpts] = useState<GoalCardOptions>(loadPrefs);
  const [data, setData] = useState<GoalCardData | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GoalCardRenderer | null>(null);
  const startRef = useRef(0);
  const goal = match.goals.find((g) => g.id === goalId);

  useEffect(() => {
    buildGoalCardData(match, goalId, settings)
      .then(setData)
      .catch((e) => toast((e as Error).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(opts));
    } catch {
      /* preferences are optional */
    }
    setFile(null);
  }, [opts]);

  // Live preview loop (half resolution); restarts when options change.
  useEffect(() => {
    if (!data) return;
    const r = createRenderer(data, { ...opts, bg: opts.bg === 'photo' && !data.hasPhoto ? 'red' : opts.bg });
    rendererRef.current = r;
    const c = canvasRef.current!;
    const k = 0.5;
    c.width = r.width * k;
    c.height = r.height * k;
    const ctx = c.getContext('2d')!;
    startRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min((performance.now() - startRef.current) / 1000, DURATION);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      r.draw(ctx, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, opts]);

  const set = (p: Partial<GoalCardOptions>) => setOpts((o) => ({ ...o, ...p }));
  const baseName = `gol-${matchSlug(match)}-${goal ? formatMinute(goal).replace(/\D+/g, '-').replace(/-$/, '') : ''}-${opts.format}`;

  const exportMp4 = async () => {
    if (!rendererRef.current) return;
    setBusy(0);
    try {
      const blob = await renderMp4(rendererRef.current, (p) => setBusy(p));
      downloadBlob(blob, `${baseName}.mp4`);
      setFile(new File([blob], `${baseName}.mp4`, { type: 'video/mp4' }));
      toast('Video MP4 pronto per WhatsApp e Instagram.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportPng = async () => {
    if (!rendererRef.current) return;
    downloadBlob(await renderPng(rendererRef.current), `${baseName}.png`);
  };

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  return (
    <Modal title="Card gol animata" onClose={onClose} width={900}>
      {!data ? (
        <div className="row muted">
          <Spinner /> Preparazione…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', placeItems: 'center', background: '#000', borderRadius: 10, padding: 10 }}>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '62vh', borderRadius: 6 }} />
          </div>
          <div className="section">
            <div className="field">
              <label>Formato</label>
              <div className="btn-group">
                {(Object.keys(GOAL_CARD_SIZES) as GoalCardOptions['format'][]).map((f) => (
                  <button key={f} className={`btn sm ${opts.format === f ? 'active' : ''}`} onClick={() => set({ format: f })} title={GOAL_CARD_SIZES[f].label}>
                    {f === 'story' ? 'Storia / Reel' : 'Post'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Sfondo</label>
              <div className="btn-group">
                <button className={`btn sm ${opts.bg === 'red' ? 'active' : ''}`} onClick={() => set({ bg: 'red' })}>
                  Colore
                </button>
                <button className={`btn sm ${opts.bg === 'dark' ? 'active' : ''}`} onClick={() => set({ bg: 'dark' })}>
                  Scuro
                </button>
                <button className={`btn sm ${opts.bg === 'photo' ? 'active' : ''}`} disabled={!data.hasPhoto} title={data.hasPhoto ? '' : 'Carica una foto della partita nella scheda Extra'} onClick={() => set({ bg: 'photo' })}>
                  Foto partita
                </button>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Scritta</label>
                <input className="input sm" value={opts.title} maxLength={14} onChange={(e) => set({ title: e.target.value || 'Gol!' })} />
              </div>
              <div className="field">
                <label>Colore</label>
                <input className="input sm" type="color" value={opts.accent} onChange={(e) => set({ accent: e.target.value })} style={{ padding: 2, height: 32 }} />
              </div>
            </div>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={opts.showSponsor} disabled={!data.sponsor} onChange={(e) => set({ showSponsor: e.target.checked })} /> Mostra main sponsor
              {!data.sponsor && <span className="faint">(nessuno impostato)</span>}
            </label>
            <div className="faint small" style={{ lineHeight: 1.5 }}>
              Risultato dopo questo gol: {match.homeName} {data.next.home} – {data.next.away} {match.awayName}
              {!data.scorer && ' · Marcatore non indicato: verrà mostrato il nome della squadra.'}
            </div>

            <button className="btn" onClick={() => (startRef.current = performance.now())}>
              <Play size={14} /> Rivedi animazione
            </button>
            <button className="btn primary" onClick={exportMp4} disabled={busy !== null}>
              {busy !== null ? <Spinner /> : <Video size={15} />} {busy !== null ? `Creazione video ${Math.round(busy * 100)}%` : 'Scarica video MP4'}
            </button>
            {busy !== null && (
              <div style={{ height: 6, borderRadius: 3, background: 'var(--panel-3)', overflow: 'hidden' }}>
                <div style={{ width: `${busy * 100}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
            )}
            {canShare && (
              <button className="btn" onClick={() => navigator.share({ files: [file!] }).catch(() => undefined)}>
                <Share2 size={14} /> Condividi (WhatsApp, Instagram…)
              </button>
            )}
            <button className="btn" onClick={exportPng}>
              <ImageIcon size={14} /> Scarica immagine PNG
            </button>
            <div className="faint small" style={{ lineHeight: 1.5 }}>
              <Download size={11} /> Video MP4 H.264 da {DURATION} secondi, 30 fps: si pubblica così com'è su canale WhatsApp, storie e Reel di Instagram.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
