import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getAssetUrl } from '../../services/assets';
import { downloadBlob, matchSlug } from '../../services/export';
import { sameTeam } from '../../services/standings';
import { useApp } from '../../store/appStore';
import type { GraphicKind, Match } from '../../types';
import { KIND_LABELS } from '../../types';
import { Modal, Spinner } from '../ui';

/* Simple icon outlines (24×24 viewBox). */
const ICONS = {
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  comment: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  send: 'M22 2 15 22l-4-9-9-4Z M22 2 11 13',
  bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};

function icon(ctx: CanvasRenderingContext2D, d: string, x: number, y: number, size: number, color = '#ffffff', width = 2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(d));
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function avatar(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, cx: number, cy: number, r: number) {
  // Story-style gradient ring.
  const g = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
  g.addColorStop(0, '#f59e0b');
  g.addColorStop(0.5, '#e11d48');
  g.addColorStop(1, '#a21caf');
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#1c1c22';
  ctx.fill();
  if (logo) {
    const s = Math.min((r * 1.4) / logo.width, (r * 1.4) / logo.height);
    ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Instagram feed post mockup (dark UI). */
function drawPost(art: HTMLImageElement, logo: HTMLImageElement | null, user: string, caption: string): HTMLCanvasElement {
  const W = 1080;
  const imgH = Math.round((W * art.height) / art.width);
  const H = 120 + imgH + 250;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  avatar(ctx, logo, 62, 60, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '600 30px Inter, sans-serif';
  ctx.fillText(user, 116, 58);
  ctx.font = '400 24px Inter, sans-serif';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('Post in evidenza', 116, 90);
  icon(ctx, ICONS.dots, W - 70, 42, 36);
  ctx.drawImage(art, 0, 120, W, imgH);
  const iy = 120 + imgH + 26;
  icon(ctx, ICONS.heart, 28, iy, 50, '#ff3040', 2);
  ctx.save();
  ctx.translate(28, iy);
  ctx.scale(50 / 24, 50 / 24);
  ctx.fillStyle = '#ff3040';
  ctx.fill(new Path2D(ICONS.heart));
  ctx.restore();
  icon(ctx, ICONS.comment, 106, iy, 50);
  icon(ctx, ICONS.send, 184, iy, 50);
  icon(ctx, ICONS.bookmark, W - 76, iy, 50);
  ctx.fillStyle = '#fff';
  ctx.font = '600 28px Inter, sans-serif';
  ctx.fillText('Piace ai tifosi e ad altri', 30, iy + 100);
  ctx.font = '600 28px Inter, sans-serif';
  const userW = ctx.measureText(user + ' ').width;
  ctx.fillText(user, 30, iy + 146);
  ctx.font = '400 28px Inter, sans-serif';
  ctx.fillText(caption, 30 + userW, iy + 146);
  ctx.fillStyle = '#71717a';
  ctx.font = '400 22px Inter, sans-serif';
  ctx.fillText('ANTEPRIMA · MATCHDAY STUDIO', 30, iy + 190);
  return c;
}

/** Instagram story inside a phone frame. */
function drawStory(art: HTMLImageElement, logo: HTMLImageElement | null, user: string): HTMLCanvasElement {
  const SW = 1080;
  const SH = 1920;
  const pad = 60;
  const c = document.createElement('canvas');
  c.width = SW + pad * 2;
  c.height = SH + pad * 2;
  const ctx = c.getContext('2d')!;
  // Phone body
  ctx.fillStyle = '#0b0b0e';
  roundRect(ctx, 0, 0, c.width, c.height, 150);
  ctx.fill();
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, c.width - 6, c.height - 6, 148);
  ctx.stroke();
  // Screen
  ctx.save();
  roundRect(ctx, pad, pad, SW, SH, 100);
  ctx.clip();
  const story = art.width / art.height < 0.6;
  if (story) {
    ctx.drawImage(art, pad, pad, SW, SH);
  } else {
    // Blurred cover background + full graphic in the middle, as Instagram does for non 9:16 posts.
    const s = Math.max(SW / art.width, SH / art.height);
    ctx.filter = 'blur(40px) brightness(0.55)';
    ctx.drawImage(art, pad + (SW - art.width * s) / 2, pad + (SH - art.height * s) / 2, art.width * s, art.height * s);
    ctx.filter = 'none';
    const w = SW - 80;
    const h = (w * art.height) / art.width;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 40;
    ctx.drawImage(art, pad + 40, pad + (SH - h) / 2, w, h);
    ctx.shadowBlur = 0;
  }
  // Top gradient, progress bar, header
  const g = ctx.createLinearGradient(0, pad, 0, pad + 260);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(pad, pad, SW, 260);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, pad + 24, pad + 22, SW - 48, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(ctx, pad + 24, pad + 22, (SW - 48) * 0.45, 6, 3);
  ctx.fill();
  avatar(ctx, logo, pad + 70, pad + 90, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px Inter, sans-serif';
  ctx.fillText(user, pad + 118, pad + 100);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '400 28px Inter, sans-serif';
  ctx.fillText('ora', pad + 128 + ctx.measureText(user).width + 20, pad + 100);
  // Reply bar
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  roundRect(ctx, pad + 30, pad + SH - 130, SW - 200, 84, 42);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '400 28px Inter, sans-serif';
  ctx.fillText('Invia messaggio', pad + 70, pad + SH - 78);
  icon(ctx, ICONS.heart, pad + SW - 150, pad + SH - 112, 48);
  icon(ctx, ICONS.send, pad + SW - 80, pad + SH - 112, 48);
  ctx.restore();
  return c;
}

export function MockupModal({ match, kind, render, onClose }: { match: Match; kind: GraphicKind; render: () => Promise<Blob>; onClose: () => void }) {
  const teams = useApp((s) => s.teams);
  const favorite = useApp((s) => s.settings.league?.favoriteTeam ?? '');
  const [post, setPost] = useState<string | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile: the club followed in the standings (else the home team).
  const club = teams.find((t) => favorite && sameTeam(t.name, favorite));
  const clubName = club?.name ?? match.homeName ?? 'squadra';
  const logoId = club?.logoId ?? match.homeLogoId;
  const user = clubName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await render();
      const art = await loadImage(URL.createObjectURL(blob));
      const logoUrl = await getAssetUrl(logoId);
      const logo = logoUrl ? await loadImage(logoUrl).catch(() => null) : null;
      if (!alive) return;
      setPost(drawPost(art, logo, user, `${KIND_LABELS[kind]} ⚽ ${match.homeName} – ${match.awayName}`).toDataURL('image/png'));
      setStory(drawStory(art, logo, user).toDataURL('image/png'));
    })().catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const save = async (dataUrl: string, name: string) => downloadBlob(await (await fetch(dataUrl)).blob(), `${matchSlug(match)}_mockup-${name}.png`);

  return (
    <Modal title="Anteprima mockup" onClose={onClose} width={980}>
      <p className="muted" style={{ marginTop: 0 }}>Come apparirà la grafica su Instagram: utile per controllare leggibilità e visibilità degli sponsor.</p>
      {error && <div style={{ color: '#fca5a5' }}>Errore: {error}</div>}
      {!post && !error ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 300 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
          {[
            ['Post nel feed', post, 'post'],
            ['Storia', story, 'storia'],
          ].map(([label, url, key]) =>
            url ? (
              <div key={key} className="section" style={{ gap: 8 }}>
                <div className="section-title">{label}</div>
                <img src={url} alt="" style={{ width: '100%', maxHeight: 560, objectFit: 'contain', borderRadius: 10, background: '#000' }} />
                <button className="btn sm" onClick={() => save(url, key!)}>
                  <Download size={14} /> Scarica mockup {label!.toLowerCase()}
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}
    </Modal>
  );
}
