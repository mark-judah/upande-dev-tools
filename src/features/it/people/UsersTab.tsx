import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { SwipeRow } from '@/core/ui/SwipeRow';
import { useLoad } from '@/features/shared/useLoad';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { itUsers } from '../shared/it-api';
import { ago, useMe, whyReadOnly, type PersonRow, type UsersResponse } from './helpers';
import { usePersonOps } from './PersonOps';
import { CreateUserSheet } from './CreateUserSheet';
import { Avatar, ChipRow, Empty, ErrorBox, ListSkeleton, SearchBox, Tag, TagWrap } from './ui';

type Status = 'active' | 'disabled' | 'none' | null;

export function UsersTab({ refreshKey }: { refreshKey: number }) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [creating, setCreating] = useState(false);
  const me = useMe();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error, reload } = useLoad(() =>
    itUsers<UsersResponse>('users', {
      search: q || undefined,
      status: status === 'active' || status === 'disabled' ? status : undefined,
      profile: status === 'none' ? 'none' : undefined,
    }),
  );
  // Refetch when the filters (or an outside change) move.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, refreshKey]);

  const ops = usePersonOps(reload);
  const sum = data?.summary;
  const pick = (s: Exclude<Status, null>) => setStatus((cur) => (cur === s ? null : s));

  return (
    <View style={{ gap: spacing.md }}>
      <Button label="Create user" iconLeft="person-add-outline" onPress={() => setCreating(true)} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search name or email" />
      <ChipRow>
        <DecisionChip label={`Active${sum ? ` ${sum.active}` : ''}`} selected={status === 'active'} onPress={() => pick('active')} />
        <DecisionChip label={`Disabled${sum ? ` ${sum.disabled}` : ''}`} selected={status === 'disabled'} onPress={() => pick('disabled')} />
        <DecisionChip label={`No profile${sum ? ` ${sum.no_profile}` : ''}`} selected={status === 'none'} onPress={() => pick('none')} />
      </ChipRow>
      <Text style={s.swipeHint}>Swipe a person left to disable, right to add a role profile.</Text>

      {loading && !data ? <ListSkeleton /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.rows.length === 0 ? <Empty icon="people-outline" title="Nobody here" body={q || status ? 'Nothing matches. Clear the search or filter.' : 'No system users yet.'} /> : null}

      <View style={{ gap: spacing.sm }}>
        {data?.rows.map((u) => (
          <UserItem key={u.name} u={u} me={me} ops={ops} />
        ))}
      </View>

      {ops.sheet}
      <CreateUserSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(email) => {
          reload();
          router.push(`/it/person/${encodeURIComponent(email)}` as never);
        }}
      />
    </View>
  );
}

// Memoised on the row and "me" only: the ops object is new each render, but its actions only open a sheet through a
// state setter, so an older copy behaves the same. Typing in the search no longer re-renders every person.
const UserItem = memo(
  function UserItem({ u, me, ops }: { u: PersonRow; me: string | null; ops: ReturnType<typeof usePersonOps> }) {
  const blocked = whyReadOnly(u, me);
  const op = { name: u.name, full_name: u.full_name, profiles: u.profiles };
  const isMe = me === u.name;
  return (
    <SwipeRow
      radius={borderRadius.md}
      disabled={!!blocked}
      swipeLeft={
        u.enabled
          ? { label: 'Disable', icon: 'ban-outline', color: COLORS.warn, onTrigger: () => ops.disable(op) }
          : { label: 'Enable', icon: 'checkmark-circle-outline', color: COLORS.success, onTrigger: () => ops.enable(op) }
      }
      swipeRight={{ label: 'Add profile', icon: 'shield-checkmark-outline', color: COLORS.text, onTrigger: () => ops.addProfile(op) }}
    >
      <Card
        style={{ marginBottom: 0 }}
        onPress={() => router.push(`/it/person/${encodeURIComponent(u.name)}` as never)}
        accessibilityLabel={`${u.full_name}, ${u.enabled ? 'active' : 'disabled'}${u.locked ? ', read only' : ''}`}
      >
        <View style={s.row}>
          <Avatar name={u.full_name} dim={!u.enabled} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.titleLine}>
              <Text style={[s.name, !u.enabled && { color: COLORS.textMuted }]} numberOfLines={1}>{u.full_name}{isMe ? ' (you)' : ''}</Text>
              {u.locked ? <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} accessibilityLabel="Read only" /> : null}
            </View>
            <Text style={s.sub} numberOfLines={1}>{u.name}</Text>
            <TagWrap>
              {!u.enabled ? <Tag label="Disabled" tone="warn" /> : null}
              {u.profiles.length === 0 ? <Tag label="No profile" tone="danger" /> : u.profiles.map((p) => <Tag key={p} label={p} />)}
            </TagWrap>
            <Text style={s.sub}>Active {ago(u.last_active || u.last_login)}</Text>
          </View>
        </View>
      </Card>
    </SwipeRow>
  );
  },
  (a, b) => a.u === b.u && a.me === b.me,
);

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  swipeHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
