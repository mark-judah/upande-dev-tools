import { create } from 'zustand';

/** Whether the sidebar is open. Screens open it from their header; the root layout renders it. */
export const useDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
