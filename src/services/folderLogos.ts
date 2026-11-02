import { uploadLogoFile } from '../components/TeamSelector/TeamSelector';
import { useApp } from '../store/appStore';

/**
 * Logos placed in the project folder `loghi/puliti/` (transparent PNG or SVG).
 * Vite bundles them, so dropping new files there and reloading the page imports them.
 */
const FOLDER_FILES = import.meta.glob('/loghi/puliti/*.{png,svg,PNG,SVG}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const FOLDER_LOGO_COUNT = Object.keys(FOLDER_FILES).length;

let running: Promise<number> | null = null;

/**
 * Imports folder logos into the library (and creates their teams).
 * Normally skips files imported before, so deleted logos don't come back;
 * `force` re-imports every file whose logo is missing from the library.
 */
export function importFolderLogos(force = false): Promise<number> {
  // Serialize runs (React StrictMode mounts twice; a button click may overlap startup).
  const prev = running ?? Promise.resolve(0);
  const next = prev.catch(() => 0).then(() => runImport(force));
  running = next.finally(() => {
    if (running === next) running = null;
  });
  return next;
}

async function runImport(force: boolean): Promise<number> {
  const app = useApp.getState();
  const done = new Set(app.settings.importedLogoFiles ?? []);
  let imported = 0;
  for (const [path, url] of Object.entries(FOLDER_FILES)) {
    const file = path.split('/').pop()!;
    const name = file.replace(/\.[^.]+$/, '');
    if (done.has(file) && !force) continue;
    const exists = useApp.getState().assets.some((a) => a.kind === 'logo' && a.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const blob = await (await fetch(url)).blob();
      const type = file.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      const id = await uploadLogoFile(new File([blob], file, { type }), name);
      if (id) {
        await useApp.getState().teamFromLogo(id);
        imported++;
      }
    }
    done.add(file);
  }
  await useApp.getState().setSettings({ importedLogoFiles: [...done] });
  return imported;
}
