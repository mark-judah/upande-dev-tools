import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Dep = {
  name: string;
  app: string;
  instance: string;
  branch?: string;
  commit_hash?: string;
  workflow_state: string;
  creation: string;
  requested_by_user?: string;
  approval_status?: string | null;
};
type Recent = { recent: Dep[]; counts_by_state: Record<string, number> };

const STATES = ['Requested', 'In Progress', 'Deployed', 'Failed'] as const;
const LAST_KEY = 'deploy_last_choice';

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

  // Load the app and instance lists once, the first time the sheet opens, and restore the last choice.
  useEffect(() => {
    if (!open || apps.length) return;
    Promise.all([names('Deployment App'), names('Deployment Instance'), storage.get(LAST_KEY).catch(() => null)])
      .then(([a, i, last]) => {
        setApps(a);
        setInstances(i);
        try {
          const saved = last ? (JSON.parse(last) as { app?: string; instance?: string }) : {};
          if (saved.instance && i.includes(saved.instance)) setInstance(saved.instance);
        } catch {
          // ignore a corrupt saved choice
        }
      })
      .catch((e) => toast.showError(mapAxiosError(e).message));
  }, [open, apps.length, toast]);

  const send = useCallback(async () => {
    setBusy(true);
    try {
      await call('deployments.create_deployment_request', { app, instance, branch: branch || undefined, description: notes || undefined });
      storage.set(LAST_KEY, JSON.stringify({ instance })).catch(() => {});
      toast.showSuccess(`Deployment of ${app} requested`);
      setOpen(false);
      setApp('');
      setBranch('');
      setNotes('');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  }, [app, instance, branch, notes, toast, reload]);

  // Production deploys get a confirmation: it is the highest-risk action in the app.
  const request = () => {
    if (/prod/i.test(instance)) {
      showDialog(`Deploy ${app} to ${instance}?`, 'This asks for a deployment on a live server.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request it', onPress: () => void send() },
      ]);
    } else {
      void send();
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
      footer={<Button label="Request deployment" iconLeft="rocket-outline" onPress={() => setOpen(true)} />}
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
          <Text style={s.muted}>
            {when(d.creation)}
            {d.requested_by_user ? ` · ${d.requested_by_user.split('@')[0]}` : ''}
            {d.approval_status ? ` · ${d.approval_status}` : ''}
          </Text>
        </Card>
      ))}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Request deployment" busy={busy}>
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
          {instances.map((i) => <DecisionChip key={i} label={i} selected={instance === i} onPress={() => setInstance(i)} />)}
        </View>
        <LabeledInput label="Branch (optional)" value={branch} onChangeText={setBranch} autoCapitalize="none" autoCorrect={false} />
        <LabeledInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <Button label={app && instance ? `Request ${app} on ${instance}` : 'Pick an app and an instance'} onPress={request} loading={busy} disabled={!app || !instance} />
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
                setApp(a);
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
  tile: { flex: 1, minHeight: 72, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.md, justifyContent: 'space-between' },
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
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.md, marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
});
