import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, format } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { BottomSheet } from '@/core/ui/Dialog';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Req = { name: string; title: string; request_type: string; product_area?: string; project?: string; priority?: string; raised_by_user?: string };

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const WHEN = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

export function ReviewQueueScreen() {
  const { data, loading, error, reload } = useLoad(() => call<Req[]>('requests.get_review_queue', {}, true));
  const toast = useToast();
  const [sel, setSel] = useState<Req | null>(null);
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [whenDays, setWhenDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const act = async (kind: 'accept' | 'Reject' | 'Defer') => {
    if (!sel) return;
    setBusy(true);
    try {
      if (kind === 'accept') await call('requests.accept_request', { name: sel.name, project: project || sel.project, priority, complete_by: format(addDays(new Date(), whenDays), 'yyyy-MM-dd') });
      else await call('requests.triage_request', { name: sel.name, action: kind });
      toast.showSuccess(kind === 'accept' ? 'Accepted and scheduled' : kind === 'Reject' ? 'Rejected' : 'Deferred');
      setSel(null);
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Review Queue" loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {(data ?? []).length === 0 ? (
        <Card><Text style={s.muted}>Queue is clear.</Text></Card>
      ) : (
        (data ?? []).map((r) => (
          <Card key={r.name}>
            <Text style={s.title}>{r.title}</Text>
            <View style={s.row}>
              <Pill label={r.request_type} tone="info" />
              {r.product_area ? <Pill label={r.product_area} /> : null}
            </View>
            <Text style={s.muted}>{r.raised_by_user}</Text>
            <Button label="Triage" size="sm" variant="outline" onPress={() => { setSel(r); setProject(r.project ?? ''); }} />
          </Card>
        ))
      )}
      <BottomSheet visible={!!sel} onClose={() => setSel(null)} title={sel?.title ?? ''} busy={busy}>
        <LabeledInput label="Project" value={project} onChangeText={setProject} autoCapitalize="none" />
        <View style={s.row}>{PRIORITIES.map((p) => <DecisionChip key={p} label={p} selected={priority === p} onPress={() => setPriority(p)} />)}</View>
        <View style={s.row}>{WHEN.map((w) => <DecisionChip key={w.label} label={w.label} selected={whenDays === w.days} onPress={() => setWhenDays(w.days)} />)}</View>
        <Button label="Accept and schedule" onPress={() => act('accept')} loading={busy} disabled={!project && !sel?.project} />
        <View style={{ height: spacing.sm }} />
        <Button label="Defer" variant="outline" onPress={() => act('Defer')} disabled={busy} />
        <View style={{ height: spacing.sm }} />
        <Button label="Reject" variant="ghost" onPress={() => act('Reject')} disabled={busy} />
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.sm },
});
