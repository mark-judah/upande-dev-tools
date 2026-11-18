import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict, isFuture, parseISO } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Row } from '@/core/ui/Row';
import { BottomSheet } from '@/core/ui/Dialog';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { Skeleton } from '@/core/ui/Skeleton';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { storage } from '@/core/storage';
import { api, mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Dep = {
  name: string;
  app: string;
  instance: string;
  branch?: string;
  commit_hash?: string;
  description?: string | null;
  workflow_state: string;
  creation: string;
  requested_by_user?: string;
  requires_approval?: 0 | 1;
  approval_status?: string | null;
};
type Recent = { recent: Dep[]; counts_by_state: Record<string, number> };

const STATES = ['Requested', 'In Progress', 'Deployed', 'Failed'] as const;
const LAST_KEY = 'deploy_last_choice';

/** Requested or running, and not turned down: asking again would only queue a duplicate. */
const isOpen = (d: Dep) => (d.workflow_state === 'Requested' || d.workflow_state === 'In Progress') && d.approval_status !== 'Rejected';
const openFor = (list: Dep[], app: string, instance: string) => list.find((d) => d.app === app && d.instance === instance && isOpen(d));
const targetKey = (app: string, instance: string) => `${app}|${instance}`;

function showAlreadyQueued(open: Dep): void {
  showDialog(
    'Already in the queue',
    `${open.app} on ${open.instance} already has an open request (${open.workflow_state.toLowerCase()}, ${when(open.creation)}). Wait for it to finish before asking again.`,
    [{ text: 'OK' }],
    { name: 'time-outline', tone: 'info' },
  );
}

type LastChoice = { instance?: string; branches?: Record<string, string> };

const stateTone = (s: string) => (s === 'Deployed' ? 'success' : s === 'Failed' ? 'danger' : s === 'In Progress' ? 'warn' : 'info');

async function names(doctype: string): Promise<string[]> {
  const res = await api<{ message: { name: string }[] }>({
    method: 'GET',
    url: '/api/method/frappe.client.get_list',
    params: { doctype, fields: JSON.stringify(['name']), limit_page_length: 200, order_by: 'name asc' },
  });
  return res.message.map((r) => r.name);
}

function when(creation: string): string {
  const d = parseISO(creation.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return creation.slice(0, 16);
  return isFuture(d) ? `scheduled ${creation.slice(0, 10)}` : `${formatDistanceToNowStrict(d)} ago`;
}

export function DeploymentsScreen() {
  const { data, loading, error, reload } = useLoad(() => call<Recent>('deployments.get_recent_deployments', { limit: 30 }, true));
  const toast = useToast();
  const [filter, setFilter] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<string[]>([]);
  const [instances, setInstances] = useState<string[]>([]);
  const [app, setApp] = useState('');
  const [instance, setInstance] = useState('');
  const [branch, setBranch] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  /** The row being repeated, when the sheet was opened from "Deploy again". */
  const [source, setSource] = useState<Dep | null>(null);
  /** Last branch requested per app + instance, so a fresh request starts from it. */
  const [branches, setBranches] = useState<Record<string, string>>({});
  // A ref, not state: two taps in the same frame must not both get through.
  const inFlight = useRef(false);

  // Load the app and instance lists once, the first time the sheet opens, and restore the last choice.
  useEffect(() => {
    if (!open || apps.length) return;
    Promise.all([names('Deployment App'), names('Deployment Instance'), storage.get(LAST_KEY).catch(() => null)])
      .then(([a, i, last]) => {
        setApps(a);
        setInstances(i);
        try {
          const saved = last ? (JSON.parse(last) as LastChoice) : {};
          // Never override an instance that "Deploy again" already filled in.
          if (saved.instance && i.includes(saved.instance)) setInstance((cur) => cur || (saved.instance as string));
          if (saved.branches) setBranches(saved.branches);
        } catch {
          // ignore a corrupt saved choice
        }
      })
      .catch((e) => toast.showError(mapAxiosError(e).message));
  }, [open, apps.length, toast]);

  const send = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await call('deployments.create_deployment_request', { app, instance, branch: branch || undefined, description: notes || undefined });
      const nextBranches = { ...branches };
      if (branch) nextBranches[targetKey(app, instance)] = branch;
      else delete nextBranches[targetKey(app, instance)];
      setBranches(nextBranches);
      storage.set(LAST_KEY, JSON.stringify({ instance, branches: nextBranches } satisfies LastChoice)).catch(() => {});
      toast.showSuccess(source ? `${app} on ${instance} requested again` : `Deployment of ${app} requested`);
      setOpen(false);
      setSource(null);
      setApp('');
      setBranch('');
      setNotes('');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [app, instance, branch, notes, branches, source, toast, reload]);

  // Checks for an open request on the same target, then asks for confirmation on live
  // servers (the highest-risk action in the app), then sends.
  const request = async () => {
    if (inFlight.current || !app || !instance) return;
    inFlight.current = true;
    setBusy(true);
    // Fresh list, so a request someone else queued a minute ago counts too.
    const fresh = await call<Recent>('deployments.get_recent_deployments', { limit: 50 }, true).catch(() => null);
    setBusy(false);
    // The dialogs below are modal, so the guard can drop here; send() takes it again.
    inFlight.current = false;
    const clash = openFor(fresh?.recent ?? data?.recent ?? [], app, instance);
    if (clash) {
      showAlreadyQueued(clash);
      return;
    }
    if (/prod/i.test(instance)) {
      showDialog(`Deploy ${app} to ${instance}?`, 'This asks for a deployment on a live server.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request it', onPress: () => void send() },
      ]);
    } else {
      void send();
    }
  };

  /** A new, blank request. Clears anything a "Deploy again" left behind. */
  const openFresh = () => {
    if (source) {
      setSource(null);
      setApp('');
      setBranch('');
      setNotes('');
    }
    setOpen(true);
  };

  /** Same app, instance, branch and notes as an earlier request, still editable before sending. */
  const deployAgain = (d: Dep) => {
    const clash = openFor(data?.recent ?? [], d.app, d.instance);
    if (clash) {
      showAlreadyQueued(clash);
      return;
    }
    setSource(d);
    setApp(d.app);
    setInstance(d.instance);
    setBranch(d.branch ?? '');
    setNotes(d.description ?? '');
    setOpen(true);
  };

  // A fresh request remembers the branch last used for that app on that instance.
  const pickTarget = (nextApp: string, nextInstance: string) => {
    setApp(nextApp);
    setInstance(nextInstance);
    if (!source && !branch && nextApp && nextInstance) {
      const remembered = branches[targetKey(nextApp, nextInstance)];
      if (remembered) setBranch(remembered);
    }
  };

  const counts = data?.counts_by_state ?? {};
  const rows = useMemo(() => (data?.recent ?? []).filter((d) => !filter || d.workflow_state === filter), [data, filter]);
  const shownApps = useMemo(() => apps.filter((a) => a.toLowerCase().includes(query.trim().toLowerCase())), [apps, query]);

  return (
    <Screen
      tab
      title="Ship"
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={reload}
      onRefresh={reload}
      footer={<Button label="Request deployment" iconLeft="rocket-outline" onPress={openFresh} />}
    >
      <View style={s.tiles}>
        {STATES.map((k) => {
          const active = filter === k;
          return (
            <Pressable
              key={k}
              style={[s.tile, active && s.tileActive, k === 'Failed' && (counts[k] ?? 0) > 0 && s.tileFailed]}
              onPress={() => setFilter(active ? null : k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${counts[k] ?? 0} ${k}`}
            >
              <Text style={[s.num, (active || (k === 'Failed' && (counts[k] ?? 0) > 0)) && { color: '#fff' }]}>{counts[k] ?? 0}</Text>
              <Text style={[s.tileLabel, (active || (k === 'Failed' && (counts[k] ?? 0) > 0)) && { color: '#E5E5E5' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {k === 'In Progress' ? 'Running' : k}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !data ? <Skeleton height={84} /> : null}
      {rows.length === 0 && data ? (
        <Card><Text style={s.muted}>{filter ? `Nothing ${filter.toLowerCase()}.` : 'No deployments yet.'}</Text></Card>
      ) : null}

      {rows.map((d) => (
        <Card key={d.name}>
          <View style={s.head}>
            <Text style={s.name} numberOfLines={1}>{d.app}</Text>
            <Pill label={d.workflow_state} tone={stateTone(d.workflow_state)} />
          </View>
          <View style={s.chips}>
            <View style={s.chip}><Ionicons name="server-outline" size={13} color={COLORS.textSecondary} /><Text style={s.chipText} numberOfLines={1}>{d.instance}</Text></View>
            {d.branch ? <View style={s.chip}><Ionicons name="git-branch-outline" size={13} color={COLORS.textSecondary} /><Text style={s.chipText} numberOfLines={1}>{d.branch}</Text></View> : null}
            {d.commit_hash ? <View style={s.chip}><Text style={[s.chipText, s.mono]}>{d.commit_hash.slice(0, 7)}</Text></View> : null}
          </View>
          <View style={s.foot}>
            <Text style={[s.muted, s.footText]} numberOfLines={2}>
              {when(d.creation)}
              {d.requested_by_user ? ` · ${d.requested_by_user.split('@')[0]}` : ''}
              {d.approval_status ? ` · ${d.approval_status}` : ''}
            </Text>
            {!isOpen(d) ? (
              <Button
                label="Deploy again"
                iconLeft="refresh"
                variant="outline"
                size="sm"
                onPress={() => deployAgain(d)}
                disabled={busy}
              />
            ) : null}
          </View>
        </Card>
      ))}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={source ? 'Deploy again' : 'Request deployment'} busy={busy}>
        {source ? (
          <Text style={s.from} numberOfLines={2}>
            Copied from the {source.workflow_state.toLowerCase()} request {when(source.creation)}. Change anything before sending.
          </Text>
        ) : null}
        <Text style={s.label}>App</Text>
        <Row
          title={app || 'Choose an app'}
          left={<Ionicons name="cube-outline" size={22} color={app ? COLORS.text : COLORS.textMuted} />}
          onPress={() => setPicker(true)}
          divider
        />
        <Text style={s.label}>Instance</Text>
        <View style={s.chipsWrap}>
          {instances.length === 0 ? <Skeleton height={44} style={{ width: 160 }} /> : null}
          {instances.map((i) => <DecisionChip key={i} label={i} selected={instance === i} onPress={() => pickTarget(app, i)} />)}
        </View>
        <LabeledInput label="Branch (optional)" value={branch} onChangeText={setBranch} autoCapitalize="none" autoCorrect={false} />
        <LabeledInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <Button
          label={app && instance ? `${source ? 'Deploy' : 'Request'} ${app} on ${instance}` : 'Pick an app and an instance'}
          onPress={() => void request()}
          loading={busy}
          disabled={!app || !instance}
        />
      </BottomSheet>

      <BottomSheet visible={picker} onClose={() => setPicker(false)} title="Choose an app">
        <LabeledInput label="Search" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Type to filter" />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {shownApps.length === 0 ? <Text style={s.muted}>No app matches.</Text> : null}
          {shownApps.map((a) => (
            <Row
              key={a}
              title={a}
              titleLines={1}
              right={app === a ? <Ionicons name="checkmark" size={20} color={COLORS.text} /> : undefined}
              onPress={() => {
                pickTarget(a, instance);
                setPicker(false);
                setQuery('');
              }}
              divider
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, minHeight: 72, backgroundColor: COLORS.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.md, justifyContent: 'space-between' },
  tileActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  tileFailed: { backgroundColor: '#7F1D1D', borderColor: '#7F1D1D' },
  num: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.bgMuted, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary, flexShrink: 1 },
  mono: { fontFamily: 'monospace' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footText: { flex: 1 },
  from: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.md, marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
});
