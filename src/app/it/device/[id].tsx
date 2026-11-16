import { useLocalSearchParams } from 'expo-router';
import { DeviceDetailScreen } from '@/features/it/devices/DeviceDetailScreen';

export default function DeviceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeviceDetailScreen id={String(id)} />;
}
