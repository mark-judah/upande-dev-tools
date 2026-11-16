import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { relativeDue } from '@/core/date';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { loadPeople, type Person } from '@/features/detail/api';
import { AssigneeSheet, DueSheet, MenuSheet, type MenuItem } from '@/features/detail/sheets';
import { Pill } from '@/features/shared/Pill';
import {
  getPersonTasks,
  reassign,
  setDue,
  setTaskStatus,
  type ConsoleItem,
  type ConsoleTask,
  type TaskRec,
} from './pm-api';
import { emails } from './pm-api';
import { Empty } from './pm-ui';

/** What the quick actions need to know about a task. */
export type ActionTarget = { name: string; title: string; due: string | null; assignees: string[]; status: string };

export type RowModel = {
  key: string;
  kind: 'task' | 'request' | 'issue';
  name: string;
  title: string;
  sub: string;
  pill?: { label: string; tone: 'success' | 'warn' | 'danger' | 'info' | 'neutral' };
  target?: ActionTarget;
};

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';
export const priorityTone = (p?: string | null): Tone => (p === 'Urgent' || p === 'Critical' ? 'danger' : p === 'High' ? 'warn' : 'neutral');

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function fromConsole(i: ConsoleItem): RowModel {
  if (i.kind === 'task') {
    const d = i.due ? relativeDue(i.due) : null;
    return {
      key: i.name,
      kind: 'task',
      name: i.name,
      title: i.title,
      sub: [i.assignees.join(', ') || 'Nobody', i.project_label, i.due ? `due ${i.due}` : 'no due date'].filter(Boolean).join(' · '),
      pill: i.days_late > 0 ? { label: `${i.days_late}d late`, tone: 'danger' } : d && d.tone !== 'later' && d.tone !== 'none' ? { label: d.label, tone: 'warn' } : i.priority ? { label: i.priority, tone: priorityTone(i.priority) } : undefined,
      target: i.actions.length ? { name: i.name, title: i.title, due: i.due, assignees: i.assignee_ids, status: i.status } : undefined,
    };
  }
  if (i.kind === 'issue') {
    return { key: i.name, kind: 'issue', name: i.name, title: i.title, sub: `On hold · quiet ${plural(i.quiet_days, 'day')} · ${i.project_label}`, pill: { label: 'Issue', tone: 'neutral' } };
  }
  return {
    key: i.name,
    kind: 'request',
    name: i.name,
    title: i.title,
    sub: `${i.kind === 'approved' ? 'Approved, nobody scheduled it' : 'Waiting for a decision'} · ${i.requester} · ${plural(i.age_days, 'day')}`,
    pill: i.priority ? { label: i.priority, tone: priorityTone(i.priority) } : undefined,
  };
}

export function fromTask(t: TaskRec, names: Record<string, string>, today: string): RowModel {
  const who = emails(t._assign);
  const due = t.exp_end_date ? t.exp_end_date.slice(0, 10) : null;
  const late = due && due < today ? Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000) : 0;
  const d = due ? relativeDue(due) : null;
  const open = t.status !== 'Completed';
  return {
    key: t.name,
    kind: 'task',
    name: t.name,
    title: t.subject,
    sub: [who.map((e) => names[e] ?? e.split('@')[0]).join(', ') || 'Nobody', due ? `due ${due}` : 'no due date'].join(' · '),
    pill: !open ? { label: 'Done', tone: 'success' } : late > 0 ? { label: `${late}d late`, tone: 'danger' } : d && d.tone !== 'later' && d.tone !== 'none' ? { label: d.label, tone: 'warn' } : t.priority ? { label: t.priority, tone: priorityTone(t.priority) } : undefined,
    target: open ? { name: t.name, title: t.subject, due, assignees: who, status: t.status } : undefined,
  };
}

export function openRow(r: RowModel) {
  if (r.kind === 'task') router.push(`/task/${r.name}` as never);
  else if (r.kind === 'request') router.push(`/request/${r.name}` as never);
}

/**
 * The PM's quick actions on a task: new due date, reassign, mark done, move to pending.
 * Calls the same endpoints as the web console. Render `sheets` once, inside the screen (or inside
 * a BottomSheet, so a modal never has to open over another one).
 */
export function useRowActions(onChanged: () => void) {
  const toast = useToast();
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [menu, setMenu] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const fetchPeople = useCallback(async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      setPeople(await loadPeople());
    } catch (e) {
      setPeopleError(mapAxiosError(e).message);
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string, undo?: () => Promise<unknown>) => {
    try {
      await fn();
      toast.showSuccess(
        ok,
        undo
          ? {
              action: {
                label: 'Undo',
                onPress: async () => {
                  try {
                    await undo();
                  } catch (e) {
                    toast.showError(mapAxiosError(e).message);
                  }
                  onChanged();
                },
              },
            }
          : undefined,
      );
      onChanged();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    }
  };

  const t = target;
  const items: MenuItem[] = t
    ? [
        { label: 'Open task', icon: 'open-outline', onPress: () => router.push(`/task/${t.name}` as never) },
        { label: 'New due date', icon: 'calendar-outline', onPress: () => setDueOpen(true) },
        {
          label: 'Reassign',
          icon: 'person-add-outline',
          onPress: () => {
            setAssignOpen(true);
            if (!people.length) fetchPeople();
          },
        },
        {
          label: 'Move to pending review',
          icon: 'hourglass-outline',
          onPress: () => run(() => setTaskStatus(t.name, 'Pending Review'), 'Moved to pending review', () => setTaskStatus(t.name, t.status)),
        },
        {
          label: 'Mark done',
          icon: 'checkmark-done-outline',
          onPress: () => run(() => setTaskStatus(t.name, 'Completed'), 'Task closed', () => setTaskStatus(t.name, t.status)),
        },
      ]
    : [];

  const sheets: ReactNode = (
    <>
      <MenuSheet visible={menu} items={items} onClose={() => setMenu(false)} />
      <DueSheet
        visible={dueOpen}
        value={t?.due ?? ''}
        onClose={() => setDueOpen(false)}
        onPick={(date) => {
          setDueOpen(false);
          if (t) {
            const prev = t.due;
            run(() => setDue(t.name, date), date ? `Due ${date}` : 'Due date cleared', () => setDue(t.name, prev));
          }
        }}
      />
      <AssigneeSheet
        visible={assignOpen}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        initial={t?.assignees ?? []}
        onClose={() => setAssignOpen(false)}
        onRetry={fetchPeople}
        onSave={(list) => {
          setAssignOpen(false);
          if (t) {
            const prev = t.assignees;
            run(() => reassign(t.name, list), 'Reassigned', prev.length ? () => reassign(t.name, prev) : undefined);
          }
        }}
      />
    </>
  );

  return {
    openActions: (x: ActionTarget) => {
      setTarget(x);
      setMenu(true);
    },
    sheets,
  };
}

/** One work row: tap the text to open it, the dots to act on it (sibling buttons, never nested). */
export function WorkRow({ row, onActions, divider = true }: { row: RowModel; onActions?: (t: ActionTarget) => void; divider?: boolean }) {
  const canOpen = row.kind !== 'issue';
  return (
    <View style={[s.row, divider && s.divider]}>
      <Pressable
        onPress={canOpen ? () => openRow(row) : undefined}
        disabled={!canOpen}
        accessibilityRole={canOpen ? 'button' : undefined}
        accessibilityLabel={row.title}
        style={({ pressed }) => [s.main, pressed && { backgroundColor: COLORS.bgMuted }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>{row.title}</Text>
          <Text style={s.sub} numberOfLines={1}>{row.sub}</Text>
        </View>
        {row.pill ? <Pill label={row.pill.label} tone={row.pill.tone} /> : null}
      </Pressable>
      {row.target && onActions ? (
        <Pressable
          onPress={() => onActions(row.target as ActionTarget)}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${row.title}`}
          style={s.dots}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A plain list of rows with an optional "show all". */
export function RowList({ rows, onActions, limit = 6, empty }: { rows: RowModel[]; onActions?: (t: ActionTarget) => void; limit?: number; empty?: string }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <Empty title={empty ?? 'Nothing here'} />;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <View>
      {shown.map((r, i) => (
        <WorkRow key={r.key} row={r} onActions={onActions} divider={i < shown.length - 1} />
      ))}
      {rows.length > limit ? (
        <Button
          label={all ? 'Show fewer' : `Show all ${rows.length}`}
          variant="outline"
          size="sm"
          onPress={() => setAll(!all)}
          style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}

/** A drill-down: the list behind a tile or bar, in a sheet. Row actions open inside the sheet. */
export function DrillSheet({ title, subtitle, rows, onClose, onChanged }: {
  title: string | null;
  subtitle?: string;
  rows: RowModel[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { openActions, sheets } = useRowActions(onChanged);
  return (
    <BottomSheet visible={title !== null} onClose={onClose} title={title ?? ''} subtitle={subtitle}>
      <View>
        {rows.length === 0 ? <Empty title="Nothing here" body="This list is empty right now." /> : null}
        {rows.slice(0, 80).map((r, i, a) => (
          <WorkRow key={r.key} row={r} onActions={openActions} divider={i < a.length - 1} />
        ))}
        {rows.length > 80 ? <Text style={s.more}>Showing the first 80 of {rows.length}. Open the Work tab to filter further.</Text> : null}
      </View>
      {sheets}
    </BottomSheet>
  );
}

/** One person's open tasks (get_pm_person_tasks), with the same quick actions. */
export function PersonSheet({ person, project, onClose, onChanged }: {
  person: { user: string; name: string } | null;
  project?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [got, setGot] = useState<{ user: string; rows: ConsoleTask[] | null; error: string | null } | null>(null);
  const user = person?.user;
  // Results only count for the person they were fetched for, so switching person shows the skeleton.
  const rows = got && got.user === user ? got.rows : null;
  const error = got && got.user === user ? got.error : null;

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let live = true;
    getPersonTasks(user, project)
      .then((r) => live && setGot({ user, rows: r, error: null }))
      .catch((e) => live && setGot({ user, rows: null, error: mapAxiosError(e).message }));
    return () => {
      live = false;
    };
  }, [user, project, tick]);
  const load = () => setTick((n) => n + 1);

  const { openActions, sheets } = useRowActions(() => {
    load();
    onChanged();
  });

  return (
    <BottomSheet visible={!!person} onClose={onClose} title={person?.name ?? ''} subtitle={rows ? `${plural(rows.length, 'open task')}, soonest due first` : 'Loading open tasks'}>
      {error ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.more}>{error}</Text>
          <Button label="Try again" variant="outline" onPress={load} />
        </View>
      ) : !rows ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : rows.length === 0 ? (
        <Empty title="No open tasks" />
      ) : (
        rows.slice(0, 80).map((r, i, a) => <WorkRow key={r.name} row={fromConsole(r)} onActions={openActions} divider={i < a.length - 1} />)
      )}
      {sheets}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  dots: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  more: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, paddingVertical: spacing.sm },
});
