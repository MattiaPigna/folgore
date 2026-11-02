import { Gradient, type Textbox } from 'fabric';
import { Sparkles } from 'lucide-react';
import { editor } from '../../editor/controller';
import { FX_PRESETS, gradientFill, type TextFx } from '../../editor/textEffects';
import { SliderRow } from '../ui';

function solid(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  if (/^rgba\(.*,\s*0(\.0+)?\)$/.test(c.replace(/\s/g, ' '))) return null; // fully transparent
  return c;
}

function hex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
}

export function TextEffectsSection({ obj }: { obj: Textbox }) {
  const fx: TextFx = (obj as any).fx ?? {};
  const size = obj.fontSize ?? 40;
  const grad = obj.fill instanceof Gradient ? obj.fill : null;
  // Colour the presets start from: the solid fill, else the outline colour, else white.
  const base = solid(obj.fill) ?? solid(obj.stroke) ?? '#ffffff';

  const setFx = (patch: Partial<TextFx>) => {
    const next: TextFx = { ...fx, ...patch };
    editor.setProps(obj, { fx: next, dirty: true });
  };

  const echo = fx.echo ?? { count: 0, dx: 0, dy: Math.round(size * 0.18), opacity: 0.6, outline: true };
  const motion = fx.motion ?? { amount: 0, angle: 0 };
  const stops = grad ? (grad.colorStops as { color: string }[]) : null;
  const vertical = grad ? (grad.coords as any).x2 === 0 : true;

  return (
    <div className="section">
      <div className="section-title">
        <Sparkles size={12} /> Effetti
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {FX_PRESETS.map((p) => (
          <button key={p.id} className="btn sm" style={{ padding: '0 4px' }} onClick={() => editor.setProps(obj, { ...p.apply(size, base), dirty: true }, true)}>
            {p.label}
          </button>
        ))}
      </div>

      <SliderRow label="Sfocatura" min={0} max={40} step={0.5} value={fx.blur ?? 0} onChange={(v) => setFx({ blur: v })} format={(v) => `${v}`} />

      <SliderRow label="Mosso" min={0} max={Math.round(size * 1.2)} step={1} value={motion.amount} onChange={(v) => setFx({ motion: { ...motion, amount: v } })} format={(v) => `${Math.round(v)}`} />
      {motion.amount > 0 && (
        <SliderRow label="Direzione" min={0} max={180} step={5} value={motion.angle} onChange={(v) => setFx({ motion: { ...motion, angle: v } })} format={(v) => `${v}°`} />
      )}

      <SliderRow label="Eco" min={0} max={8} step={1} value={echo.count} onChange={(v) => setFx({ echo: { ...echo, count: v } })} format={(v) => `${v}`} />
      {echo.count > 0 && (
        <>
          <SliderRow label="Distanza X" min={-Math.round(size)} max={Math.round(size)} step={1} value={echo.dx} onChange={(v) => setFx({ echo: { ...echo, dx: v } })} format={(v) => `${Math.round(v)}`} />
          <SliderRow label="Distanza Y" min={-Math.round(size)} max={Math.round(size)} step={1} value={echo.dy} onChange={(v) => setFx({ echo: { ...echo, dy: v } })} format={(v) => `${Math.round(v)}`} />
          <SliderRow label="Dissolvenza" min={0.2} max={0.95} step={0.05} value={echo.opacity} onChange={(v) => setFx({ echo: { ...echo, opacity: v } })} format={(v) => `${Math.round(v * 100)}%`} />
          <label className="check small">
            <input type="checkbox" checked={echo.outline} onChange={(e) => setFx({ echo: { ...echo, outline: e.target.checked } })} /> Copie solo contorno
          </label>
        </>
      )}

      <label className="check small">
        <input
          type="checkbox"
          checked={!!grad}
          onChange={(e) => editor.setProps(obj, { fill: e.target.checked ? gradientFill([base, '#9ca3af']) : stops?.[0]?.color ?? base, dirty: true }, true)}
        />
        Colore sfumato (gradiente)
      </label>
      {grad && stops && (
        <div className="row">
          <input type="color" className="swatch" value={hex(stops[0].color)} onChange={(e) => editor.setProps(obj, { fill: gradientFill([e.target.value, stops[1].color], vertical), dirty: true })} />
          <input type="color" className="swatch" value={hex(stops[1].color)} onChange={(e) => editor.setProps(obj, { fill: gradientFill([stops[0].color, e.target.value], vertical), dirty: true })} />
          <div className="btn-group" style={{ flex: 1 }}>
            <button className={`btn sm ${vertical ? 'active' : ''}`} onClick={() => editor.setProps(obj, { fill: gradientFill([stops[0].color, stops[1].color], true), dirty: true }, true)}>
              Verticale
            </button>
            <button className={`btn sm ${!vertical ? 'active' : ''}`} onClick={() => editor.setProps(obj, { fill: gradientFill([stops[0].color, stops[1].color], false), dirty: true }, true)}>
              Orizzontale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
