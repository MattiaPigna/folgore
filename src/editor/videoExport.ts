import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import { StaticCanvas, type FabricObject } from 'fabric';
import { collectFonts, ensureFontsFor } from '../services/fonts';
import type { FormatSpec, Match, Settings } from '../types';
import { applyBgFx, applyColorFx, fxSnapshot, type FxSnapshot } from './colorFx';
import { applyGoalBindings } from './goalBindings';
import { hydrate } from './serialization';
import { applyAnimFrame, restSnapshot, type AnimSnapshot } from './videoAnim';
import { DEFAULT_EXTRAS, drawEffects, makeConfetti, shakeOffset, type VideoExtras } from './videoEffects';

export class VideoUnsupportedError extends Error {}

export interface GoalVideoFrame {
  canvas: StaticCanvas;
  objects: FabricObject[];
  rests: AnimSnapshot[];
  fxBase: FxSnapshot[];
  particles: ReturnType<typeof makeConfetti>;
}

/** Builds and binds an offscreen canvas ready to be driven frame-by-frame. Caller must `canvas.dispose()` when done. */
export async function prepareGoalVideoCanvas(stored: any, format: FormatSpec, match: Match, goalId: string | null, settings: Settings): Promise<GoalVideoFrame> {
  const canvas = new StaticCanvas(document.createElement('canvas'), { width: format.width, height: format.height, enableRetinaScaling: false, renderOnAddRemove: false });
  await ensureFontsFor(collectFonts(stored));
  await canvas.loadFromJSON(await hydrate(stored));
  await applyGoalBindings(canvas, match, goalId, settings);
  const objects = canvas.getObjects();
  const rests = objects.map(restSnapshot);
  const fxBase = objects.map(fxSnapshot);
  return { canvas, objects, rests, fxBase, particles: makeConfetti() };
}

const unitOf = (format: FormatSpec) => format.width / 1080;

/** Renders one frame at time t: each object's entrance animation, then the global effects post-process. */
export function drawGoalVideoFrame(frame: GoalVideoFrame, t: number, format: FormatSpec, extras: VideoExtras, accent = '#e11d48'): void {
  const u = unitOf(format);
  const { sx, sy } = extras.shake ? shakeOffset(t, extras.impactTime, u) : { sx: 0, sy: 0 };
  frame.canvas.setViewportTransform([1, 0, 0, 1, sx, sy]);
  frame.objects.forEach((o, i) => {
    applyAnimFrame(o, frame.rests[i], t, u);
    if (o.bgFx && o.bgFx !== 'none') applyBgFx(o, frame.fxBase[i], t, accent);
    else applyColorFx(o, frame.fxBase[i], t, accent);
  });
  frame.canvas.renderAll();
  drawEffects(frame.canvas.getContext(), t, extras, format.width, format.height, u, accent, frame.particles);
}

/** Encodes the goal video to H.264 MP4 (fast start), frame by frame. */
export async function renderGoalVideoMp4(
  stored: any,
  format: FormatSpec,
  match: Match,
  goalId: string | null,
  settings: Settings,
  duration: number,
  extras: VideoExtras = DEFAULT_EXTRAS,
  accent = '#e11d48',
  fps = 30,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const frame = await prepareGoalVideoCanvas(stored, format, match, goalId, settings);
  try {
    const frames = Math.round(duration * fps);
    const bitrate = 10_000_000;
    const el = frame.canvas.getElement();
    if (typeof VideoEncoder !== 'undefined' && (await canEncodeVideo('avc', { width: format.width, height: format.height, bitrate }))) {
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
      const source = new CanvasSource(el, { codec: 'avc', bitrate, keyFrameInterval: 1 });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      for (let i = 0; i < frames; i++) {
        const t = i / fps;
        drawGoalVideoFrame(frame, t, format, extras, accent);
        await source.add(t, 1 / fps);
        onProgress?.((i + 1) / frames);
      }
      await output.finalize();
      return new Blob([output.target.buffer!], { type: 'video/mp4' });
    }
    return await recordRealtime(frame, format, extras, accent, duration, fps, onProgress);
  } finally {
    frame.canvas.dispose();
  }
}

/** Fallback for browsers without WebCodecs H.264: real-time MediaRecorder, MP4 only (Instagram rejects WebM). */
async function recordRealtime(
  frame: GoalVideoFrame,
  format: FormatSpec,
  extras: VideoExtras,
  accent: string,
  duration: number,
  fps: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const el = frame.canvas.getElement();
  const mime = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new VideoUnsupportedError('Questo browser non sa creare video MP4. Usa Google Chrome o Microsoft Edge aggiornati (su PC o Android).');
  const stream = el.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  drawGoalVideoFrame(frame, 0, format, extras, accent);
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawGoalVideoFrame(frame, Math.min(t, duration), format, extras, accent);
      onProgress?.(Math.min(1, t / duration));
      if (t >= duration) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  return new Blob(chunks, { type: 'video/mp4' });
}

/** Still frame at a given instant (e.g. the end of the animation), as a PNG. */
export async function renderGoalVideoPng(
  stored: any,
  format: FormatSpec,
  match: Match,
  goalId: string | null,
  settings: Settings,
  t: number,
  extras: VideoExtras = DEFAULT_EXTRAS,
  accent = '#e11d48',
): Promise<Blob> {
  const frame = await prepareGoalVideoCanvas(stored, format, match, goalId, settings);
  try {
    drawGoalVideoFrame(frame, t, format, extras, accent);
    const url = frame.canvas.toDataURL({ format: 'png', multiplier: 1 });
    return (await fetch(url)).blob();
  } finally {
    frame.canvas.dispose();
  }
}
