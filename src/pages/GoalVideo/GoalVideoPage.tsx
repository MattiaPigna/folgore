import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Image as ImageIcon, Layers3, Redo2, Share2, Shapes, Undo2, Video, Wallpaper } from 'lucide-react';
import { applyGoalBindings, latestGoalId } from '../../editor/goalBindings';
import { editor } from '../../editor/controller';
import { applyBgFx, applyColorFx, fxSnapshot, type BgFx, type FxSnapshot } from '../../editor/colorFx';
import { restSnapshot, applyAnimFrame, type AnimConfig, type AnimSnapshot } from '../../editor/videoAnim';
import { DEFAULT_EXTRAS, drawEffects, makeConfetti, shakeOffset } from '../../editor/videoEffects';
import { renderGoalVideoMp4, renderGoalVideoPng, VideoUnsupportedError } from '../../editor/videoExport';
import { buildGoalVideoDefault } from '../../editor/goalVideoLayout';
import { CUSTOM_PROPS } from '../../editor/fabricSetup';
import { downloadBlob, ensureGoalVideo, matchSlug } from '../../services/export';
import { formatGoal, sortGoals } from '../../services/score';
import { useApp } from '../../store/appStore';
import { useEditorUI } from '../../store/editorStore';
import { useRoute } from '../../store/routeStore';
import type { FabricObject } from 'fabric';
import type { FormatSpec, GraphicDoc, Match } from '../../types';
import { BackgroundManager } from '../../components/Editor/BackgroundManager';
import { PropertiesPanel } from '../../components/Editor/PropertiesPanel';
import { LayersPanel } from '../../components/Editor/LayersPanel';
import { GoalElementsPanel } from '../../components/GoalVideo/GoalElementsPanel';
import { VideoSettingsPanel, type VideoSettings } from '../../components/GoalVideo/VideoSettingsPanel';
import { Timeline } from '../../components/GoalVideo/Timeline';
import { Spinner } from '../../components/ui';

type LeftTab = 'elements' | 'background' | 'video';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!(editor.active as any)?.isEditing;
}

export function GoalVideoPage({ matchId, goalId }: { matchId: string; goalId: string | null }) {
  const match = useApp((s) => s.matches.find((m) => m.id === matchId));
  if (!match) {
    return (
      <div className="page">
        <div className="empty">Partita non trovata. Potrebbe essere stata eliminata.</div>
      </div>
    );
  }
  return <GoalVideoEditor match={match} initialGoalId={goalId} />;
}

function GoalVideoEditor({ match, initialGoalId }: { match: Match; initialGoalId: string | null }) {
  const go = useRoute((s) => s.go);
  const { settings, updateMatch, toast } = useApp();
  const bump = useEditorUI((s) => s.bump);
  useEditorUI((s) => s.version);

  const canvasEl = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>('elements');
  const [format, setFormat] = useState<FormatSpec>({ preset: 'story', width: 1080, height: 1920 });
  const [video, setVideo] = useState<VideoSettings>({ duration: 7, accent: '#e11d48', extras: DEFAULT_EXTRAS });
  const [goalSel, setGoalSel] = useState<string | null>(initialGoalId && match.goals.some((g) => g.id === initialGoalId) ? initialGoalId : latestGoalId(match));
  const [t, setT] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [menu, setMenu] = useState(false);

  const matchRef = useRef(match);
  matchRef.current = match;
  const formatRef = useRef(format);
  formatRef.current = format;
  const videoRef = useRef(video);
  videoRef.current = video;
  const goalSelRef = useRef(goalSel);
  goalSelRef.current = goalSel;
  const loadedOnce = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const restsRef = useRef<AnimSnapshot[] | null>(null);
  const fxBaseRef = useRef<FxSnapshot[] | null>(null);
  const particlesRef = useRef(makeConfetti());
  const playRaf = useRef(0);

  const unit = () => editor.width / 1080;

  /** Persists the canvas + video settings into match.goalVideo. */
  const saveNow = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (!loadedOnce.current || !editor.canvas) return;
    const doc: GraphicDoc = { format: formatRef.current, json: editor.serialize(), templateId: null, updatedAt: Date.now(), video: videoRef.current };
    await updateMatch(matchRef.current.id, () => ({ goalVideo: doc }));
  }, [updateMatch]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 600);
  }, [saveNow]);

  const fit = useCallback(() => {
    const el = stageRef.current;
    if (el) editor.fitTo(el.clientWidth, el.clientHeight);
  }, []);

  const rebind = useCallback(() => {
    return editor.canvas ? applyGoalBindings(editor.canvas, matchRef.current, goalSelRef.current, useApp.getState().settings) : Promise.resolve(false);
  }, []);

  // Mount canvas once.
  useEffect(() => {
    if (!canvasEl.current) return;
    editor.mount(canvasEl.current);
    editor.onChange = bump;
    editor.onCommit = scheduleSave;
    editor.onRebind = rebind;
    editor.onRestored = rebind;
    setReady(true);
    const onResize = () => fit();
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
      cancelAnimationFrame(playRaf.current);
      loadedOnce.current = false;
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the goal-video doc once the canvas is mounted.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const m = matchRef.current;
      const doc = await ensureGoalVideo(m);
      if (cancelled) return;
      setFormat(doc.format);
      formatRef.current = doc.format;
      const v: VideoSettings = doc.video ?? { duration: 7, accent: '#e11d48', extras: DEFAULT_EXTRAS };
      setVideo(v);
      videoRef.current = v;
      setT(v.duration);
      await editor.load(doc.json, doc.format);
      if (cancelled) return;
      if (editor.canvas) await applyGoalBindings(editor.canvas, m, goalSelRef.current, useApp.getState().settings);
      editor.resetHistory();
      loadedOnce.current = true;
      fit();
      setLoading(false);
      if (!m.goalVideo) await saveNow();
    })().catch((e) => {
      console.error(e);
      toast(`Errore nel caricamento del video: ${e.message ?? e}`, 'error');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // The timeline strip only mounts once loading flips to false, shrinking the stage after the
  // first `fit()` call (run while loading was still true) sized it against a taller stage. Re-fit
  // once that layout has settled.
  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [loading, fit]);

  // Re-bind when the chosen goal (or match data) changes.
  const dataKey = JSON.stringify({ goals: match.goals, homeName: match.homeName, awayName: match.awayName, homeLogoId: match.homeLogoId, awayLogoId: match.awayLogoId, competition: match.competition, round: match.round });
  useEffect(() => {
    if (!editor.canvas || !loadedOnce.current) return;
    void editor.batch(() => applyGoalBindings(editor.canvas!, match, goalSel, settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalSel, dataKey, settings.uppercaseInfo]);

  // Keyboard shortcuts (same set as the static graphics editor).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (isTyping(e)) return;
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
        toast('Video salvato.', 'success');
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, toast]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.rel')) setMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  // ---------- preview (scrub / play) ----------

  const drawFrameNow = (time: number) => {
    const c = editor.canvas;
    if (!c || !restsRef.current || !fxBaseRef.current) return;
    const u = unit();
    const objs = editor.objects;
    const { sx, sy } = video.extras.shake ? shakeOffset(time, video.extras.impactTime, u) : { sx: 0, sy: 0 };
    c.setViewportTransform([1, 0, 0, 1, sx, sy]);
    objs.forEach((o, i) => {
      applyAnimFrame(o, restsRef.current![i], time, u);
      if (o.bgFx && o.bgFx !== 'none') applyBgFx(o, fxBaseRef.current![i], time, video.accent);
      else applyColorFx(o, fxBaseRef.current![i], time, video.accent);
    });
    c.renderAll();
    drawEffects(c.getContext(), time, video.extras, format.width, format.height, u, video.accent, particlesRef.current);
  };

  const beginPreview = () => {
    if (restsRef.current || !editor.canvas) return;
    restsRef.current = editor.objects.map(restSnapshot);
    fxBaseRef.current = editor.objects.map(fxSnapshot);
    editor.canvas.discardActiveObject();
    editor.canvas.selection = false;
    editor.canvas.forEachObject((o) => (o.selectable = false));
  };

  const endPreview = () => {
    const c = editor.canvas;
    drawFrameNow(video.duration);
    setT(video.duration);
    setPlaying(false);
    cancelAnimationFrame(playRaf.current);
    restsRef.current = null;
    fxBaseRef.current = null;
    if (c) {
      c.selection = true;
      c.setViewportTransform([1, 0, 0, 1, 0, 0]);
      c.getObjects().forEach((o) => (o.selectable = !o.lockedLayer));
      c.requestRenderAll();
    }
  };

  const handleScrub = (time: number) => {
    beginPreview();
    setT(time);
    drawFrameNow(time);
  };

  const togglePlay = () => {
    if (playing) {
      endPreview();
      return;
    }
    beginPreview();
    setPlaying(true);
    const t0 = performance.now();
    const tick = () => {
      const time = (performance.now() - t0) / 1000;
      if (time >= video.duration) {
        endPreview();
        return;
      }
      setT(time);
      drawFrameNow(time);
      playRaf.current = requestAnimationFrame(tick);
    };
    playRaf.current = requestAnimationFrame(tick);
  };

  const handleAnimChange = (obj: FabricObject, patch: Partial<AnimConfig>, commit: boolean) => {
    const base = obj.anim ?? { preset: 'none' as const, start: 0, duration: 0.5 };
    obj.set({ anim: { ...base, ...patch } });
    if (commit) editor.record();
    else editor.scheduleRecord();
    bump();
  };

  const setBgFx = (fx: BgFx) => {
    const bg = editor.background;
    if (!bg) return;
    bg.set({ bgFx: fx });
    editor.record();
    bump();
  };

  const handleImpactTimeChange = (v: number, commit: boolean) => {
    setVideo((o) => ({ ...o, extras: { ...o.extras, impactTime: v } }));
    if (commit) scheduleSave();
  };

  const changeVideo = (patch: Partial<VideoSettings>) => {
    setVideo((o) => ({ ...o, ...patch }));
    if (patch.duration !== undefined && !playing) setT(patch.duration);
    scheduleSave();
  };

  const changeFormat = (f: FormatSpec) => {
    if (f.width === format.width && f.height === format.height) return;
    editor.changeFormat(f);
    setFormat(f);
    formatRef.current = f;
    fit();
    scheduleSave();
  };

  const resetLayout = async () => {
    if (!editor.canvas) return;
    if (!window.confirm('Sostituire tutti gli elementi del video con il layout predefinito? Le modifiche attuali andranno perse.')) return;
    if (playing || restsRef.current) endPreview();
    const objects = await buildGoalVideoDefault(format.width, format.height);
    const json = { version: '6', background: '#000000', objects: objects.map((o) => o.toObject(CUSTOM_PROPS)) };
    await editor.load(json, format);
    await applyGoalBindings(editor.canvas, match, goalSel, settings);
    editor.resetHistory();
    bump();
    await saveNow();
    toast('Layout predefinito ripristinato.');
  };

  // ---------- export ----------

  const goal = match.goals.find((g) => g.id === goalSel);
  const baseName = `gol-${matchSlug(match)}${goal ? '-' + formatGoal(goal).replace(/\s|'|–/g, '-').toLowerCase() : ''}`;

  const exportMp4 = async () => {
    setMenu(false);
    setBusy(0);
    try {
      await saveNow();
      const blob = await renderGoalVideoMp4(editor.serialize(), format, match, goalSel, settings, video.duration, video.extras, video.accent, 30, (p) => setBusy(p));
      downloadBlob(blob, `${baseName}.mp4`);
      setFile(new File([blob], `${baseName}.mp4`, { type: 'video/mp4' }));
      toast('Video MP4 pronto per WhatsApp e Instagram.', 'success');
    } catch (e) {
      toast(e instanceof VideoUnsupportedError ? e.message : `Esportazione non riuscita: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportPng = async () => {
    setMenu(false);
    try {
      await saveNow();
      const blob = await renderGoalVideoPng(editor.serialize(), format, match, goalSel, settings, video.duration, video.extras, video.accent);
      downloadBlob(blob, `${baseName}.png`);
    } catch (e) {
      toast(`Esportazione non riuscita: ${(e as Error).message}`, 'error');
    }
  };

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const sortedGoals = sortGoals(match.goals);
  const title = `${match.homeName || 'Casa'} – ${match.awayName || 'Ospite'}`;

  return (
    <div className="editor">
      <div className="editor-top">
        <button className="btn sm ghost icon" title="Torna alla partita" onClick={() => go({ page: 'editor', matchId: match.id, kind: 'matchday' })}>
          <ArrowLeft size={16} />
        </button>
        <div className="editor-title" title={title}>
          {title} · Video gol
        </div>
        {sortedGoals.length > 0 && (
          <select className="select sm" style={{ width: 220 }} value={goalSel ?? ''} onChange={(e) => setGoalSel(e.target.value || null)}>
            {sortedGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {formatGoal(g)}
              </option>
            ))}
          </select>
        )}
        <div className="spacer" />
        <button className="btn sm icon" title="Annulla (Ctrl+Z)" disabled={!editor.canUndo} onClick={() => editor.undo()}>
          <Undo2 size={15} />
        </button>
        <button className="btn sm icon" title="Ripristina (Ctrl+Y)" disabled={!editor.canRedo} onClick={() => editor.redo()}>
          <Redo2 size={15} />
        </button>
        <div className="sep" />
        <div className="rel">
          <button className="btn sm primary" disabled={busy !== null || loading} onClick={() => setMenu(!menu)}>
            {busy !== null ? <Spinner /> : <Download size={14} />} {busy !== null ? `Creazione ${Math.round(busy * 100)}%` : 'Esporta'}
          </button>
          {menu && (
            <div className="menu">
              <button className="menu-item" onClick={exportMp4}>
                <Video size={15} /> Scarica video MP4
              </button>
              <button className="menu-item" onClick={exportPng}>
                <ImageIcon size={15} /> Scarica immagine PNG
              </button>
              {canShare && (
                <button className="menu-item" onClick={() => navigator.share({ files: [file!] }).catch(() => undefined)}>
                  <Share2 size={15} /> Condividi (WhatsApp, Instagram…)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="editor-body">
        <aside className="panel">
          <div className="panel-tabs">
            <button className={`panel-tab ${leftTab === 'elements' ? 'active' : ''}`} onClick={() => setLeftTab('elements')}>
              <Shapes size={16} /> Elementi
            </button>
            <button className={`panel-tab ${leftTab === 'background' ? 'active' : ''}`} onClick={() => setLeftTab('background')}>
              <Wallpaper size={16} /> Sfondo
            </button>
            <button className={`panel-tab ${leftTab === 'video' ? 'active' : ''}`} onClick={() => setLeftTab('video')}>
              <Video size={16} /> Video
            </button>
          </div>
          <div className="panel-scroll">
            {leftTab === 'elements' && <GoalElementsPanel match={match} goalId={goalSel} />}
            {leftTab === 'background' && <BackgroundManager />}
            {leftTab === 'video' && (
              <VideoSettingsPanel
                format={format}
                onFormatChange={changeFormat}
                video={video}
                onChange={changeVideo}
                bgFx={editor.background?.bgFx ?? 'none'}
                onBgFxChange={setBgFx}
                hasBackground={!!editor.background}
                onResetLayout={resetLayout}
              />
            )}
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
        </div>

        <aside className="panel right">
          <div className="panel-tabs" style={{ padding: '0 14px' }}>
            <div className="panel-tab active" style={{ flexDirection: 'row', justifyContent: 'flex-start', cursor: 'default' }}>
              <Layers3 size={14} /> Proprietà
            </div>
          </div>
          <div className="panel-scroll" style={{ flex: '1 1 55%' }}>
            <PropertiesPanel videoMode />
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

      {!loading && (
        <Timeline
          objects={editor.objects}
          duration={video.duration}
          t={t}
          playing={playing}
          impactTime={video.extras.impactTime}
          onScrub={handleScrub}
          onScrubEnd={endPreview}
          onPlayToggle={togglePlay}
          onAnimChange={handleAnimChange}
          onImpactTimeChange={handleImpactTimeChange}
        />
      )}
    </div>
  );
}
