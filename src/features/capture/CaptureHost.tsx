import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { addDays, format } from 'date-fns';
import { useCaptureUi } from './capture-ui';
import { useCaptureQueue } from './capture-queue';
import {
  loadDraft,
  loadPrefs,
  saveDraft,
  savePrefs,
  similar,
  useCaptureOptions,
  type Due,
  type Mode,
} from './capture-data';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Segmented } from '@/core/ui/Segmented';
import { useToast } from '@/core/ui/Toast';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/store';
import { useNetworkStore } from '@/core/network/store';
import { useMyDay } from '@/features/my-day/my-day-store';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

const MODES = [
  { value: 'task', label: 'Task' },
  { value: 'request', label: 'Request' },
] as const;

const DUES: { value: Due; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next week' },
  { value: 'none', label: 'None' },
];

function dueDate(d: Due): string | undefined {
  const now = new Date();
  if (d === 'today') return format(now, 'yyyy-MM-dd');
  if (d === 'tomorrow') return format(addDays(now, 1), 'yyyy-MM-dd');
  if (d === 'week') return format(addDays(now, 7), 'yyyy-MM-dd');
  return undefined;
}

type Notice = { tone: 'ok' | 'info' | 'error'; text: string; undo?: () => Promise<void> };
type View_ = 'main' | 'project' | 'tag';

/** The capture sheet, mounted once at the root so adding a task or request is one tap from every screen. */
export function CaptureHost() {
  const hasSession = useAuthStore((s) => s.hasSession);
  const locked = useAuthStore((s) => s.biometricLocked);
  const email = useAuthStore((s) => s.email) ?? '';
  const roles = useAuthStore((s) => s.roles);
  const online = useNetworkStore((s) => s.online);
  const submit = useCaptureQueue((s) => s.submit);
  const flush = useCaptureQueue((s) => s.flush);
  const hydrate = useCaptureQueue((s) => s.hydrate);
  const toast = useToast();

  const open = useCaptureUi((s) => s.open);
  const setOpen = useCaptureUi((s) => s.setOpen);
  const opts = useCaptureOptions(open && hasSession && !locked);
  const myDay = useMyDay((s) => s.data);

  const [mode, setMode] = useState<Mode>('task');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState<Due>('today');
  const [projectPick, setProject] = useState<string | undefined>();
  const [tagPick, setTag] = useState<string | undefined>();
  const [rtype, setRtype] = useState<string | undefined>();
  const [priority, setPriority] = useState<string | undefined>();
  const [more, setMore] = useState(false);
  const [view, setView] = useState<View_>('main');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [added, setAdded] = useState(0);
  const [ready, setReady] = useState(false);
  const input = useRef<TextInputInstance>(null);

  // Only Dev Team + (Projects Manager or System Manager) get a real Task; the server files everyone else's as a Chore request.
  const direct = roles.includes('System Manager') || (roles.includes('Dev Team') && roles.includes('Projects Manager'));
  const asTask = mode === 'task';
  const types = opts.requestTypes;
  const type = rtype && types.includes(rtype) ? rtype : types[0];

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Retry waiting captures on sign-in, on coming back online and on returning to the app.
  useEffect(() => {
    if (!hasSession || locked) return;
    const run = () => {
      flush().then((n) => n > 0 && toast.showSuccess(n === 1 ? 'Capture synced' : `${n} captures synced`));
    };
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, locked, online]);

  // On open: restore remembered choices and any unsent draft, then put the cursor in the title.
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([loadPrefs(email), loadDraft(email)]).then(([p, d]) => {
      if (!live) return;
      if (p) {
        setMode(p.mode);
        setDue(p.due);
        setProject(p.project);
        setTag(p.tag);
        setRtype(p.requestType);
      }
      if (d) {
        setMode(d.mode);
        setTitle(d.title);
        setDetails(d.description);
        setMore(!!d.description);
      }
      setReady(true);
    });
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => {
      live = false;
      clearTimeout(t);
      setReady(false);
      setView('main');
      setNotice(null);
      setAdded(0);
    };
  }, [open, email]);

  // Remember choices and keep the draft while typing.
  useEffect(() => {
    if (!open || !ready) return;
    savePrefs(email, { mode, due, project: projectPick, tag: tagPick, requestType: rtype });
  }, [open, ready, email, mode, due, projectPick, tagPick, rtype]);
  useEffect(() => {
    if (!open || !ready) return;
    const t = setTimeout(
      () => saveDraft(email, title.trim() || details.trim() ? { mode, title, description: details } : null),
      300,
    );
    return () => clearTimeout(t);
  }, [open, ready, email, mode, title, details]);

  // Defaults that spare a pick: a lone project or tag is chosen for you; a stale remembered one is ignored.
  const project =
    projectPick && (!opts.projects.length || opts.projects.some((p) => p.name === projectPick))
      ? projectPick
      : opts.projects.length === 1
        ? opts.projects[0].name
        : undefined;
  const tag =
    tagPick && (!opts.tags.length || opts.tags.includes(tagPick))
      ? tagPick
      : opts.tags.length === 1
        ? opts.tags[0]
        : undefined;

  const projectLabel = opts.projects.find((p) => p.name === project)?.project_name ?? project;

  const duplicate = useMemo(() => {
    const t = title.trim();
    if (t.length < 8 || !myDay) return null;
    const known = [...myDay.tasks.map((x) => x.subject), ...myDay.requests.map((x) => x.title)];
    return known.find((k) => similar(t, k)) ?? null;
  }, [title, myDay]);

  const close = () => setOpen(false);

  const undoer = useCallback(
    (kind: 'task' | 'request', name: string) => async () => {
      try {
        if (kind === 'task') await call('board.delete_task', { name });
        else await call('requests.withdraw_request', { name });
        setNotice({ tone: 'info', text: 'Undone' });
      } catch (e) {
        setNotice({ tone: 'error', text: mapAxiosError(e).message });
      }
    },
    [],
  );

  const onSubmit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    if (!tag) {
      setNotice({ tone: 'error', text: 'Pick a tag first' });
      setView('tag');
      return;
    }
    if (asTask && direct && !project) {
      setNotice({ tone: 'error', text: 'Pick a project first' });
      setView('project');
      return;
    }
    setBusy(true);
    setNotice(null);
    const base = { title: t, tags: [tag], description: details.trim() || undefined };
    const result = await submit(
      asTask
        ? {
            ...base,
            kind: 'task',
            project: direct ? project : undefined,
            complete_by: direct ? dueDate(due) : undefined,
            assign_to: email || undefined,
          }
        : {
            ...base,
            kind: 'request',
            request_type: type,
            priority: opts.canTriage ? priority : undefined,
            project: opts.projects.length ? project : undefined,
          },
    );
    setBusy(false);
    if (result.status === 'rejected') {
      setNotice({ tone: 'error', text: result.message });
      return;
    }
    if (result.status === 'queued') {
      setNotice({ tone: 'info', text: 'Saved on this phone, will send when online' });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice({
        tone: 'ok',
        text: result.filedAsRequest ? `Sent for review: ${t}` : `Added: ${t}`,
        undo: result.name ? undoer(result.kind, result.name) : undefined,
      });
    }
    setAdded((n) => n + 1);
    setTitle('');
    setDetails('');
    setMore(false);
    saveDraft(email, null);
    setTimeout(() => input.current?.focus(), 50);
  };

  if (!hasSession || locked) return null;

  if (view !== 'main') {
    const isProject = view === 'project';
    return (
      <BottomSheet visible={open} onClose={() => setView('main')} title={isProject ? 'Project' : 'Tag'}>
        <PickList
          items={
            isProject
              ? opts.projects.map((p) => ({ value: p.name, label: p.project_name || p.name }))
              : opts.tags.map((x) => ({ value: x, label: x }))
          }
          selected={isProject ? project : tag}
          onPick={(v) => {
            if (isProject) setProject(v);
            else setTag(v);
            setNotice(null);
            setView('main');
          }}
          onBack={() => setView('main')}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={open} onClose={close} title="Quick add" busy={busy}>
      <Segmented
        value={mode}
        options={MODES}
        onChange={(m) => {
          setMode(m);
          setNotice(null);
        }}
      />

      <TextInput
        ref={input}
        value={title}
        onChangeText={setTitle}
        placeholder={asTask ? 'What needs doing?' : 'What do you need?'}
        placeholderTextColor={COLORS.textMuted}
        style={s.title}
        autoFocus
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={onSubmit}
        accessibilityLabel="Title"
      />

      {duplicate ? (
        <Text style={s.hint} numberOfLines={1}>
          Similar already exists: {duplicate}
        </Text>
      ) : null}

      {asTask && !direct ? (
        <Text style={s.hint}>Goes to review first as a request, so it is not a task yet.</Text>
      ) : null}

      {asTask && direct ? (
        <View style={s.chips}>
          {DUES.map((d) => (
            <DecisionChip key={d.value} label={d.label} selected={due === d.value} onPress={() => setDue(d.value)} />
          ))}
        </View>
      ) : null}

      {!asTask ? (
        <View style={s.chips}>
          {types.map((t) => (
            <DecisionChip key={t} label={t} selected={type === t} onPress={() => setRtype(t)} />
          ))}
        </View>
      ) : null}

      <View style={s.pickers}>
        {asTask && direct ? (
          <Picker grow={3} icon="folder-outline" label={projectLabel ?? 'Project'} set={!!project} onPress={() => setView('project')} />
        ) : null}
        <Picker icon="pricetag-outline" label={tag ?? 'Tag'} set={!!tag} onPress={() => setView('tag')} />
      </View>

      <Pressable onPress={() => setMore((m) => !m)} style={s.moreRow} accessibilityRole="button">
        <Text style={s.moreText}>More options</Text>
        <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSecondary} />
      </Pressable>
      {more ? (
        <View style={s.moreBody}>
          {!asTask && opts.canTriage && opts.priorities.length ? (
            <View style={s.chips}>
              {opts.priorities.map((p) => (
                <DecisionChip
                  key={p}
                  label={p}
                  selected={priority === p}
                  onPress={() => setPriority(priority === p ? undefined : p)}
                />
              ))}
            </View>
          ) : null}
          {!asTask && opts.projects.length ? (
            <View style={s.pickers}>
              <Picker icon="folder-outline" label={projectLabel ?? 'Project'} set={!!project} onPress={() => setView('project')} />
            </View>
          ) : null}
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Details (optional)"
            placeholderTextColor={COLORS.textMuted}
            style={[s.title, s.details]}
            multiline
            accessibilityLabel="Details"
          />
        </View>
      ) : null}

      {notice ? (
        <View style={[s.notice, notice.tone === 'error' && s.noticeError]}>
          <Ionicons
            name={notice.tone === 'error' ? 'alert-circle' : notice.tone === 'ok' ? 'checkmark-circle' : 'information-circle'}
            size={18}
            color={notice.tone === 'error' ? COLORS.danger : notice.tone === 'ok' ? COLORS.success : COLORS.text}
          />
          <Text style={s.noticeText} numberOfLines={2}>
            {notice.text}
          </Text>
          {notice.undo ? (
            <Pressable
              onPress={notice.undo}
              hitSlop={8}
              style={s.undo}
              accessibilityRole="button"
              accessibilityLabel="Undo"
            >
              <Text style={s.undoText}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Button
        label={asTask ? (direct ? 'Add task' : 'Send for review') : 'Add request'}
        onPress={onSubmit}
        loading={busy}
        disabled={!title.trim()}
        style={s.primary}
      />
      {added > 0 ? <Button label={`Done (${added} added)`} variant="ghost" onPress={close} /> : null}
    </BottomSheet>
  );
}

function Picker({
  grow = 1,
  icon,
  label,
  set,
  onPress,
}: {
  grow?: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  set: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.picker, { flexGrow: grow }, !set && s.pickerEmpty]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={set ? COLORS.text : COLORS.textMuted} />
      <Text style={[s.pickerText, !set && s.pickerTextEmpty]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
}

function PickList({
  items,
  selected,
  onPick,
  onBack,
}: {
  items: { value: string; label: string }[];
  selected?: string;
  onPick: (v: string) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState('');
  const shown = q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : items;
  return (
    <View style={s.list}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        <Text style={s.backText}>Back</Text>
      </Pressable>
      {items.length > 8 ? (
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search"
          placeholderTextColor={COLORS.textMuted}
          style={s.title}
          autoFocus
          accessibilityLabel="Search"
        />
      ) : null}
      {shown.length === 0 ? <Text style={s.hint}>Nothing to pick from.</Text> : null}
      <ScrollView style={s.listScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {shown.map((i) => (
          <Pressable key={i.value} onPress={() => onPick(i.value)} style={s.listRow} accessibilityRole="button">
            <Text style={[s.listText, i.value === selected && s.listTextOn]} numberOfLines={1}>
              {i.label}
            </Text>
            {i.value === selected ? <Ionicons name="checkmark" size={18} color={COLORS.text} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  title: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.lg,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  details: { fontFamily: fontFamily.regular, fontSize: fontSize.md, minHeight: 80, textAlignVertical: 'top' },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'flex-start' },
  pickers: { flexDirection: 'row', gap: spacing.sm },
  picker: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  pickerEmpty: { borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt },
  pickerText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  pickerTextEmpty: { fontFamily: fontFamily.medium, color: COLORS.textMuted },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  moreText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  moreBody: { gap: spacing.md },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: COLORS.surfaceAlt,
  },
  noticeError: { backgroundColor: '#FEF2F2' },
  noticeText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  undo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  undoText: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text, textDecorationLine: 'underline' },
  primary: { alignSelf: 'stretch', minHeight: 52 },
  list: { gap: spacing.sm },
  listScroll: { maxHeight: 320 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  listRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  listText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  listTextOn: { fontFamily: fontFamily.semiBold },
});
