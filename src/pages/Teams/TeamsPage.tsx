import { useState } from 'react';
import { Images, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { TeamEditorModal } from '../../components/TeamSelector/TeamSelector';
import { LogoImg, confirmDialog } from '../../components/ui';
import { orphanLogos, useApp } from '../../store/appStore';
import type { Team } from '../../types';

export function TeamsPage() {
  const teams = useApp((s) => s.teams);
  const removeTeam = useApp((s) => s.removeTeam);
  const toast = useApp((s) => s.toast);
  const assets = useApp((s) => s.assets);
  const teamFromLogo = useApp((s) => s.teamFromLogo);
  const loose = orphanLogos({ teams, assets });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const list = teams.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Libreria squadre</h1>
          <p className="page-sub">Squadre salvate con il proprio logo, pronte per la selezione rapida.</p>
        </div>
        <div className="row">
          <div className="search" style={{ width: 260 }}>
            <Search size={14} />
            <input className="input" placeholder="Cerca squadra…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={15} /> Nuova squadra
          </button>
        </div>
      </div>
      {loose.length > 0 && (
        <div className="card row" style={{ marginBottom: 18 }}>
          <Images size={18} color="var(--accent)" />
          <span style={{ flex: 1 }}>
            {loose.length === 1 ? 'C’è 1 logo' : `Ci sono ${loose.length} loghi`} nella libreria senza squadra associata.
          </span>
          <button
            className="btn primary sm"
            onClick={async () => {
              for (const l of loose) await teamFromLogo(l.id);
              toast(`${loose.length} squadre create dai loghi.`, 'success');
            }}
          >
            Crea squadre dai loghi
          </button>
        </div>
      )}
      {!list.length ? (
        <div className="empty">
          <Shield size={34} />
          <div>{teams.length ? 'Nessuna squadra trovata.' : 'Nessuna squadra salvata. Aggiungi la prima squadra con il suo logo.'}</div>
        </div>
      ) : (
        <div className="tiles">
          {list.map((t) => (
            <div key={t.id} className="tile">
              <div className="tile-media checker" style={{ cursor: 'pointer' }} onClick={() => setEditing(t)}>
                <LogoImg assetId={t.logoId} size="lg" />
              </div>
              <div className="tile-body">
                <div className="tile-name" title={t.name}>
                  {t.name}
                </div>
                <div className="row">
                  <button className="btn sm" style={{ flex: 1 }} onClick={() => setEditing(t)}>
                    <Pencil size={13} /> Modifica
                  </button>
                  <button
                    className="btn sm icon danger"
                    title="Elimina squadra"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Eliminare la squadra?',
                        message: `"${t.name}" verrà rimossa dalla libreria. Le partite già create e il logo nella libreria loghi non vengono modificati.`,
                        confirmLabel: 'Elimina',
                        danger: true,
                      });
                      if (ok) {
                        await removeTeam(t.id);
                        toast('Squadra eliminata.');
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <TeamEditorModal team={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
