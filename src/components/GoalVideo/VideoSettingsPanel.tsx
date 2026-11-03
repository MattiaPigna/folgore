import { BG_FX_LABELS, BG_FX_OPTIONS, type BgFx } from '../../editor/colorFx';
import { BURST_STYLES, BURST_STYLE_LABELS, type VideoExtras } from '../../editor/videoEffects';
import type { FormatSpec } from '../../types';
import { FORMAT_PRESETS } from '../../types';
import { SliderRow } from '../ui';

export interface VideoSettings {
  duration: number;
  accent: string;
  extras: VideoExtras;
}

/** Left-panel "Video" tab: format, duration, accent colour, and the global impact effects. */
export function VideoSettingsPanel({
  format,
  onFormatChange,
  video,
  onChange,
  bgFx,
  onBgFxChange,
  hasBackground,
  onResetLayout,
}: {
  format: FormatSpec;
  onFormatChange: (f: FormatSpec) => void;
  video: VideoSettings;
  onChange: (patch: Partial<VideoSettings>) => void;
  bgFx: BgFx;
  onBgFxChange: (fx: BgFx) => void;
  hasBackground: boolean;
  onResetLayout: () => void;
}) {
  const setExtra = (patch: Partial<VideoExtras>) => onChange({ extras: { ...video.extras, ...patch } });

  return (
    <>
      <div className="section">
        <div className="section-title">Formato</div>
        <div className="btn-group">
          <button
            className={`btn sm ${format.preset === 'story' ? 'active' : ''}`}
            onClick={() => onFormatChange({ preset: 'story', width: FORMAT_PRESETS.story.width, height: FORMAT_PRESETS.story.height })}
          >
            Storia / Reel
          </button>
          <button
            className={`btn sm ${format.preset === 'portrait' ? 'active' : ''}`}
            onClick={() => onFormatChange({ preset: 'portrait', width: FORMAT_PRESETS.portrait.width, height: FORMAT_PRESETS.portrait.height })}
          >
            Post
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Layout</div>
        <div className="faint small">Sostituisce tutti gli elementi con il layout predefinito "GOAL GOAL GOAL" (sfondo blu/rosso, minuto e marcatore, loghi e risultato).</div>
        <button className="btn sm" onClick={onResetLayout}>
          Ripristina layout predefinito
        </button>
      </div>

      <div className="section">
        <div className="section-title">Video</div>
        <div className="field">
          <label>Durata (secondi)</label>
          <input
            className="input sm"
            type="number"
            min={3}
            max={15}
            step={0.5}
            value={video.duration}
            onChange={(e) => onChange({ duration: Math.min(15, Math.max(3, parseFloat(e.target.value) || 3)) })}
          />
        </div>
        <div className="field">
          <label>Colore accento (effetti, pop)</label>
          <input className="input sm" type="color" value={video.accent} onChange={(e) => onChange({ accent: e.target.value })} style={{ padding: 2, height: 32 }} />
        </div>
      </div>

      <div className="section">
        <div className="section-title">Sfondo animato</div>
        <div className="faint small">{hasBackground ? 'Anima il colore o le luci dello sfondo per tutta la durata del video.' : 'Nessuno sfondo impostato.'}</div>
        <div className="btn-group">
          {BG_FX_OPTIONS.map((fx) => (
            <button key={fx} className={`btn sm ${bgFx === fx ? 'active' : ''}`} disabled={!hasBackground} onClick={() => onBgFxChange(fx)}>
              {BG_FX_LABELS[fx]}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Effetti d'impatto</div>
        <div className="faint small">Scattano tutti insieme al "momento impatto", sopra gli elementi della tela.</div>
        <label className="check small">
          <input type="checkbox" checked={video.extras.shake} onChange={(e) => setExtra({ shake: e.target.checked })} /> Scossa camera
        </label>
        <label className="check small">
          <input type="checkbox" checked={video.extras.flash} onChange={(e) => setExtra({ flash: e.target.checked })} /> Flash
        </label>
        <label className="check small">
          <input type="checkbox" checked={video.extras.shockwave} onChange={(e) => setExtra({ shockwave: e.target.checked })} /> Onda d'urto
        </label>
        <div className="field">
          <label>Esplosione</label>
          <div className="btn-group">
            {BURST_STYLES.map((b) => (
              <button key={b} className={`btn sm ${video.extras.burst === b ? 'active' : ''}`} onClick={() => setExtra({ burst: b })}>
                {BURST_STYLE_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
        <SliderRow
          label="Momento impatto"
          min={0}
          max={Math.max(0.1, video.duration - 0.5)}
          step={0.05}
          value={Math.min(video.extras.impactTime, Math.max(0.1, video.duration - 0.5))}
          onChange={(v) => setExtra({ impactTime: v })}
          format={(v) => `${v.toFixed(2)}s`}
        />
      </div>
    </>
  );
}
