import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Segmented } from '@/core/ui/Segmented';
import { spacing } from '@/core/theme';
import { ItGate } from '../shared/ItGate';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { PermissionsTab } from './PermissionsTab';

type Tab = 'users' | 'roles' | 'perms';

export function PeopleHub({ initial = 'users' }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <ItGate title="People and access">
      <Screen title="People and access" backFallback="/" onRefresh={() => setRefreshKey((k) => k + 1)}>
        <View style={{ gap: spacing.md }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[{ value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles' }, { value: 'perms', label: 'Permissions' }]}
          />
          {tab === 'users' ? <UsersTab refreshKey={refreshKey} /> : tab === 'roles' ? <RolesTab /> : <PermissionsTab />}
        </View>
      </Screen>
    </ItGate>
  );
}
