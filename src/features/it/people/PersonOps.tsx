import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { useToast } from '@/core/ui/Toast';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { useItAccess } from '../shared/useItAccess';
import { post } from '../shared/it-api';
import { list, rolesGained, rolesLost, type Profile } from './helpers';
import { Empty, TagWrap, Tag } from './ui';

export type OpUser = { name: string; full_name: string; profiles: string[] };
type Pending =
  | { kind: 'enable' | 'disable'; user: OpUser }
  | { kind: 'pick'; user: OpUser }
  | { kind: 'add' | 'remove'; user: OpUser; profile: string };

/** The risky changes on one person (disable/enable, add or remove a role profile), each behind a confirm. */
export function usePersonOps(onChanged: () => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const toast = useToast();
  const profiles = useItAccess((st) => st.profiles);
  const close = useCallback(() => setPending(null), []);

  const done = (msg: string) => {
    toast.showSuccess(msg);
    onChanged();
  };

  let sheet = null;
  if (pending?.kind === 'pick') {
    const u = pending.user;
    sheet = (
      <ProfilePicker
        visible
        user={u}
        profiles={profiles}
        onClose={close}
        onPick={(p) => setPending({ kind: 'add', user: u, profile: p })}
      />
    );
  } else if (pending?.kind === 'enable' || pending?.kind === 'disable') {
    const { user, kind } = pending;
    const on = kind === 'enable';
    sheet = (
      <ConfirmSheet
        visible
        onClose={close}
        title={on ? `Enable ${user.full_name}?` : `Disable ${user.full_name}?`}
        consequence={
          on
            ? `${user.full_name} (${user.name}) will be able to sign in again with the roles from ${list(user.profiles) === 'nothing' ? 'no role profile' : list(user.profiles)}.`
            : `${user.full_name} (${user.name}) will be signed out and will not be able to sign in. Their records and history stay. You can enable them again any time.`
        }
        confirmLabel={on ? 'Enable' : 'Disable'}
        danger={!on}
        onConfirm={async () => {
          await post.users('update', { name: user.name, enabled: on ? 1 : 0 });
          done(`${user.full_name} ${on ? 'enabled' : 'disabled'}`);
        }}
      />
    );
  } else if (pending?.kind === 'add') {
    const { user, profile } = pending;
    const gain = rolesGained(profiles, user.profiles, profile);
    sheet = (
      <ConfirmSheet
        visible
        onClose={close}
        title={`Give ${profile}?`}
        consequence={
          gain.length
            ? `${user.full_name} will gain these roles: ${list(gain, 10)}. They keep everything they already have.`
            : `${user.full_name} already has every role in ${profile}, so nothing new is granted. They will be listed under it.`
        }
        confirmLabel={`Give ${profile}`}
        onConfirm={async () => {
          await post.users('add_role_profile', { name: user.name, role_profile: profile });
          done(`${profile} added to ${user.full_name}`);
        }}
      />
    );
  } else if (pending?.kind === 'remove') {
    const { user, profile } = pending;
    const lose = rolesLost(profiles, user.profiles, profile);
    sheet = (
      <ConfirmSheet
        visible
        onClose={close}
        title={`Remove ${profile}?`}
        consequence={
          lose.length
            ? `${user.full_name} will lose these roles: ${list(lose, 10)}.${user.profiles.length === 1 ? ' This is their only profile, so they will have no access at all.' : ''}`
            : `${user.full_name} keeps all their roles, because their other profiles still include them.`
        }
        confirmLabel="Remove"
        danger={lose.length > 0}
        onConfirm={async () => {
          await post.users('remove_role_profile', { name: user.name, role_profile: profile });
          done(`${profile} removed from ${user.full_name}`);
        }}
      />
    );
  }

  return {
    sheet,
    disable: (user: OpUser) => setPending({ kind: 'disable', user }),
    enable: (user: OpUser) => setPending({ kind: 'enable', user }),
    addProfile: (user: OpUser) => setPending({ kind: 'pick', user }),
    removeProfile: (user: OpUser, profile: string) => setPending({ kind: 'remove', user, profile }),
  };
}

/** Pick one assignable role profile, with the roles it gives. Profiles the server will refuse are listed with the reason. */
export function ProfilePicker({ visible, user, profiles, onClose, onPick }: {
  visible: boolean;
  user: OpUser;
  profiles: Profile[];
  onClose: () => void;
  onPick: (profile: string) => void;
}) {
  const free = profiles.filter((p) => p.assignable && !user.profiles.includes(p.name));
  const refused = profiles.filter((p) => !p.assignable);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a role profile" subtitle={`for ${user.full_name}`}>
      {free.length === 0 ? <Empty icon="checkmark-done-outline" title="Nothing left to add" body="They already have every profile that can be given from here." /> : null}
      {free.map((p) => (
        <Pressable
          key={p.name}
          onPress={() => onPick(p.name)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${p.name}`}
          style={({ pressed }) => [s.opt, pressed && { backgroundColor: COLORS.bgMuted }]}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.optTitle}>{p.name}</Text>
            <TagWrap>
              {p.roles.slice(0, 8).map((r) => <Tag key={r} label={r} />)}
              {p.roles.length > 8 ? <Tag label={`+${p.roles.length - 8} more`} /> : null}
              {p.roles.length === 0 ? <Tag label="No roles yet" /> : null}
            </TagWrap>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </Pressable>
      ))}
      {refused.length ? (
        <Text style={s.refused}>
          Not available here: {list(refused.map((p) => p.name), 8)}. Profiles with system roles, and the IT Team profile, are given in Desk by a System Manager.
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  optTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  refused: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: spacing.sm },
});
