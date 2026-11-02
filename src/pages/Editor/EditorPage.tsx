import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileArchive,
  Goal as GoalIcon,
  Grid2x2Check,
  Info,
  Layers3,
  LayoutTemplate,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Save,
  Shapes,
  Smartphone,
  Trophy,
  Undo2,
  Wallpaper,
} from 'lucide-react';
import { FabricImage } from 'fabric';
import { applyBindings } from '../../editor/applyBindings';
import { autoGroup } from '../../editor/layouts';
import { coverCanvas } from '../../editor/geometry';
import { editor } from '../../editor/controller';
import { mergeBackground, renderStored, templateJSON, withoutBackgroundImage } from '../../editor/render';
import { downloadBlob, ensureGraphic, exportZip, fileNameFor, renderGraphicBlob } from '../../services/export';
import { uid } from '../../services/database';
import { useApp } from '../../store/appStore';
import { useEditorUI } from '../../store/editorStore';
import { useRoute } from '../../store/routeStore';
import type { FormatSpec, GraphicDoc, GraphicKind, Match, Template } from '../../types';
import { FORMAT_PRESETS, GRAPHIC_KINDS, KIND_LABELS } from '../../types';
import { MatchInfoForm } from '../../components/MatchForm/MatchInfoForm';
import { PostMatchForm } from '../../components/MatchForm/PostMatchForm';
import { GoalManager } from '../../components/GoalManager/GoalManager';
import { ElementsPanel } from '../../components/Editor/ElementsPanel';
import { BackgroundManager } from '../../components/Editor/BackgroundManager';
import { PropertiesPanel } from '../../components/Editor/PropertiesPanel';
import { LayersPanel } from '../../components/Editor/LayersPanel';
import { TemplatePickerModal } from '../../components/Editor/TemplatePickerModal';
import { MockupModal } from '../../components/Editor/MockupModal';
import { Modal, Spinner, confirmDialog } from '../../components/ui';

type LeftTab = 'data' | 'goals' | 'post' | 'elements' | 'background';

const LEFT_TABS: { id: LeftTab; label: string; icon: typeof Info }[] = [
  { id: 'data', label: 'Partita', icon: Info },
  { id: 'goals', label: 'Marcatori', icon: GoalIcon },
  { id: 'post', label: 'Extra', icon: Trophy },
  { id: 'elements', label: 'Elementi', icon: Shapes },
  { id: 'background', label: 'Sfondo', icon: Wallpaper },
];

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!(editor.active as any)?.isEditing;
}

export function EditorPage({ matchId, kind }: { matchId: string; kind: GraphicKind }) {
  const match = useApp((s) => s.matches.find((m) => m.id === matchId));
  if (!match) {
    return (
      <div className="page">
        <div className="empty">Partita non trovata. Potrebbe essere stata eliminata.</div>
      </div>
    );
  }
  return <Editor match={match} kind={kind} />;
}

function Editor({ match, kind }: { match: Match; kind: GraphicKind }) {
  const go = useRoute((s) => s.go);
  const { settings, templates, updateMatch, toast, saveTemplate, setSettings } = useApp();
  const bump = useEditorUI((s) => s.bump);
  useEditorUI((s) => s.version);

  const canvasEl = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('data');
  const [format, setFormat] = useState<FormatSpec>(settings.defaultFormat);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [menu, setMenu] = useState<'export' | 'template' | null>(null);
  const [modal, setModal] = useState<'customSize' | 'saveTemplate' | 'applyTemplate' | 'mockup' | null>(null);
  const [busy, setBusy] = useState(false);

  // Latest values for async callbacks.
  const matchRef = useRef(match);
  matchRef.current = match;
  const kindRef = useRef(kind);
  const formatRef = useRef(format);
  formatRef.current = format;
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;
  const loadedKind = useRef<GraphicKind | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  /** Persists the canvas into match.graphics[kind]. */
  const saveNow = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const k = loadedKind.current;
    if (!k || !editor.canvas) return;
    const doc: GraphicDoc = { format: formatRef.current, json: editor.serialize(), templateId: templateIdRef.current, updatedAt: Date.now() };
    await updateMatch(matchRef.current.id, (m) => ({ graphics: { ...m.graphics, [k]: doc } }));
  }, [updateMatch]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 600);
  }, [saveNow]);

  const fit = useCallback(() => {
    const el = stageRef.current;
    if (el) editor.fitTo(el.clientWidth, el.clientHeight);
  }, []);

  // Mount canvas once.
  useEffect(() => {
    if (!canvasEl.current) return;
    editor.mount(canvasEl.current);
    editor.onChange = bump;
    editor.onCommit = scheduleSave;
    editor.onRebind = () => {
      const k = loadedKind.current;
      return k && editor.canvas ? applyBindings(editor.canvas, matchRef.current, k, useApp.getState().settings) : Promise.resolve();
    };
    editor.onRestored = () => {
      const k = loadedKind.current;
      return k && editor.canvas ? applyBindings(editor.canvas, matchRef.current, k, useApp.getState().settings) : Promise.resolve();
    };
    setReady(true);
    const onResize = () => fit();
    // Flush pending edits when the tab is hidden or closed.
    const flush = () => {
      if (saveTimer.current !== undefined) void saveNow();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      if (saveTimer.current !== undefined) void saveNow();
      loadedKind.current = null;
      editor.dispose();
    };
  }, []);

  useEffect(() => {
    editor.snapEnabled = settings.snapEnabled;
  }, [settings.snapEnabled]);

  // Load graphic when kind changes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if (saveTimer.current !== undefined) await saveNow();
      setLoading(true);
      loadedKind.current = null;
      kindRef.current = kind;
      const m = matchRef.current;
      const st = useApp.getState();
      const doc = await ensureGraphic(m, kind, st.templates, st.settings);
      if (cancelled) return;
      setFormat(doc.format);
      formatRef.current = doc.format;
      setTemplateId(doc.templateId);
      templateIdRef.current = doc.templateId;
      await editor.load(doc.json, doc.format);
      if (editor.canvas) await applyBindings(editor.canvas, m, kind, st.settings);
      if (cancelled) return;
      // Graphics made before groups existed get their template groups now.
      const grouped = autoGroup(doc.templateId, editor.objects) > 0;
      editor.resetHistory();
      loadedKind.current = kind;
      fit();
      setLoading(false);
      if (!m.graphics[kind] || grouped) await saveNow();
    })().catch((e) => {
      console.error(e);
      toast(`Errore nel caricamento della grafica: ${e.message ?? e}`, 'error');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, kind]);

  // Push match data changes into bound elements.
  const dataKey = JSON.stringify({ ...match, graphics: null, updatedAt: 0 });
  const leagueKey = JSON.stringify([settings.league ?? null, settings.sponsors ?? null]);
  useEffect(() => {
    if (!editor.canvas || loadedKind.current !== kind) return;
    void editor.batch(() => applyBindings(editor.canvas!, match, kind, settings));
  }, [dataKey, settings.uppercaseInfo, settings.matchdayPrefix, leagueKey]);

  const patchMatch = (patch: Partial<Match>) => updateMatch(match.id, patch);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (isTyping(e) || modal) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        await editor.undo();
      } else if ((mod && k === 'y') || (mod && e.shiftKey && k === 'z')) {
        e.preventDefault();
        await editor.redo();
      } else if (mod && k === 'c') {
        if (await editor.copy()) toast('Elemento copiato.');
      } else if (mod && k === 'v') {
        e.preventDefault();
        await editor.paste();
      } else if (mod && k === 'd') {
        e.preventDefault();
        await editor.duplicateSelected();
      } else if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          if (editor.ungroupSelection()) toast('Gruppo sciolto: ora gli elementi sono singoli.');
        } else if (editor.groupSelection()) toast('Elementi raggruppati.', 'success');
      } else if (mod && k === 'a') {
        e.preventDefault();
        editor.selectAll();
      } else if (mod && k === 's') {
        e.preventDefault();
        await saveNow();
        toast('Grafica salvata.', 'success');
      } else if (k === 'delete' || k === 'backspace') {
        if (editor.active) {
          e.preventDefault();
          editor.deleteSelected();
        }
      } else if (k.startsWith('arrow') && editor.active) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        editor.nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
      } else if (k === 'escape') {
        editor.exitGroup();
        editor.select(undefined);
      } else if (mod && (k === '=' || k === '+')) {
        e.preventDefault();
        editor.setZoom(editor.zoom * 1.15);
      } else if (mod && k === '-') {
        e.preventDefault();
        editor.setZoom(editor.zoom / 1.15);
      } else if (mod && k === '0') {
        e.preventDefault();
        fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, saveNow, toast, fit]);

  // Close dropdown menus on outside click.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.rel')) setMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const changeFormat = (f: FormatSpec) => {
    if (f.width === format.width && f.height === format.height) {
      setFormat(f);
      return;
    }
    editor.changeFormat(f);
    setFormat(f);
    formatRef.current = f;
    fit();
    scheduleSave();
  };

  const currentDoc = (): GraphicDoc => ({ format, json: editor.serialize(), templateId, updatedAt: Date.now() });

  const exportCurrent = async (type: 'png' | 'jpeg') => {
    setMenu(null);
    setBusy(true);
    try {
      await saveNow();
      const blob = await renderGraphicBlob(match, kind, currentDoc(), settings, type);
      downloadBlob(blob, fileNameFor(match, kind, type));
      toast(`Esportato ${type === 'jpeg' ? 'JPG' : 'PNG'} ${format.width}×${format.height}px.`, 'success');
    } catch (e) {
      toast(`Esportazione non riuscita: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async (type: 'png' | 'jpeg') => {
    setMenu(null);
    setBusy(true);
    try {
      await saveNow();
      await exportZip(matchRef.current, templates, settings, type, { [kind]: currentDoc() });
      toast('Pacchetto ZIP con tutte le grafiche esportato.', 'success');
    } catch (e) {
      toast(`Esportazione ZIP non riuscita: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyTemplate = async (t: { id: string }) => {
    setModal(null);
    const ok = await confirmDialog({
      title: 'Applicare il template?',
      message: 'La disposizione attuale di questa grafica verrà sostituita. Lo sfondo caricato viene mantenuto. Potrai annullare con Ctrl+Z.',
      confirmLabel: 'Applica',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const st = useApp.getState();
      const tpl = st.templates.find((x) => x.id === t.id);
      const target = tpl?.format ?? format;
      const json = mergeBackground(await templateJSON(t.id, kind, target, st.templates), editor.serialize());
      setFormat(target);
      formatRef.current = target;
      setTemplateId(t.id);
      templateIdRef.current = t.id;
      await editor.replaceContent(json, target, async () => {
        // A kept background may come from another format: re-cover the new canvas.
        const bg = editor.background;
        if (bg instanceof FabricImage && (target.width !== format.width || target.height !== format.height)) coverCanvas(bg, target.width, target.height);
        await applyBindings(editor.canvas!, matchRef.current, kind, st.settings);
      });
      fit();
      toast('Template applicato.', 'success');
    } finally {
      setBusy(false);
    }
  };

  const switchKind = (k: GraphicKind) => {
    if (k !== kind) go({ page: 'editor', matchId: match.id, kind: k });
  };

  const title = `${match.homeName || 'Casa'} – ${match.awayName || 'Ospite'}`;
  const presetValue = format.preset === 'custom' ? 'custom' : format.preset;

  return (
    <div className="editor">
      <div className="editor-top">
        <button className="btn sm ghost icon" title="Archivio partite" onClick={() => go({ page: 'archive' })}>
          <ArrowLeft size={16} />
        </button>
        <div className="editor-title" title={title}>
          {title}
        </div>
        <div className="tabs">
          {GRAPHIC_KINDS.map((k) => (
            <button key={k} className={`tab ${k === kind ? 'active' : ''}`} onClick={() => switchKind(k)}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn sm icon" title="Annulla (Ctrl+Z)" disabled={!editor.canUndo} onClick={() => editor.undo()}>
          <Undo2 size={15} />
        </button>
        <button className="btn sm icon" title="Ripristina (Ctrl+Y)" disabled={!editor.canRedo} onClick={() => editor.redo()}>
          <Redo2 size={15} />
        </button>
        <button
          className={`btn sm icon ${settings.snapEnabled ? 'active' : ''}`}
          title="Guide di allineamento e snap automatico"
          onClick={() => setSettings({ snapEnabled: !settings.snapEnabled })}
        >
          <Magnet size={15} />
        </button>
        <div className="sep" />
        <select
          className="select sm"
          style={{ width: 190 }}
          value={presetValue}
          title="Formato"
          onChange={(e) => {
            const v = e.target.value as keyof typeof FORMAT_PRESETS | 'custom';
            if (v === 'custom') setModal('customSize');
            else changeFormat({ preset: v, width: FORMAT_PRESETS[v].width, height: FORMAT_PRESETS[v].height });
          }}
        >
          {Object.values(FORMAT_PRESETS).map((p) => (
            <option key={p.preset} value={p.preset}>
              {p.label}
            </option>
          ))}
          <option value="custom">{format.preset === 'custom' ? `Personalizzato · ${format.width}×${format.height}` : 'Personalizzato…'}</option>
        </select>
        <div className="rel">
          <button className="btn sm" onClick={() => setMenu(menu === 'template' ? null : 'template')}>
            <LayoutTemplate size={14} />
            <span className="btn-label">Template</span> <ChevronDown size={13} />
          </button>
          {menu === 'template' && (
            <div className="menu">
              <button className="menu-item" onClick={() => (setMenu(null), setModal('applyTemplate'))}>
                <LayoutTemplate size={15} /> Applica template…
              </button>
              <button className="menu-item" onClick={() => (setMenu(null), setModal('saveTemplate'))}>
                <Save size={15} /> Salva come template…
              </button>
            </div>
          )}
        </div>
        <button className="btn sm" disabled={loading} title="Anteprima su Instagram (post e storia)" onClick={() => setModal('mockup')}>
          <Smartphone size={14} />
          <span className="btn-label">Mockup</span>
        </button>
        <div className="rel">
          <button className="btn sm primary" disabled={busy || loading} onClick={() => setMenu(menu === 'export' ? null : 'export')}>
            {busy ? <Spinner /> : <Download size={14} />} Esporta <ChevronDown size={13} />
          </button>
          {menu === 'export' && (
            <div className="menu">
              <div className="faint small" style={{ padding: '4px 10px' }}>
                {KIND_LABELS[kind]} · {format.width}×{format.height}px
              </div>
              <button className="menu-item" onClick={() => exportCurrent('png')}>
                <Download size={15} /> Scarica PNG
              </button>
              <button className="menu-item" onClick={() => exportCurrent('jpeg')}>
                <Download size={15} /> Scarica JPG
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => exportAll('png')}>
                <FileArchive size={15} /> Tutte le grafiche · ZIP (PNG)
              </button>
              <button className="menu-item" onClick={() => exportAll('jpeg')}>
                <FileArchive size={15} /> Tutte le grafiche · ZIP (JPG)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="editor-body">
        <aside className="panel">
          <div className="panel-tabs">
            {LEFT_TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`panel-tab ${leftTab === id ? 'active' : ''}`} onClick={() => setLeftTab(id)}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <div className="panel-scroll">
            {leftTab === 'data' && <MatchInfoForm match={match} onChange={patchMatch} compact />}
            {leftTab === 'goals' && <GoalManager match={match} onChange={patchMatch} />}
            {leftTab === 'post' && <PostMatchForm match={match} onChange={patchMatch} />}
            {leftTab === 'elements' && <ElementsPanel match={match} kind={kind} />}
            {leftTab === 'background' && <BackgroundManager />}
          </div>
        </aside>

        <div className="stage" ref={stageRef} onMouseDown={(e) => e.target === e.currentTarget && editor.select(undefined)}>
          <div className="stage-inner" onMouseDown={(e) => e.target === e.currentTarget && editor.select(undefined)}>
            <div className="canvas-shell" style={{ visibility: loading ? 'hidden' : 'visible' }}>
              <canvas ref={canvasEl} />
            </div>
          </div>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <Spinner />
            </div>
          )}
          <div className="stage-hud">
            <div className="zoom-bar">
              <button className="btn sm ghost icon" title="Riduci (Ctrl -)" onClick={() => editor.setZoom(editor.zoom / 1.15)}>
                <Minus size={14} />
              </button>
              <span className="zoom-val">{Math.round(editor.zoom * 100)}%</span>
              <button className="btn sm ghost icon" title="Ingrandisci (Ctrl +)" onClick={() => editor.setZoom(editor.zoom * 1.15)}>
                <Plus size={14} />
              </button>
              <button className="btn sm ghost icon" title="Adatta allo schermo (Ctrl 0)" onClick={fit}>
                <Maximize size={14} />
              </button>
              <button className="btn sm ghost" title="Dimensione reale" onClick={() => editor.setZoom(1)}>
                100%
              </button>
              <span className="faint small" style={{ padding: '0 8px' }}>
                {format.width}×{format.height}
              </span>
            </div>
          </div>
        </div>

        <aside className="panel right">
          <div className="panel-tabs" style={{ padding: '0 14px' }}>
            <div className="panel-tab active" style={{ flexDirection: 'row', justifyContent: 'flex-start', cursor: 'default' }}>
              <Grid2x2Check size={14} /> Proprietà
            </div>
          </div>
          <div className="panel-scroll" style={{ flex: '1 1 55%' }}>
            <PropertiesPanel />
          </div>
          <div className="panel-tabs" style={{ padding: '0 14px', borderTop: '1px solid var(--border)' }}>
            <div className="panel-tab active" style={{ flexDirection: 'row', justifyContent: 'flex-start', cursor: 'default' }}>
              <Layers3 size={14} /> Livelli
            </div>
          </div>
          <div className="panel-scroll" style={{ flex: '1 1 45%' }}>
            <LayersPanel />
          </div>
        </aside>
      </div>

      {modal === 'customSize' && <CustomSizeModal initial={format} onClose={() => setModal(null)} onApply={(f) => (changeFormat(f), setModal(null))} />}
      {modal === 'mockup' && (
        <MockupModal
          match={match}
          kind={kind}
          onClose={() => setModal(null)}
          render={async () => {
            await saveNow();
            return renderGraphicBlob(matchRef.current, kind, currentDoc(), settings, 'png');
          }}
        />
      )}
      {modal === 'applyTemplate' && <TemplatePickerModal kind={kind} currentId={templateId} onClose={() => setModal(null)} onPick={applyTemplate} />}
      {modal === 'saveTemplate' && (
        <SaveTemplateModal
          kind={kind}
          onClose={() => setModal(null)}
          onSave={async (name, includeBg, makeDefault) => {
            setModal(null);
            const json = includeBg ? editor.serialize() : withoutBackgroundImage(editor.serialize(), format);
            const thumbnail = await renderStored(json, { format, match, kind, settings, type: 'jpeg', quality: 0.8, multiplier: 300 / format.width });
            const t: Template = { id: uid(), name, kind, format, json, thumbnail, builtIn: false, createdAt: Date.now() };
            await saveTemplate(t);
            setTemplateId(t.id);
            templateIdRef.current = t.id;
            if (makeDefault) await setSettings({ defaultTemplates: { ...settings.defaultTemplates, [kind]: t.id } });
            toast(`Template "${name}" salvato.`, 'success');
          }}
        />
      )}
    </div>
  );
}

function CustomSizeModal({ initial, onClose, onApply }: { initial: FormatSpec; onClose: () => void; onApply: (f: FormatSpec) => void }) {
  const [w, setW] = useState(initial.width);
  const [h, setH] = useState(initial.height);
  const valid = w >= 100 && w <= 5000 && h >= 100 && h <= 5000;
  return (
    <Modal title="Formato personalizzato" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Dimensioni esatte in pixel dell'immagine esportata (100–5000).</p>
      <div className="grid-2">
        <div className="field">
          <label>Larghezza (px)</label>
          <input className="input" type="number" value={w} onChange={(e) => setW(parseInt(e.target.value, 10) || 0)} />
        </div>
        <div className="field">
          <label>Altezza (px)</label>
          <input className="input" type="number" value={h} onChange={(e) => setH(parseInt(e.target.value, 10) || 0)} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annulla
        </button>
        <button className="btn primary" disabled={!valid} onClick={() => onApply({ preset: 'custom', width: w, height: h })}>
          Applica formato
        </button>
      </div>
    </Modal>
  );
}

function SaveTemplateModal({
  kind,
  onClose,
  onSave,
}: {
  kind: GraphicKind;
  onClose: () => void;
  onSave: (name: string, includeBg: boolean, makeDefault: boolean) => void;
}) {
  const [name, setName] = useState(`${KIND_LABELS[kind]} personalizzato`);
  const [includeBg, setIncludeBg] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  return (
    <Modal title="Salva come template" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        Il template conserva posizione e dimensioni di testi e loghi, font, colori, elementi decorativi e livelli. I dati della partita restano collegati.
      </p>
      <div className="section">
        <div className="field">
          <label>Nome template</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. MATCHDAY Derby" />
        </div>
        <label className="check">
          <input type="checkbox" checked={includeBg} onChange={(e) => setIncludeBg(e.target.checked)} /> Includi l'immagine di sfondo attuale
        </label>
        <label className="check">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Usa come predefinito per le nuove partite
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annulla
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), includeBg, makeDefault)}>
          <Save size={14} /> Salva template
        </button>
      </div>
    </Modal>
  );
}
