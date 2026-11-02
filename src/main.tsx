import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/500.css';
import './services/fonts';
import './styles.css';
import { setupFabric } from './editor/fabricSetup';
import { App } from './App';

setupFabric();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
