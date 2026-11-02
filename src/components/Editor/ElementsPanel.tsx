import { useState } from 'react';
import { Circle, Database, Image as ImageIcon, Minus, PenTool, Search, Shield, Square, Type } from 'lucide-react';
import { editor } from '../../editor/controller';
import { placeholderFor } from '../../editor/serialization';
import { getAssetUrl } from '../../services/assets';
import { IMAGE_BINDING_LABELS, TEXT_BINDING_LABELS, imageAssetFor, resolveText, type ImageBinding, type TextBinding } from '../../services/bindings';
import { SANS_FONT, SCORE_FONT, SCRIPT_FONT } from '../../services/fonts';
import { FileError, IMAGE_TYPES, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import type { GraphicKind, Match } from '../../types';
import { LogoImg } from '../ui';
import { SponsorPanel } from './SponsorPanel';

export function ElementsPanel({ match, kind }: { match: Match; kind: GraphicKind }) {
  const settings = useApp((s) => s.settings);
  const assets = useApp((s) => s.assets);
  const addAsset = useApp((s) => s.addAsset);
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState('');
  const u = editor.width / 1080;

  const addBoundText = (b: TextBinding) => {
    const big = b === 'score' || b === 'homeScore' || b === 'awayScore';
    editor.addText({
      text: resolveText(b, match, kind, settings) || TEXT_BINDING_LABELS[b],
      name: TEXT_BINDING_LABELS[b],
      binding: b,
      autoText: true,
      fontFamily: big ? SCORE_FONT : SANS_FONT,
      fontWeight: big ? 700 : 400,
      fontSize: (big ? 160 : 30) * u,
    } as any);
  };

  const addBoundImage = async (b: ImageBinding) => {
    const id = imageAssetFor(b, match, settings);
    const url = (await getAssetUrl(id)) ?? placeholderFor(b);
    await editor.addImage(url, { name: IMAGE_BINDING_LABELS[b], assetId: id, binding: b, fitMode: b === 'photo' ? 'cover' : 'contain' });
  };

  const addLibraryLogo = async (id: string, name: string) => {
    const url = await getAssetUrl(id);
    if (url) await editor.addImage(url, { name, assetId: id });
  };

  const uploadImage = async () => {
    const [file] = await pickFile('.png,.jpg,.jpeg,.webp,.svg');
    if (!file) return;
    try {
      const blob = await prepareImage(file, IMAGE_TYPES, "l'immagine");
      const meta = await addAsset(blob, 'image', fileBaseName(file.name));
      const url = await getAssetUrl(meta.id);
      if (url) await editor.addImage(url, { name: meta.name, assetId: meta.id });
    } catch (e) {
      toast(e instanceof FileError ? e.message : "Impossibile caricare l'immagine.", 'error');
    }
  };

  const logos = assets.filter((a) => a.kind === 'logo' && !a.archived && a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="section">
        <div className="section-title">Testi</div>
        <div className="add-grid">
          <button
            className="add-btn"
            onClick={() =>
              editor.addText({ text: 'Matchday', name: 'Titolo calligrafico', fontFamily: SCRIPT_FONT, fontSize: 150 * u, width: 1000 * u, lineHeight: 1 } as any)
            }
          >
            <PenTool size={15} /> Titolo calligrafico
          </button>
          <button className="add-btn" onClick={() => editor.addText({ text: 'Titolo', name: 'Titolo', fontWeight: 700, fontSize: 80 * u, charSpacing: 60 } as any)}>
            <Type size={15} /> Titolo
          </button>
          <button className="add-btn" onClick={() => editor.addText({ text: 'Testo', name: 'Testo', fontSize: 34 * u } as any)}>
            <Type size={13} /> Testo
          </button>
          <button
            className="add-btn"
            onClick={() => editor.addText({ text: 'SOTTOTITOLO', name: 'Sottotitolo', fontSize: 22 * u, charSpacing: 250, fontWeight: 500 } as any)}
          >
            <Type size={11} /> Sottotitolo
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Forme</div>
        <div className="add-grid">
          <button className="add-btn" onClick={() => editor.addRect()}>
            <Square size={15} /> Rettangolo
          </button>
          <button className="add-btn" onClick={() => editor.addCircle()}>
            <Circle size={15} /> Cerchio
          </button>
          <button className="add-btn" onClick={() => editor.addLine(false)}>
            <Minus size={15} /> Linea
          </button>
          <button className="add-btn" onClick={() => editor.addLine(true)}>
            <Minus size={15} style={{ transform: 'rotate(90deg)' }} /> Divisore
          </button>
          <button className="add-btn" onClick={uploadImage} style={{ gridColumn: '1 / -1' }}>
            <ImageIcon size={15} /> Carica immagine / decorazione
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <Database size={12} /> Dati della partita
        </div>
        <div className="faint small">Elementi collegati: si aggiornano automaticamente con i dati e i marcatori.</div>
        <div className="add-grid">
          {(Object.keys(IMAGE_BINDING_LABELS) as ImageBinding[]).filter((b) => b !== 'spMain').map((b) => (
            <button key={b} className="add-btn" onClick={() => addBoundImage(b)}>
              {b === 'photo' ? <ImageIcon size={14} /> : <Shield size={14} />} {IMAGE_BINDING_LABELS[b]}
            </button>
          ))}
          {(Object.keys(TEXT_BINDING_LABELS) as TextBinding[]).map((b) => (
            <button key={b} className="add-btn" onClick={() => addBoundText(b)}>
              <Type size={13} /> {TEXT_BINDING_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <SponsorPanel />

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
