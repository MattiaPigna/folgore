import { FabricImage } from 'fabric';
import { Crop, ImagePlus, Lock, Maximize, MousePointer2, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { editor } from '../../editor/controller';
import { getAssetUrl } from '../../services/assets';
import { BG_TYPES, FileError, PHOTO_MAX_SIDE, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import { useEditorUI } from '../../store/editorStore';
import { Dropzone, SliderRow } from '../ui';
import { ImageEffectsSection } from './ImageEffectsSection';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function BackgroundManager() {
  useEditorUI((s) => s.version);
  const addAsset = useApp((s) => s.addAsset);
  const toast = useApp((s) => s.toast);
  const bg = editor.background;
  const img = bg instanceof FabricImage ? bg : null;

  const upload = async (file?: File) => {
    const f = file ?? (await pickFile('.jpg,.jpeg,.png,.webp'))[0];
    if (!f) return;
    try {
      const blob = await prepareImage(f, BG_TYPES, 'lo sfondo', PHOTO_MAX_SIDE);
      const meta = await addAsset(blob, 'background', fileBaseName(f.name));
      const url = await getAssetUrl(meta.id);
      if (url) await editor.setBackgroundImage(url, meta.id);
      toast('Sfondo aggiornato.', 'success');
    } catch (e) {
      toast(e instanceof FileError ? e.message : 'Impossibile caricare lo sfondo.', 'error');
    }
  };

  const crop = img ? editor.getCrop(img) : null;

  return (
    <>
      <div className="section">
        <div className="section-title">Sfondo di questa grafica</div>
        <div className="faint small">Ogni grafica (Matchday, Half Time, Full Time, Post Match) ha il proprio sfondo indipendente.</div>
        <Dropzone accept=".jpg,.jpeg,.png,.webp" onFiles={(f) => upload(f[0])}>
          <ImagePlus size={20} style={{ marginBottom: 6 }} />
          <div style={{ fontWeight: 600 }}>{img ? 'Sostituisci sfondo' : 'Carica sfondo'}</div>
          <div className="small faint">JPG, JPEG, PNG, WEBP · trascina qui o clicca</div>
        </Dropzone>
        {bg && (
          <div className="row wrap">
            <button className="btn sm" onClick={() => editor.select(bg)} disabled={!!bg.lockedLayer} title="Seleziona per spostarlo o ridimensionarlo sulla tela">
              <MousePointer2 size={13} /> Seleziona
            </button>
            <button className={`btn sm ${bg.lockedLayer ? 'active' : ''}`} onClick={() => editor.setLocked(bg, !bg.lockedLayer)}>
              {bg.lockedLayer ? <Lock size={13} /> : <Unlock size={13} />} {bg.lockedLayer ? 'Bloccato' : 'Blocca'}
            </button>
            {img && (
              <button className="btn sm danger" onClick={() => editor.removeBackgroundImage()}>
                <Trash2 size={13} /> Rimuovi
              </button>
            )}
          </div>
        )}
      </div>

      {img && (
        <>
          <div className="section">
            <div className="section-title">Posizione e zoom</div>
            <SliderRow label="Zoom" min={1} max={4} step={0.01} value={editor.getBgZoom(img)} onChange={(v) => editor.setBgZoom(img, v)} format={pct} />
            <div className="row">
              <button className="btn sm" style={{ flex: 1 }} onClick={() => editor.coverBackground(img)}>
                <Maximize size={13} /> Adatta alla tela
              </button>
            </div>
            <div className="faint small">Trascina lo sfondo sulla tela per regolarne la posizione.</div>
          </div>
          <ImageEffectsSection images={[img]} title="Effetti sfondo" />
          <div className="section">
            <div className="section-title">Regolazioni</div>
            <SliderRow label="Luminosità" min={-0.6} max={0.6} step={0.01} value={editor.getFilter(img, 'Brightness')} onChange={(v) => editor.setFilter(img, 'Brightness', v)} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} />
            <SliderRow label="Contrasto" min={-0.6} max={0.6} step={0.01} value={editor.getFilter(img, 'Contrast')} onChange={(v) => editor.setFilter(img, 'Contrast', v)} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} />
            <SliderRow label="Opacità" min={0} max={1} step={0.01} value={img.opacity ?? 1} onChange={(v) => editor.setProps(img, { opacity: v })} format={pct} />
            <button
              className="btn sm ghost"
              onClick={() => {
                editor.setFilter(img, 'Brightness', 0);
                editor.setFilter(img, 'Contrast', 0);
                editor.setProps(img, { opacity: 1 });
              }}
            >
              <RotateCcw size={13} /> Ripristina regolazioni
            </button>
          </div>
          {crop && (
            <div className="section">
              <div className="section-title">
                <Crop size={12} /> Ritaglio
              </div>
              <SliderRow label="Sinistra" min={0} max={0.45} step={0.005} value={crop.l} onChange={(v) => editor.setCrop(img, { ...crop, l: v })} format={pct} />
              <SliderRow label="Destra" min={0} max={0.45} step={0.005} value={crop.r} onChange={(v) => editor.setCrop(img, { ...crop, r: v })} format={pct} />
              <SliderRow label="Alto" min={0} max={0.45} step={0.005} value={crop.t} onChange={(v) => editor.setCrop(img, { ...crop, t: v })} format={pct} />
              <SliderRow label="Basso" min={0} max={0.45} step={0.005} value={crop.b} onChange={(v) => editor.setCrop(img, { ...crop, b: v })} format={pct} />
              <button className="btn sm ghost" onClick={() => editor.setCrop(img, { l: 0, t: 0, r: 0, b: 0 })}>
                <RotateCcw size={13} /> Rimuovi ritaglio
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
