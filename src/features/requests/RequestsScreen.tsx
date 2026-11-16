import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Text } from 'react-native';

export function RequestsScreen() {
  return (
    <Screen tab title="Requests">
      <Card><Text>Requests are coming.</Text></Card>
    </Screen>
  );
}
