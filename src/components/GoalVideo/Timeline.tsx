import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { FabricObject } from 'fabric';
import { ANIM_PRESET_LABELS, DEFAULT_ANIM, type AnimConfig } from '../../editor/videoAnim';

const ROW_H = 30;

export function Timeline({
  objects,
  duration,
  t,
  playing,
  impactTime,
  onScrub,
  onScrubEnd,
  onPlayToggle,
  onAnimChange,
  onImpactTimeChange,
}: {
  objects: FabricObject[];
  duration: number;
  t: number;
  playing: boolean;
  impactTime: number;
  onScrub: (t: number) => void;
  onScrubEnd: () => void;
  onPlayToggle: () => void;
  onAnimChange: (obj: FabricObject, patch: Partial<AnimConfig>, commit: boolean) => void;
  onImpactTimeChange: (t: number, commit: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = width / Math.max(0.1, duration);
  const xToT = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, (clientX - rect.left) / scale));
  };

  const dragScrub = (e: React.PointerEvent) => {
    onScrub(xToT(e.clientX));
    const move = (ev: PointerEvent) => onScrub(xToT(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onScrubEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragImpact = (e: React.PointerEvent) => {
    e.stopPropagation();
    const move = (ev: PointerEvent) => onImpactTimeChange(xToT(ev.clientX), false);
    const up = (ev: PointerEvent) => {
      onImpactTimeChange(xToT(ev.clientX), true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragBar = (e: React.PointerEvent, obj: FabricObject, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    const base = obj.anim ?? DEFAULT_ANIM;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / scale;
      if (mode === 'move') onAnimChange(obj, { start: Math.min(duration - 0.1, Math.max(0, base.start + dt)) }, false);
      else onAnimChange(obj, { duration: Math.min(duration - base.start, Math.max(0.1, base.duration + dt)) }, false);
    };
    const up = () => {
      onAnimChange(obj, {}, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <button className="btn sm icon" onClick={onPlayToggle} title={playing ? 'Pausa' : 'Riproduci'}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="faint small" style={{ width: 50, textAlign: 'right' }}>
          {t.toFixed(2)}s
        </span>
      </div>
      <div className="timeline-track" ref={trackRef} onPointerDown={dragScrub}>
        <div className="timeline-ruler">
          {ticks.map((s) => (
            <span key={s} className="timeline-tick" style={{ left: s * scale }}>
              {s}s
            </span>
          ))}
        </div>
        <div className="timeline-impact" style={{ left: impactTime * scale }} onPointerDown={dragImpact} title="Momento impatto (coriandoli, scossa, flash)" />
        <div className="timeline-cursor" style={{ left: t * scale }} />
        <div className="timeline-rows">
          {objects.map((o, i) => {
            const anim = o.anim ?? DEFAULT_ANIM;
            return (
              <div key={o.id ?? i} className="timeline-row" style={{ height: ROW_H }}>
                <div className="timeline-row-label" title={o.name}>
                  {o.name}
                </div>
                {anim.preset !== 'none' && (
                  <div
                    className="timeline-bar"
                    style={{ left: anim.start * scale, width: Math.max(6, anim.duration * scale) }}
                    onPointerDown={(e) => dragBar(e, o, 'move')}
                    title={`${ANIM_PRESET_LABELS[anim.preset]} · ${anim.start.toFixed(1)}s → ${(anim.start + anim.duration).toFixed(1)}s`}
                  >
                    <div className="timeline-bar-handle" onPointerDown={(e) => dragBar(e, o, 'resize')} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
