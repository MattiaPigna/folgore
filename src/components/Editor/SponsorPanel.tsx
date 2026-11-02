import { useState } from 'react';
import { FabricImage } from 'fabric';
import { Award, Columns3, Handshake, LayoutGrid, PanelBottom, PanelTop } from 'lucide-react';
import { editor } from '../../editor/controller';
import { SPONSOR_STYLE_LABELS, buildSponsorBlock, describeRows, type SponsorBlock, type SponsorStyle } from '../../editor/sponsorLayouts';
import { getAssetUrl } from '../../services/assets';
import { activeSponsors } from '../../services/sponsorUtils';
import { useApp } from '../../store/appStore';
import { useRoute } from '../../store/routeStore';
import { LogoImg } from '../ui';

const BLOCKS: { id: SponsorBlock; label: string; hint: string; icon: typeof Award }[] = [
  { id: 'bar', label: 'Barra sponsor', hint: 'Fascia con tutti gli sponsor attivi', icon: Columns3 },
  { id: 'main', label: 'Main sponsor', hint: 'Badge con il logo principale', icon: Award },
  { id: 'powered', label: 'Powered by', hint: 'Firma discreta in un angolo', icon: Handshake },
  { id: 'grid', label: 'Griglia partner', hint: 'Grafica “I nostri partner”', icon: LayoutGrid },
];

export function SponsorPanel() {
  const settings = useApp((s) => s.settings);
  const toast = useApp((s) => s.toast);
  const go = useRoute((s) => s.go);
  const [style, setStyle] = useState<SponsorStyle>('cards');
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const [perRow, setPerRow] = useState<number | null>(null);
  const [mainRow, setMainRow] = useState(true);
  const list = activeSponsors(settings);

  const insert = async (block: SponsorBlock) => {
    if (!list.length) {
      toast('Nessuno sponsor attivo: aggiungili dalla pagina Sponsor.', 'info');
      return;
    }
    const objs = await buildSponsorBlock(block, { W: editor.width, H: editor.height, sponsors: list, style, position, perRow, mainRow });
    editor.addMany(objs, BLOCKS.find((b) => b.id === block)?.label ?? 'Sponsor');
    toast('Sponsor inseriti: sono selezionati insieme, trascinali per spostarli.', 'success');
  };

  const addSingle = async (assetId: string, name: string, index: number) => {
    const url = await getAssetUrl(assetId);
    if (!url) return;
    await editor.addImage(url, { name: `Sponsor · ${name}`, assetId, binding: `sp:${index}` });
    const img = editor.active;
    if (img instanceof FabricImage && style === 'white') editor.setLogoColor(img, 'white');
  };

  return (
    <div className="section">
      <div className="section-title">
        <Handshake size={12} /> Sponsor
      </div>
      {!list.length ? (
        <div className="faint small" style={{ lineHeight: 1.5 }}>
          Nessuno sponsor attivo.{' '}
          <a href="#/sponsors" onClick={(e) => (e.preventDefault(), go({ page: 'sponsors' }))} style={{ color: 'var(--accent)' }}>
            Gestisci sponsor
          </a>
        </div>
      ) : (
        <>
          <div className="field">
            <label>Stile loghi</label>
            <div className="btn-group">
              {(Object.keys(SPONSOR_STYLE_LABELS) as SponsorStyle[]).map((s) => (
                <button key={s} className={`btn sm ${style === s ? 'active' : ''}`} onClick={() => setStyle(s)} title={SPONSOR_STYLE_LABELS[s]}>
                  {s === 'cards' ? 'Card' : s === 'white' ? 'Bianco' : 'Striscia'}
                </button>
              ))}
            </div>
          </div>
          <div className="faint small" style={{ lineHeight: 1.45 }}>
            {style === 'cards'
              ? 'Card: loghi a colori su riquadri bianchi, funziona con tutti i loghi.'
              : style === 'white'
                ? 'Bianco: ideale per loghi fatti di scritte e contorni; i loghi pieni diventano una sagoma.'
                : 'Striscia: fascia chiara con loghi a colori, stile banner da stadio.'}
          </div>
          <div className="field">
            <label>Posizione</label>
            <div className="btn-group">
              <button className={`btn sm ${position === 'bottom' ? 'active' : ''}`} onClick={() => setPosition('bottom')}>
                <PanelBottom size={13} /> In basso
              </button>
              <button className={`btn sm ${position === 'top' ? 'active' : ''}`} onClick={() => setPosition('top')}>
                <PanelTop size={13} /> In alto
              </button>
            </div>
          </div>
          <div className="field">
            <label>Sponsor per riga (meno = loghi più grandi)</label>
            <div className="btn-group">
              {[null, 1, 2, 3, 4, 5, 6, 8].map((n) => (
                <button key={n ?? 'auto'} className={`btn sm ${perRow === n ? 'active' : ''}`} style={{ padding: '0 4px' }} onClick={() => setPerRow(n)}>
                  {n ?? 'Auto'}
                </button>
              ))}
            </div>
          </div>
          {list[0]?.tier === 'main' && (
            <label className="check small">
              <input type="checkbox" checked={mainRow} onChange={(e) => setMainRow(e.target.checked)} /> Main sponsor in una riga a parte (più grande)
            </label>
          )}
          <div className="faint small" style={{ lineHeight: 1.5 }}>
            Barra: {describeRows(list, perRow, mainRow, 'bar')}
            <br />
            Griglia: {describeRows(list, perRow, mainRow, 'grid')}
          </div>
          <div className="add-grid">
            {BLOCKS.map(({ id, label, hint, icon: Icon }) => (
              <button key={id} className="add-btn" title={hint} onClick={() => insert(id)}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="faint small">
            {list.length} sponsor attivi · i blocchi si aggiornano da soli se cambi gli sponsor. Per mettere un singolo logo clicca qui sotto.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {list.map((s, i) => (
              <button key={s.id} className="btn" style={{ height: 58, padding: 4, background: '#f4f4f5' }} title={`Aggiungi ${s.name}`} onClick={() => addSingle(s.assetId, s.name, i)}>
                <LogoImg assetId={s.assetId} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
