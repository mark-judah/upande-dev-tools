import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { useToast } from '@/core/ui/Toast';
import { useLoad } from '@/features/shared/useLoad';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { ItGate } from '../shared/ItGate';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itUsers, post } from '../shared/it-api';
import { ago, whyReadOnly, useMe, type PersonDetail } from './helpers';
import { usePersonOps } from './PersonOps';
import { ResetPasswordSheet } from './ResetPasswordSheet';
import { Avatar, ErrorBox, Notice, Section, Tag, TagWrap } from './ui';

export function PersonScreen() {
  const { name: raw } = useLocalSearchParams<{ name: string }>();
  const name = decodeURIComponent(String(raw ?? ''));
  return (
    <ItGate title="Person">
      <PersonBody name={name} />
    </ItGate>
  );
}

function PersonBody({ name }: { name: string }) {
  const me = useMe();
  const { data, loading, error, reload } = useLoad(() => itUsers<PersonDetail>('detail', { name }));
  const ops = usePersonOps(reload);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  if (loading && !data) {
    return (
      <Screen title="Person" backFallback="/it/people">
        <View style={{ gap: spacing.md }} accessibilityLabel="Loading">
          <Skeleton height={120} radius={borderRadius.xl} />
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={140} />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="Person" backFallback="/it/people">
        <ErrorBox message={error ?? 'Not found'} onRetry={reload} />
      </Screen>
    );
  }

  const u = data;
  const readOnly = whyReadOnly({ name: u.name, locked: u.locked }, me);
  const op = { name: u.name, full_name: u.full_name, profiles: u.profiles };
  const locked = !!readOnly;

  return (
    <Screen title={u.full_name} backFallback="/it/people" onRefresh={reload}>
      <View style={{ gap: spacing.lg }}>
        <View style={s.hero}>
          <Avatar name={u.full_name} size={64} dim={!u.enabled} />
          <Text style={s.heroName}>{u.full_name}{u.is_me ? ' (you)' : ''}</Text>
          <Text style={s.heroSub} selectable>{u.name}</Text>
          <View style={s.heroRow}>
            <Text style={s.heroSub}>{u.enabled ? 'Can sign in' : 'Disabled'}</Text>
            <Switch
              value={!!u.enabled}
              disabled={locked}
              onValueChange={() => (u.enabled ? ops.disable(op) : ops.enable(op))}
              accessibilityLabel={u.enabled ? 'Account enabled. Turn off to disable' : 'Account disabled. Turn on to enable'}
              trackColor={{ true: COLORS.success, false: '#525252' }}
            />
          </View>
        </View>

        {readOnly ? (
          <Notice icon="lock-closed-outline" tone="warn">{readOnly} {u.locked ? 'It is read only here.' : 'Other changes are still blocked on your own account.'}</Notice>
        ) : null}

        <Section title="Role profiles" hint="Roles come from profiles. Adding or removing one changes what this person can do.">
          <View style={{ gap: spacing.sm }}>
            {u.profiles.length === 0 ? <Notice icon="alert-circle-outline" tone="danger">No role profile, so this person has no access to anything.</Notice> : null}
            {u.profiles.map((p) => (
              <Card key={p}>
                <View style={s.profRow}>
                  <Text style={s.profName} numberOfLines={2}>{p}</Text>
                  <Button label="Remove" size="sm" variant="outline" disabled={locked} onPress={() => ops.removeProfile(op, p)} />
                </View>
              </Card>
            ))}
            <Button label="Add a role profile" variant="outline" iconLeft="add" disabled={locked} onPress={() => ops.addProfile(op)} />
          </View>
        </Section>

        <Section title="What they can do" hint={`${u.roles.length} role${u.roles.length === 1 ? '' : 's'} in effect`}>
          <TagWrap>
            {u.roles.length ? u.roles.map((r) => <Tag key={r} label={r} />) : <Text style={s.sub}>No roles.</Text>}
          </TagWrap>
        </Section>

        <Section title="Activity">
          <Card>
            <View style={{ gap: 6 }}>
              <Line label="Last active" value={ago(u.last_active)} />
              <Line label="Last sign in" value={ago(u.last_login)} />
              <Line label="Created" value={ago(u.created)} />
              <Line label="Type" value={u.user_type} />
            </View>
          </Card>
        </Section>

        <Section title="History" hint="What IT changed on this account.">
          {u.history.length === 0 ? <Text style={s.sub}>No changes recorded yet.</Text> : (
            <View style={{ paddingLeft: 4 }}>
              {u.history.map((h, i) => (
                <View key={`${h.at}-${i}`} style={s.tl}>
                  <View style={s.rail}>
                    <View style={s.dot} />
                    {i < u.history.length - 1 ? <View style={s.line} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.md }}>
                    <Text style={s.histText}>{h.text}</Text>
                    <Text style={s.sub}>{ago(h.at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title="Danger zone">
          <View style={{ gap: spacing.sm }}>
            <Button label="Reset password" variant="outline" color={COLORS.danger} iconLeft="key-outline" disabled={locked} onPress={() => setResetting(true)} />
            <Button label="Delete user" variant="outline" color={COLORS.danger} iconLeft="trash-outline" disabled={locked} onPress={() => setDeleting(true)} />
            {locked ? <Text style={s.sub}>Both are off because this account is read only here.</Text> : <Text style={s.sub}>Disabling is safer than deleting: it keeps their records and can be undone.</Text>}
          </View>
        </Section>
      </View>

      {ops.sheet}
      <ResetPasswordSheet visible={resetting} onClose={() => setResetting(false)} user={u} />
      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${u.full_name}?`}
        consequence={`${u.full_name} (${u.name}) is removed for good. If anything points at them the server refuses, and then disabling the account is the right move. Disabling keeps their records and can be undone; deleting cannot.`}
        confirmLabel="Delete user"
        danger
        typeToConfirm={u.name}
        onConfirm={async () => {
          await post.users('delete', { name: u.name });
          toast.showSuccess(`${u.full_name} deleted`);
          router.replace('/it/people' as never);
        }}
      />
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line2}>
      <Text style={s.sub}>{label}</Text>
      <Text style={s.val}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: COLORS.text, borderRadius: borderRadius.xl, padding: spacing.lg, alignItems: 'center', gap: 6 },
  heroName: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: '#fff', textAlign: 'center' },
  heroSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#D4D4D4' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  profRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  profName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  val: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  line2: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  tl: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.text, marginTop: 5 },
  line: { flex: 1, width: 2, backgroundColor: COLORS.border, marginTop: 2 },
  histText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
});
