import { useState } from 'react';
import { FabricImage, Textbox, type FabricObject } from 'fabric';
import { Boxes, ChevronDown, ChevronRight, ChevronUp, Copy, Folder, Eye, EyeOff, Image as ImageIcon, Link2, Lock, Square, Trash2, Type, Unlock, Wallpaper } from 'lucide-react';
import { editor } from '../../editor/controller';
import { useEditorUI } from '../../store/editorStore';
import { useApp } from '../../store/appStore';

/** Folder by type for layers that are not in a group. */
function categoryOf(o: FabricObject, logoIds: Set<string>): string {
  const b = o.binding ?? '';
  if (b === 'spMain' || b.startsWith('sp:') || b.startsWith('spSlot:') || (o.name ?? '').startsWith('Sponsor')) return 'Sponsor';
  if (o instanceof FabricImage) {
    if (['homeLogo', 'awayLogo', 'clubLogo'].includes(b) || b.startsWith('stLogo:') || (o.assetId && logoIds.has(o.assetId))) return 'Loghi';
    return 'Immagini';
  }
  if (o instanceof Textbox) return 'Testi';
  return 'Forme e decorazioni';
}

function iconFor(o: FabricObject) {
  if (o.role === 'background') return <Wallpaper size={14} />;
  if (o instanceof Textbox) return <Type size={14} />;
  if (o instanceof FabricImage) return <ImageIcon size={14} />;
  return <Square size={14} />;
}

export function LayersPanel() {
  useEditorUI((s) => s.version);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const assets = useApp((s) => s.assets);
  const logoIds = new Set(assets.filter((a) => a.kind === 'logo').map((a) => a.id));
  const objs = editor.objects;
  const selected = new Set(editor.activeObjects);
  const list = [...objs].reverse();


  // Every layer lives in a folder: its group, or a folder by type (Sponsor, Loghi, Testi…).
  // Folders appear once, at the position of their topmost member; the background stays on its own.
  const folderOf = (o: FabricObject): { id: string; name: string } | null => {
    if (o.groupId) return { id: o.groupId, name: o.groupName ?? 'Gruppo' };
    if (o.role === 'background') return null;
    const cat = categoryOf(o, logoIds);
    return { id: `cat:${cat}`, name: cat };
  };
  type Entry = { kind: 'row'; obj: FabricObject } | { kind: 'group'; id: string; name: string; members: FabricObject[]; category: boolean };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const o of list) {
    const f = folderOf(o);
    if (!f) entries.push({ kind: 'row', obj: o });
    else if (!seen.has(f.id)) {
      seen.add(f.id);
      const members = list.filter((m) => folderOf(m)?.id === f.id);
      entries.push({ kind: 'group', id: f.id, name: f.name, members, category: f.id.startsWith('cat:') });
    }
  }
  const selectFolder = (en: Extract<Entry, { kind: 'group' }>) => (en.category ? editor.selectMany(en.members) : editor.selectGroup(en.id));
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (o: FabricObject, child: boolean) => {
    const isSel = selected.has(o);
    return (
            <div
              key={o.id}
              style={child ? { marginLeft: 18 } : undefined}
              className={`layer ${isSel ? 'selected' : ''} ${o.visible ? '' : 'hidden-layer'} ${overId === o.id ? 'dragover' : ''}`}
              draggable={editing !== o.id}
              onDragStart={(e) => {
                setDragId(o.id ?? null);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(o.id ?? null);
              }}
              onDragLeave={() => setOverId(null)}
              onDrop={() => onDrop(o)}
              onClick={() => o.visible && (o.groupId ? editor.selectSingle(o) : editor.select(o))}
              onDoubleClick={() => setEditing(o.id ?? null)}
              title="Doppio clic per rinominare · trascina per riordinare"
            >
              <span className="layer-icon">{iconFor(o)}</span>
              <span className="layer-name">
                {editing === o.id ? (
                  <input
                    autoFocus
                    defaultValue={o.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      editor.rename(o, e.target.value.trim() || o.name || 'Elemento');
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                ) : (
                  o.name || o.type
                )}
              </span>
              {o.binding && <Link2 size={11} color="var(--accent)" style={{ flex: 'none' }} />}
              {isSel && (
                <>
                  <button className="layer-btn" title="Su" onClick={(e) => (e.stopPropagation(), editor.bringForward(o))}>
                    <ChevronUp size={13} />
                  </button>
                  <button className="layer-btn" title="Giù" onClick={(e) => (e.stopPropagation(), editor.sendBackward(o))}>
                    <ChevronDown size={13} />
                  </button>
                  <button
                    className="layer-btn"
                    title="Duplica"
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.duplicateSelected();
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="layer-btn"
                    title="Elimina"
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.deleteObject(o);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              <button className={`layer-btn ${o.lockedLayer ? 'on' : ''}`} title={o.lockedLayer ? 'Sblocca' : 'Blocca'} onClick={(e) => (e.stopPropagation(), editor.setLocked(o, !o.lockedLayer))}>
                {o.lockedLayer ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button className="layer-btn" title={o.visible ? 'Nascondi' : 'Mostra'} onClick={(e) => (e.stopPropagation(), editor.setVisible(o, !o.visible))}>
                {o.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
    );
  };

  const onDrop = (target: FabricObject) => {
    const src = objs.find((o) => o.id === dragId);
    setDragId(null);
    setOverId(null);
    if (!src || src === target) return;
    editor.moveTo(src, objs.indexOf(target));
  };

  return (
    <div className="section">
      {entries.some((en) => en.kind === 'group') && (
        <>
          <div className="section-title">Gruppi e cartelle</div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            {entries.map((en) =>
              en.kind === 'group' ? (
                <button
                  key={`chip-${en.id}`}
                  className={`btn sm ${en.members.every((m) => selected.has(m) || !m.visible) && en.members.some((m) => selected.has(m)) ? 'active' : ''}`}
                  title="Seleziona tutto il gruppo"
                  onClick={() => selectFolder(en)}
                >
                  {en.category ? <Folder size={13} /> : <Boxes size={13} />} {en.name}
                  <span className="faint small">{en.members.length}</span>
                </button>
              ) : null,
            )}
          </div>
        </>
      )}
      <div className="section-title">Livelli ({objs.length})</div>
      <div className="layers">
        {entries.map((en) =>
          en.kind === 'row' ? (
            renderRow(en.obj, false)
          ) : (
            <div key={`g-${en.id}`}>
              <div
                className={`layer group-row ${en.members.every((m) => selected.has(m)) ? 'selected' : ''}`}
                onClick={() => selectFolder(en)}
                title="Clic: seleziona tutto il contenuto · freccia: mostra gli elementi"
              >
                <button
                  className="layer-btn"
                  title={open.has(en.id) ? 'Chiudi gruppo' : 'Apri gruppo'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpen(en.id);
                  }}
                >
                  {open.has(en.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <span className="layer-icon">{en.category ? <Folder size={14} /> : <Boxes size={14} />}</span>
                <span className="layer-name" style={{ fontWeight: 600 }}>
                  {en.name} <span className="faint small">({en.members.length})</span>
                </span>
                <button
                  className={`layer-btn ${en.members.every((m) => m.lockedLayer) ? 'on' : ''}`}
                  title="Blocca / sblocca tutto il gruppo"
                  onClick={(e) => (e.stopPropagation(), editor.setManyLocked(en.members, !en.members.every((m) => m.lockedLayer)))}
                >
                  {en.members.every((m) => m.lockedLayer) ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  className="layer-btn"
                  title="Mostra / nascondi tutto il gruppo"
                  onClick={(e) => (e.stopPropagation(), editor.setManyVisible(en.members, !en.members.some((m) => m.visible)))}
                >
                  {en.members.some((m) => m.visible) ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
              {open.has(en.id) && en.members.map((m) => renderRow(m, true))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
