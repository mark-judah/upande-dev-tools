import { useLocalSearchParams } from 'expo-router';
import { TaskDetail } from '@/features/detail/TaskDetail';
import { RequestDetail } from '@/features/detail/RequestDetail';

/** One entry point for the Task and Request routes; the screens live in features/detail. */
export function RecordDetail({ doctype }: { doctype: 'Task' | 'Request' }) {
  const { name } = useLocalSearchParams<{ name: string }>();
  return doctype === 'Task' ? <TaskDetail name={name} /> : <RequestDetail name={name} />;
}
