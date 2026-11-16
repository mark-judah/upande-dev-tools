import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Segmented } from '@/core/ui/Segmented';
import { useLoad } from '@/features/shared/useLoad';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { itPerms, itRoles } from '../shared/it-api';
import { SearchList } from './DoctypePicker';
import { RulesView, type RulesResponse } from './RulesView';
import { UserPerms } from './UserPerms';
import { ErrorBox, ListSkeleton, Tag, TagWrap } from './ui';

type Mode = 'rules' | 'who' | 'users';
type Doc = { rows: { name: string; module: string }[] };

export function PermissionsTab() {
  const [mode, setMode] = useState<Mode>('rules');
  const [doctype, setDoctype] = useState<string | null>(null);

  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[{ value: 'rules', label: 'Doctype rules' }, { value: 'who', label: 'Who can?' }, { value: 'users', label: 'Limits' }]}
      />
      {mode === 'users' ? <UserPerms /> : doctype ? (
        <View style={{ gap: spacing.md }}>
          <Button label="Pick another doctype" variant="outline" iconLeft="swap-horizontal" onPress={() => setDoctype(null)} />
          {mode === 'rules' ? <RulesView key={doctype} doctype={doctype} /> : <WhoCan key={doctype} doctype={doctype} />}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.sub}>
            {mode === 'rules' ? 'Pick a doctype to see and change which roles can do what with it.' : 'Pick a doctype to see which roles reach it and how many people hold them.'}
          </Text>
          <SearchList
            placeholder="Search doctypes, e.g. Sales Invoice"
            emptyBody="Doctypes that hold code, users or permissions are changed in Desk."
            fetch={async (q) => (await itPerms<Doc>('doctypes', { search: q || undefined })).rows.map((d) => ({ name: d.name, hint: d.module }))}
            onPick={setDoctype}
          />
        </View>
      )}
    </View>
  );
}

/** Doctype -> the roles that can read it -> how many people hold each. */
function WhoCan({ doctype }: { doctype: string }) {
  const { data, loading, error, reload } = useLoad(async () => {
    const [rules, roles] = await Promise.all([
      itPerms<RulesResponse>('rules', { doctype }),
      itRoles<{ rows: { name: string; people: number }[] }>('roles'),
    ]);
    return { rules, people: new Map(roles.rows.map((r) => [r.name, r.people])) };
  });
  if (loading && !data) return <ListSkeleton rows={3} height={90} />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const rules = data.rules.rules.filter((r) => r.read && r.permlevel === 0);
  const roleNames = Array.from(new Set(rules.map((r) => r.role)));
  const hasSystem = roleNames.some((r) => !data.people.has(r));
  const total = roleNames.reduce((n, r) => n + (data.people.get(r) ?? 0), 0);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={s.title}>{doctype}</Text>
      <View style={s.tile}>
        <Text style={s.big}>{roleNames.length}</Text>
        <Text style={s.tileText}>roles can read it{hasSystem ? ', plus system roles' : ''}. Up to {total} people hold them, some more than once.</Text>
      </View>
      {roleNames.map((role) => {
        const mine = rules.filter((r) => r.role === role);
        const can = ['write', 'create', 'delete', 'submit', 'cancel'].filter((t) => mine.some((r) => r[t]));
        const n = data.people.get(role);
        return (
          <Card key={role}>
            <View style={{ gap: 6 }}>
              <View style={s.head}>
                <Text style={[s.title, { flex: 1, fontSize: fontSize.md }]} numberOfLines={2}>{role}</Text>
                <Text style={s.sub}>{n === undefined ? 'System role' : `${n} ${n === 1 ? 'person' : 'people'}`}</Text>
              </View>
              <TagWrap>
                <Tag label="read" tone="dark" />
                {can.map((t) => <Tag key={t} label={t} />)}
                {mine.some((r) => r.if_owner) ? <Tag label="own records only" tone="warn" /> : null}
              </TagWrap>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tile: { backgroundColor: COLORS.text, borderRadius: 16, padding: spacing.lg, gap: 4 },
  big: { fontFamily: fontFamily.bold, fontSize: 40, color: '#fff' },
  tileText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: '#D4D4D4' },
});
