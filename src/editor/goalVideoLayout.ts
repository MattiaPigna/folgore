import { Gradient, Rect, type FabricObject } from 'fabric';
import { uid } from '../services/database';
import { image, text } from './layouts';
import { LOGO_PLACEHOLDER } from './serialization';
import type { AnimConfig, AnimPreset } from './videoAnim';

const anim = (preset: AnimPreset, start: number, duration = 0.5): AnimConfig => ({ preset, start, duration });

const GOAL_FONT = 'Montserrat';
const BAR_RED = '#c8102e';

function rect(o: { name: string; role?: 'element' | 'decor'; left: number; top: number; width: number; height: number; fill: any; rx?: number; stroke?: string; strokeWidth?: number; opacity?: number }): Rect {
  return new Rect({
    id: uid(),
    name: o.name,
    role: o.role ?? 'element',
    left: o.left,
    top: o.top,
    width: o.width,
    height: o.height,
    fill: o.fill,
    rx: o.rx ?? 0,
    ry: o.rx ?? 0,
    stroke: o.stroke,
    strokeWidth: o.strokeWidth ?? 0,
    opacity: o.opacity ?? 1,
  });
}

/** Blue → red split background with vertical light streaks and a soft glow, as in the "GOAL GOAL GOAL" poster. */
function posterBackground(W: number, H: number, u: number): FabricObject[] {
  const bg = rect({
    name: 'Sfondo',
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: new Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: W, y2: 0 },
      colorStops: [
        { offset: 0, color: '#0b33b8' },
        { offset: 0.3, color: '#0a2382' },
        { offset: 0.5, color: '#43093c' },
        { offset: 0.7, color: '#a5001c' },
        { offset: 1, color: '#e30613' },
      ],
    }),
  });
  bg.set({ role: 'background', bgFx: 'none' });

  const streak = (x: number, w: number, opacity: number) =>
    rect({
      name: 'Luce',
      role: 'decor',
      left: W * x,
      top: 0,
      width: w * u,
      height: H,
      opacity,
      fill: new Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: 0, y2: H },
        colorStops: [
          { offset: 0, color: 'rgba(255,255,255,0.9)' },
          { offset: 0.55, color: 'rgba(255,255,255,0.25)' },
          { offset: 1, color: 'rgba(255,255,255,0)' },
        ],
      }),
    });

  const glow = rect({
    name: 'Bagliore',
    role: 'decor',
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: new Gradient({
      type: 'radial',
      coords: { x1: W * 0.9, y1: H * 0.86, r1: 0, x2: W * 0.9, y2: H * 0.86, r2: W * 0.42 },
      colorStops: [
        { offset: 0, color: 'rgba(255,255,255,0.45)' },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
    }),
  });

  return [bg, streak(0.06, 26, 0.18), streak(0.1, 8, 0.25), streak(0.19, 14, 0.14), streak(0.27, 5, 0.2), streak(0.76, 10, 0.12), streak(0.86, 30, 0.12), streak(0.94, 6, 0.2), glow];
}

/**
 * Default goal-video layout, modelled on the "GOAL ×4" poster: four stacked GOAL rows (filled /
 * outline alternating) that burst in first, then the minute + scorer bar, then the white card with
 * both team logos, and finally the score between them. Every element stays editable and retimable.
 */
export async function buildGoalVideoDefault(W: number, H: number): Promise<FabricObject[]> {
  const u = W / 1080;

  // --- top card (logos + score) ---
  const cardW = 760 * u;
  const cardH = 300 * u;
  const cardTop = -28 * u;
  const cardMid = cardTop + cardH / 2 + 14 * u;

  // --- bottom bar (minute + scorer) ---
  const barH = 150 * u;
  const barTop = H - barH - Math.max(70 * u, H * 0.07);
  const minuteW = 250 * u;
  const nameW = 620 * u;
  const barLeft = (W - minuteW - nameW) / 2;

  // --- GOAL rows fill the space between card and bar ---
  const rowsTop = cardTop + cardH + 30 * u;
  const rowsBottom = barTop - 30 * u;
  const rowH = (rowsBottom - rowsTop) / 4;
  const goalSize = Math.min(275 * u, rowH * 0.95);

  const rows: FabricObject[] = [];
  for (let i = 0; i < 4; i++) {
    const outline = i % 2 === 1;
    const centerY = rowsTop + rowH * (i + 0.5);
    const row = text({
      name: `GOAL ${i + 1}`,
      text: 'GOAL',
      left: 0,
      top: centerY - goalSize * 0.5,
      width: W,
      fontSize: goalSize,
      fontFamily: GOAL_FONT,
      fontWeight: 700,
      textAlign: 'center',
      charSpacing: 40,
      lineHeight: 0.88,
      keepCase: true,
    });
    if (outline) row.set({ fill: 'rgba(0,0,0,0)', stroke: '#ffffff', strokeWidth: 5 * u, strokeUniform: true });
    row.anim = outline ? anim(i === 1 ? 'fromRight' : 'fromLeft', 0.15 + i * 0.25, 0.4) : anim('pop', 0.15 + i * 0.25, 0.45);
    rows.push(row);
  }

  // --- minute + scorer bar ---
  const minuteBox = rect({ name: 'Box minuto', left: barLeft, top: barTop, width: minuteW, height: barH, fill: '#ffffff' });
  minuteBox.anim = anim('fromLeft', 1.45, 0.45);
  const minuteSize = 100 * u;
  const minute = text({
    name: 'Minuto',
    binding: 'goal:minute',
    text: "34'",
    left: barLeft,
    top: barTop + (barH - minuteSize * 1.13) / 2,
    width: minuteW,
    fontSize: minuteSize,
    fontFamily: GOAL_FONT,
    fontWeight: 700,
    textAlign: 'center',
    fill: '#000000',
    lineHeight: 1,
  });
  minute.anim = anim('fromLeft', 1.5, 0.45);

  const nameBox = rect({ name: 'Box marcatore', left: barLeft + minuteW, top: barTop, width: nameW, height: barH, fill: BAR_RED, stroke: '#ffffff', strokeWidth: 5 * u });
  nameBox.anim = anim('fromRight', 1.6, 0.45);
  const nameSize = 74 * u;
  const scorer = text({
    name: 'Marcatore',
    binding: 'goal:scorer',
    text: 'MARIO ROSSI',
    left: barLeft + minuteW + 20 * u,
    top: barTop + (barH - nameSize * 1.13) / 2,
    width: nameW - 40 * u,
    fontSize: nameSize,
    fontFamily: GOAL_FONT,
    fontWeight: 400,
    textAlign: 'center',
    lineHeight: 1,
  });
  scorer.textCase = 'upper';
  scorer.anim = anim('fromRight', 1.65, 0.45);

  // --- top card: logos, then score ---
  const card = rect({ name: 'Box loghi', left: (W - cardW) / 2, top: cardTop, width: cardW, height: cardH, fill: '#ffffff', rx: 28 * u });
  card.anim = anim('fromTop', 2.3, 0.5);

  const logoBox = 190 * u;
  const homeLogo = await image(LOGO_PLACEHOLDER, { name: 'Logo casa', binding: 'homeLogo', cx: W / 2 - 245 * u, cy: cardMid, boxW: logoBox, boxH: logoBox });
  homeLogo.anim = anim('pop', 2.6, 0.5);
  const awayLogo = await image(LOGO_PLACEHOLDER, { name: 'Logo ospite', binding: 'awayLogo', cx: W / 2 + 245 * u, cy: cardMid, boxW: logoBox, boxH: logoBox });
  awayLogo.anim = anim('pop', 2.75, 0.5);

  const scoreSize = 120 * u;
  const score = text({
    name: 'Risultato',
    binding: 'goal:scoreAfter',
    text: '1 - 0',
    left: W / 2 - 150 * u,
    top: cardMid - (scoreSize * 1.13) / 2,
    width: 300 * u,
    fontSize: scoreSize,
    fontFamily: GOAL_FONT,
    fontWeight: 700,
    textAlign: 'center',
    fill: '#000000',
    lineHeight: 1,
  });
  score.anim = anim('pop', 3.2, 0.55);

  return [...posterBackground(W, H, u), ...rows, minuteBox, nameBox, minute, scorer, card, homeLogo, awayLogo, score];
}
