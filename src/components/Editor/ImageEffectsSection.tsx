import type { FabricImage } from 'fabric';
import { Sparkles } from 'lucide-react';
import { editor } from '../../editor/controller';
import { IMAGE_FX } from '../../editor/imageEffects';
import { SliderRow } from '../ui';

/** Effect presets + intensity for one or more images (photos, backgrounds, logos). */
export function ImageEffectsSection({ images, title = 'Effetti immagine' }: { images: FabricImage[]; title?: string }) {
  if (!images.length) return null;
  const current = images.every((i) => (i.imgFx ?? 'none') === (images[0].imgFx ?? 'none')) ? images[0].imgFx ?? 'none' : null;
  const amount = images[0].imgFxAmount ?? 0.7;
  const fx = IMAGE_FX.find((f) => f.id === current);
  return (
    <div className="section">
      <div className="section-title">
        <Sparkles size={12} /> {title}
        {images.length > 1 ? ` (${images.length})` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {IMAGE_FX.map((f) => (
          <button
            key={f.id}
            className={`btn sm ${current === f.id ? 'active' : ''}`}
            style={{ padding: '0 4px' }}
            title={f.hint}
            onClick={() => editor.setImageEffect(images, f.id, current === f.id ? amount : f.id === 'none' ? 0 : 0.7)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {fx && fx.id !== 'none' && fx.id !== 'invert' && (
        <SliderRow label="Intensità" min={0.05} max={1} step={0.01} value={amount} onChange={(v) => editor.setImageEffect(images, fx.id, v, false)} format={(v) => `${Math.round(v * 100)}%`} />
      )}
    </div>
  );
}
