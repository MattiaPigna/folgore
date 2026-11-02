import { useEffect, useState } from 'react';
import { BUILTIN_TEMPLATES, buildBuiltinJSON } from '../../editor/layouts';
import { renderStored } from '../../editor/render';
import { useApp } from '../../store/appStore';
import type { GraphicKind, Template } from '../../types';
import { Modal, Spinner } from '../ui';

const builtinThumbs = new Map<string, Promise<string>>();

/** Thumbnail data URL for a template (built-in ones are rendered once per session). */
export function useTemplateThumb(t: Template): string | null {
  const [url, setUrl] = useState<string | null>(t.thumbnail);
  useEffect(() => {
    if (t.thumbnail) {
      setUrl(t.thumbnail);
      return;
    }
    if (!t.builtIn) return;
    let alive = true;
    let p = builtinThumbs.get(t.id);
    if (!p) {
      p = buildBuiltinJSON(t.id, t.kind, t.format).then((json) => renderStored(json, { format: t.format, type: 'jpeg', quality: 0.8, multiplier: 300 / t.format.width }));
      builtinThumbs.set(t.id, p);
    }
    p.then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [t]);
  return url;
}

export function builtinTemplates(kind: GraphicKind): Template[] {
  return BUILTIN_TEMPLATES.filter((d) => d.kind === kind).map((d) => ({
    id: d.id,
    name: d.name,
    kind,
    format: { preset: 'portrait', width: 1080, height: 1350 },
    json: null,
    thumbnail: null,
    builtIn: true,
    createdAt: 0,
  }));
}

export function templatesFor(kind: GraphicKind, templates: Template[]): Template[] {
  return [...builtinTemplates(kind), ...templates.filter((t) => t.kind === kind)];
}

export function TemplateThumb({ template, onClick }: { template: Template; onClick?: () => void }) {
  const url = useTemplateThumb(template);
  return (
    <div className="tpl-thumb" onClick={onClick}>
      {url ? <img src={url} alt="" /> : <Spinner />}
    </div>
  );
}

export function TemplatePickerModal({
  kind,
  currentId,
  onClose,
  onPick,
}: {
  kind: GraphicKind;
  currentId: string | null;
  onClose: () => void;
  onPick: (t: Template) => void;
}) {
  const templates = useApp((s) => s.templates);
  const list = templatesFor(kind, templates);
  return (
    <Modal title="Applica template" onClose={onClose} width={760}>
      <p className="muted" style={{ marginTop: 0 }}>Scegli la disposizione grafica da applicare. Lo sfondo caricato resta invariato.</p>
      <div className="tpl-grid">
        {list.map((t) => (
          <div key={t.id} className={`tpl ${t.id === currentId ? 'selected' : ''}`}>
            <TemplateThumb template={t} onClick={() => onPick(t)} />
            <div className="tpl-body">
              <div className="tile-name">{t.name}</div>
              <div className="faint small">
                {t.builtIn ? 'Predefinito' : 'Personalizzato'} · {t.format.width}×{t.format.height}
              </div>
              <button className="btn sm" onClick={() => onPick(t)}>
                Applica
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Chiudi
        </button>
      </div>
    </Modal>
  );
}
