import { create } from 'zustand';

/** What the instance sheet shows. `resign` and `manage` are about one saved instance. */
export type PickerView = { kind: 'list' } | { kind: 'add' } | { kind: 'resign'; id: string } | { kind: 'manage'; id: string };

type State = {
  open: boolean;
  view: PickerView;
  openPicker: (view?: PickerView) => void;
  setView: (view: PickerView) => void;
  close: () => void;
};

/**
 * One instance sheet for the whole app (mounted once by `InstancePickerHost`), opened from the switcher bar on the IT
 * screens, from ItGate's empty states and from Settings.
 */
export const useInstancePicker = create<State>((set) => ({
  open: false,
  view: { kind: 'list' },
  openPicker: (view = { kind: 'list' }) => set({ open: true, view }),
  setView: (view) => set({ view }),
  close: () => set({ open: false }),
}));

export const openInstancePicker = (view?: PickerView) => useInstancePicker.getState().openPicker(view);
