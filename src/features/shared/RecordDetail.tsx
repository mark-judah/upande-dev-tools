import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { useToast } from '@/core/ui/Toast';
import { api, mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from './useLoad';
import { Pill, priorityTone } from './Pill';
import { NEXT_STAGE, TASK_STAGE, type Stage } from './types';

type Doc = Record<string, string | null | undefined>;

async function getDoc(doctype: string, name: string): Promise<Doc> {
  const res = await api<{ message: Doc }>({ method: 'GET', url: '/api/method/frappe.client.get', params: { doctype, name } });
  return res.message;
}

/** Plain-text view of a Text Editor field. */
const plain = (html?: string | null) => (html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

export function RecordDetail({ doctype }: { doctype: 'Task' | 'Request' }) {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { data, loading, error, reload } = useLoad(() => getDoc(doctype, name));
  const toast = useToast();

  const isTask = doctype === 'Task';
  const title = (isTask ? data?.subject : data?.title) ?? name;
  const stage: Stage | undefined = isTask && data?.status ? TASK_STAGE[data.status] : undefined;
  const next = stage ? NEXT_STAGE[stage] : undefined;

  const move = async () => {
    if (!next) return;
    try {
      await call('board.set_stage', { doctype: 'Task', name, stage: next });
      toast.showSuccess(next === 'Done' ? 'Task closed' : `Moved to ${next}`);
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    }
  };

  const promote = async () => {
    try {
      await call('requests.promote_to_task', { name });
      toast.showSuccess('Promoted to a task');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    }
  };

  return (
    <Screen
      title={name}
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={reload}
      onRefresh={reload}
      footer={
        next ? <Button label={`Move to ${next}`} onPress={move} /> : !isTask && data?.request_type === 'Note' && data?.workflow_state !== 'Completed' && !data?.linked_task
          ? <Button label="Promote to task" onPress={promote} />
          : undefined
      }
    >
      <Card>
        <Text style={s.title}>{title}</Text>
        <View style={s.row}>
          {(isTask ? data?.status : data?.workflow_state) ? <Pill label={(isTask ? data?.status : data?.workflow_state) as string} tone="info" /> : null}
          {data?.priority ? <Pill label={data.priority} tone={priorityTone(data.priority)} /> : null}
          {!isTask && data?.request_type ? <Pill label={data.request_type} /> : null}
        </View>
        {data?.project ? <Text style={s.muted}>Project: {data.project}</Text> : null}
        {isTask && data?.exp_end_date ? <Text style={s.muted}>Due: {data.exp_end_date}</Text> : null}
      </Card>
      {plain(data?.description) ? (
        <Card title="Details"><Text style={s.body}>{plain(data?.description)}</Text></Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
});
