import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricImage,
  FabricObject,
  Point,
  Rect,
  Shadow,
  Textbox,
  filters,
  util,
} from 'fabric';
import { uid } from '../services/database';
import { SANS_FONT, collectFonts, ensureFontsFor } from '../services/fonts';
import type { FormatSpec } from '../types';
import { CUSTOM_PROPS } from './fabricSetup';
import { adaptObjects, coverCanvas, fitImageToBox, moveBoxTo, sceneBox } from './geometry';
import { makeDefaultBackground } from './layouts';
import { applyTextCase, type TextCase } from './textCase';
import { applyImageFx } from './imageEffects';
import { canvasToRaw, hydrate, toStored } from './serialization';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type FilterName = 'Brightness' | 'Contrast';
export type LogoColor = 'original' | 'white' | 'black' | 'gray';

const HISTORY_LIMIT = 80;

export class EditorController {
  canvas: Canvas | null = null;
  width = 1080;
  height = 1350;
  zoom = 0.5;
  snapEnabled = true;

  /** UI refresh (selection, properties, layers). */
  onChange: (() => void) | null = null;
  /** Content changed and should be persisted. */
  onCommit: (() => void) | null = null;
  /** Called after undo/redo so bound elements reflect current match data (undo reverts layout only). */
  onRestored: (() => Promise<unknown>) | null = null;

  private history: string[] = [];
  private hIndex = -1;
  private suspended = 0;
  /** Group currently "entered": its members are selected one by one. */
  isolated: string | null = null;
  private expanding = false;
  /** Asks the page to re-apply data bindings (e.g. after changing text case). */
  onRebind: (() => Promise<unknown>) | null = null;
  private clipboard: any[] | null = null;
  private pasteCount = 0;
  private guides: { v: number[]; h: number[] } = { v: [], h: [] };
  private recordTimer: number | undefined;
  private notifyQueued = false;
  private pendingFilter = new Set<FabricImage>();
  private filterFrame = 0;

  mount(el: HTMLCanvasElement): void {
    const c = new Canvas(el, {
      width: this.width * this.zoom,
      height: this.height * this.zoom,
      backgroundColor: '#000000',
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      stopContextMenu: true,
      selectionColor: 'rgba(244,63,94,0.08)',
      selectionBorderColor: '#f43f5e',
      selectionLineWidth: 1,
    });
    this.canvas = c;
    c.on('selection:created', () => this.onSelection());
    c.on('selection:updated', () => this.onSelection());
    c.on('selection:cleared', () => {
      if (!this.expanding) this.isolated = null;
      this.notify();
    });
    // Double click on a grouped element: edit only that element (Canva-style "enter the group").
    c.on('mouse:dblclick', (e) => this.enterGroup(e.scenePoint));
    c.on('object:moving', (e) => {
      this.snap(e.target);
      this.notify();
    });
    c.on('object:scaling', () => this.notify());
    c.on('object:rotating', () => this.notify());
    c.on('object:resizing', () => this.notify());
    c.on('object:modified', (e) => {
      const targets = e.target instanceof ActiveSelection ? e.target.getObjects() : [e.target];
      for (const t of targets) {
        if (t instanceof FabricImage && t.binding) {
          t.boxW = t.getScaledWidth();
          t.boxH = t.getScaledHeight();
        }
      }
      this.record();
      this.notify();
    });
    c.on('text:changed', (e) => {
      const t = e.target as FabricObject;
      if (t.binding) t.autoText = false;
      this.notify();
    });
    c.on('text:editing:exited', () => this.record());
    c.on('mouse:up', () => {
      if (this.guides.v.length || this.guides.h.length) {
        this.guides = { v: [], h: [] };
        c.requestRenderAll();
      }
    });
    c.on('after:render', ({ ctx }) => this.drawGuides(ctx as CanvasRenderingContext2D));
  }

  dispose(): void {
    window.clearTimeout(this.recordTimer);
    this.canvas?.dispose();
    this.canvas = null;
    this.history = [];
    this.hIndex = -1;
    this.onChange = null;
    this.onCommit = null;
    this.onRestored = null;
    this.onRebind = null;
    this.isolated = null;
  }

  // ---------- loading / saving ----------

  /** Marks the current state as the history baseline. */
  resetHistory(): void {
    if (!this.canvas) return;
    this.history = [JSON.stringify(canvasToRaw(this.canvas))];
    this.hIndex = 0;
    this.notify();
  }

  /** Replaces the whole content but keeps undo history (e.g. applying a template). */
  async replaceContent(stored: any, format: FormatSpec, beforeRecord?: () => Promise<unknown>): Promise<void> {
    const c = this.canvas;
    if (!c) return;
    this.suspended++;
    try {
      this.width = format.width;
      this.height = format.height;
      c.discardActiveObject();
      await ensureFontsFor(collectFonts(stored));
      await c.loadFromJSON(await hydrate(stored));
      this.applyZoom();
      if (beforeRecord) await beforeRecord();
    } finally {
      this.suspended--;
    }
    c.requestRenderAll();
    this.record();
  }

  async load(stored: any, format: FormatSpec): Promise<void> {
    const c = this.canvas;
    if (!c) return;
    this.suspended++;
    try {
      this.width = format.width;
      this.height = format.height;
      c.discardActiveObject();
      await ensureFontsFor(collectFonts(stored));
      await c.loadFromJSON(await hydrate(stored));
      this.applyZoom();
      c.requestRenderAll();
    } finally {
      this.suspended--;
    }
    this.history = [JSON.stringify(canvasToRaw(c))];
    this.hIndex = 0;
    this.notify();
  }

  /** Storable JSON (asset references instead of object URLs). */
  serialize(): any {
    if (!this.canvas) return null;
    return toStored(canvasToRaw(this.canvas));
  }

  /** Run bulk programmatic changes, then record a single history entry. */
  async batch(fn: () => Promise<boolean | void> | boolean | void): Promise<void> {
    this.suspended++;
    let changed: boolean | void;
    try {
      changed = await fn();
    } finally {
      this.suspended--;
    }
    if (changed !== false) this.record();
    this.canvas?.requestRenderAll();
    this.notify();
  }

  // ---------- history ----------

  record(): void {
    const c = this.canvas;
    if (!c || this.suspended) return;
    window.clearTimeout(this.recordTimer);
    const snap = JSON.stringify(canvasToRaw(c));
    if (snap === this.history[this.hIndex]) return;
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.hIndex = this.history.length - 1;
    this.onCommit?.();
    this.notify();
  }

  /** Debounced record for continuous inputs (sliders, typing in fields). */
  scheduleRecord(): void {
    window.clearTimeout(this.recordTimer);
    this.recordTimer = window.setTimeout(() => this.record(), 350);
  }

  get canUndo(): boolean {
    return this.hIndex > 0;
  }
  get canRedo(): boolean {
    return this.hIndex < this.history.length - 1;
  }

  async undo(): Promise<void> {
    this.flushPending();
    if (!this.canUndo) return;
    this.hIndex--;
    await this.restore(this.history[this.hIndex]);
  }

  async redo(): Promise<void> {
    if (!this.canRedo) return;
    this.hIndex++;
    await this.restore(this.history[this.hIndex]);
  }

  private flushPending(): void {
    if (this.recordTimer !== undefined) {
      window.clearTimeout(this.recordTimer);
      this.recordTimer = undefined;
      this.record();
    }
  }

  private async restore(snap: string): Promise<void> {
    const c = this.canvas;
    if (!c) return;
    this.suspended++;
    try {
      c.discardActiveObject();
      await c.loadFromJSON(JSON.parse(snap));
      if (this.onRestored) await this.onRestored();
      c.requestRenderAll();
    } finally {
      this.suspended--;
    }
    this.onCommit?.();
    this.notify();
  }

  // ---------- notifications ----------

  notify(): void {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      this.onChange?.();
    });
  }

  // ---------- groups ----------

  groupMembers(groupId: string): FabricObject[] {
    return this.objects.filter((o) => o.groupId === groupId);
  }

  /** Selecting part of a group selects the whole group, unless that group is "entered". */
  private onSelection(): void {
    const c = this.canvas;
    if (!c || this.expanding) {
      this.notify();
      return;
    }
    const sel = c.getActiveObjects();
    const ids = new Set(sel.map((o) => o.groupId).filter((g): g is string => !!g && g !== this.isolated));
    if (this.isolated && !sel.some((o) => o.groupId === this.isolated)) this.isolated = null;
    if (ids.size) {
      const all = new Set(sel);
      for (const g of ids) for (const m of this.groupMembers(g)) if (m.visible && !m.lockedLayer) all.add(m);
      if (all.size > sel.length) {
        this.expanding = true;
        c.discardActiveObject();
        const list = this.objects.filter((o) => all.has(o));
        c.setActiveObject(list.length === 1 ? list[0] : new ActiveSelection(list, { canvas: c }));
        this.expanding = false;
        c.requestRenderAll();
      }
    }
    this.notify();
  }

  /** Double click inside a selected group: select just the element under the pointer. */
  private enterGroup(point: Point): void {
    const c = this.canvas;
    const active = c?.getActiveObject();
    if (!c || !(active instanceof ActiveSelection)) return;
    const members = active.getObjects();
    const gid = members[0]?.groupId;
    if (!gid || !members.every((m) => m.groupId === gid)) return;
    c.discardActiveObject();
    const hit = [...members].reverse().find((m) => m.visible && m.containsPoint(point));
    this.isolated = gid;
    this.expanding = true;
    if (hit) c.setActiveObject(hit);
    this.expanding = false;
    c.requestRenderAll();
    this.notify();
  }

  /** Selects a whole group (from the layers panel). */
  selectGroup(groupId: string): void {
    const c = this.canvas;
    if (!c) return;
    this.isolated = null;
    const list = this.groupMembers(groupId).filter((m) => m.visible && !m.lockedLayer);
    if (!list.length) return;
    this.expanding = true;
    c.discardActiveObject();
    c.setActiveObject(list.length === 1 ? list[0] : new ActiveSelection(list, { canvas: c }));
    this.expanding = false;
    c.requestRenderAll();
    this.notify();
  }

  /** Selects a list of elements together (e.g. a type folder of the layers panel). */
  selectMany(objs: FabricObject[]): void {
    const c = this.canvas;
    if (!c) return;
    const list = objs.filter((o) => o.visible && !o.lockedLayer);
    if (!list.length) return;
    this.isolated = null;
    this.expanding = true;
    c.discardActiveObject();
    c.setActiveObject(list.length === 1 ? list[0] : new ActiveSelection(list, { canvas: c }));
    this.expanding = false;
    c.requestRenderAll();
    this.notify();
  }

  /** Selects one element even if it belongs to a group. */
  selectSingle(obj: FabricObject): void {
    this.isolated = obj.groupId ?? null;
    this.expanding = true;
    this.select(obj);
    this.expanding = false;
  }

  exitGroup(): void {
    this.isolated = null;
  }

  /** Groups the current selection (Ctrl+G). */
  groupSelection(name = 'Gruppo'): boolean {
    const objs = this.activeObjects.filter((o) => o.role !== 'background');
    if (objs.length < 2) return false;
    const id = uid();
    for (const o of objs) {
      o.groupId = id;
      o.groupName = name;
    }
    this.isolated = null;
    this.record();
    this.notify();
    return true;
  }

  /** Removes the group of the selected elements (Ctrl+Shift+G). */
  ungroupSelection(): boolean {
    const ids = new Set(this.activeObjects.map((o) => o.groupId).filter(Boolean));
    if (!ids.size) return false;
    for (const o of this.objects) {
      if (o.groupId && ids.has(o.groupId)) {
        o.groupId = undefined;
        o.groupName = undefined;
      }
    }
    this.isolated = null;
    this.record();
    this.notify();
    return true;
  }

  renameGroup(groupId: string, name: string): void {
    for (const o of this.groupMembers(groupId)) o.groupName = name;
    this.record();
    this.notify();
  }

  /** "Similar" elements: same standings column, same sponsor slot type, or same layer suffix. */
  similarTo(obj: FabricObject): FabricObject[] {
    const b = obj.binding ?? '';
    let key: (o: FabricObject) => boolean;
    const st = b.match(/^st:\d+:(\w+)$/);
    if (st) key = (o) => new RegExp(`^st:\\d+:${st[1]}$`).test(o.binding ?? '');
    else if (/^(sp:\d+|stLogo:\d+)$/.test(b)) {
      const prefix = b.split(':')[0];
      key = (o) => (o.binding ?? '').startsWith(prefix + ':');
    } else if (obj.name?.includes(' · ')) {
      const suffix = obj.name.split(' · ').pop();
      key = (o) => o.name?.split(' · ').pop() === suffix && o.type === obj.type;
    } else key = (o) => o.type === obj.type && (o as any).fontFamily === (obj as any).fontFamily && o.role === obj.role;
    return this.objects.filter((o) => o.visible && !o.lockedLayer && key(o));
  }

  selectSimilar(obj: FabricObject): number {
    const c = this.canvas;
    const list = this.similarTo(obj);
    if (!c || list.length < 2) return list.length;
    this.isolated = obj.groupId ?? null;
    this.expanding = true;
    c.discardActiveObject();
    c.setActiveObject(new ActiveSelection(list, { canvas: c }));
    this.expanding = false;
    c.requestRenderAll();
    this.notify();
    return list.length;
  }

  /** Selection members plus hidden members of the same groups (e.g. empty standings rows), so group edits stay consistent. */
  withHiddenGroupMates(objs: FabricObject[]): FabricObject[] {
    const out = new Set(objs);
    const ids = new Set(objs.map((o) => o.groupId).filter(Boolean));
    for (const o of this.objects) if (o.groupId && ids.has(o.groupId) && !o.visible) out.add(o);
    return [...out];
  }

  /** Applies props to many objects (text props only to texts, etc.) and refreshes the selection box. */
  setPropsMany(objs: FabricObject[], props: Record<string, any> | ((o: FabricObject) => Record<string, any> | null), immediate = false): void {
    const c = this.canvas;
    if (!c) return;
    for (const o of objs) {
      const p = typeof props === 'function' ? props(o) : props;
      if (!p) continue;
      o.set({ ...p, dirty: true });
      if (o instanceof Textbox) o.initDimensions();
      o.setCoords();
    }
    this.refreshSelection(objs);
    if (immediate) this.record();
    else this.scheduleRecord();
    this.notify();
  }

  private refreshSelection(objs: FabricObject[]): void {
    const c = this.canvas;
    const active = c?.getActiveObject();
    if (!c || !(active instanceof ActiveSelection)) {
      c?.requestRenderAll();
      return;
    }
    const members = active.getObjects();
    if (!objs.every((o) => members.includes(o))) {
      c.requestRenderAll();
      return;
    }
    this.expanding = true;
    c.discardActiveObject();
    c.setActiveObject(new ActiveSelection(members, { canvas: c }));
    this.expanding = false;
    c.requestRenderAll();
  }

  /** Upper / lower / title case for texts; kept when bound data updates the text. */
  async setTextCase(objs: FabricObject[], mode: TextCase): Promise<void> {
    const texts = objs.filter((o): o is Textbox => o instanceof Textbox);
    for (const t of texts) {
      t.textCase = mode;
      if (mode !== 'none') t.set('text', applyTextCase(t.text ?? '', mode));
    }
    // 'none' on bound texts: restore the original data text.
    if (mode === 'none' && this.onRebind) {
      const bound = texts.filter((t) => t.binding && t.autoText !== false);
      for (const t of bound) t.set('text', '\u0000'); // force refresh
      await this.onRebind();
    }
    this.setPropsMany(texts, {}, true);
  }

  // ---------- zoom / format ----------

  setZoom(z: number): void {
    this.zoom = Math.min(4, Math.max(0.05, z));
    this.applyZoom();
    this.notify();
  }

  fitTo(containerW: number, containerH: number): void {
    const pad = 56;
    this.setZoom(Math.min((containerW - pad) / this.width, (containerH - pad) / this.height));
  }

  private applyZoom(): void {
    const c = this.canvas;
    if (!c) return;
    c.setDimensions({ width: Math.round(this.width * this.zoom), height: Math.round(this.height * this.zoom) });
    c.setViewportTransform([this.zoom, 0, 0, this.zoom, 0, 0]);
    c.requestRenderAll();
  }

  changeFormat(format: FormatSpec): void {
    const c = this.canvas;
    if (!c) return;
    c.discardActiveObject();
    adaptObjects(c, this.width, this.height, format.width, format.height);
    this.width = format.width;
    this.height = format.height;
    this.applyZoom();
    this.record();
  }

  // ---------- selection & objects ----------

  get objects(): FabricObject[] {
    return this.canvas?.getObjects() ?? [];
  }

  get active(): FabricObject | undefined {
    return this.canvas?.getActiveObject() ?? undefined;
  }

  get activeObjects(): FabricObject[] {
    return this.canvas?.getActiveObjects() ?? [];
  }

  byId(id: string): FabricObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  select(obj: FabricObject | undefined): void {
    const c = this.canvas;
    if (!c) return;
    if (!obj) c.discardActiveObject();
    else c.setActiveObject(obj);
    c.requestRenderAll();
    this.notify();
  }

  selectAll(): void {
    const c = this.canvas;
    if (!c) return;
    const objs = this.objects.filter((o) => o.visible && !o.lockedLayer && o.role !== 'background');
    if (!objs.length) return;
    c.discardActiveObject();
    c.setActiveObject(new ActiveSelection(objs, { canvas: c }));
    c.requestRenderAll();
    this.notify();
  }

  /** Generic property setter used by the properties panel. */
  setProps(obj: FabricObject, props: Record<string, any>, immediate = false): void {
    obj.set(props);
    if (obj instanceof Textbox) obj.initDimensions();
    obj.setCoords();
    this.canvas?.requestRenderAll();
    if (immediate) this.record();
    else this.scheduleRecord();
    this.notify();
  }

  private add(obj: FabricObject, select = true): void {
    const c = this.canvas;
    if (!c) return;
    if (!obj.id) obj.id = uid();
    c.add(obj);
    if (select) c.setActiveObject(obj);
    c.requestRenderAll();
    this.record();
  }

  /** Adds several objects as one undo step and selects them together (easy to move as a block). */
  addMany(objs: FabricObject[], groupName?: string): void {
    const c = this.canvas;
    if (!c || !objs.length) return;
    if (groupName) {
      const gid = uid();
      for (const o of objs) {
        o.groupId = gid;
        o.groupName = groupName;
      }
    }
    this.isolated = null;
    this.suspended++;
    for (const o of objs) {
      if (!o.id) o.id = uid();
      c.add(o);
    }
    this.suspended--;
    c.discardActiveObject();
    const selectable = objs.filter((o) => o.visible !== false);
    this.expanding = true;
    if (selectable.length) c.setActiveObject(selectable.length === 1 ? selectable[0] : new ActiveSelection(selectable, { canvas: c }));
    this.expanding = false;
    c.requestRenderAll();
    this.record();
  }

  /** Applies an image effect (with intensity) to one or more images, as one undo step. */
  setImageEffect(imgs: FabricImage[], id: string, amount: number, record = true): void {
    for (const img of imgs) applyImageFx(img, id, amount);
    this.canvas?.requestRenderAll();
    if (record) this.record();
    else this.scheduleRecord();
    this.notify();
  }

  getLogoColor(img: FabricImage): LogoColor {
    for (const f of img.filters as any[]) {
      if (f?.type === 'Grayscale') return 'gray';
      if (f?.type === 'BlendColor' && f.mode === 'tint' && f.alpha >= 1) return String(f.color).toLowerCase() === '#000000' ? 'black' : 'white';
    }
    return 'original';
  }

  /** Recolours a logo: original, all white, all black or greyscale (keeps brightness/contrast). */
  setLogoColor(img: FabricImage, mode: LogoColor, record = true): void {
    const rest = img.filters.filter((f: any) => f && f.type !== 'Grayscale' && f.type !== 'BlendColor');
    if (mode === 'gray') rest.push(new filters.Grayscale());
    if (mode === 'white' || mode === 'black') rest.push(new filters.BlendColor({ color: mode === 'white' ? '#ffffff' : '#000000', mode: 'tint', alpha: 1 }));
    img.filters = rest;
    img.imgFx = undefined;
    img.applyFilters();
    this.canvas?.requestRenderAll();
    if (record) this.record();
    this.notify();
  }

  private centerNew(obj: FabricObject): void {
    obj.setPositionByOrigin(new Point(this.width / 2, this.height / 2), 'center', 'center');
    obj.setCoords();
  }

  addText(opts: Partial<Textbox> & { text?: string } = {}): Textbox {
    const u = this.width / 1080;
    const { text = 'Nuovo testo', ...rest } = opts;
    const t = new Textbox(text, {
      name: rest.name ?? 'Testo',
      role: 'element',
      width: 600 * u,
      fontSize: 56 * u,
      fontFamily: SANS_FONT,
      fill: '#ffffff',
      textAlign: 'center',
      ...rest,
    } as any);
    this.centerNew(t);
    this.add(t);
    return t;
  }

  addRect(): void {
    const u = this.width / 1080;
    const r = new Rect({ name: 'Rettangolo', role: 'decor', width: 400 * u, height: 220 * u, fill: '#e11d48', rx: 0, ry: 0, strokeWidth: 0 });
    this.centerNew(r);
    this.add(r);
  }

  addCircle(): void {
    const u = this.width / 1080;
    const r = new Circle({ name: 'Cerchio', role: 'decor', radius: 120 * u, fill: '#ffffff', opacity: 0.9, strokeWidth: 0 });
    this.centerNew(r);
    this.add(r);
  }

  addLine(vertical = false): void {
    const u = this.width / 1080;
    const r = new Rect({
      name: vertical ? 'Linea verticale' : 'Linea',
      role: 'decor',
      width: vertical ? 3 * u : 600 * u,
      height: vertical ? 200 * u : 3 * u,
      fill: '#ffffff',
      opacity: 0.7,
      strokeWidth: 0,
    });
    this.centerNew(r);
    this.add(r);
  }

  async addImage(url: string, opts: { name: string; assetId: string | null; binding?: string; fitMode?: 'contain' | 'cover' }): Promise<void> {
    const img = await FabricImage.fromURL(url);
    const maxW = this.width * 0.4;
    const maxH = this.height * 0.3;
    img.set({
      id: uid(),
      name: opts.name,
      role: 'element',
      assetId: opts.assetId,
      binding: opts.binding,
      fitMode: opts.fitMode ?? 'contain',
      originX: 'center',
      originY: 'center',
      left: this.width / 2,
      top: this.height / 2,
    });
    fitImageToBox(img, maxW, maxH, 'contain');
    if (opts.binding) {
      img.boxW = img.getScaledWidth();
      img.boxH = img.getScaledHeight();
    }
    this.add(img);
  }

  async replaceImage(img: FabricImage, url: string, assetId: string | null): Promise<void> {
    const w = img.getScaledWidth();
    const h = img.getScaledHeight();
    await img.setSrc(url);
    img.assetId = assetId;
    if (img.role === 'background') coverCanvas(img, this.width, this.height);
    else fitImageToBox(img, img.boxW || w, img.boxH || h, img.fitMode ?? 'contain');
    this.canvas?.requestRenderAll();
    this.record();
  }

  deleteSelected(): void {
    const c = this.canvas;
    if (!c) return;
    const objs = this.activeObjects.filter((o) => !o.lockedLayer);
    if (!objs.length) return;
    c.discardActiveObject();
    c.remove(...objs);
    c.requestRenderAll();
    this.record();
  }

  deleteObject(obj: FabricObject): void {
    const c = this.canvas;
    if (!c) return;
    if (c.getActiveObjects().includes(obj)) c.discardActiveObject();
    c.remove(obj);
    c.requestRenderAll();
    this.record();
  }

  private async cloneObjects(objs: FabricObject[], offset: number): Promise<FabricObject[]> {
    const out: FabricObject[] = [];
    // A whole group duplicated -> new group; a single member duplicated -> standalone element.
    const newGroup = new Map<string, string | null>();
    for (const o of objs) {
      if (!o.groupId || newGroup.has(o.groupId)) continue;
      const total = this.groupMembers(o.groupId).length;
      const picked = objs.filter((x) => x.groupId === o.groupId).length;
      newGroup.set(o.groupId, total > 0 && picked < total ? null : uid());
    }
    for (const o of objs) {
      const cl = await o.clone(CUSTOM_PROPS);
      cl.set({
        id: uid(),
        name: `${o.name ?? 'Elemento'} copia`,
        left: (cl.left ?? 0) + offset,
        top: (cl.top ?? 0) + offset,
        lockedLayer: false,
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
        hasControls: true,
      });
      if (cl.role === 'background') cl.role = 'element';
      if (o.groupId) {
        const g = newGroup.get(o.groupId);
        cl.groupId = g ?? undefined;
        cl.groupName = g ? `${o.groupName ?? 'Gruppo'} copia` : undefined;
      }
      out.push(cl);
    }
    return out;
  }

  /** Returns the selected objects with absolute (scene) coordinates, even inside an ActiveSelection. */
  private async detachedSelection(): Promise<FabricObject[]> {
    const c = this.canvas;
    const active = c?.getActiveObject();
    if (!c || !active) return [];
    if (active instanceof ActiveSelection) {
      const objs = active.getObjects();
      c.discardActiveObject(); // restores absolute coordinates on children
      const res = [...objs];
      c.setActiveObject(new ActiveSelection(objs, { canvas: c }));
      return res;
    }
    return [active];
  }

  async duplicateSelected(): Promise<void> {
    const c = this.canvas;
    if (!c) return;
    const src = await this.detachedSelection();
    if (!src.length) return;
    const clones = await this.cloneObjects(src, 24);
    this.suspended++;
    c.discardActiveObject();
    for (const cl of clones) c.add(cl);
    this.suspended--;
    c.setActiveObject(clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas: c }));
    c.requestRenderAll();
    this.record();
  }

  async copy(): Promise<boolean> {
    const src = await this.detachedSelection();
    if (!src.length) return false;
    this.clipboard = src.map((o) => o.toObject(CUSTOM_PROPS));
    this.pasteCount = 0;
    return true;
  }

  async paste(): Promise<void> {
    const c = this.canvas;
    if (!c || !this.clipboard) return;
    this.pasteCount++;
    const objs = (await util.enlivenObjects(this.clipboard)) as FabricObject[];
    const clones = await this.cloneObjects(objs, 24 * this.pasteCount);
    c.discardActiveObject();
    for (const cl of clones) c.add(cl);
    c.setActiveObject(clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas: c }));
    c.requestRenderAll();
    this.record();
  }

  get hasClipboard(): boolean {
    return !!this.clipboard;
  }

  // ---------- layers ----------

  private bgIndex(): number {
    return this.objects.findIndex((o) => o.role === 'background');
  }

  bringForward(obj: FabricObject): void {
    this.canvas?.bringObjectForward(obj);
    this.afterReorder();
  }

  sendBackward(obj: FabricObject): void {
    const c = this.canvas;
    if (!c) return;
    const idx = this.objects.indexOf(obj);
    if (idx - 1 <= this.bgIndex() && obj.role !== 'background') return;
    c.sendObjectBackwards(obj);
    this.afterReorder();
  }

  bringToFront(obj: FabricObject): void {
    this.canvas?.bringObjectToFront(obj);
    this.afterReorder();
  }

  sendToBack(obj: FabricObject): void {
    const c = this.canvas;
    if (!c) return;
    if (obj.role === 'background') c.sendObjectToBack(obj);
    else c.moveObjectTo(obj, this.bgIndex() + 1);
    this.afterReorder();
  }

  moveTo(obj: FabricObject, index: number): void {
    const c = this.canvas;
    if (!c) return;
    const min = obj.role === 'background' ? 0 : this.bgIndex() + 1;
    c.moveObjectTo(obj, Math.max(min, Math.min(index, this.objects.length - 1)));
    this.afterReorder();
  }

  private afterReorder(): void {
    this.canvas?.requestRenderAll();
    this.record();
  }

  setLocked(obj: FabricObject, locked: boolean): void {
    obj.set({
      lockedLayer: locked,
      selectable: !locked,
      evented: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
    });
    if (locked && this.activeObjects.includes(obj)) this.canvas?.discardActiveObject();
    this.canvas?.requestRenderAll();
    this.record();
  }

  setVisible(obj: FabricObject, visible: boolean): void {
    obj.set('visible', visible);
    if (!visible && this.activeObjects.includes(obj)) this.canvas?.discardActiveObject();
    this.canvas?.requestRenderAll();
    this.record();
  }

  setManyVisible(objs: FabricObject[], visible: boolean): void {
    for (const o of objs) o.set('visible', visible);
    if (!visible) this.canvas?.discardActiveObject();
    this.canvas?.requestRenderAll();
    this.record();
  }

  setManyLocked(objs: FabricObject[], locked: boolean): void {
    this.suspended++;
    for (const o of objs) this.setLocked(o, locked);
    this.suspended--;
    this.record();
  }

  rename(obj: FabricObject, name: string): void {
    obj.name = name;
    this.record();
  }

  // ---------- geometry ----------

  align(mode: AlignMode): void {
    const objs = this.active ? [this.active] : [];
    for (const obj of objs) {
      const b = sceneBox(obj);
      const x = mode === 'left' ? 0 : mode === 'hcenter' ? (this.width - b.width) / 2 : mode === 'right' ? this.width - b.width : null;
      const y = mode === 'top' ? 0 : mode === 'vcenter' ? (this.height - b.height) / 2 : mode === 'bottom' ? this.height - b.height : null;
      moveBoxTo(obj, x, y);
    }
    this.canvas?.requestRenderAll();
    this.record();
  }

  setBox(obj: FabricObject, v: { x?: number; y?: number; w?: number; h?: number; keepRatio?: boolean }): void {
    if (v.w !== undefined && v.w > 0) {
      if (obj instanceof Textbox) {
        obj.set('width', v.w / (obj.scaleX || 1));
        obj.initDimensions();
      } else {
        const sx = v.w / (obj.width || 1);
        obj.set(v.keepRatio ? { scaleX: sx, scaleY: sx } : { scaleX: sx });
      }
    }
    if (v.h !== undefined && v.h > 0 && !(obj instanceof Textbox)) {
      const sy = v.h / (obj.height || 1);
      obj.set(v.keepRatio ? { scaleX: sy, scaleY: sy } : { scaleY: sy });
    }
    if (obj instanceof FabricImage && obj.binding && (v.w !== undefined || v.h !== undefined)) {
      obj.boxW = obj.getScaledWidth();
      obj.boxH = obj.getScaledHeight();
    }
    obj.setCoords();
    if (v.x !== undefined || v.y !== undefined) moveBoxTo(obj, v.x ?? null, v.y ?? null);
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }

  setAngle(obj: FabricObject, angle: number): void {
    const center = obj.getCenterPoint();
    obj.set('angle', angle);
    obj.setPositionByOrigin(center, 'center', 'center');
    obj.setCoords();
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }

  nudge(dx: number, dy: number): void {
    const obj = this.active;
    if (!obj || obj.lockedLayer) return;
    obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
    obj.setCoords();
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }

  // ---------- snapping & guides ----------

  private snap(target: FabricObject | undefined): void {
    if (!target) return;
    if (!this.snapEnabled) {
      this.guides = { v: [], h: [] };
      return;
    }
    const t = 7 / this.zoom;
    const b = sceneBox(target);
    const excluded = new Set<FabricObject>([target, ...this.activeObjects]);
    const tx = [0, this.width / 2, this.width];
    const ty = [0, this.height / 2, this.height];
    for (const o of this.objects) {
      if (excluded.has(o) || !o.visible || o.role === 'background') continue;
      const ob = sceneBox(o);
      if (ob.width >= this.width - 1 && ob.height >= this.height - 1) continue;
      tx.push(ob.left, ob.left + ob.width / 2, ob.left + ob.width);
      ty.push(ob.top, ob.top + ob.height / 2, ob.top + ob.height);
    }
    const px = [b.left, b.left + b.width / 2, b.left + b.width];
    const py = [b.top, b.top + b.height / 2, b.top + b.height];
    const best = (pts: number[], targets: number[]) => {
      let d = Infinity;
      let line = 0;
      for (const p of pts)
        for (const q of targets) {
          if (Math.abs(q - p) < Math.abs(d)) {
            d = q - p;
            line = q;
          }
        }
      return Math.abs(d) <= t ? { d, line } : null;
    };
    const sx = best(px, tx);
    const sy = best(py, ty);
    if (sx) target.set('left', (target.left ?? 0) + sx.d);
    if (sy) target.set('top', (target.top ?? 0) + sy.d);
    target.setCoords();
    this.guides = { v: sx ? [sx.line] : [], h: sy ? [sy.line] : [] };
  }

  private drawGuides(ctx: CanvasRenderingContext2D): void {
    if (!this.guides.v.length && !this.guides.h.length) return;
    const z = this.zoom;
    ctx.save();
    ctx.transform(z, 0, 0, z, 0, 0);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.beginPath();
    for (const x of this.guides.v) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (const y of this.guides.h) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- background ----------

  get background(): FabricObject | undefined {
    return this.objects.find((o) => o.role === 'background');
  }

  async setBackgroundImage(url: string, assetId: string): Promise<void> {
    const c = this.canvas;
    if (!c) return;
    const old = this.background;
    const img = await FabricImage.fromURL(url);
    img.set({ id: uid(), name: 'Sfondo', role: 'background', assetId });
    coverCanvas(img, this.width, this.height);
    if (old instanceof FabricImage) {
      img.filters = old.filters.map((f) => f);
      img.applyFilters();
      img.set('opacity', old.opacity);
    }
    this.suspended++;
    const idx = old ? this.objects.indexOf(old) : 0;
    if (old) c.remove(old);
    c.insertAt(Math.max(0, idx), img);
    this.suspended--;
    if (old?.lockedLayer) this.setLocked(img, true);
    c.requestRenderAll();
    this.record();
  }

  removeBackgroundImage(): void {
    const c = this.canvas;
    if (!c) return;
    const old = this.background;
    const rect = makeDefaultBackground(this.width, this.height);
    this.suspended++;
    const idx = old ? this.objects.indexOf(old) : 0;
    if (old) c.remove(old);
    c.insertAt(Math.max(0, idx), rect);
    this.suspended--;
    c.discardActiveObject();
    c.requestRenderAll();
    this.record();
  }

  getFilter(img: FabricImage, name: FilterName): number {
    const f = img.filters.find((x) => x && (x as any).type === name) as any;
    if (!f) return 0;
    return name === 'Brightness' ? f.brightness : f.contrast;
  }

  setFilter(img: FabricImage, name: FilterName, value: number): void {
    const rest = img.filters.filter((x) => x && (x as any).type !== name);
    if (value !== 0) {
      rest.push(name === 'Brightness' ? new filters.Brightness({ brightness: value }) : new filters.Contrast({ contrast: value }));
    }
    img.filters = rest;
    // Filtering large photos is expensive: apply at most once per frame while dragging sliders.
    this.pendingFilter.add(img);
    if (!this.filterFrame) {
      this.filterFrame = requestAnimationFrame(() => {
        this.filterFrame = 0;
        for (const i of this.pendingFilter) i.applyFilters();
        this.pendingFilter.clear();
        this.canvas?.requestRenderAll();
      });
    }
    this.scheduleRecord();
    this.notify();
  }

  coverBackground(img: FabricImage): void {
    coverCanvas(img, this.width, this.height);
    this.canvas?.requestRenderAll();
    this.record();
  }

  /** Zoom factor relative to "cover" scale. */
  getBgZoom(img: FabricImage): number {
    const cover = Math.max(this.width / img.width, this.height / img.height);
    return (img.scaleX ?? 1) / cover;
  }

  setBgZoom(img: FabricImage, factor: number): void {
    const center = img.getCenterPoint();
    const cover = Math.max(this.width / img.width, this.height / img.height);
    img.set({ scaleX: cover * factor, scaleY: cover * factor });
    img.setPositionByOrigin(center, 'center', 'center');
    img.setCoords();
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }

  /** Crop as fractions of the natural image size: left, top, right, bottom. */
  getCrop(img: FabricImage): { l: number; t: number; r: number; b: number } {
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || img.width;
    const nh = el.naturalHeight || img.height;
    return {
      l: img.cropX / nw,
      t: img.cropY / nh,
      r: Math.max(0, 1 - (img.cropX + img.width) / nw),
      b: Math.max(0, 1 - (img.cropY + img.height) / nh),
    };
  }

  setCrop(img: FabricImage, crop: { l: number; t: number; r: number; b: number }): void {
    const el = img.getElement() as HTMLImageElement;
    const nw = el.naturalWidth || img.width;
    const nh = el.naturalHeight || img.height;
    const l = Math.min(Math.max(crop.l, 0), 0.9);
    const t = Math.min(Math.max(crop.t, 0), 0.9);
    const r = Math.min(Math.max(crop.r, 0), 0.9 - l);
    const b = Math.min(Math.max(crop.b, 0), 0.9 - t);
    const center = img.getCenterPoint();
    img.set({ cropX: l * nw, cropY: t * nh, width: nw * (1 - l - r), height: nh * (1 - t - b) });
    img.setPositionByOrigin(center, 'center', 'center');
    img.setCoords();
    if (img.binding) {
      img.boxW = img.getScaledWidth();
      img.boxH = img.getScaledHeight();
    }
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }

  // ---------- text effects ----------

  setShadow(obj: FabricObject, s: { color: string; blur: number; offsetX: number; offsetY: number } | null): void {
    obj.set('shadow', s ? new Shadow(s) : null);
    obj.set('dirty', true);
    this.canvas?.requestRenderAll();
    this.scheduleRecord();
    this.notify();
  }
}

export const editor = new EditorController();

if (import.meta.env.DEV) (window as any).__editor = editor;
