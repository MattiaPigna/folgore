import { useState } from 'react';
import { Check, FolderDown, Images, Pencil, Search, Shield, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import { useRoute } from '../../store/routeStore';
import { uploadLogoFile } from '../../components/TeamSelector/TeamSelector';
import { Dropzone, LogoImg, confirmDialog } from '../../components/ui';
import { uid } from '../../services/database';
import { useApp } from '../../store/appStore';
import { FOLDER_LOGO_COUNT, importFolderLogos } from '../../services/folderLogos';
import type { AssetMeta } from '../../types';

export function LogosPage() {
  const assets = useApp((s) => s.assets);
  const [q, setQ] = useState('');
  const logos = assets.filter((a) => a.kind === 'logo' && !a.archived && a.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const toast = useApp((s) => s.toast);

  const onFiles = async (files: File[]) => {
    let ok = 0;
    for (const f of files) {
      const id = await uploadLogoFile(f);
      if (id) {
        await useApp.getState().teamFromLogo(id); // each logo is a team, ready in the selector
        ok++;
      }
    }
    if (ok) toast(ok > 1 ? `${ok} loghi caricati e squadre create.` : 'Logo caricato e squadra creata.', 'success');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Libreria loghi</h1>
          <p className="page-sub">Loghi PNG e SVG con trasparenza, disponibili in tutte le grafiche come elementi indipendenti.</p>
        </div>
        <div className="row">
          <div className="search" style={{ width: 260 }}>
            <Search size={14} />
            <input className="input" placeholder="Cerca logo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            className="btn"
            title={`Importa i loghi presenti nella cartella del progetto loghi/puliti (${FOLDER_LOGO_COUNT} file)`}
            disabled={!FOLDER_LOGO_COUNT}
            onClick={async () => {
              const n = await importFolderLogos(true);
              toast(n ? `${n} loghi importati dalla cartella.` : 'Tutti i loghi della cartella sono già nella libreria.', n ? 'success' : 'info');
            }}
          >
            <FolderDown size={15} /> Importa dalla cartella ({FOLDER_LOGO_COUNT})
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Dropzone accept=".png,.svg,image/png,image/svg+xml" onFiles={onFiles}>
          <Upload size={20} style={{ marginBottom: 6 }} />
          <div style={{ fontWeight: 600 }}>Carica loghi</div>
          <div className="small faint">PNG o SVG · trascina qui uno o più file, oppure clicca</div>
        </Dropzone>
      </div>
      {!logos.length ? (
        <div className="empty">
          <Images size={34} />
          <div>{assets.some((a) => a.kind === 'logo' && !a.archived) ? 'Nessun logo trovato.' : 'Nessun logo caricato.'}</div>
        </div>
      ) : (
        <div className="tiles">
          {logos.map((l) => (
            <LogoTile key={l.id} logo={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function LogoTile({ logo }: { logo: AssetMeta }) {
  const { renameAsset, removeAsset, teams, matches, saveTeam, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(logo.name);
  const usedBy = teams.filter((t) => t.logoId === logo.id);

  const save = async () => {
    if (!name.trim()) return;
    await renameAsset(logo.id, name.trim());
    setEditing(false);
  };

  const remove = async () => {
    const inMatches = matches.filter((m) => m.homeLogoId === logo.id || m.awayLogoId === logo.id || JSON.stringify(m.graphics).includes(logo.id)).length;
    const ok = await confirmDialog({
      title: 'Eliminare il logo?',
      message:
        `"${logo.name}" verrà eliminato definitivamente.` +
        (usedBy.length ? ` È associato a ${usedBy.length} squadr${usedBy.length > 1 ? 'e' : 'a'}.` : '') +
        (inMatches ? ` È usato in ${inMatches} partit${inMatches > 1 ? 'e' : 'a'}: nelle grafiche comparirà un segnaposto.` : ''),
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    for (const t of usedBy) await saveTeam({ ...t, logoId: null });
    await removeAsset(logo.id);
    toast('Logo eliminato.');
  };

  const createTeam = async () => {
    await saveTeam({ id: uid(), name: logo.name, logoId: logo.id, createdAt: Date.now() });
    toast(`Squadra "${logo.name}" creata.`, 'success');
  };

  return (
    <div className="tile">
      <div className="tile-media checker">
        <LogoImg assetId={logo.id} size="lg" />
      </div>
      <div className="tile-body">
        {editing ? (
          <div className="row" style={{ gap: 4 }}>
            <input className="input sm" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="btn sm icon" onClick={save} title="Salva">
              <Check size={13} />
            </button>
            <button className="btn sm icon" onClick={() => (setEditing(false), setName(logo.name))} title="Annulla">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="tile-name" title={logo.name}>
            {logo.name}
          </div>
        )}
        <div className="faint small">
          {logo.mime === 'image/svg+xml' ? 'SVG' : 'PNG'}
          {usedBy.length ? ` · ${usedBy.map((t) => t.name).join(', ')}` : ''}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm icon" title="Rinomina" onClick={() => setEditing(true)}>
            <Pencil size={13} />
          </button>
          <button className="btn sm icon" title="Ritocca immagine" onClick={() => useRoute.getState().go({ page: 'studio', assetId: logo.id })}>
            <WandSparkles size={13} />
          </button>
          {!usedBy.length && (
            <button className="btn sm" title="Crea una squadra con questo logo" onClick={createTeam}>
              <Shield size={13} /> Crea squadra
            </button>
          )}
          <div className="spacer" />
          <button className="btn sm icon danger" title="Elimina" onClick={remove}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
