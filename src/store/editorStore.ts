import { create } from 'zustand';

/** Bumped by the editor controller so React panels re-read canvas state. */
interface EditorUIState {
  version: number;
  bump: () => void;
}

export const useEditorUI = create<EditorUIState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
