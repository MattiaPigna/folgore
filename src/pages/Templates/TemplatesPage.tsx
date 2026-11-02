import { Copy, Pencil, Star, Trash2 } from 'lucide-react';
import { TemplateThumb, templatesFor } from '../../components/Editor/TemplatePickerModal';
import { confirmDialog, promptDialog } from '../../components/ui';
import { uid } from '../../services/database';
import { useApp } from '../../store/appStore';
import type { Template } from '../../types';
import { GRAPHIC_KINDS, KIND_LABELS } from '../../types';

export function TemplatesPage() {
  const { templates, settings, setSettings, saveTemplate, removeTemplate, toast } = useApp();

  const rename = async (t: Template) => {
    const name = await promptDialog({ title: 'Rinomina template', defaultValue: t.name, confirmLabel: 'Rinomina' });
    if (name) await saveTemplate({ ...t, name });
  };
  const duplicate = async (t: Template) => {
    await saveTemplate({ ...structuredClone(t), id: uid(), name: `${t.name} (copia)`, createdAt: Date.now() });
    toast('Template duplicato.', 'success');
  };
  const remove = async (t: Template) => {
    const ok = await confirmDialog({
      title: 'Eliminare il template?',
      message: `"${t.name}" verrà eliminato. Le grafiche già create con questo template non cambiano.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (ok) {
      await removeTemplate(t.id);
      toast('Template eliminato.');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Template grafici</h1>
          <p className="page-sub">
            Layout riutilizzabili per ogni tipo di grafica. Per crearne uno, apri una partita nell'editor e usa "Template → Salva come template".
          </p>
        </div>
      </div>
      {GRAPHIC_KINDS.map((k) => (
        <div key={k} style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ marginBottom: 12, fontSize: 12 }}>
            {KIND_LABELS[k]}
          </div>
          <div className="tpl-grid">
            {templatesFor(k, templates).map((t) => {
              const isDefault = settings.defaultTemplates[k] === t.id;
              return (
                <div key={t.id} className={`tpl ${isDefault ? 'selected' : ''}`}>
                  <TemplateThumb template={t} />
                  <div className="tpl-body">
                    <div className="tile-name" title={t.name}>
                      {t.name}
                    </div>
                    <div className="faint small">
                      {t.builtIn ? 'Predefinito di sistema' : 'Personalizzato'} · {t.format.width}×{t.format.height}
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className={`btn sm ${isDefault ? 'active' : ''}`}
                        style={{ flex: 1 }}
                        title="Usa per le nuove partite"
                        onClick={() => setSettings({ defaultTemplates: { ...settings.defaultTemplates, [k]: t.id } })}
                      >
                        <Star size={13} /> {isDefault ? 'Predefinito' : 'Imposta'}
                      </button>
                      {!t.builtIn && (
                        <>
                          <button className="btn sm icon" title="Rinomina" onClick={() => rename(t)}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn sm icon" title="Duplica" onClick={() => duplicate(t)}>
                            <Copy size={13} />
                          </button>
                          <button className="btn sm icon danger" title="Elimina" onClick={() => remove(t)}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
