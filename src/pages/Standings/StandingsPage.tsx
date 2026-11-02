import { useState } from 'react';
import { AlertTriangle, ClipboardPaste, Download, ExternalLink, FileUp, Link2, ListOrdered, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { LogoImg, Modal, Spinner, confirmDialog } from '../../components/ui';
import { formatUpdated } from '../../services/bindings';
import { downloadBlob } from '../../services/export';
import { pickFile } from '../../services/imageProcessing';
import { CSV_TEMPLATE, StandingsImportError, matchLogos, parseStandingsCsv, sameTeam, standingsToCsv } from '../../services/standings';
import { DEFAULT_LEAGUE, StandingsUnavailableError, TUTTOCAMPO_WIDGET_INFO, fetchStandings, isApiConfigured, normalizeWidgetUrl, widgetUrlOf } from '../../services/tuttocampo';
import { useApp } from '../../store/appStore';
import { useRoute } from '../../store/routeStore';
import type { League, StandingRow, StandingsSource } from '../../types';

const NUM_COLS: { key: keyof StandingRow; label: string; title: string }[] = [
  { key: 'pts', label: 'PT', title: 'Punti' },
  { key: 'played', label: 'G', title: 'Giocate' },
  { key: 'won', label: 'V', title: 'Vinte' },
  { key: 'drawn', label: 'N', title: 'Pareggiate' },
  { key: 'lost', label: 'P', title: 'Perse' },
  { key: 'gf', label: 'GF', title: 'Gol fatti' },
  { key: 'ga', label: 'GS', title: 'Gol subiti' },
  { key: 'gd', label: 'DR', title: 'Differenza reti' },
];

const METHOD_LABEL: Record<StandingsSource, string> = { api: 'API ufficiale', widget: 'widget Tuttocampo', csv: 'importazione CSV', manual: 'modifica manuale' };

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${formatUpdated(ts)} alle ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StandingsPage() {
  const { settings, setSettings, teams, assets, matches, toast } = useApp();
  const go = useRoute((s) => s.go);
  const league: League = settings.league ?? DEFAULT_LEAGUE;
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const widgetUrl = widgetUrlOf(league);
  const [widgetDraft, setWidgetDraft] = useState(widgetUrl);
  const widgetValid = !widgetDraft.trim() || !!normalizeWidgetUrl(widgetDraft);
  const logos = assets.filter((a) => a.kind === 'logo' && !a.archived);

  const save = (patch: Partial<League>) => setSettings({ league: { ...league, ...patch } });

  const applyRows = async (rows: StandingRow[], method: StandingsSource) => {
    const withLogos = matchLogos(rows, teams, false);
    await save({ rows: withLogos, updatedAt: Date.now(), updateMethod: method });
    const missing = withLogos.filter((r) => !r.logoId).length;
    toast(`Classifica aggiornata: ${rows.length} squadre${missing ? ` (${missing} senza logo in libreria)` : ''}.`, 'success');
  };

  const refresh = async () => {
    setBusy(true);
    setUnavailable(null);
    try {
      const { rows, method } = await fetchStandings(league);
      await applyRows(rows, method);
    } catch (e) {
      if (e instanceof StandingsUnavailableError || e instanceof StandingsImportError) setUnavailable(e.message);
      else setUnavailable(`Errore durante l’aggiornamento: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importText = async (text: string): Promise<boolean> => {
    try {
      await applyRows(parseStandingsCsv(text), 'csv');
      setUnavailable(null);
      return true;
    } catch (e) {
      toast(e instanceof StandingsImportError ? e.message : `File non valido: ${(e as Error).message}`, 'error');
      return false;
    }
  };

  const importCsv = async () => {
    const [file] = await pickFile('.csv,.txt,text/csv,text/plain');
    if (file) await importText(await file.text());
  };

  const editRow = (i: number, patch: Partial<StandingRow>) => {
    const rows = league.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    save({ rows, updatedAt: Date.now(), updateMethod: 'manual' });
  };

  const numValue = (v: string): number | null => {
    const s = v.trim().replace(/^\+/, '');
    return s === '' || !/^-?\d+$/.test(s) ? null : parseInt(s, 10);
  };

  const openGraphic = () => {
    const latest = [...matches].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!latest) {
      toast('Crea prima una partita: la grafica CLASSIFICA si trova tra le grafiche della partita.', 'info');
      go({ page: 'new' });
      return;
    }
    go({ page: 'editor', matchId: latest.id, kind: 'standings' });
  };

  const favoriteFound = league.rows.some((r) => sameTeam(r.team, league.favoriteTeam));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Classifica</h1>
          <p className="page-sub">
            {league.category} · Girone {league.group} · {league.province} ({league.region}) · Fonte: Tuttocampo{' '}
            <a href={league.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              apri la pagina <ExternalLink size={11} />
            </a>
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={openGraphic}>
            <ListOrdered size={15} /> Apri grafica CLASSIFICA
          </button>
          <button className="btn primary" onClick={refresh} disabled={busy}>
            {busy ? <Spinner /> : <RefreshCw size={15} />} AGGIORNA CLASSIFICA
          </button>
        </div>
      </div>

      <div className="card row wrap" style={{ marginBottom: 14, gap: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="label">Ultimo aggiornamento</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>
            {league.updatedAt ? fmtDateTime(league.updatedAt) : 'Mai aggiornata'}
            {league.updateMethod && <span className="muted small" style={{ fontWeight: 400 }}> · {METHOD_LABEL[league.updateMethod]}</span>}
          </div>
          <div className="faint small" style={{ marginTop: 3 }}>
            {league.rows.length} squadre · Aggiornamento automatico: {isApiConfigured(league) ? 'API configurata' : widgetUrl ? 'widget Tuttocampo della società' : 'non disponibile (vedi sotto)'}
          </div>
        </div>
        <div className="field" style={{ width: 260 }}>
          <label>Squadra da evidenziare</label>
          <input
            className="input"
            list="standings-teams"
            value={league.favoriteTeam}
            onChange={(e) => save({ favoriteTeam: e.target.value })}
            placeholder="Es. Folgore Lacedonia"
          />
          <datalist id="standings-teams">
            {league.rows.map((r) => (
              <option key={r.team} value={r.team} />
            ))}
          </datalist>
          {league.rows.length > 0 && !favoriteFound && <span className="small" style={{ color: 'var(--warn)' }}>Nessuna squadra della classifica corrisponde a questo nome.</span>}
        </div>
      </div>

      {unavailable && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.07)' }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <AlertTriangle size={20} color="var(--warn)" style={{ flex: 'none', marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aggiornamento automatico non disponibile</div>
              <div className="muted" style={{ lineHeight: 1.55 }}>{unavailable}</div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn sm primary" onClick={importCsv}>
                  <FileUp size={14} /> Importa CSV
                </button>
                <button className="btn sm" onClick={() => setPasteOpen(true)}>
                  <ClipboardPaste size={14} /> Incolla dati
                </button>
                <a className="btn sm" href={league.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Classifica su Tuttocampo
                </a>
                <a className="btn sm ghost" href={TUTTOCAMPO_WIDGET_INFO} target="_blank" rel="noreferrer">
                  Info API Tuttocampo
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0, flex: 1 }}>
            Dati classifica
          </div>
          <button className="btn sm" onClick={importCsv}>
            <FileUp size={14} /> Importa CSV
          </button>
          <button className="btn sm" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste size={14} /> Incolla dati
          </button>
          <button className="btn sm" onClick={() => downloadBlob(new Blob([CSV_TEMPLATE], { type: 'text/csv' }), 'modello-classifica.csv')}>
            <Download size={14} /> Modello CSV
          </button>
          <button className="btn sm" disabled={!league.rows.length} onClick={() => downloadBlob(new Blob([standingsToCsv(league.rows)], { type: 'text/csv' }), 'classifica.csv')}>
            <Download size={14} /> Esporta CSV
          </button>
          <button
            className="btn sm"
            disabled={!league.rows.length}
            title="Associa automaticamente i loghi della libreria alle squadre"
            onClick={() => {
              save({ rows: matchLogos(league.rows, teams, false) });
              toast('Loghi ricollegati dalla libreria.', 'success');
            }}
          >
            <Wand2 size={14} /> Ricollega loghi
          </button>
        </div>

        {!league.rows.length ? (
          <div className="empty">
            <ListOrdered size={34} />
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Nessun dato in classifica</div>
            <div>Premi AGGIORNA CLASSIFICA oppure importa un CSV (Pos;Squadra;PT;G;V;N;P;GF;GS;DR). I valori non presenti restano vuoti: nessun dato viene inventato.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="st-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Logo</th>
                  <th style={{ textAlign: 'left' }}>Squadra</th>
                  {NUM_COLS.map((c) => (
                    <th key={c.key} title={c.title}>
                      {c.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {league.rows.map((r, i) => (
                  <tr key={i} className={sameTeam(r.team, league.favoriteTeam) ? 'fav' : ''}>
                    <td>
                      <input className="input sm num-cell" value={r.pos} onChange={(e) => editRow(i, { pos: numValue(e.target.value) ?? 0 })} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <LogoImg assetId={r.logoId} size="sm" />
                        <select className="select sm" style={{ width: 34, padding: 0 }} title="Scegli logo" value={r.logoId ?? ''} onChange={(e) => editRow(i, { logoId: e.target.value || null })}>
                          <option value="">—</option>
                          {logos.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <input className="input sm" style={{ minWidth: 200 }} value={r.team} onChange={(e) => editRow(i, { team: e.target.value })} />
                    </td>
                    {NUM_COLS.map((c) => (
                      <td key={c.key}>
                        <input
                          className="input sm num-cell"
                          value={r[c.key] === null ? '' : String(r[c.key])}
                          placeholder="–"
                          onChange={(e) => editRow(i, { [c.key]: numValue(e.target.value) } as Partial<StandingRow>)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="layer-btn" title="Elimina riga" onClick={() => save({ rows: league.rows.filter((_, j) => j !== i), updatedAt: Date.now(), updateMethod: 'manual' })}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button
            className="btn sm"
            onClick={() =>
              save({
                rows: [...league.rows, { pos: league.rows.length + 1, team: '', played: null, won: null, drawn: null, lost: null, gf: null, ga: null, gd: null, pts: null, logoId: null }],
              })
            }
          >
            <Plus size={14} /> Aggiungi squadra
          </button>
          <button className="btn sm" disabled={league.rows.length < 2} onClick={() => save({ rows: [...league.rows].sort((a, b) => a.pos - b.pos) })}>
            Ordina per posizione
          </button>
          <div className="spacer" />
          <button
            className="btn sm danger"
            disabled={!league.rows.length}
            onClick={async () => {
              if (await confirmDialog({ title: 'Svuotare la classifica?', message: 'Tutte le righe verranno eliminate.', confirmLabel: 'Svuota', danger: true }))
                save({ rows: [], updatedAt: null, updateMethod: null });
            }}
          >
            <Trash2 size={14} /> Svuota
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginTop: 0 }}>
          <RefreshCw size={15} /> Fonte automatica: widget classifica Tuttocampo
        </div>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          Il widget «Classifica» è il canale gratuito che Tuttocampo offre alle società per usare i propri dati. AGGIORNA CLASSIFICA lo legge una volta, solo quando premi il pulsante. Puoi incollare il link
          o direttamente il codice <code>&lt;iframe&gt;</code> generato su Tuttocampo.
        </p>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <label>Link widget classifica</label>
            <input
              className="input"
              value={widgetDraft}
              placeholder="https://www.tuttocampo.it/WidgetV2/Classifica/…"
              onChange={(e) => setWidgetDraft(e.target.value)}
              onBlur={() => {
                if (!widgetDraft.trim()) return save({ widgetUrl: '' });
                const clean = normalizeWidgetUrl(widgetDraft);
                if (clean) {
                  setWidgetDraft(clean);
                  if (clean !== widgetUrl) save({ widgetUrl: clean });
                }
              }}
            />
            {!widgetValid && <span className="small" style={{ color: 'var(--warn)' }}>Link non valido: deve essere un widget «Classifica» di tuttocampo.it (WidgetV2/Classifica/…).</span>}
          </div>
          {widgetUrl && (
            <a className="btn sm" href={widgetUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Anteprima widget
            </a>
          )}
          <a className="btn sm ghost" href={TUTTOCAMPO_WIDGET_INFO} target="_blank" rel="noreferrer">
            Crea un widget
          </a>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <button className="row btn ghost" style={{ padding: 0, height: 'auto' }} onClick={() => setApiOpen((v) => !v)}>
          <Link2 size={15} /> <b>API ufficiale Tuttocampo (a pagamento, su accordo)</b>
        </button>
        {apiOpen && (
          <div className="section" style={{ marginTop: 12 }}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              Tuttocampo fornisce i dati tramite API solo con abbonamento mensile concordato con la redazione. Se ottieni l’accesso, inserisci qui l’indirizzo della classifica e la chiave: AGGIORNA CLASSIFICA userà
              l’API al posto del widget. La pagina web del girone non viene mai letta automaticamente, perché le condizioni d’uso del sito vietano lo scraping.
            </p>
            <div className="grid-2">
              <div className="field">
                <label>Indirizzo API classifica</label>
                <input className="input" value={league.api?.endpoint ?? ''} placeholder="https://…" onChange={(e) => save({ api: { endpoint: e.target.value, key: league.api?.key ?? '' } })} />
              </div>
              <div className="field">
                <label>Chiave API</label>
                <input className="input" type="password" value={league.api?.key ?? ''} onChange={(e) => save({ api: { endpoint: league.api?.endpoint ?? '', key: e.target.value } })} />
              </div>
            </div>
          </div>
        )}
      </div>

      {pasteOpen && <PasteModal onClose={() => setPasteOpen(false)} onImport={async (t) => (await importText(t)) && setPasteOpen(false)} />}
    </div>
  );
}

function PasteModal({ onClose, onImport }: { onClose: () => void; onImport: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Incolla dati classifica" onClose={onClose} width={640}>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        Incolla una tabella copiata da Excel/Fogli Google o un testo CSV. La prima riga deve contenere le intestazioni, ad esempio: <code>Pos; Squadra; PT; G; V; N; P; GF; GS; DR</code>
      </p>
      <textarea className="textarea" style={{ minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annulla
        </button>
        <button className="btn primary" disabled={!text.trim()} onClick={() => onImport(text)}>
          Importa
        </button>
      </div>
    </Modal>
  );
}
