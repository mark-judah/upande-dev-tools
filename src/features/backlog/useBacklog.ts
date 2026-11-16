import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/core/api/call';
import { storage } from '@/core/storage';
import { useToast } from '@/core/ui/Toast';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useLoad } from '@/features/shared/useLoad';
import type { Stage } from '@/features/shared/types';
import { useAuthStore } from '@/core/auth/store';
import { useMyDay } from '@/features/my-day/my-day-store';
import { todayKey } from '@/core/date';
import { EMPTY_FILTERS, itemKey, type Board, type Filters, type GroupBy, type Item, type Scope, type ViewMode } from './model';

const PREFS_KEY = 'backlog_prefs_v1';

type Prefs = { view: ViewMode; filters: Filters; collapsed: string[]; scope: Scope; groupBy: GroupBy };

const DEFAULT_PREFS: Prefs = { view: 'list', filters: EMPTY_FILTERS, collapsed: ['done', 'none'], scope: 'mine', groupBy: 'due' };

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
          scope: p.scope ?? DEFAULT_PREFS.scope,
          groupBy: p.groupBy ?? DEFAULT_PREFS.groupBy,
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

export type BulkValues = { stage?: Stage; priority?: string; end?: string; assignMe?: boolean };
export type BulkProgress = { done: number; total: number; label: string } | null;

const CHUNK = 25;

/** Board data, project names, and moving an item with an optimistic local patch. */
export function useBacklogData() {
  const toast = useToast();
  const { setStage } = useTaskActions();
  const email = useAuthStore((st) => st.email);
  const fullName = useAuthStore((st) => st.fullName);
  const { data, loading, error, reload } = useLoad(() => call<Board>('board.get_board', {}, true));
  const projects = useLoad(() =>
    call<{ name: string; project_name: string }[]>('board.get_projects', {}, true).catch(() => []),
  );
  const [full, setFull] = useState<Board | null>(null);
  const [patches, setPatches] = useState<Record<string, Partial<Item>>>({});
  const [progress, setProgress] = useState<BulkProgress>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const board = full ?? data;

  // A fresh server answer replaces any local guess.
  const refresh = useCallback(async () => {
    await reload();
    setFull(null);
    setPatches({});
  }, [reload]);

  // Undo lives in the toast (outside this screen), so catch up with the server once its window has passed.
  const syncLater = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      reload().then(() => setPatches({})).catch(() => {});
    }, 6500);
  }, [reload]);

  const items = useMemo<Item[]>(() => {
    const all = board?.items ?? [];
    if (!Object.keys(patches).length) return all;
    const today = todayKey();
    return all.map((i) => {
      const p = patches[itemKey(i)];
      if (!p) return i;
      const next = { ...i, ...p };
      next.late = next.stage === 'Done' ? false : next.end ? next.end < today : false;
      return next;
    });
  }, [board, patches]);

  const projectNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects.data ?? []) m[p.name] = p.project_name || p.name;
    return m;
  }, [projects.data]);

  const patch = useCallback((keys: string[], p: Partial<Item>) => {
    setPatches((o) => {
      const n = { ...o };
      for (const k of keys) n[k] = { ...n[k], ...p };
      return n;
    });
  }, []);
  const unpatch = useCallback((keys: string[]) => {
    setPatches((o) => {
      const n = { ...o };
      for (const k of keys) delete n[k];
      return n;
    });
  }, []);

  const move = useCallback(
    async (item: Item, to: Stage): Promise<boolean> => {
      const key = itemKey(item);
      const from = item.stage;
      if (from === to) return true;
      patch([key], { stage: to });
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
      if (ok) syncLater();
      else unpatch([key]);
      return ok;
    },
    [setStage, toast, refresh, syncLater, patch, unpatch],
  );

  /** One server call per chunk of rows (board.bulk_update); rows are independent, failures are reported by name. */
  const send = useCallback(async (changes: { doctype: string; name: string; values: Record<string, unknown> }[], label: string) => {
    const saved: string[] = [];
    const failed: { name: string; error: string }[] = [];
    setProgress({ done: 0, total: changes.length, label });
    try {
      for (let at = 0; at < changes.length; at += CHUNK) {
        const part = changes.slice(at, at + CHUNK);
        try {
          const res = await call<{ saved: string[]; failed: { name: string; error: string }[] }>('board.bulk_update', { changes: part });
          saved.push(...res.saved);
          failed.push(...res.failed);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Request failed';
          failed.push(...part.map((c) => ({ name: c.name, error: msg })));
        }
        setProgress({ done: Math.min(at + CHUNK, changes.length), total: changes.length, label });
      }
    } finally {
      setProgress(null);
    }
    return { saved, failed };
  }, []);

  /** Applies one change to many rows: optimistic, one progress bar, one Undo. */
  const bulk = useCallback(
    async (targets: Item[], v: BulkValues, label: string) => {
      const rows = targets.filter((i) => i.doctype !== 'Request' && !(v.assignMe && i.doctype !== 'Task'));
      if (!rows.length) {
        toast.showError('Nothing selected can take that change.');
        return;
      }
      const values: Record<string, unknown> = {};
      const local: Partial<Item> = {};
      if (v.stage) { values.stage = v.stage; local.stage = v.stage; }
      if (v.priority) { values.priority = v.priority === 'None' ? '' : v.priority; local.priority = v.priority; }
      if (v.end) { values.end = v.end; local.end = v.end; }
      if (v.assignMe && email) {
        values.assign_to = [email];
        local.assignee_ids = [email];
        local.assignees = [(fullName || email).split(' ')[0]];
      }
      const keys = rows.map(itemKey);
      patch(keys, local);
      const { saved, failed } = await send(rows.map((i) => ({ doctype: i.doctype, name: i.name, values })), label);
      const savedRows = rows.filter((i) => saved.includes(i.name));
      const failedKeys = rows.filter((i) => !saved.includes(i.name)).map(itemKey);
      if (failedKeys.length) unpatch(failedKeys);
      useMyDay.getState().load();
      syncLater();
      if (failed.length) {
        toast.showError(`${saved.length} updated, ${failed.length} failed. ${failed[0].error}`.slice(0, 140));
      }
      if (!savedRows.length) return;
      const undoable = !v.assignMe;
      const msg = `${label}: ${savedRows.length} item${savedRows.length === 1 ? '' : 's'}`;
      const action = undoable
        ? {
            label: 'Undo',
            onPress: async () => {
              const restore = savedRows.map((i) => {
                const was: Record<string, unknown> = {};
                if (v.stage) was.stage = i.stage;
                if (v.priority) was.priority = i.priority ?? '';
                if (v.end) was.end = i.end ?? '';
                return { doctype: i.doctype, name: i.name, values: was };
              });
              unpatch(savedRows.map(itemKey));
              const res = await send(restore, 'Undo');
              if (res.failed.length) toast.showError('Some items could not be restored');
              useMyDay.getState().load();
              refresh();
            },
          }
        : undefined;
      toast.showInfo(msg, { action, durationMs: 7000 });
    },
    [email, fullName, patch, unpatch, send, syncLater, toast, refresh],
  );

  const truncated = !!board && board.total > board.items.length;
  const loadAll = useCallback(async () => {
    try {
      setFull(await call<Board>('board.get_board', { limit: 20000 }, true));
    } catch {
      toast.showError('Could not load the full backlog');
    }
  }, [toast]);

  return { data: board, items, loading, error, refresh, projectNames, move, bulk, progress, truncated, loadAll };
}
