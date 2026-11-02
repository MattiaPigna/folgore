import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import { getAssetUrl } from './assets';
import { SANS_FONT, SCORE_FONT, SCRIPT_FONT } from './fonts';
import { computeScore, formatMinute, sortGoals, type Score } from './score';
import { mainSponsor } from './sponsorUtils';
import type { Match, Settings } from '../types';

/**
 * Animated goal card. One pure function draws a frame for time t; the live preview and the
 * MP4 export both use it, so the exported video is frame-exact (no real-time recording).
 */

export const FPS = 30;
export const DURATION = 7; // seconds (Reels >= 3 s; the last ~3 s hold the final layout)

export type GoalCardFormat = 'story' | 'post';
export type GoalCardBg = 'photo' | 'red' | 'dark';

export const GOAL_CARD_SIZES: Record<GoalCardFormat, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: 'Storia / Reel · 1080×1920' },
  post: { w: 1080, h: 1350, label: 'Post · 1080×1350' },
};

export interface GoalCardOptions {
  format: GoalCardFormat;
  bg: GoalCardBg;
  title: string;
  accent: string;
  showSponsor: boolean;
}

export const DEFAULT_GOAL_CARD: GoalCardOptions = { format: 'story', bg: 'red', title: 'Gol!', accent: '#e11d48', showSponsor: true };

type Img = HTMLImageElement;

export interface GoalCardData {
  scorer: string;
  minute: string;
  typeLabel: string;
  teamName: string;
  side: 'home' | 'away';
  homeName: string;
  awayName: string;
  topLabel: string;
  prev: Score;
  next: Score;
  homeLogo: Img | null;
  awayLogo: Img | null;
  photo: Img | null;
  sponsor: Img | null;
  hasPhoto: boolean;
}

interface Particle {
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: number;
  delay: number;
}

async function loadImg(assetId: string | null | undefined): Promise<Img | null> {
  const url = await getAssetUrl(assetId);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Score just before and right after the given goal (chronological order). */
export function scoreAround(match: Match, goalId: string): { prev: Score; next: Score } | null {
  const sorted = sortGoals(match.goals);
  const i = sorted.findIndex((g) => g.id === goalId);
  if (i < 0) return null;
  return { prev: computeScore(sorted.slice(0, i)), next: computeScore(sorted.slice(0, i + 1)) };
}

export async function buildGoalCardData(match: Match, goalId: string, settings: Settings): Promise<GoalCardData> {
  const goal = match.goals.find((g) => g.id === goalId);
  const around = scoreAround(match, goalId);
  if (!goal || !around) throw new Error('Gol non trovato.');
  await Promise.all(
    [`400 200px "${SCRIPT_FONT}"`, `700 100px "${SCORE_FONT}"`, `600 100px "${SCORE_FONT}"`, `600 40px "${SANS_FONT}"`, `700 40px "${SANS_FONT}"`].map((f) =>
      document.fonts.load(f, 'Gol!0123AZ').catch(() => undefined),
    ),
  );
  const sp = mainSponsor(settings);
  const [homeLogo, awayLogo, photo, sponsor] = await Promise.all([loadImg(match.homeLogoId), loadImg(match.awayLogoId), loadImg(match.photoId), loadImg(sp?.assetId)]);
  const teamName = goal.team === 'home' ? match.homeName : match.awayName;
  const round = match.round.trim();
  return {
    scorer: goal.player.trim(),
    minute: formatMinute(goal),
    typeLabel: goal.type === 'penalty' ? 'SU RIGORE' : goal.type === 'own' ? 'AUTOGOL' : '',
    teamName,
    side: goal.team,
    homeName: match.homeName,
    awayName: match.awayName,
    topLabel: [match.competition.trim(), round ? `${round}ª GIORNATA` : ''].filter(Boolean).join(' · ').toUpperCase(),
    prev: around.prev,
    next: around.next,
    homeLogo,
    awayLogo,
    photo,
    sponsor,
    hasPhoto: !!photo,
  };
}

/* ---------- animation helpers ---------- */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParticles(n: number): Particle[] {
  const r = mulberry32(42);
  return Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const s = 500 + r() * 1300;
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 500, rot: r() * 6, vr: (r() - 0.5) * 14, w: 9 + r() * 10, h: 16 + r() * 16, color: Math.floor(r() * 3), delay: r() * 0.12 };
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, size: number, maxW: number): number {
  let s = size;
  ctx.font = `${weight} ${s}px "${family}"`;
  while (s > 20 && ctx.measureText(text).width > maxW) {
    s *= 0.94;
    ctx.font = `${weight} ${s}px "${family}"`;
  }
  return s;
}

function drawContain(ctx: CanvasRenderingContext2D, img: Img, cx: number, cy: number, box: number) {
  const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/* ---------- renderer ---------- */

export interface GoalCardRenderer {
  width: number;
  height: number;
  /** Draws the frame at time t (seconds) on a context of size width×height (any transform applied by the caller). */
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

export function createRenderer(data: GoalCardData, opts: GoalCardOptions): GoalCardRenderer {
  const { w: W, h: H } = GOAL_CARD_SIZES[opts.format];
  const story = opts.format === 'story';
  const u = W / 1080;
  const s = story ? 1 : 0.8; // type scale for the shorter post format
  const A = opts.accent;
  const particles = makeParticles(110);
  const colors = [A, '#ffffff', '#fbbf24'];
  const Y = story
    ? { top: 0.075, title: 0.28, name: 0.47, pill: 0.535, board: 0.69, sponsor: 0.895 }
    : { top: 0.05, title: 0.255, name: 0.465, pill: 0.55, board: 0.735, sponsor: 0.915 };

  // Background is static: render it once.
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const b = bg.getContext('2d')!;
  b.fillStyle = '#050507';
  b.fillRect(0, 0, W, H);
  if (opts.bg === 'photo' && data.photo) {
    const img = data.photo;
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    b.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    b.fillStyle = 'rgba(0,0,0,0.55)';
    b.fillRect(0, 0, W, H);
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.5, rgba(A, 0.18));
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
  } else {
    const g = b.createRadialGradient(W / 2, H * Y.title, 0, W / 2, H * Y.title, H * 0.85);
    if (opts.bg === 'red') {
      g.addColorStop(0, rgba(A, 0.95));
      g.addColorStop(0.35, rgba(A, 0.45));
      g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      g.addColorStop(0, rgba(A, 0.35));
      g.addColorStop(0.5, rgba(A, 0.08));
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    // diagonal stripes texture
    b.save();
    b.globalAlpha = 0.05;
    b.strokeStyle = '#ffffff';
    b.lineWidth = 2 * u;
    for (let x = -H; x < W + H; x += 26 * u) {
      b.beginPath();
      b.moveTo(x, 0);
      b.lineTo(x + H * 0.6, H);
      b.stroke();
    }
    b.restore();
  }
  const v = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  b.fillStyle = v;
  b.fillRect(0, 0, W, H);

  const scorerText = (data.scorer || data.teamName || 'GOL').toUpperCase();
  const pillText = [data.minute, data.typeLabel].filter(Boolean).join('  ·  ');

  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    ctx.save();
    // --- camera: slow zoom + impact shake
    const shakeAmp = t > 0.42 ? 24 * u * Math.max(0, 1 - (t - 0.42) / 0.55) : 0;
    const sx = Math.sin(t * 93) * shakeAmp;
    const sy = Math.cos(t * 71) * shakeAmp;
    const zoom = 1.12 - 0.12 * easeOut(clamp(t / DURATION));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.globalAlpha = prog(t, 0.05, 0.3);
    ctx.drawImage(bg, -W / 2, -H / 2);
    ctx.restore();
    ctx.translate(sx, sy);

    const tx = W / 2;
    const ty = H * Y.title;

    // --- light rays behind the title
    const rayA = prog(t, 0.3, 0.9) * (0.16 + 0.05 * Math.sin(t * 3));
    if (rayA > 0) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(t * 0.18);
      const R = Math.hypot(W, H);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
      rg.addColorStop(0, `rgba(255,255,255,${rayA})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.07) * R, Math.sin(a - 0.07) * R);
        ctx.lineTo(Math.cos(a + 0.07) * R, Math.sin(a + 0.07) * R);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // --- shockwave ring at impact
    const ring = prog(t, 0.42, 1.1);
    if (ring > 0 && ring < 1) {
      ctx.save();
      ctx.strokeStyle = rgba('#ffffff', 0.7 * (1 - ring));
      ctx.lineWidth = 18 * u * (1 - ring);
      ctx.beginPath();
      ctx.arc(tx, ty, 120 * u + easeOut(ring) * 700 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- title "Gol!" slam
    const pt = prog(t, 0.12, 0.55);
    if (pt > 0) {
      const scale = 2.8 - 1.8 * easeBack(pt);
      const pulse = t > 3 ? 1 + 0.025 * Math.sin((t - 3) * 4) : 1;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale * pulse, scale * pulse);
      ctx.rotate(-0.06);
      ctx.globalAlpha = clamp(pt * 3);
      const size = fitFont(ctx, opts.title, '400', SCRIPT_FONT, 330 * u * s, W * 0.86);
      ctx.font = `400 ${size}px "${SCRIPT_FONT}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glow = 0.75 + 0.25 * Math.sin(t * 5);
      ctx.shadowColor = rgba(A, 1);
      ctx.shadowBlur = 60 * u * glow;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(opts.title, 0, 0);
      ctx.shadowBlur = 22 * u;
      ctx.shadowColor = rgba(A, 0.9);
      ctx.fillText(opts.title, 0, 0);
      ctx.restore();
    }

    // --- confetti burst
    if (t > 0.42) {
      for (const p of particles) {
        const dt = t - 0.42 - p.delay;
        if (dt <= 0) continue;
        const drag = 1 - Math.exp(-2.2 * dt);
        const x = tx + ((p.vx * drag) / 2.2) * u;
        const y = ty + ((p.vy * drag) / 2.2) * u + 0.5 * 700 * dt * dt * u;
        const a = clamp(1 - (dt - 2.6) / 1.2);
        if (a <= 0 || y > H + 50) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.vr * dt);
        ctx.scale(1, Math.cos(dt * 9 + p.rot));
        ctx.fillStyle = colors[p.color];
        ctx.fillRect((-p.w * u) / 2, (-p.h * u) / 2, p.w * u, p.h * u);
        ctx.restore();
      }
    }

    // --- flash
    const fl = t < 0.12 ? 0 : 1 - prog(t, 0.12, 0.62);
    if (fl > 0 && t >= 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 * fl * fl})`;
      ctx.fillRect(-sx, -sy, W, H);
    }

    // --- top label
    const pl = prog(t, 0.9, 1.3);
    if (pl > 0 && data.topLabel) {
      ctx.save();
      ctx.globalAlpha = pl;
      ctx.font = `600 ${30 * u * s}px "${SANS_FONT}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      (ctx as any).letterSpacing = `${6 * u}px`;
      ctx.fillText(data.topLabel, W / 2, H * Y.top + (1 - easeOut(pl)) * -20 * u);
      ctx.restore();
    }

    // --- scorer name: clip reveal from the left with an accent wipe bar
    const pn = prog(t, 1.0, 1.55);
    if (pn > 0) {
      const ny = H * Y.name;
      ctx.save();
      const size = fitFont(ctx, scorerText, '700', SCORE_FONT, 150 * u * s, W - 120 * u);
      ctx.font = `700 ${size}px "${SCORE_FONT}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(scorerText).width;
      const left = W / 2 - tw / 2 - 30 * u;
      const full = tw + 60 * u;
      const e = easeInOut(pn);
      // wipe bar: grows, then shrinks to the right revealing the text
      const barL = left + full * clamp((pn - 0.45) / 0.55);
      const barR = left + full * clamp(pn / 0.5);
      ctx.fillStyle = A;
      if (barR > barL) ctx.fillRect(barL, ny - size * 0.5, barR - barL, size);
      ctx.beginPath();
      ctx.rect(left, ny - size, full * clamp((pn - 0.25) / 0.5), size * 2);
      ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 20 * u;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(scorerText, W / 2 + (1 - e) * -30 * u, ny);
      ctx.restore();
    }

    // --- minute pill + team
    const pp = prog(t, 1.45, 1.9);
    if (pp > 0) {
      const py = H * Y.pill + (1 - easeOut(pp)) * 30 * u;
      ctx.save();
      ctx.globalAlpha = pp;
      ctx.font = `700 ${46 * u * s}px "${SCORE_FONT}"`;
      (ctx as any).letterSpacing = `${3 * u}px`;
      const pw = ctx.measureText(pillText).width + 70 * u;
      const ph = 74 * u * s;
      ctx.fillStyle = A;
      ctx.beginPath();
      ctx.roundRect(W / 2 - pw / 2, py - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillText, W / 2, py + 2 * u);
      ctx.font = `600 ${32 * u * s}px "${SANS_FONT}"`;
      (ctx as any).letterSpacing = `${4 * u}px`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(data.teamName.toUpperCase(), W / 2, py + ph * 0.5 + 40 * u * s);
      ctx.restore();
    }

    // --- scoreboard with the score flip
    const pb = prog(t, 1.9, 2.4);
    if (pb > 0) {
      const by = H * Y.board + (1 - easeOut(pb)) * 60 * u;
      const flipT = 2.75;
      const pf = prog(t, flipT, flipT + 0.45);
      const boxW = W - 120 * u;
      const boxH = 300 * u * s;
      ctx.save();
      ctx.globalAlpha = pb;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.roundRect(W / 2 - boxW / 2, by - boxH / 2, boxW, boxH, 36 * u);
      ctx.fill();
      ctx.stroke();
      const logoBox = 190 * u * s;
      const lx = W / 2 - boxW / 2 + 40 * u + logoBox / 2;
      const rx = W / 2 + boxW / 2 - 40 * u - logoBox / 2;
      for (const side of ['home', 'away'] as const) {
        const img = side === 'home' ? data.homeLogo : data.awayLogo;
        const cx = side === 'home' ? lx : rx;
        const bump = side === data.side && pf > 0 ? 1 + 0.18 * Math.sin(Math.PI * clamp(pf * 1.4)) : 1;
        ctx.save();
        ctx.translate(cx, by);
        ctx.scale(bump, bump);
        if (img) drawContain(ctx, img, 0, 0, logoBox);
        else {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.arc(0, 0, logoBox * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `700 ${70 * u * s}px "${SCORE_FONT}"`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((side === 'home' ? data.homeName : data.awayName).slice(0, 1).toUpperCase(), 0, 0);
        }
        ctx.restore();
      }
      // digits
      const size = 210 * u * s;
      ctx.font = `700 ${size}px "${SCORE_FONT}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const gap = 150 * u * s;
      const digit = (side: 'home' | 'away', cx: number) => {
        const oldV = data.prev[side];
        const newV = data.next[side];
        if (oldV === newV || pf <= 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(pf > 0 ? newV : oldV), cx, by + 6 * u);
          return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - size, by - boxH / 2, size * 2, boxH);
        ctx.clip();
        const e = easeOut(clamp(pf * 1.6));
        ctx.globalAlpha = pb * (1 - e);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(oldV), cx, by + 6 * u + e * size);
        ctx.globalAlpha = pb;
        const eb = easeBack(pf);
        ctx.shadowColor = A;
        ctx.shadowBlur = 50 * u * (1 - pf * 0.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(newV), cx, by + 6 * u - (1 - eb) * size);
        ctx.restore();
      };
      digit('home', W / 2 - gap / 2 - 20 * u);
      digit('away', W / 2 + gap / 2 + 20 * u);
      ctx.fillStyle = A;
      ctx.fillRect(W / 2 - 22 * u, by - 5 * u, 44 * u, 12 * u);
      // flash ring on the scoring digit
      if (pf > 0 && pf < 1) {
        const cx = data.side === 'home' ? W / 2 - gap / 2 - 20 * u : W / 2 + gap / 2 + 20 * u;
        ctx.strokeStyle = rgba(A, 1 - pf);
        ctx.lineWidth = 10 * u * (1 - pf);
        ctx.beginPath();
        ctx.arc(cx, by, 60 * u + pf * 160 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- main sponsor
    const ps = prog(t, 3.0, 3.5);
    if (ps > 0 && opts.showSponsor && data.sponsor) {
      const sy0 = H * Y.sponsor;
      ctx.save();
      ctx.globalAlpha = ps;
      ctx.font = `600 ${22 * u}px "${SANS_FONT}"`;
      (ctx as any).letterSpacing = `${5 * u}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('MAIN SPONSOR', W / 2, sy0 - 92 * u * s);
      // light card so dark and coloured logos stay readable
      const cw = 440 * u * s;
      const ch = 130 * u * s;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - cw / 2, sy0 - ch / 2 + 10 * u, cw, ch, 22 * u);
      ctx.fill();
      const img = data.sponsor;
      const k = Math.min((cw * 0.84) / img.naturalWidth, (ch * 0.74) / img.naturalHeight);
      ctx.drawImage(img, W / 2 - (img.naturalWidth * k) / 2, sy0 - (img.naturalHeight * k) / 2 + 10 * u, img.naturalWidth * k, img.naturalHeight * k);
      ctx.restore();
    }
    ctx.restore();
  };

  return { width: W, height: H, draw };
}

/* ---------- export ---------- */

export async function renderPng(r: GoalCardRenderer, t = DURATION): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  r.draw(c.getContext('2d')!, t);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG non generato'))), 'image/png'));
}

export class VideoUnsupportedError extends Error {}

/** Encodes the animation to H.264 MP4 (fast start), frame by frame. */
export async function renderMp4(r: GoalCardRenderer, onProgress?: (p: number) => void): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext('2d')!;
  const frames = Math.round(DURATION * FPS);
  const bitrate = 10_000_000;
  if (typeof VideoEncoder !== 'undefined' && (await canEncodeVideo('avc', { width: r.width, height: r.height, bitrate }))) {
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const source = new CanvasSource(c, { codec: 'avc', bitrate, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();
    for (let i = 0; i < frames; i++) {
      r.draw(ctx, i / FPS);
      await source.add(i / FPS, 1 / FPS);
      onProgress?.((i + 1) / frames);
    }
    await output.finalize();
    return new Blob([output.target.buffer!], { type: 'video/mp4' });
  }
  return recordRealtime(c, ctx, r, frames, onProgress);
}

/** Fallback for browsers without WebCodecs H.264: real-time MediaRecorder, MP4 only (Instagram rejects WebM). */
async function recordRealtime(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, r: GoalCardRenderer, frames: number, onProgress?: (p: number) => void): Promise<Blob> {
  const mime = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new VideoUnsupportedError('Questo browser non sa creare video MP4. Usa Google Chrome o Microsoft Edge aggiornati (su PC o Android).');
  const stream = c.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  r.draw(ctx, 0);
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      r.draw(ctx, Math.min(t, DURATION));
      onProgress?.(Math.min(1, t / DURATION));
      if (t >= DURATION) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  void frames;
  return new Blob(chunks, { type: 'video/mp4' });
}
