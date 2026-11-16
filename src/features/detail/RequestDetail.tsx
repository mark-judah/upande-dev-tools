import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Alert } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from '@/core/auth/store';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { relativeDue } from '@/core/date';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill, priorityTone } from '@/features/shared/Pill';
import { loadRequest, useDetail, type HistoryEvent } from './api';
import { Collapsible, HtmlView, htmlToText } from './html';
import { ago, fullDate, shorten } from './format';
import { ChipRow, Field, Value } from './parts';
import { EditRequestSheet, MenuSheet, type MenuItem } from './sheets';
import { DetailLayout, MenuButton } from './DetailLayout';

const TRIAGE_ROLES = ['Dev Team', 'Projects Manager'];

const stateTone = (state: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' =>
  state === 'Completed' || state === 'Closed' ? 'success'
    : state === 'Rejected' ? 'danger'
      : state === 'Under Review' || state === 'Deferred' ? 'warn'
        : state === 'Withdrawn' ? 'neutral' : 'info';

const HINT: Record<string, string> = {
  'Under Review': 'Waiting for a reviewer to decide.',
  Approved: 'Approved. It still needs to be scheduled.',
  Scheduled: 'Scheduled. A task has been planned for it.',
  'In Progress': 'Someone is working on this.',
  Deferred: 'Put on hold for now.',
  Completed: 'The work is done and waiting for the requester to confirm.',
  Closed: 'Confirmed complete.',
  Rejected: 'This request was not accepted.',
  Withdrawn: 'The requester withdrew this.',
};

const toHtml = (text: string) =>
  text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`).join('');

function Timeline({ events }: { events: HistoryEvent[] }) {
  return (
    <View>
      {events.map((e, i) => (
        <View key={`${e.at}-${i}`} style={s.event}>
          <View style={s.rail}>
            <View style={[s.dot, i === events.length - 1 && s.dotLast]} />
            {i < events.length - 1 ? <View style={s.railLine} /> : null}
          </View>
          <View style={s.eventBody}>
            <Text style={s.eventText} selectable>{e.text}</Text>
            <Text style={s.sub} accessibilityLabel={fullDate(e.at)}>
              {[e.by, ago(e.at)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function RequestDetail({ name }: { name: string }) {
  const { data: r, loading, error, reload, patch } = useDetail(() => loadRequest(name));
  const toast = useToast();
  const roles = useAuthStore((st) => st.roles);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canPromote = !!r && r.full && r.requestType === 'Note' && !r.task && r.isOpen && roles.some((x) => TRIAGE_ROLES.includes(x));

  const run = async (label: string, fn: () => Promise<unknown>, apply?: () => void, undo?: () => void) => {
    setBusy(true);
    apply?.();
    try {
      await fn();
      toast.showSuccess(label);
      reload();
    } catch (e) {
      undo?.();
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = () =>
    showDialog('Withdraw this request?', 'It will be closed as withdrawn. Anyone following it will see that you cancelled it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          if (!r) return;
          const old = { state: r.state, canWithdraw: r.canWithdraw, canEdit: r.canEdit, canConfirm: r.canConfirm };
          return run('Request withdrawn', () => call('requests.withdraw_request', { name }),
            () => patch({ state: 'Withdrawn', canWithdraw: false, canEdit: false, canConfirm: false }), () => patch(old));
        },
      },
    ]);

  const confirm = () => {
    if (!r) return;
    const old = { state: r.state, canConfirm: r.canConfirm, canWithdraw: r.canWithdraw };
    return run('Marked as complete', () => call('requests.confirm_request_complete', { name }),
      () => patch({ state: 'Closed', canConfirm: false, canWithdraw: false }), () => patch(old));
  };

  const promote = () => run('Promoted to a task', () => call('requests.promote_to_task', { name }));

  const save = async (v: { title?: string; description?: string }) => {
    if (!r) return;
    setBusy(true);
    const old = { title: r.title, descriptionHtml: r.descriptionHtml };
    patch({ ...(v.title ? { title: v.title } : {}), ...(v.description !== undefined ? { descriptionHtml: toHtml(v.description) } : {}) });
    setEditOpen(false);
    try {
      await call('requests.update_request', {
        name,
        ...(v.title ? { title: v.title } : {}),
        ...(v.description !== undefined ? { description: toHtml(v.description) } : {}),
      });
      toast.showSuccess('Saved');
    } catch (e) {
      patch(old);
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const menu: MenuItem[] = r ? [
    ...(r.canEdit ? [{ label: 'Edit title and description', icon: 'create-outline' as const, onPress: () => setEditOpen(true) }] : []),
    { label: 'Share', icon: 'share-outline', onPress: () => { Share.share({ message: `${r.title} (${name})` }).catch(() => {}); } },
    ...(r.canWithdraw ? [{ label: 'Withdraw request', icon: 'close-circle-outline' as const, danger: true, onPress: withdraw }] : []),
  ] : [];

  const footer = !r ? undefined : r.canConfirm ? (
    <Button label="Confirm complete" iconLeft="checkmark-circle-outline" onPress={confirm} loading={busy} singleLine />
  ) : canPromote ? (
    <Button label="Promote to task" iconLeft="arrow-up-circle-outline" onPress={promote} loading={busy} singleLine />
  ) : undefined;

  const events = r?.events.filter((e) => e.kind !== 'comment') ?? [];
  const taskDue = r?.task?.due ? relativeDue(r.task.due) : null;

  return (
    <DetailLayout
      doctype="Request"
      name={name}
      title={r ? shorten(r.title) : name}
      headerRight={r ? <MenuButton onPress={() => setMenuOpen(true)} /> : undefined}
      hasData={!!r}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={reload}
      footer={footer}
    >
      {r ? (
        <>
          <Card>
            <Text style={s.caption} selectable>{[r.name, r.requestType].filter(Boolean).join(' · ')}</Text>
            <Text style={s.title} selectable>{r.title}</Text>
            <ChipRow>
              <Pill label={r.state || 'Open'} tone={stateTone(r.state)} />
              {r.priority ? <Pill label={r.priority} tone={priorityTone(r.priority)} /> : null}
            </ChipRow>
            {HINT[r.state] ? <Text style={[s.sub, { marginTop: spacing.md }]}>{HINT[r.state]}</Text> : null}
          </Card>

          {r.canConfirm ? <Alert tone="success">The work is finished. Confirm it meets your need to close this request.</Alert> : null}
          {!r.full ? <Alert tone="info">Some details are only visible to the requester and reviewers.</Alert> : null}

          <Card title="Details">
            <Field inline label="Type"><Value>{r.requestType || 'Not set'}</Value></Field>
            <Field inline label="Raised by"><Value>{r.raisedBy || 'Unknown'}</Value>{r.raisedFor ? <Text style={s.sub}>{`for ${r.raisedFor}`}</Text> : null}</Field>
            <Field inline label="Raised"><Value>{ago(r.raisedAt)}</Value><Text style={s.sub}>{fullDate(r.raisedAt)}</Text></Field>
            {r.projectName ? <Field inline label="Project"><Value>{r.projectName}</Value></Field> : null}
            {r.source ? <Field inline label="Source"><Value>{r.source}</Value></Field> : null}
            {r.tags.length ? <Field inline label="Tags"><ChipRow>{r.tags.map((x) => <Pill key={x} label={x} />)}</ChipRow></Field> : null}
          </Card>

          {r.task ? (
            <Card title="Linked task">
              <Row
                title={r.task.subject}
                subtitle={[r.task.name, taskDue && taskDue.tone !== 'none' ? `Due ${taskDue.label}` : '', r.assignees.join(', ')].filter(Boolean).join(' · ')}
                right={r.task.status ? <Pill label={r.task.status} tone={r.task.status === 'Overdue' ? 'danger' : r.task.status === 'Completed' ? 'success' : 'info'} /> : undefined}
                onPress={() => router.push(`/task/${r.task!.name}` as never)}
                accessibilityLabel={`Open task ${r.task.subject}`}
              />
            </Card>
          ) : null}

          <Card title="Description">
            {htmlToText(r.descriptionHtml) || /<img/i.test(r.descriptionHtml) ? (
              <Collapsible><HtmlView html={r.descriptionHtml} /></Collapsible>
            ) : <Text style={s.sub}>No description.</Text>}
          </Card>

          {r.resolutionNotes || r.decisionReason ? (
            <Card title="Resolution">
              {r.decisionReason ? <Field label="Reason given"><Value>{r.decisionReason}</Value></Field> : null}
              {r.resolutionNotes ? <Collapsible><HtmlView html={r.resolutionNotes} /></Collapsible> : null}
            </Card>
          ) : null}

          {events.length ? (
            <Card title="History">
              <Timeline events={events} />
            </Card>
          ) : null}

          <MenuSheet visible={menuOpen} items={menu} onClose={() => setMenuOpen(false)} />
          <EditRequestSheet
            visible={editOpen}
            title={r.title}
            description={htmlToText(r.descriptionHtml)}
            saving={busy}
            onClose={() => setEditOpen(false)}
            onSave={save}
          />
        </>
      ) : null}
    </DetailLayout>
  );
}

const s = StyleSheet.create({
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, letterSpacing: 0.4, marginBottom: spacing.xs },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xl, lineHeight: 28, color: COLORS.text, marginBottom: spacing.md },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  event: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.border, marginTop: 5 },
  dotLast: { backgroundColor: COLORS.text },
  railLine: { flex: 1, width: 2, backgroundColor: COLORS.border, marginVertical: 2 },
  eventBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  eventText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
});
