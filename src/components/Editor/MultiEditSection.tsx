import { ActiveSelection, Circle, FabricImage, Rect, Textbox, type FabricObject } from 'fabric';
import { AlignCenter, AlignLeft, AlignRight, Bold, Boxes, Group, Italic, MousePointerClick, Ungroup } from 'lucide-react';
import { editor } from '../../editor/controller';
import { FX_PRESETS } from '../../editor/textEffects';
import type { TextCase } from '../../editor/textCase';
import { BUILTIN_FONTS } from '../../services/fonts';
import { useApp } from '../../store/appStore';
import { NumField, SliderRow } from '../ui';
import { ImageEffectsSection } from './ImageEffectsSection';

const CASES: { mode: TextCase; label: string; title: string }[] = [
  { mode: 'upper', label: 'AA', title: 'TUTTO MAIUSCOLO' },
  { mode: 'lower', label: 'aa', title: 'tutto minuscolo' },
  { mode: 'title', label: 'Aa', title: 'Iniziali Maiuscole' },
  { mode: 'none', label: 'Orig.', title: 'Come scritto / come nei dati' },
];

function uniform<T>(values: T[]): T | undefined {
  return values.length && values.every((v) => v === values[0]) ? values[0] : undefined;
}

function hex(c: unknown): string {
  if (typeof c !== 'string') return '#ffffff';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
}

/** Group info and grouping actions, shown for any selection. */
export function GroupBar({ obj }: { obj: FabricObject }) {
  const toast = useApp((s) => s.toast);
  const members = obj instanceof ActiveSelection ? obj.getObjects() : [obj];
  const gid = uniform(members.map((m) => m.groupId));
  const groupName = gid ? members[0].groupName ?? 'Gruppo' : null;
  const isSel = obj instanceof ActiveSelection;
  const similar = !isSel ? editor.similarTo(obj).length : 0;

  return (
    <div className="section" style={{ gap: 8 }}>
      {isSel && gid && (
        <>
          <div className="row" style={{ gap: 6 }}>
            <Boxes size={14} color="var(--accent)" />
            <input className="input sm" style={{ flex: 1 }} value={groupName ?? ''} onChange={(e) => editor.renameGroup(gid, e.target.value)} title="Nome del gruppo" />
            <button className="btn sm" title="Separa il gruppo (Ctrl+Shift+G)" onClick={() => editor.ungroupSelection() && toast('Gruppo sciolto.')}>
              <Ungroup size={13} /> Separa
            </button>
          </div>
          <div className="faint small">Gruppo di {members.length} elementi · doppio clic su un elemento per modificarlo da solo.</div>
        </>
      )}
      {isSel && !gid && (
        <div className="row">
          <span className="faint small" style={{ flex: 1 }}>
            {members.length} elementi selezionati
          </span>
          <button className="btn sm" title="Raggruppa (Ctrl+G)" onClick={() => editor.groupSelection() && toast('Elementi raggruppati.', 'success')}>
            <Group size={13} /> Raggruppa
          </button>
        </div>
      )}
      {!isSel && (obj.groupId || similar > 1) && (
        <div className="row wrap" style={{ gap: 6 }}>
          {obj.groupId && (
            <button className="btn sm" title="Torna a selezionare tutto il gruppo" onClick={() => editor.selectGroup(obj.groupId!)}>
              <Boxes size={13} /> Gruppo “{obj.groupName ?? 'Gruppo'}”
            </button>
          )}
          {similar > 1 && (
            <button className="btn sm" title="Seleziona tutti gli elementi dello stesso tipo (es. tutti i nomi squadra)" onClick={() => editor.selectSimilar(obj)}>
              <MousePointerClick size={13} /> Seleziona simili ({similar})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Edits applied to every element of a multi-selection. */
export function MultiEditSection({ sel }: { sel: ActiveSelection }) {
  const fonts = useApp((s) => s.fonts);
  const members = sel.getObjects();
  // Edits also reach hidden elements of the same group (e.g. empty standings rows).
  const targets = editor.withHiddenGroupMates(members);
  const texts = targets.filter((o): o is Textbox => o instanceof Textbox);
  const images = targets.filter((o): o is FabricImage => o instanceof FabricImage);
  const shapes = targets.filter((o) => o instanceof Rect || o instanceof Circle);

  const font = uniform(texts.map((t) => t.fontFamily));
  const weight = uniform(texts.map((t) => String(t.fontWeight ?? 400)));
  const size = uniform(texts.map((t) => Math.round((t.fontSize ?? 0) * 10) / 10));
  const spacing = uniform(texts.map((t) => t.charSpacing ?? 0));
  const align = uniform(texts.map((t) => t.textAlign));
  const italic = texts.length > 0 && texts.every((t) => t.fontStyle === 'italic');
  const bold = texts.length > 0 && texts.every((t) => Number(t.fontWeight ?? 400) >= 600);
  const opacity = uniform(members.map((m) => Math.round((m.opacity ?? 1) * 100) / 100)) ?? 1;

  const setTexts = (p: Record<string, any> | ((t: FabricObject) => Record<string, any> | null), now = true) => editor.setPropsMany(texts, p, now);

  return (
    <>
      {texts.length > 0 && (
        <div className="section">
          <div className="section-title">Testi ({texts.length}) · modifica tutti</div>
          <select className="select sm" value={font ?? ''} onChange={(e) => setTexts({ fontFamily: e.target.value })} style={{ fontFamily: font }}>
            {!font && <option value="">— font diversi —</option>}
            {(['Calligrafico', 'Serif', 'Sans-serif', 'Display'] as const).map((cat) => (
              <optgroup key={cat} label={cat}>
                {BUILTIN_FONTS.filter((f) => f.category === cat).map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </optgroup>
            ))}
            {fonts.length > 0 && (
              <optgroup label="Font personalizzati">
                {fonts.map((f) => (
                  <option key={f.id} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="grid-2" style={{ gap: 6 }}>
            <select className="select sm" value={weight ?? ''} onChange={(e) => setTexts({ fontWeight: Number(e.target.value) })}>
              {!weight && <option value="">— misto —</option>}
              <option value="300">Light</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
            <NumField label="Pt" title="Dimensione (uguale per tutti)" min={4} max={1200} value={size ?? NaN} onChange={(v) => setTexts({ fontSize: v }, false)} />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="label" style={{ flex: 1 }}>Dimensione proporzionale</span>
            <button className="btn sm" title="Riduci tutti del 8%" onClick={() => setTexts((t) => ({ fontSize: Math.max(4, ((t as Textbox).fontSize ?? 20) * 0.92) }))}>
              A−
            </button>
            <button className="btn sm" title="Ingrandisci tutti del 8%" onClick={() => setTexts((t) => ({ fontSize: ((t as Textbox).fontSize ?? 20) * 1.08 }))}>
              A+
            </button>
          </div>
          <div className="row">
            <input type="color" className="swatch" title="Colore di tutti i testi" value={hex(uniform(texts.map((t) => t.fill)) ?? '#ffffff')} onChange={(e) => setTexts({ fill: e.target.value }, false)} />
            <div className="btn-group" style={{ flex: 1 }}>
              <button className={`btn sm ${bold ? 'active' : ''}`} title="Grassetto" onClick={() => setTexts({ fontWeight: bold ? 400 : 700 })}>
                <Bold size={13} />
              </button>
              <button className={`btn sm ${italic ? 'active' : ''}`} title="Corsivo" onClick={() => setTexts({ fontStyle: italic ? 'normal' : 'italic' })}>
                <Italic size={13} />
              </button>
              {(
                [
                  ['left', AlignLeft],
                  ['center', AlignCenter],
                  ['right', AlignRight],
                ] as const
              ).map(([a, Icon]) => (
                <button key={a} className={`btn sm ${align === a ? 'active' : ''}`} onClick={() => setTexts({ textAlign: a })}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className="btn-group">
            {CASES.map((c) => (
              <button key={c.mode} className="btn sm" title={c.title} onClick={() => editor.setTextCase(texts, c.mode)}>
                {c.label}
              </button>
            ))}
          </div>
          <NumField label="Sp" title="Spaziatura lettere (tutti)" step={5} value={spacing ?? NaN} onChange={(v) => setTexts({ charSpacing: v }, false)} />
          <div className="label">Effetto per tutti</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {FX_PRESETS.map((p) => (
              <button
                key={p.id}
                className="btn sm"
                style={{ padding: '0 4px' }}
                onClick={() => setTexts((t) => p.apply((t as Textbox).fontSize ?? 40, typeof (t as Textbox).fill === 'string' && !String((t as Textbox).fill).startsWith('rgba(0,0,0,0') ? ((t as Textbox).fill as string) : '#ffffff'))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="section">
          <div className="section-title">Loghi e immagini ({images.length})</div>
          <div className="btn-group">
            {(
              [
                ['original', 'Originale'],
                ['white', 'Bianco'],
                ['black', 'Nero'],
                ['gray', 'Grigi'],
              ] as const
            ).map(([m, l]) => (
              <button
                key={m}
                className="btn sm"
                onClick={() => {
                  for (const img of images) editor.setLogoColor(img, m, false);
                  editor.record();
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <ImageEffectsSection images={images} title="Effetti immagini" />

      {shapes.length > 0 && (
        <div className="section">
          <div className="section-title">Forme ({shapes.length})</div>
          <div className="row">
            <span className="label" style={{ flex: 1 }}>Colore riempimento</span>
            <input type="color" className="swatch" value={hex(uniform(shapes.map((s) => s.fill)) ?? '#ffffff')} onChange={(e) => editor.setPropsMany(shapes, { fill: e.target.value })} />
          </div>
        </div>
      )}

      <div className="section">
        <SliderRow label="Opacità" min={0} max={1} step={0.01} value={opacity} onChange={(v) => editor.setPropsMany(members, { opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
    </>
  );
}

export { CASES };
