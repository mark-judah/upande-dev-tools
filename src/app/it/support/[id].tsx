import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '../../../features/it/support/ConversationScreen';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen id={decodeURIComponent(String(id))} />;
}
