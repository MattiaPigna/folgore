import { useState } from 'react';
import { ArrowRight, CalendarDays, LayoutTemplate } from 'lucide-react';
import { MatchInfoForm } from '../../components/MatchForm/MatchInfoForm';
import { TemplateThumb, templatesFor } from '../../components/Editor/TemplatePickerModal';
import { emptyMatch, useApp } from '../../store/appStore';
import { useRoute } from '../../store/routeStore';
import type { FormatSpec, GraphicKind, Match } from '../../types';
import { FORMAT_PRESETS, GRAPHIC_KINDS, KIND_LABELS } from '../../types';

export function NewMatchPage() {
  const settings = useApp((s) => s.settings);
  const templates = useApp((s) => s.templates);
  const saveMatch = useApp((s) => s.saveMatch);
  const toast = useApp((s) => s.toast);
  const go = useRoute((s) => s.go);
  const [match, setMatch] = useState<Match>(() => emptyMatch(settings));
  const [format, setFormat] = useState<FormatSpec>(settings.defaultFormat);

  const patch = (p: Partial<Match>) => setMatch((m) => ({ ...m, ...p }));

  const create = async () => {
    if (!match.homeName.trim() || !match.awayName.trim()) {
      toast('Seleziona la squadra di casa e la squadra ospite.', 'error');
      return;
    }
    // A built-in template follows the format chosen here; custom ones keep their own format.
    const m: Match = { ...match, format, createdAt: Date.now() };
    await saveMatch(m);
    toast('Partita creata.', 'success');
    go({ page: 'editor', matchId: m.id, kind: 'matchday' });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nuova partita</h1>
          <p className="page-sub">I dati inseriti sono condivisi tra MATCHDAY, HALF TIME, FULL TIME e POST MATCH.</p>
        </div>
        <button className="btn primary" onClick={create}>
          Crea e apri l'editor <ArrowRight size={15} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">
            <CalendarDays size={16} /> Dati della partita
          </div>
          <MatchInfoForm match={match} onChange={patch} />
        </div>

        <div className="card">
          <div className="card-title">
            <LayoutTemplate size={16} /> Template e formato
          </div>
          <div className="section">
            <div className="field">
              <label>Formato iniziale</label>
              <select
                className="select"
                value={format.preset}
                onChange={(e) => {
                  const p = FORMAT_PRESETS[e.target.value as keyof typeof FORMAT_PRESETS];
                  if (p) setFormat({ preset: p.preset, width: p.width, height: p.height });
                }}
              >
                {Object.values(FORMAT_PRESETS).map((p) => (
                  <option key={p.preset} value={p.preset}>
                    {p.label}
                  </option>
                ))}
                {format.preset === 'custom' && <option value="custom">Personalizzato · {format.width}×{format.height}</option>}
              </select>
            </div>
            {GRAPHIC_KINDS.map((k: GraphicKind) => {
              const list = templatesFor(k, templates);
              const sel = list.find((t) => t.id === match.templateIds[k]) ?? list[0];
              return (
                <div key={k} className="row" style={{ alignItems: 'stretch', gap: 12 }}>
                  <div style={{ width: 64, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flex: 'none' }}>
                    <TemplateThumb template={sel} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>{KIND_LABELS[k]}</label>
                    <select className="select" value={sel.id} onChange={(e) => patch({ templateIds: { ...match.templateIds, [k]: e.target.value } })}>
                      {list.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            <div className="faint small">I template personalizzati si creano dall'editor con "Template → Salva come template".</div>
          </div>
        </div>
      </div>
    </div>
  );
}
