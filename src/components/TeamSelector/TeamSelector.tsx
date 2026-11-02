import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, Upload, X } from 'lucide-react';
import { uid } from '../../services/database';
import { FileError, LOGO_TYPES, fileBaseName, pickFile, prepareImage } from '../../services/imageProcessing';
import { orphanLogos, teamNameFromFile, useApp } from '../../store/appStore';
import type { Team } from '../../types';
import { LogoImg, Modal } from '../ui';

/** Uploads a logo file (PNG/SVG) into the library. Shows errors as toasts. */
export async function uploadLogoFile(file: File, name?: string): Promise<string | null> {
  const app = useApp.getState();
  try {
    const blob = await prepareImage(file, LOGO_TYPES, 'il logo');
    const meta = await app.addAsset(blob, 'logo', name || fileBaseName(file.name));
    return meta.id;
  } catch (e) {
    app.toast(e instanceof FileError ? e.message : `Errore nel caricamento del logo: ${(e as Error).message}`, 'error');
    return null;
  }
}

export function LogoLibraryPicker({ value, onPick }: { value: string | null; onPick: (id: string) => void }) {
  const assets = useApp((s) => s.assets);
  const [q, setQ] = useState('');
  const logos = assets.filter((a) => a.kind === 'logo' && !a.archived && a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="section">
      <div className="search">
        <Search size={14} />
        <input className="input sm" placeholder="Cerca nella libreria loghi…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, maxHeight: 190, overflow: 'auto' }}>
        {logos.map((l) => (
          <button
            key={l.id}
            className={`btn ${value === l.id ? 'active' : ''}`}
            style={{ height: 64, padding: 6 }}
            title={l.name}
            onClick={() => onPick(l.id)}
          >
            <LogoImg assetId={l.id} />
          </button>
        ))}
        {!logos.length && <div className="faint small">Nessun logo nella libreria.</div>}
      </div>
    </div>
  );
}

export function TeamEditorModal({
  team,
  initialName,
  onClose,
  onSaved,
}: {
  team?: Team;
  initialName?: string;
  onClose: () => void;
  onSaved?: (t: Team) => void;
}) {
  const saveTeam = useApp((s) => s.saveTeam);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(team?.name ?? initialName ?? '');
  const [logoId, setLogoId] = useState<string | null>(team?.logoId ?? null);
  const [showLib, setShowLib] = useState(false);

  const upload = async () => {
    const [file] = await pickFile('.png,.svg,image/png,image/svg+xml');
    if (!file) return;
    const id = await uploadLogoFile(file, name || undefined);
    if (id) setLogoId(id);
  };

  const save = async () => {
    if (!name.trim()) {
      toast('Inserisci il nome della squadra.', 'error');
      return;
    }
    const t: Team = { id: team?.id ?? uid(), name: name.trim(), logoId, createdAt: team?.createdAt ?? Date.now() };
    await saveTeam(t);
    toast(team ? 'Squadra aggiornata.' : 'Squadra aggiunta alla libreria.', 'success');
    onSaved?.(t);
    onClose();
  };

  return (
    <Modal title={team ? 'Modifica squadra' : 'Nuova squadra'} onClose={onClose}>
      <div className="section" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Nome squadra</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. A.S.D. Folgore Lacedonia" onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <div className="field">
          <label>Logo (PNG o SVG, trasparenza supportata)</label>
          <div className="row">
            <div className="checker" style={{ borderRadius: 10, padding: 8 }}>
              <LogoImg assetId={logoId} size="lg" />
            </div>
            <div className="section" style={{ gap: 6 }}>
              <button className="btn sm" onClick={upload}>
                <Upload size={14} /> Carica logo
              </button>
              <button className={`btn sm ${showLib ? 'active' : ''}`} onClick={() => setShowLib((v) => !v)}>
                Scegli dalla libreria
              </button>
              {logoId && (
                <button className="btn sm ghost" onClick={() => setLogoId(null)}>
                  <X size={14} /> Rimuovi
                </button>
              )}
            </div>
          </div>
        </div>
        {showLib && <LogoLibraryPicker value={logoId} onPick={(id) => setLogoId(id)} />}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annulla
        </button>
        <button className="btn primary" onClick={save}>
          Salva squadra
        </button>
      </div>
    </Modal>
  );
}

export function TeamSelector({
  label,
  teamId,
  fallbackName,
  fallbackLogo,
  onChange,
}: {
  label: string;
  teamId: string | null;
  fallbackName?: string;
  fallbackLogo?: string | null;
  onChange: (team: Team) => void;
}) {
  const teams = useApp((s) => s.teams);
  const assets = useApp((s) => s.assets);
  const teamFromLogo = useApp((s) => s.teamFromLogo);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const team = teams.find((t) => t.id === teamId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => teams.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())), [teams, q]);
  // Library logos not linked to a team yet: picking one creates the team on the fly.
  const loose = useMemo(
    () => orphanLogos({ teams, assets }).filter((l) => teamNameFromFile(l.name).toLowerCase().includes(q.toLowerCase())),
    [teams, assets, q],
  );
  const pick = (t: Team) => {
    onChange(t);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="team-picker" ref={ref}>
        <button type="button" className="team-picker-value" onClick={() => setOpen((v) => !v)}>
          <LogoImg assetId={team?.logoId ?? fallbackLogo} size="sm" />
          <span style={{ flex: 1, fontWeight: 600 }} className={team || fallbackName ? '' : 'faint'}>
            {team?.name ?? (fallbackName || 'Seleziona squadra…')}
          </span>
          <ChevronDown size={16} className="faint" />
        </button>
        {open && (
          <div className="dropdown">
            <div className="search">
              <Search size={14} />
              <input className="input sm" autoFocus placeholder="Cerca squadra…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="dropdown-list">
              {filtered.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`dropdown-item ${t.id === teamId ? 'active' : ''}`}
                  onClick={() => pick(t)}
                >
                  <LogoImg assetId={t.logoId} size="sm" />
                  <span>{t.name}</span>
                </button>
              ))}
              {loose.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="dropdown-item"
                  title="Dalla libreria loghi: la squadra verrà creata automaticamente"
                  onClick={async () => {
                    const t = await teamFromLogo(l.id);
                    if (t) pick(t);
                  }}
                >
                  <LogoImg assetId={l.id} size="sm" />
                  <span>{teamNameFromFile(l.name)}</span>
                </button>
              ))}
              {!filtered.length && !loose.length && (
                <div className="faint small" style={{ padding: 8 }}>
                  Nessuna squadra trovata. Carica i loghi in Libreria loghi o crea una nuova squadra.
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
            >
              <Plus size={14} /> Nuova squadra{q ? ` "${q}"` : ''}
            </button>
          </div>
        )}
      </div>
      {creating && (
        <TeamEditorModal
          initialName={q}
          onClose={() => setCreating(false)}
          onSaved={(t) => {
            onChange(t);
            setQ('');
          }}
        />
      )}
    </div>
  );
}
