import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { BottomSheet } from '@/core/ui/Dialog';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { useToast } from '@/core/ui/Toast';
import { api, mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Dep = { name: string; app: string; instance: string; branch?: string; commit_hash?: string; workflow_state: string; creation: string };
type Recent = { recent: Dep[]; counts_by_state: Record<string, number> };

const stateTone = (s: string) => (s === 'Deployed' ? 'success' : s === 'Failed' ? 'danger' : s === 'In Progress' ? 'warn' : 'info');

async function names(doctype: string): Promise<string[]> {
  const res = await api<{ message: { name: string }[] }>({
    method: 'GET',
    url: '/api/method/frappe.client.get_list',
    params: { doctype, fields: JSON.stringify(['name']), limit_page_length: 100 },
  });
  return res.message.map((r) => r.name);
}

export function DeploymentsScreen() {
  const { data, loading, error, reload } = useLoad(() => call<Recent>('deployments.get_recent_deployments', { limit: 20 }, true));
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<string[]>([]);
  const [instances, setInstances] = useState<string[]>([]);
  const [app, setApp] = useState('');
  const [instance, setInstance] = useState('');
  const [branch, setBranch] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || apps.length) return;
    Promise.all([names('Deployment App'), names('Deployment Instance')])
      .then(([a, i]) => {
        setApps(a);
        setInstances(i);
      })
      .catch((e) => toast.showError(mapAxiosError(e).message));
  }, [open, apps.length, toast]);

  const request = async () => {
    setBusy(true);
    try {
      await call('deployments.create_deployment_request', { app, instance, branch: branch || undefined, description: notes || undefined });
      toast.showSuccess('Deployment requested');
      setOpen(false);
      setBranch('');
      setNotes('');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts_by_state ?? {};
  return (
    <Screen
      tab
      title="Ship"
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={reload}
      onRefresh={reload}
      footer={<Button label="Request deployment" onPress={() => setOpen(true)} />}
    >
      <View style={s.counts}>
        {['Requested', 'In Progress', 'Deployed', 'Failed'].map((k) => (
          <Card key={k} style={{ flex: 1 }}>
            <Text style={s.num}>{counts[k] ?? 0}</Text>
            <Text style={s.muted}>{k}</Text>
          </Card>
        ))}
      </View>
      {(data?.recent ?? []).map((d) => (
        <Card key={d.name}>
          <View style={s.head}>
            <Text style={s.name}>{d.app}</Text>
            <Pill label={d.workflow_state} tone={stateTone(d.workflow_state)} />
          </View>
          <Text style={s.muted}>{d.instance}{d.branch ? ` · ${d.branch}` : ''}{d.commit_hash ? ` · ${d.commit_hash.slice(0, 7)}` : ''}</Text>
          <Text style={s.muted}>{d.name} · {d.creation.slice(0, 16)}</Text>
        </Card>
      ))}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Request deployment" busy={busy}>
        <Text style={s.label}>App</Text>
        <View style={s.chips}>{apps.map((a) => <DecisionChip key={a} label={a} selected={app === a} onPress={() => setApp(a)} />)}</View>
        <Text style={s.label}>Instance</Text>
        <View style={s.chips}>{instances.map((i) => <DecisionChip key={i} label={i} selected={instance === i} onPress={() => setInstance(i)} />)}</View>
        <LabeledInput label="Branch (optional)" value={branch} onChangeText={setBranch} autoCapitalize="none" />
        <LabeledInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <Button label="Send request" onPress={request} loading={busy} disabled={!app || !instance} />
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  counts: { flexDirection: 'row', gap: spacing.sm },
  num: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
});
