import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { Segmented } from '@/core/ui/Segmented';
import { useToast } from '@/core/ui/Toast';
import { useLoad } from '@/features/shared/useLoad';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itRoles, post } from '../shared/it-api';
import { Empty, ErrorBox, ListSkeleton, Notice, SearchBox, Tag, TagWrap } from './ui';

type RoleRow = { name: string; desk_access: number; disabled: number; people: number; profiles: string[] };
type ProfileRow = { name: string; roles: string[]; system_roles: number; people: number };

const plural = (n: number, w: string) => (w === 'person' ? `${n} ${n === 1 ? 'person' : 'people'}` : `${n} ${w}${n === 1 ? '' : 's'}`);

export function RolesTab() {
  const [view, setView] = useState<'roles' | 'profiles'>('profiles');
  const [search, setSearch] = useState('');
  const [addTo, setAddTo] = useState<ProfileRow | null>(null);
  const [newRole, setNewRole] = useState(false);

  const roles = useLoad(() => itRoles<{ rows: RoleRow[] }>('roles'));
  const profiles = useLoad(() => itRoles<{ rows: ProfileRow[] }>('profiles'));
  const reloadAll = () => {
    roles.reload();
    profiles.reload();
  };

  const term = search.trim().toLowerCase();
  const roleRows = useMemo(() => (roles.data?.rows ?? []).filter((r) => !term || r.name.toLowerCase().includes(term)), [roles.data, term]);
  const profileRows = useMemo(() => (profiles.data?.rows ?? []).filter((r) => !term || r.name.toLowerCase().includes(term)), [profiles.data, term]);
  const cur = view === 'roles' ? roles : profiles;

  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        value={view}
        onChange={setView}
        options={[{ value: 'profiles', label: 'Role profiles' }, { value: 'roles', label: 'Roles' }]}
      />
      <SearchBox value={search} onChange={setSearch} placeholder={view === 'roles' ? 'Search roles' : 'Search role profiles'} />
      {view === 'roles' ? <Button label="Create role" iconLeft="add" variant="outline" onPress={() => setNewRole(true)} /> : null}

      {cur.loading && !cur.data ? <ListSkeleton rows={5} height={92} /> : cur.error && !cur.data ? <ErrorBox message={cur.error} onRetry={cur.reload} /> : null}

      {view === 'profiles' ? (
        <>
          {profiles.data && profileRows.length === 0 ? <Empty icon="shield-outline" title="No role profiles match" /> : null}
          {profileRows.map((p) => (
            <Card key={p.name}>
              <View style={{ gap: spacing.sm }}>
                <View style={s.head}>
                  <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.meta}>{plural(p.people, 'person')}</Text>
                </View>
                <TagWrap>
                  {p.roles.map((r) => <Tag key={r} label={r} />)}
                  {p.system_roles ? <Tag label={`+${plural(p.system_roles, 'system role')}`} tone="warn" /> : null}
                  {p.roles.length === 0 && !p.system_roles ? <Text style={s.meta}>No roles in this profile yet.</Text> : null}
                </TagWrap>
                <Button label="Add a role" size="sm" variant="outline" iconLeft="add" onPress={() => setAddTo(p)} />
              </View>
            </Card>
          ))}
        </>
      ) : (
        <>
          {roles.data && roleRows.length === 0 ? <Empty icon="key-outline" title="No roles match" /> : null}
          {roleRows.map((r) => (
            <Card key={r.name}>
              <View style={{ gap: spacing.sm }}>
                <View style={s.head}>
                  <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.meta}>{plural(r.people, 'person')}</Text>
                </View>
                <TagWrap>
                  {r.disabled ? <Tag label="Disabled" tone="warn" /> : null}
                  <Tag label={r.desk_access ? 'Desk access' : 'No desk access'} />
                </TagWrap>
                <Text style={s.meta}>
                  {r.profiles.length ? `In ${r.profiles.join(', ')}` : 'Not in any role profile yet, so nobody can get it from here.'}
                </Text>
              </View>
            </Card>
          ))}
        </>
      )}

      {addTo ? <AddRoleFlow profile={addTo} roles={roles.data?.rows ?? []} onClose={() => setAddTo(null)} onDone={reloadAll} /> : null}
      <CreateRoleFlow visible={newRole} existing={(roles.data?.rows ?? []).map((r) => r.name)} onClose={() => setNewRole(false)} onDone={reloadAll} />
    </View>
  );
}

function CreateRoleFlow({ visible, existing, onClose, onDone }: { visible: boolean; existing: string[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [desk, setDesk] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const clean = name.split(/\s+/).filter(Boolean).join(' ');
  const problem = !clean
    ? null
    : clean.length > 60
      ? 'Use up to 60 characters.'
      : /[<>"\\/]/.test(clean)
        ? 'Leave out symbols like < > " / \\.'
        : existing.some((e) => e.toLowerCase() === clean.toLowerCase())
          ? 'A role with that name already exists.'
          : ['System Manager', 'Script Manager', 'Administrator', 'Guest', 'All'].includes(clean)
            ? 'That name is reserved.'
            : null;
  const reset = () => {
    setName('');
    setDesk(true);
    setConfirm(false);
  };
  return (
    <>
      <BottomSheet visible={visible && !confirm} onClose={() => { reset(); onClose(); }} title="Create role">
        <View style={{ gap: spacing.md }}>
          <LabeledInput label="Role name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Stock Auditor" />
          {problem ? <Text style={s.warn}>{problem}</Text> : null}
          <View style={s.chips}>
            <DecisionChip label="Desk access" selected={desk} onPress={() => setDesk(true)} />
            <DecisionChip label="No desk access" selected={!desk} onPress={() => setDesk(false)} />
          </View>
          <Text style={s.meta}>A new role does nothing until it is put in a role profile and given permissions.</Text>
          <Button label="Review" onPress={() => setConfirm(true)} disabled={!clean || !!problem} />
        </View>
      </BottomSheet>
      {visible && confirm ? (
        <ConfirmSheet
          visible
          onClose={() => setConfirm(false)}
          title={`Create ${clean}?`}
          consequence={`A new role called ${clean} ${desk ? 'with' : 'without'} desk access will be added to the site. Nobody holds it yet.`}
          confirmLabel="Create role"
          onConfirm={async () => {
            await post.roles('create_role', { role_name: clean, desk_access: desk ? 1 : 0 });
            toast.showSuccess(`${clean} created`);
            reset();
            onClose();
            onDone();
          }}
        />
      ) : null}
    </>
  );
}

function AddRoleFlow({ profile, roles, onClose, onDone }: { profile: ProfileRow; roles: RoleRow[]; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const toast = useToast();
  const people = profile.people;
  const free = roles.filter((r) => !r.disabled && !profile.roles.includes(r.name) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));

  if (role) {
    return (
      <ConfirmSheet
        visible
        onClose={() => setRole(null)}
        title={`Add ${role} to ${profile.name}?`}
        consequence={
          people > 0
            ? `This changes ${plural(people, 'person')} right now: everyone on ${profile.name} gets ${role}, and the roles are refreshed in the background. There is no undo from this app; removing a role from a profile is done in Desk.`
            : `Nobody is on ${profile.name} yet, so no one is affected today. Anyone you give it to later will get ${role}.`
        }
        confirmLabel={`Add ${role}`}
        danger={people > 0}
        typeToConfirm={profile.name}
        onConfirm={async () => {
          await post.roles('add_role_to_profile', { role_profile: profile.name, role });
          toast.showSuccess(`${role} added to ${profile.name}`);
          onClose();
          onDone();
        }}
      />
    );
  }
  return (
    <BottomSheet visible onClose={onClose} title={`Add a role to ${profile.name}`} subtitle={people ? `Affects ${plural(people, 'person')}` : 'Nobody is on this profile yet'}>
      <View style={{ gap: spacing.sm }}>
        {people > 0 ? <Notice tone="warn" icon="warning-outline">Every one of the {plural(people, 'person')} on this profile will get the role you pick.</Notice> : null}
        <SearchBox value={q} onChange={setQ} placeholder="Search roles" />
        {free.length === 0 ? <Empty icon="key-outline" title="No roles to add" /> : null}
        {free.slice(0, 60).map((r) => (
          <Pressable key={r.name} onPress={() => setRole(r.name)} accessibilityRole="button" accessibilityLabel={`Pick ${r.name}`} style={({ pressed }) => [s.pick, pressed && { backgroundColor: COLORS.bgMuted }]}>
            <Text style={s.name}>{r.name}</Text>
            <Text style={s.meta}>{plural(r.people, 'person')}</Text>
          </Pressable>
        ))}
        <Text style={s.meta}>System roles such as System Manager are not listed. They are given in Desk.</Text>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  warn: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#92400E' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg },
});
