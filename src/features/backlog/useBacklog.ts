import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/core/api/call';
import { storage } from '@/core/storage';
import { useToast } from '@/core/ui/Toast';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useLoad } from '@/features/shared/useLoad';
import type { Stage } from '@/features/shared/types';
import { EMPTY_FILTERS, itemKey, type Board, type Filters, type Item, type ViewMode } from './model';

const PREFS_KEY = 'backlog_prefs_v1';

type Prefs = { view: ViewMode; filters: Filters; collapsed: string[] };

const DEFAULT_PREFS: Prefs = { view: 'list', filters: EMPTY_FILTERS, collapsed: ['done', 'none'] };

/** View choice, filters and collapsed sections survive a restart. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .get(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<Prefs>;
        setPrefs({
          view: p.view ?? DEFAULT_PREFS.view,
          filters: { ...EMPTY_FILTERS, ...(p.filters ?? {}) },
          collapsed: p.collapsed ?? DEFAULT_PREFS.collapsed,
        });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      storage.set(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { prefs, update, ready };
}

/** Board data, project names, and moving an item with an optimistic local stage. */
export function useBacklogData() {
  const toast = useToast();
  const { setStage } = useTaskActions();
  const { data, loading, error, reload } = useLoad(() => call<Board>('board.get_board', {}, true));
  const projects = useLoad(() =>
    call<{ name: string; project_name: string }[]>('board.get_projects', {}, true).catch(() => []),
  );
  const [overrides, setOverrides] = useState<Record<string, Stage>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // A fresh server answer replaces any local guess.
  const refresh = useCallback(async () => {
    await reload();
    setOverrides({});
  }, [reload]);

  // Undo lives in the toast (outside this screen), so catch up with the server once its window has passed.
  const syncLater = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      reload().then(() => setOverrides({})).catch(() => {});
    }, 6500);
  }, [reload]);

  const items = useMemo<Item[]>(() => {
    const all = data?.items ?? [];
    if (!Object.keys(overrides).length) return all;
    return all.map((i) => {
      const o = overrides[itemKey(i)];
      return o ? { ...i, stage: o, late: o === 'Done' ? false : i.late } : i;
    });
  }, [data, overrides]);

  const projectNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects.data ?? []) m[p.name] = p.project_name || p.name;
    return m;
  }, [projects.data]);

  const move = useCallback(
    async (item: Item, to: Stage): Promise<boolean> => {
      const key = itemKey(item);
      const from = item.stage;
      if (from === to) return true;
      setOverrides((o) => ({ ...o, [key]: to }));
      let ok = false;
      if (item.doctype === 'Task') {
        ok = await setStage(item.name, from, to);
      } else if (item.doctype === 'Issue') {
        try {
          await call('board.set_stage', { doctype: 'Issue', name: item.name, stage: to });
          ok = true;
          toast.showInfo(`Moved to ${to}`, {
            action: {
              label: 'Undo',
              onPress: () => {
                call('board.set_stage', { doctype: 'Issue', name: item.name, stage: from })
                  .catch(() => toast.showError('Could not undo'))
                  .finally(() => refresh());
              },
            },
          });
        } catch {
          toast.showError('Could not move the issue. Check your connection and try again.');
        }
      }
      if (!ok) setOverrides((o) => {
        const { [key]: _drop, ...rest } = o;
        return rest;
      });
      else syncLater();
      return ok;
    },
    [setStage, toast, refresh, syncLater],
  );

  return { data, items, loading, error, refresh, projectNames, move };
}
