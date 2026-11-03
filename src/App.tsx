import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DialogHost, Spinner, Toasts } from './components/ui';
import { ensureBuiltinFonts } from './services/fonts';
import { importFolderLogos } from './services/folderLogos';
import { useApp } from './store/appStore';
import { useRoute } from './store/routeStore';
import { ArchivePage } from './pages/Archive/ArchivePage';
import { EditorPage } from './pages/Editor/EditorPage';
import { GoalVideoPage } from './pages/GoalVideo/GoalVideoPage';
import { LogosPage } from './pages/Logos/LogosPage';
import { NewMatchPage } from './pages/NewMatch/NewMatchPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { StandingsPage } from './pages/Standings/StandingsPage';
import { SponsorsPage } from './pages/Sponsors/SponsorsPage';
import { ImageStudioPage } from './pages/ImageStudio/ImageStudioPage';
import { importSponsorFolder } from './services/sponsors';
import { TeamsPage } from './pages/Teams/TeamsPage';
import { TemplatesPage } from './pages/Templates/TemplatesPage';

export function App() {
  const storeLoaded = useApp((s) => s.loaded);
  const [fontsReady, setFontsReady] = useState(false);
  const loaded = storeLoaded && fontsReady;
  const init = useApp((s) => s.init);
  const route = useRoute((s) => s.route);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined);
    const start = init().then(async () => {
      // Logos dropped into loghi/puliti/ are added to the library automatically.
      const n = await importFolderLogos().catch(() => 0);
      if (n) useApp.getState().toast(`${n} loghi importati dalla cartella "loghi/puliti" con le rispettive squadre.`, 'success');
      const ns = await importSponsorFolder().catch(() => 0);
      if (ns) useApp.getState().toast(`${ns} sponsor importati dalla cartella "sponsor/puliti".`, 'success');
    });
    Promise.all([start, ensureBuiltinFonts().then(() => setFontsReady(true))]).catch((e) => {
      console.error(e);
      setError(
        e?.name === 'InvalidStateError' || /indexeddb/i.test(String(e))
          ? 'Impossibile accedere al database locale (IndexedDB). Verifica che il browser non sia in modalità privata.'
          : `Errore di avvio: ${e?.message ?? e}`,
      );
    });
  }, [init]);

  if (error) return <div className="loading-screen">{error}</div>;
  if (!loaded)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {route.page === 'new' && <NewMatchPage key={location.hash} />}
        {route.page === 'archive' && <ArchivePage />}
        {route.page === 'standings' && <StandingsPage />}
        {route.page === 'sponsors' && <SponsorsPage />}
        {route.page === 'studio' && <ImageStudioPage />}
        {route.page === 'teams' && <TeamsPage />}
        {route.page === 'logos' && <LogosPage />}
        {route.page === 'templates' && <TemplatesPage />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'editor' && route.matchId && <EditorPage key={route.matchId} matchId={route.matchId} kind={route.kind ?? 'matchday'} />}
        {route.page === 'goalvideo' && route.matchId && <GoalVideoPage key={route.matchId} matchId={route.matchId} goalId={route.goalId ?? null} />}
      </main>
      <DialogHost />
      <Toasts />
    </div>
  );
}
