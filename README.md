# Matchday Studio

Editor web per grafiche calcistiche (MATCHDAY, HALF TIME, FULL TIME, POST MATCH). Funziona interamente in locale: tutti i dati restano nel browser (IndexedDB).

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build di produzione in dist/
npm test         # test del calcolo risultati
```

## Funzioni principali

- **Partite**: dati condivisi tra le quattro grafiche (squadre, loghi, data, orario, stadio, località, giornata, competizione).
- **Marcatori**: gol normali, rigori e autogol, minuti con recupero (`45+2`). I risultati di primo tempo e finale si calcolano in automatico. Il minuto di fine primo tempo è configurabile e i calci di rigore sono separati dal risultato.
- **Editor canvas (Fabric.js)**:
  - trascinamento, ridimensionamento e rotazione;
  - coordinate X/Y numeriche e allineamenti;
  - guide con snap, zoom;
  - livelli: blocca, nascondi, riordina con drag, rinomina;
  - annulla/ripristina, copia/incolla e duplica.
- **Elementi collegati**: testi e loghi collegati ai dati si aggiornano da soli senza perdere posizione e stile. Si possono scollegare dal pannello Proprietà.
- **Sfondi** indipendenti per ogni grafica: zoom, spostamento, ritaglio, luminosità, contrasto, opacità e blocco.
- **Template**: quattro layout predefiniti ispirati alla locandina di riferimento, più template personalizzati. Si salvano dall'editor e si possono impostare come predefiniti per le nuove partite.
- **Esportazione**:
  - PNG/JPG alle dimensioni esatte (1080×1350, 1080×1920, 1080×1080 o personalizzate);
  - ZIP con tutte le grafiche della partita.
- **Backup**: esportazione e importazione completa (JSON con immagini e font incorporati).
- **Font personalizzati** TTF/OTF/WOFF2, salvati localmente.

## Scorciatoie

| Tasti | Azione |
| --- | --- |
| Ctrl+Z / Ctrl+Y | Annulla / Ripristina |
| Ctrl+C / Ctrl+V / Ctrl+D | Copia / Incolla / Duplica |
| Canc | Elimina |
| Frecce (Shift ×10) | Sposta |
| Ctrl+S | Salva |
| Ctrl+ + / Ctrl+ - / Ctrl+0 | Zoom / Adatta |

## Struttura

```
src/
  components/   Sidebar, Editor (Proprietà, Livelli, Elementi, Sfondo), GoalManager, TeamSelector, MatchForm, ui
  pages/        NewMatch, Archive, Editor, Teams, Logos, Templates, Settings
  editor/       controller (canvas, cronologia, snap, livelli), layouts (template), applyBindings, render, serialization
  services/     database (IndexedDB), assets, score, bindings, export (PNG/JPG/ZIP), backup, fonts, imageProcessing
  store/        appStore, editorStore, routeStore (Zustand)
  types/
```
