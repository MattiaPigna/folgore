import { Gradient } from 'fabric';

/** Gradient fill for shapes: two colours (each with its own opacity) and a direction. */

export type GradDir = 'v' | 'h' | 'd' | 'r';

export const GRAD_DIRS: { id: GradDir; label: string; title: string }[] = [
  { id: 'v', label: '↓', title: 'Dall’alto in basso' },
  { id: 'h', label: '→', title: 'Da sinistra a destra' },
  { id: 'd', label: '↘', title: 'In diagonale' },
  { id: 'r', label: '◎', title: 'Radiale (dal centro)' },
];

export interface GradStop {
  color: string; // #rrggbb
  opacity: number; // 0..1
}

export interface ShapeGrad {
  from: GradStop;
  to: GradStop;
  dir: GradDir;
}

export function buildShapeGradient({ from, to, dir }: ShapeGrad): Gradient<'linear' | 'radial'> {
  const colorStops = [
    { offset: 0, color: from.color, opacity: from.opacity },
    { offset: 1, color: to.color, opacity: to.opacity },
  ];
  if (dir === 'r') {
    return new Gradient({
      type: 'radial',
      gradientUnits: 'percentage',
      coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 },
      colorStops,
    });
  }
  const coords =
    dir === 'h' ? { x1: 0, y1: 0, x2: 1, y2: 0 } : dir === 'd' ? { x1: 0, y1: 0, x2: 1, y2: 1 } : { x1: 0, y1: 0, x2: 0, y2: 1 };
  return new Gradient({ type: 'linear', gradientUnits: 'percentage', coords, colorStops });
}

function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
}

function alphaOf(c: string): number {
  const m = c.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
}

function readStop(s: { color: string; opacity?: number } | undefined, fallback: GradStop): GradStop {
  if (!s) return fallback;
  return { color: toHex(s.color), opacity: s.opacity ?? alphaOf(s.color) };
}

/** Reads a gradient fill back into editable form (null if the fill isn't a gradient). */
export function readShapeGradient(fill: unknown): ShapeGrad | null {
  if (!(fill instanceof Gradient)) return null;
  const stops = [...(fill.colorStops as { color: string; opacity?: number; offset: number }[])].sort((a, b) => a.offset - b.offset);
  const from = readStop(stops[0], { color: '#ffffff', opacity: 1 });
  const to = readStop(stops[stops.length - 1], from);
  let dir: GradDir = 'v';
  if (fill.type === 'radial') dir = 'r';
  else {
    const c = fill.coords as { x1: number; y1: number; x2: number; y2: number };
    const dx = c.x2 - c.x1;
    const dy = c.y2 - c.y1;
    dir = dx && dy ? 'd' : dx ? 'h' : 'v';
  }
  return { from, to, dir };
}
