import { useState } from 'react';
import { Circle, Database, Image as ImageIcon, Minus, PenTool, Search, Shield, Square, Type } from 'lucide-react';
import { editor } from '../../editor/controller';
import { placeholderFor } from '../../editor/serialization';
import { GOAL_BINDING_LABELS, previewGoalText } from '../../editor/goalBindings';
import { DEFAULT_ANIM } from '../../editor/videoAnim';
import { getAssetUrl } from '../../services/assets';
import { IMAGE_BINDING_LABELS, imageAssetFor, type GoalBinding, type ImageBinding } from '../../services/bindings';
import { SANS_FONT, SCORE_FONT, SCRIPT_FONT } from '../../services/fonts';
import { FileError, IMAGE_TYPES, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import type { Match } from '../../types';
import { LogoImg } from '../ui';

const GOAL_IMAGE_BINDINGS: ImageBinding[] = ['homeLogo', 'awayLogo', 'spMain'];

/** Left-panel "insert element" tab for the goal video editor: goal/match-bound elements, plus free text/shapes. */
export function GoalElementsPanel({ match, goalId }: { match: Match; goalId: string | null }) {
  const settings = useApp((s) => s.settings);
  const assets = useApp((s) => s.assets);
  const addAsset = useApp((s) => s.addAsset);
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState('');
  const u = editor.width / 1080;

  const afterAdd = () => {
    const obj = editor.active;
    if (obj && !obj.anim) {
      obj.anim = DEFAULT_ANIM;
      editor.record();
    }
  };

  const addGoalText = (b: GoalBinding) => {
    const big = b === 'goal:scorer' || b === 'goal:scoreAfter';
    editor.addText({
      text: previewGoalText(b, match, goalId, settings),
      name: GOAL_BINDING_LABELS[b],
      binding: b,
      autoText: true,
      fontFamily: big ? SCORE_FONT : SANS_FONT,
      fontWeight: big ? 700 : 500,
      fontSize: (big ? 140 : 32) * u,
      textAlign: 'center',
      anim: DEFAULT_ANIM,
    } as any);
  };

  const addMatchText = (binding: 'homeName' | 'awayName') => {
    editor.addText({
      text: (binding === 'homeName' ? match.homeName : match.awayName) || (binding === 'homeName' ? 'Casa' : 'Ospite'),
      name: binding === 'homeName' ? 'Nome squadra casa' : 'Nome squadra ospite',
      binding,
      autoText: true,
      fontSize: 32 * u,
      textAlign: 'center',
      anim: DEFAULT_ANIM,
    } as any);
  };

  const addGoalImage = async (b: ImageBinding) => {
    const id = imageAssetFor(b, match, settings);
    const url = (await getAssetUrl(id)) ?? placeholderFor(b);
    await editor.addImage(url, { name: IMAGE_BINDING_LABELS[b], assetId: id, binding: b, fitMode: b === 'spMain' ? 'contain' : 'contain' });
    afterAdd();
  };

  const addLibraryLogo = async (id: string, name: string) => {
    const url = await getAssetUrl(id);
    if (url) {
      await editor.addImage(url, { name, assetId: id });
      afterAdd();
    }
  };

  const uploadImage = async () => {
    const [file] = await pickFile('.png,.jpg,.jpeg,.webp,.svg');
    if (!file) return;
    try {
      const blob = await prepareImage(file, IMAGE_TYPES, "l'immagine");
      const meta = await addAsset(blob, 'image', fileBaseName(file.name));
      const url = await getAssetUrl(meta.id);
      if (url) {
        await editor.addImage(url, { name: meta.name, assetId: meta.id });
        afterAdd();
      }
    } catch (e) {
      toast(e instanceof FileError ? e.message : "Impossibile caricare l'immagine.", 'error');
    }
  };

  const addFreeText = (opts: Record<string, any>) => editor.addText({ ...opts, anim: DEFAULT_ANIM } as any);

  const logos = assets.filter((a) => a.kind === 'logo' && !a.archived && a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="section">
        <div className="section-title">
          <Database size={12} /> Dati del gol
        </div>
        <div className="faint small">Si aggiornano da soli con marcatore, minuto, squadra e risultato del gol scelto.</div>
        <div className="add-grid">
          {(Object.keys(GOAL_BINDING_LABELS) as GoalBinding[]).map((b) => (
            <button key={b} className="add-btn" onClick={() => addGoalText(b)}>
              <Type size={13} /> {GOAL_BINDING_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Dati della partita</div>
        <div className="add-grid">
          <button className="add-btn" onClick={() => addMatchText('homeName')}>
            <Type size={13} /> Nome squadra casa
          </button>
          <button className="add-btn" onClick={() => addMatchText('awayName')}>
            <Type size={13} /> Nome squadra ospite
          </button>
          {GOAL_IMAGE_BINDINGS.map((b) => (
            <button key={b} className="add-btn" onClick={() => addGoalImage(b)}>
              {b === 'spMain' ? <ImageIcon size={14} /> : <Shield size={14} />} {IMAGE_BINDING_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Testi</div>
        <div className="add-grid">
          <button className="add-btn" onClick={() => addFreeText({ text: 'Gol', name: 'Titolo calligrafico', fontFamily: SCRIPT_FONT, fontSize: 280 * u, width: 1000 * u, lineHeight: 1, textAlign: 'center' })}>
            <PenTool size={15} /> Titolo calligrafico
          </button>
          <button className="add-btn" onClick={() => addFreeText({ text: 'Titolo', name: 'Titolo', fontWeight: 700, fontSize: 80 * u, charSpacing: 60 })}>
            <Type size={15} /> Titolo
          </button>
          <button className="add-btn" onClick={() => addFreeText({ text: 'Testo', name: 'Testo', fontSize: 34 * u })}>
            <Type size={13} /> Testo
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Forme</div>
        <div className="add-grid">
          <button className="add-btn" onClick={() => (editor.addRect(), afterAdd())}>
            <Square size={15} /> Rettangolo
          </button>
          <button className="add-btn" onClick={() => (editor.addCircle(), afterAdd())}>
            <Circle size={15} /> Cerchio
          </button>
          <button className="add-btn" onClick={() => (editor.addLine(false), afterAdd())}>
            <Minus size={15} /> Linea
          </button>
          <button className="add-btn" onClick={uploadImage} style={{ gridColumn: '1 / -1' }}>
            <ImageIcon size={15} /> Carica immagine / decorazione
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Libreria loghi</div>
        <div className="search">
          <Search size={14} />
          <input className="input sm" placeholder="Cerca logo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {logos.map((l) => (
            <button key={l.id} className="btn" style={{ height: 58, padding: 4 }} title={`Aggiungi ${l.name}`} onClick={() => addLibraryLogo(l.id, l.name)}>
              <LogoImg assetId={l.id} />
            </button>
          ))}
        </div>
        {!logos.length && <div className="faint small">Nessun logo. Caricali dalla Libreria loghi.</div>}
      </div>
    </>
  );
}
