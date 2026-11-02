import { useState } from 'react';
import { DatabaseBackup, Download, HardDriveUpload, SlidersHorizontal, Trash2, Type, Upload } from 'lucide-react';
import { Dropzone, Spinner, confirmDialog } from '../../components/ui';
import { createBackup, restoreBackup } from '../../services/backup';
import { db, uid } from '../../services/database';
import { downloadBlob } from '../../services/export';
import { BUILTIN_FONTS } from '../../services/fonts';
import { FileError, checkFont, fileBaseName, pickFile } from '../../services/imageProcessing';
import { useApp } from '../../store/appStore';
import { FORMAT_PRESETS } from '../../types';

export function SettingsPage() {
  const { settings, setSettings, fonts, addFont, removeFont, addAsset, removeAsset, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const uploadFonts = async (files: File[]) => {
    for (const file of files) {
      try {
        const ext = checkFont(file);
        const family = fileBaseName(file.name);
        if (fonts.some((f) => f.family.toLowerCase() === family.toLowerCase()) || BUILTIN_FONTS.some((f) => f.family.toLowerCase() === family.toLowerCase())) {
          toast(`Esiste già un font chiamato "${family}".`, 'error');
          continue;
        }
        const mime = { ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2', woff: 'font/woff' }[ext] ?? 'application/octet-stream';
        const asset = await addAsset(new Blob([file], { type: mime }), 'font', file.name);
        try {
          await addFont({ id: uid(), family, fileName: file.name, assetId: asset.id, createdAt: Date.now() });
          toast(`Font "${family}" installato.`, 'success');
        } catch {
          await removeAsset(asset.id);
          toast(`Il file "${file.name}" non è un font valido.`, 'error');
        }
      } catch (e) {
        toast(e instanceof FileError ? e.message : `Errore font: ${(e as Error).message}`, 'error');
      }
    }
  };

  const exportBackup = async () => {
    setBusy('backup');
    try {
      const blob = await createBackup();
      downloadBlob(blob, `matchday-studio-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('Backup completo esportato.', 'success');
    } catch (e) {
      toast(`Backup non riuscito: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async () => {
    const [file] = await pickFile('.json,application/json');
    if (!file) return;
    const ok = await confirmDialog({
      title: 'Ripristinare il backup?',
      message: 'Tutti i dati attuali (partite, squadre, loghi, template, font) verranno sostituiti da quelli del backup.',
      confirmLabel: 'Ripristina',
      danger: true,
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const res = await restoreBackup(file);
      toast(`Backup ripristinato: ${res.matches} partite, ${res.teams} squadre. Ricaricamento…`, 'success');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(null);
    }
  };

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Cancellare tutti i dati?',
      message: "Partite, squadre, loghi, template e font verranno eliminati definitivamente da questo browser. Esegui prima un backup.",
      confirmLabel: 'Cancella tutto',
      danger: true,
    });
    if (!ok) return;
    await db.clearAll();
    location.reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">Preferenze, font personalizzati e backup dell'applicazione.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">
            <SlidersHorizontal size={16} /> Preferenze grafiche
          </div>
          <div className="section">
            <div className="field">
              <label>Formato predefinito per le nuove partite</label>
              <select
                className="select"
                value={settings.defaultFormat.preset}
                onChange={(e) => {
                  const p = FORMAT_PRESETS[e.target.value as keyof typeof FORMAT_PRESETS];
                  if (p) setSettings({ defaultFormat: { preset: p.preset, width: p.width, height: p.height } });
                }}
              >
                {Object.values(FORMAT_PRESETS).map((p) => (
                  <option key={p.preset} value={p.preset}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Etichetta giornata</label>
              <input className="input" value={settings.matchdayPrefix} onChange={(e) => setSettings({ matchdayPrefix: e.target.value })} placeholder="MATCHDAY" />
              <span className="faint small">Esempio: "{settings.matchdayPrefix || 'MATCHDAY'} 1°"</span>
            </div>
            <div className="field">
              <label>Qualità JPG ({Math.round(settings.jpgQuality * 100)}%)</label>
              <input type="range" min={0.6} max={1} step={0.01} value={settings.jpgQuality} onChange={(e) => setSettings({ jpgQuality: parseFloat(e.target.value) })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.uppercaseInfo} onChange={(e) => setSettings({ uppercaseInfo: e.target.checked })} />
              Testi informativi in maiuscolo (stadio, località, squadre)
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.snapEnabled} onChange={(e) => setSettings({ snapEnabled: e.target.checked })} />
              Guide di allineamento e snap automatico
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <Type size={16} /> Font personalizzati
          </div>
          <div className="section">
            <Dropzone accept=".ttf,.otf,.woff2,.woff" onFiles={uploadFonts}>
              <Upload size={18} style={{ marginBottom: 6 }} />
              <div style={{ fontWeight: 600 }}>Carica font</div>
              <div className="small faint">TTF, OTF, WOFF2 · salvati localmente e inclusi nell'esportazione</div>
            </Dropzone>
            {fonts.map((f) => (
              <div key={f.id} className="row" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: `"${f.family}"`, fontSize: 22, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.family} — Matchday 2-1</div>
                  <div className="faint small">{f.fileName}</div>
                </div>
                <button
                  className="btn sm icon danger"
                  title="Elimina font"
                  onClick={async () => {
                    const ok = await confirmDialog({ title: 'Eliminare il font?', message: `I testi che usano "${f.family}" verranno mostrati con un font di sistema.`, confirmLabel: 'Elimina', danger: true });
                    if (ok) await removeFont(f.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="section-title" style={{ marginTop: 6 }}>Font inclusi</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {BUILTIN_FONTS.map((f) => (
                <span key={f.family} className="tag" style={{ fontFamily: `"${f.family}"`, fontSize: f.category === 'Calligrafico' ? 17 : 12, fontWeight: 400, padding: '3px 8px', letterSpacing: 0 }}>
                  {f.family}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <DatabaseBackup size={16} /> Backup e ripristino
          </div>
          <div className="section">
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Il backup contiene tutte le partite (in formato modificabile), squadre, loghi, sfondi, foto, template, font e impostazioni in un unico file.
            </p>
            <div className="row wrap">
              <button className="btn primary" onClick={exportBackup} disabled={!!busy}>
                {busy === 'backup' ? <Spinner /> : <Download size={14} />} Esporta backup completo
              </button>
              <button className="btn" onClick={importBackup} disabled={!!busy}>
                {busy === 'restore' ? <Spinner /> : <HardDriveUpload size={14} />} Importa backup
              </button>
            </div>
            <div className="section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn danger" onClick={wipe} style={{ alignSelf: 'flex-start' }}>
                <Trash2 size={14} /> Cancella tutti i dati
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
