import { Archive, Handshake, Images, WandSparkles, LayoutTemplate, ListOrdered, PlusCircle, Settings, Shield } from 'lucide-react';
import { BUILTIN_TEMPLATES } from '../../editor/layouts';
import { useApp } from '../../store/appStore';
import { useRoute, type Page } from '../../store/routeStore';

const NAV: { page: Page; label: string; icon: typeof Archive }[] = [
  { page: 'new', label: 'Nuova partita', icon: PlusCircle },
  { page: 'archive', label: 'Archivio partite', icon: Archive },
  { page: 'standings', label: 'Classifica', icon: ListOrdered },
  { page: 'teams', label: 'Libreria squadre', icon: Shield },
  { page: 'logos', label: 'Libreria loghi', icon: Images },
  { page: 'sponsors', label: 'Sponsor', icon: Handshake },
  { page: 'studio', label: 'Ritocco immagini', icon: WandSparkles },
  { page: 'templates', label: 'Template grafici', icon: LayoutTemplate },
  { page: 'settings', label: 'Impostazioni', icon: Settings },
];

export function Sidebar() {
  const { route, go } = useRoute();
  const archive = useApp((s) => s.matches.length);
  const teams = useApp((s) => s.teams.length);
  const logos = useApp((s) => s.assets.filter((a) => a.kind === 'logo' && !a.archived).length);
  const templates = useApp((s) => s.templates.length + BUILTIN_TEMPLATES.length);
  const sponsors = useApp((s) => (s.settings.sponsors ?? []).length);
  const counts = { archive, teams, logos, templates, sponsors };
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">MATCHDAY STUDIO</div>
          <div className="brand-sub">Grafiche per il calcio</div>
        </div>
      </div>
      {NAV.map(({ page, label, icon: Icon }) => {
        const active = route.page === page || (page === 'archive' && route.page === 'editor');
        const count = (counts as Record<string, number>)[page];
        return (
          <button key={page} className={`nav-item ${active ? 'active' : ''}`} onClick={() => go({ page })}>
            <Icon size={17} />
            {label}
            {count !== undefined && <span className="nav-badge">{count}</span>}
          </button>
        );
      })}
      <div className="sidebar-footer">
        Dati salvati localmente nel browser (IndexedDB).
        <br />
        Esegui un backup da Impostazioni.
      </div>
    </nav>
  );
}
