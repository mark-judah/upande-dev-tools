import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { useToast } from '@/core/ui/Toast';
import { useLoad } from '@/features/shared/useLoad';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itPerms, itUsers, post } from '../shared/it-api';
import { SearchList } from './DoctypePicker';
import type { UsersResponse } from './helpers';
import { Empty, ErrorBox, ListSkeleton, SearchBox, Tag, TagWrap } from './ui';

type UP = { name: string; user: string; full_name: string; allow: string; for_value: string; all_doctypes: number; applicable_for: string; is_default: number; locked: boolean };

export function UserPerms() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<UP | null>(null);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, loading, error, reload } = useLoad(() => itPerms<{ rows: UP[] }>('user_permissions', { search: q || undefined }));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={s.sub}>A user permission limits a person to certain records, for example one company or one farm, on top of their roles.</Text>
      <Button label="Add user permission" iconLeft="add" onPress={() => setAdding(true)} />
      <SearchBox value={search} onChange={setSearch} placeholder="Search person, doctype or value" />
      {loading && !data ? <ListSkeleton rows={4} height={80} /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.rows.length === 0 ? <Empty icon="funnel-outline" title="No user permissions" body={q ? 'Nothing matches the search.' : 'Nobody is limited to specific records.'} /> : null}
      {data?.rows.map((r) => (
        <Card key={r.name}>
          <View style={s.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.title} numberOfLines={1}>{r.full_name}</Text>
              <Text style={s.sub} numberOfLines={1}>{r.user}</Text>
              <Text style={s.body}>{r.allow}: {r.for_value}</Text>
              <TagWrap>
                <Tag label={r.all_doctypes ? 'All doctypes' : `Only ${r.applicable_for}`} />
                {r.is_default ? <Tag label="Default" tone="dark" /> : null}
              </TagWrap>
            </View>
            {r.locked ? (
              <Ionicons name="lock-closed" size={16} color={COLORS.textMuted} accessibilityLabel="Read only, manage in Desk" />
            ) : (
              <Pressable onPress={() => setRemoving(r)} accessibilityRole="button" accessibilityLabel={`Remove ${r.allow} ${r.for_value} for ${r.full_name}`} style={s.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              </Pressable>
            )}
          </View>
        </Card>
      ))}

      {adding ? <AddUserPerm onClose={() => setAdding(false)} onDone={reload} /> : null}
      {removing ? (
        <ConfirmSheet
          visible
          onClose={() => setRemoving(null)}
          title="Remove this limit?"
          consequence={`${removing.full_name} will no longer be limited to ${removing.allow} ${removing.for_value}. If this was their only ${removing.allow} limit, they can see every ${removing.allow} record their roles allow.`}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await post.perms('remove_user_permission', { name: removing.name });
            toast.showSuccess('User permission removed');
            reload();
          }}
        />
      ) : null}
    </View>
  );
}

type Step = 'form' | 'user' | 'allow' | 'value' | 'applicable';

function AddUserPerm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('form');
  const [user, setUser] = useState<{ name: string; full: string } | null>(null);
  const [allow, setAllow] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [allDoctypes, setAll] = useState(true);
  const [applicable, setApplicable] = useState<string | null>(null);
  const [isDefault, setDefault] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  const ready = !!user && !!allow && !!value && (allDoctypes || !!applicable);

  if (confirm && user && allow && value) {
    return (
      <ConfirmSheet
        visible
        onClose={() => setConfirm(false)}
        title="Limit this person?"
        consequence={`${user.full}${user.full !== user.name ? ` (${user.name})` : ''} will only see ${allow} ${value}${allDoctypes ? ' everywhere it is used' : ` on ${applicable}`}. They lose sight of other ${allow} records.${isDefault ? ` ${value} also becomes their default.` : ''}`}
        confirmLabel="Add limit"
        onConfirm={async () => {
          await post.perms('add_user_permission', {
            user: user.name, allow, for_value: value, apply_to_all_doctypes: allDoctypes ? 1 : 0,
            applicable_for: allDoctypes ? undefined : applicable, is_default: isDefault ? 1 : 0,
          });
          toast.showSuccess('User permission added');
          onClose();
          onDone();
        }}
      />
    );
  }

  const back = () => setStep('form');
  const title = step === 'form' ? 'Add user permission' : step === 'user' ? 'Pick a person' : step === 'allow' ? 'Pick a doctype' : step === 'value' ? `Pick a ${allow}` : 'Applies to';

  return (
    <BottomSheet visible onClose={step === 'form' ? onClose : back} title={title}>
      {step === 'form' ? (
        <View style={{ gap: spacing.md }}>
          <Field label="Person" value={user ? `${user.full} (${user.name})` : null} onPress={() => setStep('user')} />
          <Field label="Limit which doctype" value={allow} onPress={() => setStep('allow')} />
          <Field label="To this record" value={value} disabled={!allow} onPress={() => setStep('value')} />
          <View style={s.chips}>
            <DecisionChip label="Apply to all doctypes" selected={allDoctypes} onPress={() => setAll(true)} />
            <DecisionChip label="Only one doctype" selected={!allDoctypes} disabled={!allow} onPress={() => { setAll(false); setStep('applicable'); }} />
          </View>
          {!allDoctypes ? <Field label="Applies to" value={applicable} onPress={() => setStep('applicable')} /> : null}
          <View style={s.chips}>
            <DecisionChip label={isDefault ? 'Default: yes' : 'Default: no'} selected={isDefault} onPress={() => setDefault((d) => !d)} />
          </View>
          <Button label="Review" disabled={!ready} onPress={() => setConfirm(true)} />
        </View>
      ) : null}
      {step === 'user' ? (
        <SearchList
          placeholder="Search people"
          emptyBody="People who hold system roles are managed in Desk and are not listed."
          fetch={async (q) => {
            const r = await itUsers<UsersResponse>('users', { search: q || undefined, status: 'active' });
            return r.rows.filter((u) => !u.locked).slice(0, 40).map((u) => ({ name: u.name, hint: u.full_name }));
          }}
          onPick={(n, hint) => { setUser({ name: n, full: hint || n }); setStep('form'); }}
        />
      ) : null}
      {step === 'allow' ? (
        <SearchList
          placeholder="Search doctypes"
          fetch={async (q) => (await itPerms<{ rows: { name: string; module: string }[] }>('linkable_doctypes', { search: q || undefined })).rows.map((d) => ({ name: d.name, hint: d.module }))}
          onPick={(n) => { setAllow(n); setValue(null); setApplicable(null); setStep('form'); }}
        />
      ) : null}
      {step === 'value' && allow ? (
        <SearchList
          placeholder={`Search ${allow}`}
          fetch={async (q) => (await itPerms<{ rows: string[] }>('link_values', { doctype: allow, search: q || undefined })).rows.map((n) => ({ name: n }))}
          onPick={(n) => { setValue(n); setStep('form'); }}
        />
      ) : null}
      {step === 'applicable' && allow ? (
        <SearchList
          placeholder="Search doctypes"
          fetch={async (q) => (await itPerms<{ rows: string[] }>('applicable_doctypes', { allow })).rows.filter((n) => !q || n.toLowerCase().includes(q.toLowerCase())).map((n) => ({ name: n }))}
          onPick={(n) => { setApplicable(n); setAll(false); setStep('form'); }}
        />
      ) : null}
    </BottomSheet>
  );
}

function Field({ label, value, onPress, disabled }: { label: string; value: string | null; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? 'not chosen'}`} style={[s.field, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.sub}>{label}</Text>
        <Text style={s.title} numberOfLines={1}>{value ?? 'Choose'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg },
});
