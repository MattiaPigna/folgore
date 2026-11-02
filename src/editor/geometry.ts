import { FabricImage, Point, type FabricObject, type StaticCanvas } from 'fabric';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Axis-aligned bounding box in scene (canvas) coordinates. */
export function sceneBox(obj: FabricObject): Box {
  obj.setCoords();
  const pts = obj.getCoords();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function moveBoxTo(obj: FabricObject, x: number | null, y: number | null): void {
  const b = sceneBox(obj);
  if (x !== null) obj.set('left', (obj.left ?? 0) + (x - b.left));
  if (y !== null) obj.set('top', (obj.top ?? 0) + (y - b.top));
  obj.setCoords();
}

/** Fits an image into a box, keeping its center. `cover` crops via cropX/cropY. */
export function fitImageToBox(img: FabricImage, boxW: number, boxH: number, mode: 'contain' | 'cover' = 'contain'): void {
  const center = img.getCenterPoint();
  const el = img.getElement() as HTMLImageElement;
  const nw = (el as any).naturalWidth || el.width || img.width;
  const nh = (el as any).naturalHeight || el.height || img.height;
  if (!nw || !nh || !boxW || !boxH) return;
  if (mode === 'cover') {
    const s = Math.max(boxW / nw, boxH / nh);
    const vw = boxW / s;
    const vh = boxH / s;
    img.set({ cropX: (nw - vw) / 2, cropY: (nh - vh) / 2, width: vw, height: vh, scaleX: s, scaleY: s });
  } else {
    const s = Math.min(boxW / nw, boxH / nh);
    img.set({ cropX: 0, cropY: 0, width: nw, height: nh, scaleX: s, scaleY: s });
  }
  img.setPositionByOrigin(center, 'center', 'center');
  img.setCoords();
}

/** Scales a background image to cover the whole canvas, centered. */
export function coverCanvas(img: FabricImage, w: number, h: number): void {
  const el = img.getElement() as HTMLImageElement;
  const nw = (el as any).naturalWidth || img.width;
  const nh = (el as any).naturalHeight || img.height;
  const s = Math.max(w / nw, h / nh);
  img.set({ cropX: 0, cropY: 0, width: nw, height: nh, scaleX: s, scaleY: s, angle: 0, originX: 'center', originY: 'center' });
  img.setPositionByOrigin(new Point(w / 2, h / 2), 'center', 'center');
  img.setCoords();
}

/**
 * Adapts every object of a canvas from one format to another:
 * centers are scaled per-axis, sizes uniformly by the smaller ratio.
 */
export function adaptObjects(canvas: StaticCanvas, fromW: number, fromH: number, toW: number, toH: number): void {
  const rx = toW / fromW;
  const ry = toH / fromH;
  // Sizes follow the width (as the layouts do) unless the aspect changes drastically;
  // this keeps format round trips (e.g. 1080×1350 ↔ 1080×1920) lossless.
  const ratio = ry / rx;
  const s = ratio >= 0.5 && ratio <= 2 ? rx : Math.min(rx, ry);
  for (const obj of canvas.getObjects()) {
    if (obj.role === 'background') {
      if (obj instanceof FabricImage) coverCanvas(obj, toW, toH);
      else obj.set({ left: 0, top: 0, scaleX: 1, scaleY: 1, width: toW, height: toH });
      obj.setCoords();
      continue;
    }
    const c = obj.getCenterPoint();
    const fullWidth = Math.abs(sceneBox(obj).width - fromW) < 2;
    if (fullWidth && rx !== s) {
      obj.set({ scaleX: (obj.scaleX ?? 1) * rx, scaleY: (obj.scaleY ?? 1) * s });
    } else {
      obj.set({ scaleX: (obj.scaleX ?? 1) * s, scaleY: (obj.scaleY ?? 1) * s });
    }
    if (obj.boxW) obj.boxW *= s;
    if (obj.boxH) obj.boxH *= s;
    obj.setPositionByOrigin(new Point(c.x * rx, c.y * ry), 'center', 'center');
    obj.setCoords();
  }
}
