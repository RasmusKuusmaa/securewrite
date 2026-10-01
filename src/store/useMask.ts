import { create } from "zustand";

// One mask for the whole unlocked app (editor and journal alike), so the
// toggle shortcut, mask-on-open and auto-mask-on-blur all act on everything
// on screen at once - not just whichever view happened to be mounted.
interface MaskState {
  masked: boolean;
  setMasked: (masked: boolean) => void;
  toggle: () => void;
}

export const useMask = create<MaskState>((set) => ({
  masked: true,
  setMasked: (masked) => set({ masked }),
  toggle: () => set((s) => ({ masked: !s.masked })),
}));
