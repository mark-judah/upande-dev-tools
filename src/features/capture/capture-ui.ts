import { create } from 'zustand';

/** Whether the capture sheet is open. The tab bar's centre button opens it; CaptureHost renders it. */
export const useCaptureUi = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
