import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from '@/core/auth/store';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { relativeDue } from '@/core/date';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill, priorityTone } from '@/features/shared/Pill';
import { TASK_STAGE, type Stage } from '@/features/shared/types';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { loadPeople, loadTask, useDetail, type Link, type Person } from './api';
import { Collapsible, HtmlView, htmlToText } from './html';
import { ago, fullDate, shorten } from './format';
import { Avatar, ChipRow, Field, STEPS, Stepper, Value, ValueChip } from './parts';
import { AssigneeSheet, DueSheet, MenuSheet, type MenuItem } from './sheets';
import { DetailLayout, MenuButton } from './DetailLayout';

const BOARD_ROLES = ['Dev Team', 'Projects Manager', 'System Manager', 'Administrator'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUS_FOR: Record<string, string> = { Todo: 'Open', 'In Progress': 'Working', 'In Review': 'Pending Review', Done: 'Completed' };

const openRequest = (name: string) => router.push(`/request/${name}` as never);
const openTask = (name: string) => router.push(`/task/${name}` as never);

function LinkRows({ items, onOpen }: { items: Link[]; onOpen: (name: string) => void }) {
  return (
    <>
      {items.map((l, i) => (
        <Row
          key={l.name}
          title={l.label}
          subtitle={l.name}
          right={l.status ? <Pill label={l.status} /> : undefined}
          onPress={() => onOpen(l.name)}
          divider={i < items.length - 1}
          accessibilityLabel={`${l.label}, ${l.status ?? ''}`}
        />
      ))}
    </>
  );
}

export function TaskDetail({ name }: { name: string }) {
  const { data: t, loading, error, reload, patch } = useDetail(() => loadTask(name));
  const toast = useToast();
  const { setStage } = useTaskActions();
  const roles = useAuthStore((s) => s.roles);
  const canEdit = roles.some((r) => BOARD_ROLES.includes(r));
  const canReassign = canEdit;
  const [dueOpen, setDueOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [people, setPeople] = useState<{ list: Person[]; loading: boolean; error: string | null }>({ list: [], loading: false, error: null });

  const stage: Stage = (t && TASK_STAGE[t.status]) || 'Todo';
  const stepIndex = Math.max(0, STEPS.indexOf(stage as (typeof STEPS)[number]));
  const closed = stage === 'Done';
  const due = relativeDue(t?.due);
  const dueLabel = due.tone === 'none' ? 'Set due date' : closed ? `Due ${format(parseISO(t!.due), 'd MMM')}` : due.tone === 'late' ? due.label : `Due ${due.label}`;

  const moveTo = async (i: number) => {
    if (!t) return;
    const to = STEPS[i];
    const before = t.status;
    patch({ status: STATUS_FOR[to] });
    const ok = await setStage(name, stage, to);
    if (!ok) patch({ status: before });
    else reload();
  };

  const write = async (field: 'priority' | 'end', value: string | null, apply: () => void, undo: () => void) => {
    apply();
    try {
      await call('board.set_field', { doctype: 'Task', name, field, value });
    } catch (e) {
      undo();
      toast.showError(mapAxiosError(e).message);
    }
  };

  const setPriority = (p: string) => {
    if (!t || p === t.priority) return;
    const old = t.priority;
    write('priority', p, () => patch({ priority: p }), () => patch({ priority: old }));
  };

  const setDue = (date: string | null) => {
    if (!t) return;
    setDueOpen(false);
    const old = t.due;
    write('end', date, () => patch({ due: date ?? '' }), () => patch({ due: old }));
  };

  const openAssign = () => {
    setAssignOpen(true);
    if (people.list.length || people.loading) return;
    setPeople({ list: [], loading: true, error: null });
    loadPeople()
      .then((list) => setPeople({ list, loading: false, error: null }))
      .catch((e) => setPeople({ list: [], loading: false, error: mapAxiosError(e).message }));
  };

  const reassign = async (emails: string[]) => {
    if (!t) return;
    setAssignOpen(false);
    const old = { assignees: t.assignees, assigneeNames: t.assigneeNames };
    const names = { ...t.assigneeNames };
    for (const p of people.list) names[p.name] = p.full_name || p.name;
    patch({ assignees: emails, assigneeNames: names });
    try {
      await call('requests.reassign_task', { name, assign_to: emails });
      toast.showSuccess('Reassigned');
    } catch (e) {
      patch(old);
      toast.showError(mapAxiosError(e).message);
    }
  };

  const menu: MenuItem[] = [
    { label: 'Share', icon: 'share-outline', onPress: () => { Share.share({ message: `${t?.subject ?? name} (${name})` }).catch(() => {}); } },
    ...(t?.request ? [{ label: 'Open linked request', icon: 'git-branch-outline' as const, onPress: () => openRequest(t.request!.name) }] : []),
  ];

  const descText = t ? htmlToText(t.description) : '';
  const effort = t && (t.expectedHours > 0 || t.progress > 0);

  return (
    <DetailLayout
      doctype="Task"
      name={name}
      title={t ? shorten(t.subject) : name}
      headerRight={t ? <MenuButton onPress={() => setMenuOpen(true)} /> : undefined}
      hasData={!!t}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={reload}
    >
      {t ? (
        <>
          <Card>
            <Text style={s.caption} selectable>{t.name}</Text>
            <Text style={s.title} selectable>{t.subject}</Text>
            <ChipRow>
              <Pill label={t.status || 'Open'} tone={t.status === 'Overdue' ? 'danger' : closed ? 'success' : 'info'} />
              {t.module ? <Pill label={t.module} /> : null}
            </ChipRow>
            <Stepper current={stepIndex} onSelect={moveTo} disabled={!canEdit} />
          </Card>

          <Card title="Schedule">
            <Field label="Due">
              <ValueChip
                icon="calendar-outline"
                label={dueLabel}
                tone={closed ? 'normal' : due.tone === 'late' ? 'late' : due.tone === 'today' ? 'today' : 'normal'}
                onPress={canEdit ? () => setDueOpen(true) : undefined}
                accessibilityLabel={`Due date: ${dueLabel}. Change`}
              />
              {t.due ? <Text style={s.sub}>{format(parseISO(t.due), 'EEE d MMM yyyy')}</Text> : null}
            </Field>
            <Field label="Priority">
              {canEdit ? (
                <ChipRow>
                  {(PRIORITIES.includes(t.priority) || !t.priority ? PRIORITIES : [t.priority, ...PRIORITIES]).map((p) => (
                    <DecisionChip key={p} label={p} selected={p === t.priority} onPress={() => setPriority(p)} />
                  ))}
                </ChipRow>
              ) : t.priority ? <Pill label={t.priority} tone={priorityTone(t.priority)} /> : <Value>None</Value>}
            </Field>
            {t.start ? <Field inline label="Starts"><Value>{format(parseISO(t.start), 'EEE d MMM yyyy')}</Value></Field> : null}
            {effort ? (
              <Field label="Effort">
                <View style={s.effort}>
                  {t.expectedHours > 0 ? <Value>{`${t.expectedHours}h expected`}</Value> : null}
                  <ProgressBar value={t.progress / 100} scale={1} height={8} />
                  <Text style={s.sub}>{`${Math.round(t.progress)}% complete`}</Text>
                </View>
              </Field>
            ) : null}
          </Card>

          <Card title="Assigned to">
            {t.assignees.length === 0 ? <Text style={s.sub}>Nobody is assigned yet.</Text> : null}
            {t.assignees.map((email) => {
              const who = t.assigneeNames[email] || email;
              return (
                <View key={email} style={s.person}>
                  <Avatar name={who} size={36} />
                  <Text style={s.personName} numberOfLines={1}>{who}</Text>
                </View>
              );
            })}
            {canReassign ? (
              <Button
                label={t.assignees.length ? 'Reassign' : 'Assign'}
                variant="outline"
                iconLeft="person-add-outline"
                onPress={openAssign}
                singleLine
                style={s.inlineBtn}
              />
            ) : null}
          </Card>

          <Card title="Context">
            {t.projectName ? <Field inline label="Project"><Value>{t.projectName}</Value></Field> : null}
            {t.tags.length ? <Field inline label="Tags"><ChipRow>{t.tags.map((x) => <Pill key={x} label={x} />)}</ChipRow></Field> : null}
            {!t.projectName && !t.tags.length ? <Text style={s.sub}>No project or tags.</Text> : null}
          </Card>

          {t.request ? (
            <Card title="Linked request">
              <LinkRows items={[t.request]} onOpen={openRequest} />
            </Card>
          ) : null}
          {t.parent ? <Card title="Parent task"><LinkRows items={[t.parent]} onOpen={openTask} /></Card> : null}
          {t.dependsOn.length ? <Card title="Depends on"><LinkRows items={t.dependsOn} onOpen={openTask} /></Card> : null}
          {t.subTasks.length ? <Card title={`Sub-tasks (${t.subTasks.length})`}><LinkRows items={t.subTasks} onOpen={openTask} /></Card> : null}

          <Card title="Description">
            {descText || /<img/i.test(t.description) ? (
              <Collapsible><HtmlView html={t.description} /></Collapsible>
            ) : <Text style={s.sub}>No description.</Text>}
          </Card>

          <Card title="Timeline">
            <Field inline label="Created"><Value>{ago(t.created)}</Value><Text style={s.sub}>{fullDate(t.created)}</Text></Field>
            <Field inline label="Last changed"><Value>{ago(t.modified)}</Value><Text style={s.sub}>{fullDate(t.modified)}</Text></Field>
            {t.completedOn ? <Field inline label="Completed"><Value>{ago(t.completedOn)}</Value><Text style={s.sub}>{fullDate(t.completedOn)}</Text></Field> : null}
          </Card>

          <DueSheet visible={dueOpen} value={t.due} onClose={() => setDueOpen(false)} onPick={setDue} />
          <AssigneeSheet
            visible={assignOpen}
            people={people.list}
            loading={people.loading}
            error={people.error}
            initial={t.assignees}
            onClose={() => setAssignOpen(false)}
            onSave={reassign}
            onRetry={() => { setPeople({ list: [], loading: false, error: null }); openAssign(); }}
          />
          <MenuSheet visible={menuOpen} items={menu} onClose={() => setMenuOpen(false)} />
        </>
      ) : null}
    </DetailLayout>
  );
}

const s = StyleSheet.create({
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, letterSpacing: 0.4, marginBottom: spacing.xs },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xl, lineHeight: 28, color: COLORS.text, marginBottom: spacing.md },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  personName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  inlineBtn: { alignSelf: 'flex-start', marginTop: spacing.sm },
  effort: { alignSelf: 'stretch', gap: spacing.xs, flexBasis: '100%' },
});
