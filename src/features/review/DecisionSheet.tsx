import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { mapAxiosError } from '@/core/api/client';
import { storage } from '@/core/storage';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { acceptRequest, reassignTask, scheduleRequest, triage } from './api';
import {
  ACCEPT_GREEN,
  DATE_CHIPS,
  DEFER_AMBER,
  DEFER_REASONS,
  REJECT_REASONS,
  REJECT_RED,
  dateIn,
  validDate,
  type Person,
  type QueueOptions,
  type QueueRow,
} from './model';

export type SheetMode = 'accept' | 'defer' | 'reject' | 'schedule' | 'reassign';

export type Outcome = { mode: SheetMode; done: QueueRow[] };

type Props = {
  mode: SheetMode | null;
  rows: QueueRow[];
  people: Person[];
  options: QueueOptions;
  myEmail: string | null;
  onClose: () => void;
  onDone: (o: Outcome) => void;
};

const LAST_PROJECT = 'triage_last_project';
const REVISIT = [
  { label: 'No date', days: null },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
  { label: 'In a month', days: 30 },
] as const;

const SWITCH: { mode: SheetMode; label: string }[] = [
  { mode: 'accept', label: 'Accept' },
  { mode: 'defer', label: 'Defer' },
  { mode: 'reject', label: 'Reject' },
];

const COPY: Record<SheetMode, { verb: string; busy: string; color: string }> = {
  accept: { verb: 'Accept and schedule', busy: 'Accepting', color: ACCEPT_GREEN },
  schedule: { verb: 'Schedule', busy: 'Scheduling', color: ACCEPT_GREEN },
  reassign: { verb: 'Reassign', busy: 'Reassigning', color: COLORS.primary },
  defer: { verb: 'Defer', busy: 'Deferring', color: DEFER_AMBER },
  reject: { verb: 'Reject', busy: 'Rejecting', color: REJECT_RED },
};

/** The step after a swipe: everything the decision needs, pre-filled, confirmed in one tap. */
export function DecisionSheet(props: Props) {
  // Mounted only while open, so every decision starts from fresh, pre-filled state.
  return props.mode ? <Sheet {...props} /> : null;
}

function Sheet({ mode: initial, rows, people, options, myEmail, onClose, onDone }: Props) {
  const [mode, setMode] = useState<SheetMode>(initial ?? 'accept');
  const [remaining, setRemaining] = useState<QueueRow[]>(rows);
  const first = remaining[0];
  const bulk = rows.length > 1;

  const one = rows.length === 1 ? rows[0] : null;
  const [project, setProject] = useState(one?.project ?? '');
  const [priority, setPriority] = useState(one?.priority || 'Medium');
  const [days, setDays] = useState<number | 'custom'>(one?.due ? 'custom' : 7);
  const [custom, setCustom] = useState(one?.due ?? '');
  const [assignees, setAssignees] = useState<string[]>(
    one ? (one.assignee_ids.length ? one.assignee_ids : one.requested_for ? [one.requested_for] : []) : [],
  );
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>(one?.tags ?? []);
  const [reasonChip, setReasonChip] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [revisit, setRevisit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remembered project, when the request does not already name one.
  useEffect(() => {
    if (one?.project) return;
    storage
      .get(LAST_PROJECT)
      .then((p) => {
        if (p && options.projects.some((x) => x.value === p)) setProject((cur) => cur || p);
        else if (options.projects.length === 1) setProject((cur) => cur || options.projects[0].value);
      })
      .catch(() => {});
  }, [one, options.projects]);

  const me = (myEmail ?? '').toLowerCase();
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q),
    );
    return list.sort((a, b) => {
      const am = a.name.toLowerCase() === me ? 0 : 1;
      const bm = b.name.toLowerCase() === me ? 0 : 1;
      return am - bm || (a.full_name || a.name).localeCompare(b.full_name || b.name);
    });
  }, [people, query, me]);

  const nameOf = (id: string) => people.find((p) => p.name === id)?.full_name || id;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const completeBy = days === 'custom' ? custom.trim() : dateIn(days);
  const needsPlan = mode === 'accept' || mode === 'schedule' || mode === 'reassign';
  const reasonText = (reasonChip && !reason.trim() ? reasonChip : [reasonChip, reason.trim()].filter(Boolean).join('. ')).trim();

  const missing: string | null = (() => {
    if (!first) return 'Nothing to do';
    if (mode === 'defer' || mode === 'reject') return reasonText ? null : 'Give a reason first';
    if ((mode === 'accept' || mode === 'schedule') && !project) return 'Pick a project';
    if (!validDate(completeBy)) return 'Pick a valid date (yyyy-mm-dd)';
    if (!assignees.length) return 'Pick at least one person';
    return null;
  })();

  const run = async () => {
    if (missing || busy) return;
    setBusy(true);
    setError(null);
    const done: QueueRow[] = [];
    const failed: { row: QueueRow; message: string }[] = [];
    for (const r of remaining) {
      try {
        if (mode === 'accept') {
          const changedTags = !bulk && JSON.stringify([...tags].sort()) !== JSON.stringify([...r.tags].sort());
          await acceptRequest({
            name: r.name,
            project,
            priority,
            complete_by: completeBy,
            assign_to: assignees,
            comment: note.trim(),
            tags: changedTags && tags.length ? tags : undefined,
          });
        } else if (mode === 'schedule') {
          await scheduleRequest({ name: r.name, project, priority, complete_by: completeBy, assign_to: assignees, comment: note.trim() });
        } else if (mode === 'reassign') {
          await reassignTask(r.task, assignees, completeBy, note.trim());
        } else {
          const when = mode === 'defer' && revisit != null ? ` Revisit on ${dateIn(revisit)}.` : '';
          await triage(r.name, mode === 'defer' ? 'Defer' : 'Reject', `${reasonText}.${when}`.replace(/\.\./g, '.'));
        }
        done.push(r);
      } catch (e) {
        failed.push({ row: r, message: mapAxiosError(e).message });
      }
    }
    setBusy(false);
    if (needsPlan && project && done.length) storage.set(LAST_PROJECT, project).catch(() => {});
    if (done.length) onDone({ mode, done });
    if (failed.length) {
      setRemaining(failed.map((f) => f.row));
      setError(
        bulk
          ? `${failed.length} of ${remaining.length} failed. ${failed[0].message}`
          : failed[0].message,
      );
    } else {
      onClose();
    }
  };

  const copy = COPY[mode];
  const title = bulk ? `${rows.length} requests` : (first?.title ?? '');
  const subtitle = bulk
    ? 'Same settings apply to every selected request'
    : first
      ? `${first.name} · ${first.raised_by_name}`
      : undefined;
  const canSwitch = (initial === 'accept' || initial === 'defer' || initial === 'reject') && rows.every((r) => r.actions.includes('accept') || r.actions.includes('reject'));
  const reasons = mode === 'reject' ? REJECT_REASONS : DEFER_REASONS;
  const shown = query.trim() ? sorted.slice(0, 6) : sorted.slice(0, 5);

  return (
    <BottomSheet visible onClose={onClose} title={title} subtitle={subtitle} busy={busy}>
      {canSwitch ? (
        <View style={s.wrap}>
          {SWITCH.map((o) => (
            <DecisionChip
              key={o.mode}
              label={o.label}
              selected={mode === o.mode}
              disabled={busy}
              onPress={() => {
                setMode(o.mode);
                setError(null);
                setReasonChip(null);
              }}
            />
          ))}
        </View>
      ) : null}

      {mode === 'accept' || mode === 'schedule' ? (
        <>
          <Label text="Project" required />
          <View style={s.wrap}>
            {options.projects.map((p) => (
              <DecisionChip key={p.value} label={p.label} selected={project === p.value} onPress={() => setProject(p.value)} />
            ))}
            {!options.projects.length ? <Text style={s.hint}>No projects available.</Text> : null}
          </View>
          <Label text="Priority" />
          <View style={s.wrap}>
            {options.decision_priorities.map((p) => (
              <DecisionChip key={p} label={p} selected={priority === p} onPress={() => setPriority(p)} />
            ))}
          </View>
        </>
      ) : null}

      {needsPlan ? (
        <>
          <Label text="Complete by" required />
          <View style={s.wrap}>
            {DATE_CHIPS.map((d) => (
              <DecisionChip key={d.label} label={d.label} selected={days === d.days} onPress={() => setDays(d.days)} />
            ))}
            <DecisionChip label="Pick a date" selected={days === 'custom'} onPress={() => setDays('custom')} />
          </View>
          {days === 'custom' ? (
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="yyyy-mm-dd"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Complete by date"
              style={[s.input, custom && !validDate(custom) ? s.inputBad : null]}
            />
          ) : (
            <Text style={s.hint}>{completeBy}</Text>
          )}

          <Label text={assignees.length ? `Assign to (${assignees.length})` : 'Assign to'} required />
          {assignees.length ? (
            <View style={s.wrap}>
              {assignees.map((a) => (
                <DecisionChip key={a} label={`${nameOf(a)}  ×`} selected onPress={() => setAssignees((l) => l.filter((x) => x !== a))} />
              ))}
            </View>
          ) : null}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search people"
            style={s.input}
          />
          {shown.map((p) => {
            const on = assignees.includes(p.name);
            const isMe = p.name.toLowerCase() === me;
            return (
              <Pressable
                key={p.name}
                onPress={() => setAssignees((l) => toggle(l, p.name))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={s.person}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? COLORS.text : COLORS.textMuted} />
                <Text style={s.personName} numberOfLines={1}>
                  {p.full_name || p.name}
                  {isMe ? ' (me)' : ''}
                </Text>
              </Pressable>
            );
          })}
          {!shown.length ? <Text style={s.hint}>Nobody matches.</Text> : null}
          {sorted.length > shown.length ? <Text style={s.hint}>Type to narrow down {sorted.length - shown.length} more.</Text> : null}
        </>
      ) : null}

      {mode === 'accept' && !bulk && options.tags.length ? (
        <>
          <Label text="Tags" />
          <View style={s.wrap}>
            {options.tags.map((t) => (
              <DecisionChip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags((l) => toggle(l, t))} />
            ))}
          </View>
        </>
      ) : null}
      {mode === 'accept' && !bulk && first?.product_area ? (
        <Text style={s.hint}>Product area: {first.product_area}</Text>
      ) : null}

      {mode === 'defer' || mode === 'reject' ? (
        <>
          <Label text={mode === 'defer' ? 'Why defer?' : 'Why reject?'} required />
          <View style={s.wrap}>
            {reasons.map((r) => (
              <DecisionChip key={r} label={r} selected={reasonChip === r} onPress={() => setReasonChip(reasonChip === r ? null : r)} />
            ))}
          </View>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Add detail for the person who raised it"
            placeholderTextColor={COLORS.textMuted}
            multiline
            accessibilityLabel="Reason"
            style={[s.input, s.multi]}
          />
        </>
      ) : null}

      {mode === 'defer' ? (
        <>
          <Label text="Revisit" />
          <View style={s.wrap}>
            {REVISIT.map((r) => (
              <DecisionChip key={r.label} label={r.label} selected={revisit === r.days} onPress={() => setRevisit(r.days)} />
            ))}
          </View>
          <Text style={s.hint}>Saved in the reason; the request moves to Deferred and can be reopened.</Text>
        </>
      ) : null}

      {needsPlan ? (
        <>
          <Label text="Note for the assignee" />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor={COLORS.textMuted}
            multiline
            accessibilityLabel="Note"
            style={[s.input, s.multi]}
          />
        </>
      ) : null}

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
      {missing && !busy ? <Text style={s.hint}>{missing}</Text> : null}
      <Button
        label={busy ? `${copy.busy}…` : bulk ? `${copy.verb} ${remaining.length}` : copy.verb}
        color={copy.color}
        loading={busy}
        disabled={!!missing || busy}
        onPress={run}
      />
    </BottomSheet>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={s.label}>
      {text}
      {required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
    </Text>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.xs },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  inputBad: { borderColor: COLORS.danger },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  personName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  error: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: borderRadius.sm, padding: spacing.md },
  errorText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#991B1B' },
});
