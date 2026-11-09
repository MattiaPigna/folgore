import { useState } from 'react';
import { ActiveSelection, FabricImage, Rect, Textbox, type FabricObject } from 'fabric';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Italic,
  Link2,
  Lock,
  Trash2,
  Unlock,
  WandSparkles,
} from 'lucide-react';
import { useRoute } from '../../store/routeStore';
import { editor, type AlignMode } from '../../editor/controller';
import { fitImageToBox, sceneBox } from '../../editor/geometry';
import { ANIM_PRESETS, ANIM_PRESET_LABELS, DEFAULT_ANIM, type AnimConfig, type AnimPreset } from '../../editor/videoAnim';
import { COLOR_FX_LABELS, COLOR_FX_OPTIONS, type ColorFx } from '../../editor/colorFx';
import { getAssetUrl } from '../../services/assets';
import { IMAGE_BINDING_LABELS, TEXT_BINDING_LABELS, isImageBinding } from '../../services/bindings';
import { BUILTIN_FONTS } from '../../services/fonts';
import { FileError, IMAGE_TYPES, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import { useEditorUI } from '../../store/editorStore';
import { NumField, SliderRow } from '../ui';
import { TextEffectsSection } from './TextEffectsSection';
import { CASES, GroupBar, MultiEditSection } from './MultiEditSection';
import { ImageEffectsSection } from './ImageEffectsSection';
import { GRAD_DIRS, buildShapeGradient, readShapeGradient, type ShapeGrad } from '../../editor/shapeGradient';

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function colorOf(fill: unknown): string | null {
  return typeof fill === 'string' ? toHex(fill) : null;
}

function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return '#ffffff';
}

const ALIGNS: { mode: AlignMode; icon: typeof AlignLeft; title: string }[] = [
  { mode: 'left', icon: AlignStartVertical, title: 'Allinea a sinistra' },
  { mode: 'hcenter', icon: AlignCenterVertical, title: 'Centra orizzontalmente' },
  { mode: 'right', icon: AlignEndVertical, title: 'Allinea a destra' },
  { mode: 'top', icon: AlignStartHorizontal, title: 'Allinea in alto' },
  { mode: 'vcenter', icon: AlignCenterHorizontal, title: 'Centra verticalmente' },
  { mode: 'bottom', icon: AlignEndHorizontal, title: 'Allinea in basso' },
];

export function PropertiesPanel({ videoMode = false }: { videoMode?: boolean } = {}) {
  useEditorUI((s) => s.version);
  const fonts = useApp((s) => s.fonts);
  const addAsset = useApp((s) => s.addAsset);
  const toast = useApp((s) => s.toast);
  const [keepRatio, setKeepRatio] = useState(true);
  const obj = editor.active;

  if (!obj) {
    return (
      <div className="section">
        <div className="section-title">Proprietà</div>
        <div className="faint small" style={{ lineHeight: 1.6 }}>
          Seleziona un elemento sulla tela o nel pannello livelli.
          <br />
          <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> annulla · <span className="kbd">Ctrl</span>+<span className="kbd">Y</span> ripristina
          <br />
          <span className="kbd">Ctrl</span>+<span className="kbd">C</span>/<span className="kbd">V</span> copia/incolla · <span className="kbd">Ctrl</span>+
          <span className="kbd">D</span> duplica
          <br />
          <span className="kbd">Canc</span> elimina · frecce sposta (<span className="kbd">Shift</span> ×10)
        </div>
      </div>
    );
  }

  const isSel = obj instanceof ActiveSelection;
  const box = sceneBox(obj);
  const isText = obj instanceof Textbox;
  const isImg = obj instanceof FabricImage;
  const isRect = obj instanceof Rect;
  const locked = !!obj.lockedLayer;

  const replaceImage = async () => {
    if (!(obj instanceof FabricImage)) return;
    const [file] = await pickFile('.png,.jpg,.jpeg,.webp,.svg');
    if (!file) return;
    try {
      const blob = await prepareImage(file, IMAGE_TYPES, "l'immagine");
      const meta = await addAsset(blob, obj.role === 'background' ? 'background' : 'image', fileBaseName(file.name));
      const url = await getAssetUrl(meta.id);
      if (url) await editor.replaceImage(obj, url, meta.id);
      if (obj.binding) {
        obj.binding = undefined; // custom image replaces bound data
        toast("L'immagine non è più collegata ai dati della partita.", 'info');
      }
    } catch (e) {
      toast(e instanceof FileError ? e.message : "Impossibile caricare l'immagine.", 'error');
    }
  };

  return (
    <>
      <div className="section">
        <div className="row">
          <div className="section-title" style={{ flex: 1 }}>
            {isSel ? `${(obj as ActiveSelection).size()} elementi` : obj.name || 'Elemento'}
          </div>
          {!isSel && (
            <>
              <button className="layer-btn" title="Duplica (Ctrl+D)" onClick={() => editor.duplicateSelected()}>
                <Copy size={14} />
              </button>
              <button className={`layer-btn ${locked ? 'on' : ''}`} title={locked ? 'Sblocca' : 'Blocca'} onClick={() => editor.setLocked(obj, !locked)}>
                {locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <button className="layer-btn" title="Nascondi" onClick={() => editor.setVisible(obj, !obj.visible)}>
                {obj.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </>
          )}
          <button className="layer-btn" title="Elimina (Canc)" onClick={() => editor.deleteSelected()} disabled={locked}>
            <Trash2 size={14} />
          </button>
        </div>
        <GroupBar obj={obj} />
        {obj.binding && (
          <div className="row small" style={{ gap: 6, color: 'var(--muted)' }}>
            <Link2 size={13} color="var(--accent)" />
            <span style={{ flex: 1 }}>
              Collegato a: <b style={{ color: 'var(--text)' }}>{isImageBinding(obj.binding) ? IMAGE_BINDING_LABELS[obj.binding] : TEXT_BINDING_LABELS[obj.binding as keyof typeof TEXT_BINDING_LABELS]}</b>
            </span>
          </div>
        )}
        {isText && obj.binding && (
          <label className="check small">
            <input type="checkbox" checked={obj.autoText !== false} onChange={(e) => editor.setProps(obj, { autoText: e.target.checked }, true)} />
            Aggiorna automaticamente il testo dai dati
          </label>
        )}
        {isText && obj.binding && (
          <label className="check small">
            <input type="checkbox" checked={!obj.keepCase} onChange={(e) => editor.setProps(obj, { keepCase: !e.target.checked }, true)} />
            Maiuscolo automatico (da Impostazioni)
          </label>
        )}
      </div>

      <div className="section">
        <div className="section-title">Posizione e dimensioni</div>
        <div className="btn-group">
          {ALIGNS.map(({ mode, icon: Icon, title }) => (
            <button key={mode} className="btn sm" title={title} onClick={() => editor.align(mode)} disabled={locked}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="grid-2" style={{ gap: 6 }}>
          <NumField label="X" value={r1(box.left)} onChange={(v) => editor.setBox(obj, { x: v })} disabled={locked} />
          <NumField label="Y" value={r1(box.top)} onChange={(v) => editor.setBox(obj, { y: v })} disabled={locked} />
          {!isSel && (
            <>
              <NumField label="L" title="Larghezza" min={1} value={r1(obj.getScaledWidth())} onChange={(v) => editor.setBox(obj, { w: v, keepRatio })} disabled={locked} />
              <NumField
                label="A"
                title="Altezza"
                min={1}
                value={r1(obj.getScaledHeight())}
                onChange={(v) => editor.setBox(obj, { h: v, keepRatio })}
                disabled={locked || isText}
              />
              <NumField label="°" title="Rotazione" step={1} value={r1(obj.angle ?? 0)} onChange={(v) => editor.setAngle(obj, v)} disabled={locked} />
              <label className="check small">
                <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} /> Proporzioni
              </label>
            </>
          )}
        </div>
        {!isSel && <SliderRow label="Opacità" min={0} max={1} step={0.01} value={obj.opacity ?? 1} onChange={(v) => editor.setProps(obj, { opacity: v })} format={pct} />}
      </div>

      {videoMode && !isSel && <AnimationSection obj={obj} />}

      {isSel && <MultiEditSection sel={obj as ActiveSelection} />}
      {isText && <TextSection obj={obj} customFonts={fonts.map((f) => f.family)} />}
      {isText && <TextEffectsSection obj={obj} />}

      {isImg && (
        <div className="section">
          <div className="section-title">Immagine</div>
          {obj.role !== 'background' && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" style={{ flex: 1 }} onClick={replaceImage}>
                <ImagePlus size={14} /> Sostituisci
              </button>
              {obj.assetId && (
                <button className="btn sm" style={{ flex: 1 }} title="Apri nel ritocco immagini" onClick={() => useRoute.getState().go({ page: 'studio', assetId: obj.assetId! })}>
                  <WandSparkles size={14} /> Ritocca
                </button>
              )}
            </div>
          )}
          {obj.role !== 'background' && (
            <div className="field">
              <label>Colore logo</label>
              <div className="btn-group">
                {(
                  [
                    ['original', 'Originale'],
                    ['white', 'Bianco'],
                    ['black', 'Nero'],
                    ['gray', 'Grigi'],
                  ] as const
                ).map(([m, l]) => (
                  <button key={m} className={`btn sm ${editor.getLogoColor(obj) === m ? 'active' : ''}`} onClick={() => editor.setLogoColor(obj, m)}>
                    {l}
                  </button>
                ))}
              </div>
              <label className="check small">
                <input
                  type="checkbox"
                  checked={!!obj.shadow}
                  onChange={(e) =>
                    editor.setShadow(obj, e.target.checked ? { color: 'rgba(0,0,0,0.55)', blur: 24, offsetX: 0, offsetY: 8 } : null)
                  }
                />
                Ombra
              </label>
            </div>
          )}
          {obj.binding && (
            <div className="field">
              <label>Adattamento al riquadro</label>
              <div className="btn-group">
                {(['contain', 'cover'] as const).map((m) => (
                  <button
                    key={m}
                    className={`btn sm ${(obj.fitMode ?? 'contain') === m ? 'active' : ''}`}
                    onClick={() => {
                      obj.fitMode = m;
                      fitImageToBox(obj, obj.boxW || obj.getScaledWidth(), obj.boxH || obj.getScaledHeight(), m);
                      editor.canvas?.requestRenderAll();
                      editor.record();
                    }}
                  >
                    {m === 'contain' ? 'Contieni' : 'Riempi (ritaglia)'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SliderRow label="Luminosità" min={-0.6} max={0.6} step={0.01} value={editor.getFilter(obj, 'Brightness')} onChange={(v) => editor.setFilter(obj, 'Brightness', v)} format={(v) => Math.round(v * 100) + ''} />
          <SliderRow label="Contrasto" min={-0.6} max={0.6} step={0.01} value={editor.getFilter(obj, 'Contrast')} onChange={(v) => editor.setFilter(obj, 'Contrast', v)} format={(v) => Math.round(v * 100) + ''} />
          {obj.role !== 'background' && (
            <>
              <div className="label">Ritaglio</div>
              {(() => {
                const c = editor.getCrop(obj);
                return (
                  <>
                    <SliderRow label="Sinistra" min={0} max={0.45} step={0.005} value={c.l} onChange={(v) => editor.setCrop(obj, { ...c, l: v })} format={pct} />
                    <SliderRow label="Destra" min={0} max={0.45} step={0.005} value={c.r} onChange={(v) => editor.setCrop(obj, { ...c, r: v })} format={pct} />
                    <SliderRow label="Alto" min={0} max={0.45} step={0.005} value={c.t} onChange={(v) => editor.setCrop(obj, { ...c, t: v })} format={pct} />
                    <SliderRow label="Basso" min={0} max={0.45} step={0.005} value={c.b} onChange={(v) => editor.setCrop(obj, { ...c, b: v })} format={pct} />
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {isImg && <ImageEffectsSection images={[obj as FabricImage]} />}
      {!isText && !isImg && !isSel && <ShapeSection obj={obj} isRect={isRect} />}

      {!isSel && (
        <div className="section">
          <div className="section-title">Livello</div>
          <div className="grid-2" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => editor.bringToFront(obj)}>
              <ArrowUpToLine size={13} /> In primo piano
            </button>
            <button className="btn sm" onClick={() => editor.sendToBack(obj)}>
              <ArrowDownToLine size={13} /> In fondo
            </button>
            <button className="btn sm" onClick={() => editor.bringForward(obj)}>
              Avanti di uno
            </button>
            <button className="btn sm" onClick={() => editor.sendBackward(obj)}>
              Indietro di uno
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AnimationSection({ obj }: { obj: FabricObject }) {
  const anim = obj.anim ?? DEFAULT_ANIM;
  const set = (patch: Partial<AnimConfig>) => editor.setProps(obj, { anim: { ...anim, ...patch } }, true);
  return (
    <div className="section">
      <div className="section-title">Animazione</div>
      <div className="field">
        <label>Entrata</label>
        <select className="select sm" value={anim.preset} onChange={(e) => set({ preset: e.target.value as AnimPreset })}>
          {ANIM_PRESETS.map((p) => (
            <option key={p} value={p}>
              {ANIM_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {anim.preset !== 'none' && (
        <div className="grid-2" style={{ gap: 6 }}>
          <NumField label="Inizio (s)" min={0} max={30} step={0.1} decimals={1} value={anim.start} onChange={(v) => set({ start: Math.max(0, v) })} />
          <NumField label="Durata (s)" min={0.1} max={5} step={0.1} decimals={1} value={anim.duration} onChange={(v) => set({ duration: Math.max(0.1, v) })} />
        </div>
      )}
      <div className="field">
        <label>Effetto colore (per tutta la durata)</label>
        <select
          className="select sm"
          value={obj.colorFx ?? 'none'}
          onChange={(e) => editor.setProps(obj, { colorFx: e.target.value as ColorFx }, true)}
        >
          {COLOR_FX_OPTIONS.map((fx) => (
            <option key={fx} value={fx}>
              {COLOR_FX_LABELS[fx]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TextSection({ obj, customFonts }: { obj: Textbox; customFonts: string[] }) {
  const shadow = obj.shadow as any;
  const weight = String(obj.fontWeight ?? 400);
  return (
    <div className="section">
      <div className="section-title">Testo</div>
      <textarea
        className="textarea"
        rows={3}
        value={obj.text}
        onChange={(e) => editor.setProps(obj, { text: e.target.value, ...(obj.binding ? { autoText: false } : {}) })}
      />
      <select className="select sm" value={obj.fontFamily} onChange={(e) => editor.setProps(obj, { fontFamily: e.target.value }, true)} style={{ fontFamily: obj.fontFamily }}>
        {(['Calligrafico', 'Serif', 'Sans-serif', 'Display'] as const).map((cat) => (
          <optgroup key={cat} label={cat}>
            {BUILTIN_FONTS.filter((f) => f.category === cat).map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.family}
              </option>
            ))}
          </optgroup>
        ))}
        {customFonts.length > 0 && (
          <optgroup label="Font personalizzati">
            {customFonts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <div className="grid-2" style={{ gap: 6 }}>
        <NumField label="Pt" title="Dimensione" min={4} max={1200} value={r1(obj.fontSize ?? 40)} onChange={(v) => editor.setProps(obj, { fontSize: v })} />
        <select className="select sm" value={weight} onChange={(e) => editor.setProps(obj, { fontWeight: Number(e.target.value) }, true)}>
          <option value="300">Light</option>
          <option value="400">Regular</option>
          <option value="500">Medium</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
        </select>
        <NumField label="Sp" title="Spaziatura lettere" step={5} value={obj.charSpacing ?? 0} onChange={(v) => editor.setProps(obj, { charSpacing: v })} />
        <NumField label="Int" title="Interlinea" step={0.05} decimals={2} min={0.5} max={4} value={obj.lineHeight ?? 1.16} onChange={(v) => editor.setProps(obj, { lineHeight: v })} />
      </div>
      <div className="row">
        <input type="color" className="swatch" value={colorOf(obj.fill) ?? '#ffffff'} onChange={(e) => editor.setProps(obj, { fill: e.target.value })} title="Colore" />
        <div className="btn-group" style={{ flex: 1 }}>
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
              ['justify', AlignJustify],
            ] as const
          ).map(([a, Icon]) => (
            <button key={a} className={`btn sm ${obj.textAlign === a ? 'active' : ''}`} onClick={() => editor.setProps(obj, { textAlign: a }, true)}>
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>
      <div className="btn-group">
        <button className={`btn sm ${Number(weight) >= 600 ? 'active' : ''}`} title="Grassetto" onClick={() => editor.setProps(obj, { fontWeight: Number(weight) >= 600 ? 400 : 700 }, true)}>
          <Bold size={13} />
        </button>
        <button className={`btn sm ${obj.fontStyle === 'italic' ? 'active' : ''}`} title="Corsivo" onClick={() => editor.setProps(obj, { fontStyle: obj.fontStyle === 'italic' ? 'normal' : 'italic' }, true)}>
          <Italic size={13} />
        </button>
      </div>
      <div className="btn-group">
        {CASES.map((c) => (
          <button key={c.mode} className={`btn sm ${(obj.textCase ?? 'none') === c.mode ? 'active' : ''}`} title={c.title} onClick={() => editor.setTextCase([obj], c.mode)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="row">
        <span className="label" style={{ flex: 1 }}>Contorno</span>
        <input type="color" className="swatch" value={colorOf(obj.stroke) ?? '#000000'} onChange={(e) => editor.setProps(obj, { stroke: e.target.value, strokeWidth: obj.strokeWidth || 1 })} />
        <div style={{ width: 80 }}>
          <NumField label="px" min={0} max={40} step={0.5} decimals={1} value={obj.stroke ? obj.strokeWidth ?? 0 : 0} onChange={(v) => editor.setProps(obj, { strokeWidth: v, stroke: v > 0 ? obj.stroke || '#000000' : null })} />
        </div>
      </div>
      <label className="check small">
        <input
          type="checkbox"
          checked={!!shadow}
          onChange={(e) => editor.setShadow(obj, e.target.checked ? { color: 'rgba(200,16,32,0.9)', blur: 20, offsetX: 0, offsetY: 4 } : null)}
        />
        Ombra / bagliore
      </label>
      {shadow && (
        <>
          <div className="row">
            <input
              type="color"
              className="swatch"
              value={toHex(shadow.color ?? '#000000')}
              onChange={(e) => editor.setShadow(obj, { color: e.target.value, blur: shadow.blur, offsetX: shadow.offsetX, offsetY: shadow.offsetY })}
            />
            <NumField label="Sf" title="Sfocatura" min={0} max={200} value={shadow.blur ?? 0} onChange={(v) => editor.setShadow(obj, { color: shadow.color, blur: v, offsetX: shadow.offsetX, offsetY: shadow.offsetY })} />
          </div>
          <div className="grid-2" style={{ gap: 6 }}>
            <NumField label="X" value={shadow.offsetX ?? 0} onChange={(v) => editor.setShadow(obj, { color: shadow.color, blur: shadow.blur, offsetX: v, offsetY: shadow.offsetY })} />
            <NumField label="Y" value={shadow.offsetY ?? 0} onChange={(v) => editor.setShadow(obj, { color: shadow.color, blur: shadow.blur, offsetX: shadow.offsetX, offsetY: v })} />
          </div>
        </>
      )}
    </div>
  );
}

function ShapeSection({ obj, isRect }: { obj: FabricObject; isRect: boolean }) {
  const solid = colorOf(obj.fill);
  const grad = readShapeGradient(obj.fill);
  const setGrad = (patch: Partial<ShapeGrad>, commit = false) => {
    if (!grad) return;
    editor.setProps(obj, { fill: buildShapeGradient({ ...grad, ...patch }), dirty: true }, commit);
  };
  return (
    <div className="section">
      <div className="section-title">Forma</div>
      <div className="row">
        <span className="label" style={{ flex: 1 }}>Riempimento</span>
        <div className="btn-group">
          <button
            className={`btn sm ${!grad ? 'active' : ''}`}
            onClick={() => grad && editor.setProps(obj, { fill: grad.from.color, dirty: true }, true)}
          >
            Pieno
          </button>
          <button
            className={`btn sm ${grad ? 'active' : ''}`}
            onClick={() =>
              !grad &&
              editor.setProps(
                obj,
                { fill: buildShapeGradient({ from: { color: solid ?? '#000000', opacity: 1 }, to: { color: solid ?? '#000000', opacity: 0 }, dir: 'v' }), dirty: true },
                true,
              )
            }
            title="Sfumatura tra due colori o verso il trasparente"
          >
            Sfumato
          </button>
        </div>
        {!grad && (
          <input type="color" className="swatch" value={solid ?? '#000000'} onChange={(e) => editor.setProps(obj, { fill: e.target.value })} title="Colore pieno" />
        )}
      </div>
      {grad && (
        <>
          <div className="row">
            <span className="label" style={{ flex: 1 }}>Direzione</span>
            <div className="btn-group">
              {GRAD_DIRS.map((d) => (
                <button key={d.id} className={`btn sm ${grad.dir === d.id ? 'active' : ''}`} title={d.title} onClick={() => setGrad({ dir: d.id }, true)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="label" style={{ flex: 1 }}>{grad.dir === 'r' ? 'Centro' : 'Inizio'}</span>
            <input type="color" className="swatch" value={grad.from.color} onChange={(e) => setGrad({ from: { ...grad.from, color: e.target.value } })} />
          </div>
          <SliderRow label="Opacità inizio" min={0} max={1} step={0.01} value={grad.from.opacity} onChange={(v) => setGrad({ from: { ...grad.from, opacity: v } })} format={pct} />
          <div className="row">
            <span className="label" style={{ flex: 1 }}>{grad.dir === 'r' ? 'Bordo' : 'Fine'}</span>
            <input type="color" className="swatch" value={grad.to.color} onChange={(e) => setGrad({ to: { ...grad.to, color: e.target.value } })} />
          </div>
          <SliderRow label="Opacità fine" min={0} max={1} step={0.01} value={grad.to.opacity} onChange={(v) => setGrad({ to: { ...grad.to, opacity: v } })} format={pct} />
          <button className="btn sm" onClick={() => setGrad({ from: grad.to, to: grad.from }, true)}>
            Inverti
          </button>
        </>
      )}
      <div className="row">
        <span className="label" style={{ flex: 1 }}>Bordo</span>
        <input type="color" className="swatch" value={colorOf(obj.stroke) ?? '#ffffff'} onChange={(e) => editor.setProps(obj, { stroke: e.target.value, strokeWidth: obj.strokeWidth || 2 })} />
        <div style={{ width: 80 }}>
          <NumField label="px" min={0} max={60} value={obj.stroke ? obj.strokeWidth ?? 0 : 0} onChange={(v) => editor.setProps(obj, { strokeWidth: v, stroke: v > 0 ? obj.stroke || '#ffffff' : null })} />
        </div>
      </div>
      {isRect && <NumField label="R" title="Raggio angoli" min={0} max={500} value={(obj as Rect).rx ?? 0} onChange={(v) => editor.setProps(obj, { rx: v, ry: v })} />}
    </div>
  );
}
