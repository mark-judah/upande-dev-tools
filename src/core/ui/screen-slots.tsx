import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Extra header content a part of the app can hand to every `Screen` below it, without each screen opting in:
 * - `tabTrailing`: shown at the right of a tab screen's header (the root puts the notification bell here);
 * - `top`: a slim bar just under the header (the IT screens put the instance switcher here).
 * Providers nest: an inner provider overrides only the slots it sets.
 */
export type ScreenSlots = { tabTrailing?: ReactNode; top?: ReactNode };

const Ctx = createContext<ScreenSlots>({});

export function ScreenSlotsProvider({ tabTrailing, top, children }: ScreenSlots & { children: ReactNode }) {
  const parent = useContext(Ctx);
  const value = useMemo<ScreenSlots>(
    () => ({ tabTrailing: tabTrailing !== undefined ? tabTrailing : parent.tabTrailing, top: top !== undefined ? top : parent.top }),
    [parent, tabTrailing, top],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScreenSlots(): ScreenSlots {
  return useContext(Ctx);
}
