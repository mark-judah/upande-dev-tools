import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { useToast } from '@/core/ui/Toast';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itPerms, post } from '../shared/it-api';
import { useLoad } from '@/features/shared/useLoad';
import { list } from './helpers';
import { Empty, ErrorBox, ListSkeleton, Notice, SearchBox, Tag } from './ui';

export type Rule = { role: string; permlevel: number; if_owner: number; locked: boolean } & Record<string, number | string | boolean>;
export type RulesResponse = { doctype: string; customised: boolean; submittable: boolean; types: string[]; rules: Rule[]; roles: string[] };

const SUBMIT = ['submit', 'cancel', 'amend'];
const RISKY = ['write', 'create', 'delete', 'submit', 'cancel', 'import'];
const WORDS: Record<string, string> = { select: 'select', read: 'read', write: 'edit', create: 'create', delete: 'delete', submit: 'submit', cancel: 'cancel', amend: 'amend', report: 'run reports on', export: 'export', import: 'import', share: 'share', print: 'print', email: 'email', mask: 'see masked values of' };

const keyOf = (r: Rule, t: string) => `${r.role}|${r.permlevel}|${r.if_owner}|${t}`;
const ruleName = (r: Pick<Rule, 'role' | 'permlevel' | 'if_owner'>) =>
  `${r.role}${r.permlevel ? ` (level ${r.permlevel})` : ''}${r.if_owner ? ' (own records only)' : ''}`;

/** The permission matrix of one doctype: a card per rule with a toggle per permission. Toggles are staged, then applied after one review. */
export function RulesView({ doctype, onChanged }: { doctype: string; onChanged?: () => void }) {
  const { data, loading, error, reload } = useLoad(() => itPerms<RulesResponse>('rules', { doctype }));
  const [staged, setStaged] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Rule | null>(null);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();

  const byKey = useMemo(() => {
    const m = new Map<string, { rule: Rule; type: string }>();
    data?.rules.forEach((r) => data.types.forEach((t) => m.set(keyOf(r, t), { rule: r, type: t })));
    return m;
  }, [data]);

  if (loading && !data) return <ListSkeleton rows={3} height={150} />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const current = (r: Rule, t: string) => {
    const k = keyOf(r, t);
    return k in staged ? staged[k] : !!r[t];
  };
  const toggle = (r: Rule, t: string) => {
    const k = keyOf(r, t);
    setStaged((st) => {
      const next = { ...st };
      if (!!r[t] === !current(r, t)) delete next[k];
      else next[k] = !current(r, t);
      return next;
    });
  };
  const changes = Object.entries(staged).map(([k, on]) => ({ ...byKey.get(k)!, on }));
  const lines = changes.map((c) => `${c.on ? 'Grant' : 'Revoke'}: ${ruleName(c.rule)} can ${c.on ? '' : 'no longer '}${WORDS[c.type] ?? c.type} ${doctype}`);
  const risky = changes.some((c) => c.on && RISKY.includes(c.type));
  const types = data.types.filter((t) => data.submittable || !SUBMIT.includes(t));

  const apply = async () => {
    const todo = [...changes];
    let n = 0;
    try {
      for (const c of todo) {
        await post.perms('set_permission', { doctype, role: c.rule.role, permlevel: c.rule.permlevel, ptype: c.type, value: c.on ? 1 : 0, if_owner: c.rule.if_owner });
        n++;
      }
    } catch (e) {
      // Keep only what was not applied, show the fresh state, then report the failure inline.
      setStaged((st) => {
        const left = { ...st };
        todo.slice(0, n).forEach((c) => delete left[keyOf(c.rule, c.type)]);
        return left;
      });
      reload();
      const msg = (e as { message?: string })?.message;
      throw new Error(`${n} of ${todo.length} applied. ${msg ?? 'The rest failed.'}`);
    }
    setStaged({});
    toast.showSuccess(`${todo.length} permission${todo.length === 1 ? '' : 's'} updated on ${doctype}`);
    reload();
    onChanged?.();
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={s.head}>
        <Text style={s.title} numberOfLines={2}>{doctype}</Text>
        <Tag label={data.customised ? 'Customised' : 'Standard'} tone={data.customised ? 'warn' : 'neutral'} />
      </View>
      {!data.customised ? <Notice icon="information-circle-outline">These are the rules the doctype shipped with. The first change copies them into editable custom rules.</Notice> : null}

      {changes.length ? (
        <View style={s.bar}>
          <Text style={s.barText}>{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Discard" size="sm" variant="outline" color="#fff" onPress={() => setStaged({})} />
            <Pressable onPress={() => setReview(true)} accessibilityRole="button" accessibilityLabel="Review changes" style={s.reviewBtn}>
              <Text style={s.reviewText}>Review</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {data.rules.length === 0 ? <Empty icon="lock-open-outline" title="No rules" body="Nobody has any permission on this doctype yet." /> : null}
      {data.rules.map((r) => (
        <Card key={`${r.role}|${r.permlevel}|${r.if_owner}`}>
          <View style={{ gap: spacing.sm }}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.role} numberOfLines={2}>{r.role}</Text>
                <Text style={s.sub}>{`Level ${r.permlevel}${r.if_owner ? ' · own records only' : ''}`}</Text>
              </View>
              {r.locked ? <Ionicons name="lock-closed" size={16} color={COLORS.textMuted} accessibilityLabel="System role, locked" /> : null}
            </View>
            {r.locked ? <Text style={s.sub}>System role: its permissions are changed in Desk.</Text> : null}
            <View style={s.toggles}>
              {types.map((t) => {
                const on = current(r, t);
                const dirty = keyOf(r, t) in staged;
                return (
                  <Pressable
                    key={t}
                    disabled={r.locked}
                    onPress={() => toggle(r, t)}
                    accessibilityRole="switch"
                    accessibilityLabel={`${r.role} ${t}`}
                    accessibilityState={{ checked: on, disabled: r.locked }}
                    style={[s.toggle, on && s.toggleOn, dirty && s.toggleDirty, r.locked && { opacity: 0.5 }]}
                  >
                    <Ionicons name={on ? 'checkmark' : 'remove'} size={14} color={on ? '#fff' : COLORS.textMuted} />
                    <Text style={[s.toggleText, on && { color: '#fff' }]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!r.locked ? (
              <Button
                label="Remove rule"
                size="sm"
                variant="ghost"
                color={COLORS.danger}
                disabled={data.rules.length <= 1}
                onPress={() => setRemoving(r)}
              />
            ) : null}
            {!r.locked && data.rules.length <= 1 ? <Text style={s.sub}>A doctype needs at least one rule, so the last one stays.</Text> : null}
          </View>
        </Card>
      ))}

      <Button label="Add a rule" variant="outline" iconLeft="add" onPress={() => setAdding(true)} />
      <Button label="Reset to standard" variant="ghost" color={COLORS.danger} disabled={!data.customised} onPress={() => setResetting(true)} />
      {!data.customised ? <Text style={s.sub}>Already standard, nothing to reset.</Text> : null}


      <ConfirmSheet
        visible={review}
        onClose={() => setReview(false)}
        title={`Apply ${changes.length} change${changes.length === 1 ? '' : 's'}?`}
        consequence={`${lines.join('\n')}\n\nThis takes effect for everyone with those roles straight away.`}
        confirmLabel="Apply changes"
        danger={risky}
        onConfirm={apply}
      />
      {adding ? <AddRule data={data} onClose={() => setAdding(false)} onDone={() => { reload(); onChanged?.(); }} /> : null}
      {removing ? (
        <ConfirmSheet
          visible
          onClose={() => setRemoving(null)}
          title="Remove this rule?"
          consequence={`${ruleName(removing)} will lose all access to ${doctype} that this rule gave. Other rules for the same role stay.`}
          confirmLabel="Remove rule"
          danger
          onConfirm={async () => {
            await post.perms('remove_rule', { doctype, role: removing.role, permlevel: removing.permlevel, if_owner: removing.if_owner });
            toast.showSuccess('Rule removed');
            reload();
            onChanged?.();
          }}
        />
      ) : null}
      <ConfirmSheet
        visible={resetting}
        onClose={() => setResetting(false)}
        title={`Reset ${doctype}?`}
        consequence={`Every custom rule on ${doctype} is thrown away and the rules it shipped with come back, including rules for system roles. Anything you added or changed here is lost.`}
        confirmLabel="Reset to standard"
        danger
        typeToConfirm={doctype}
        onConfirm={async () => {
          await post.perms('reset_rules', { doctype });
          setStaged({});
          toast.showSuccess(`${doctype} is back to standard`);
          reload();
          onChanged?.();
        }}
      />
    </View>
  );
}

function AddRule({ data, onClose, onDone }: { data: RulesResponse; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [q, setQ] = useState('');
  const toast = useToast();
  const taken = (r: string, l: number) => data.rules.some((x) => x.role === r && x.permlevel === l && !x.if_owner);
  const roles = data.roles.filter((r) => !q || r.toLowerCase().includes(q.toLowerCase()));

  if (role) {
    return (
      <ConfirmSheet
        visible
        onClose={() => setRole(null)}
        title={`Add ${role}?`}
        consequence={`${role} will be able to read ${data.doctype} at permission level ${level}. It starts as read only; turn on more afterwards. Everyone with this role gets it straight away.`}
        confirmLabel="Add rule"
        onConfirm={async () => {
          await post.perms('add_rule', { doctype: data.doctype, role, permlevel: level });
          toast.showSuccess(`${role} added`);
          onClose();
          onDone();
        }}
      />
    );
  }
  return (
    <BottomSheet visible onClose={onClose} title="Add a rule" subtitle={data.doctype}>
      <View style={{ gap: spacing.sm }}>
        <Text style={s.sub}>Permission level</Text>
        <View style={s.levels}>
          {Array.from({ length: 10 }, (_, i) => <DecisionChip key={i} label={String(i)} selected={level === i} onPress={() => setLevel(i)} />)}
        </View>
        <SearchBox value={q} onChange={setQ} placeholder="Search roles" />
        {roles.length === 0 ? <Empty icon="key-outline" title="No roles match" /> : null}
        {roles.slice(0, 60).map((r) => {
          const t = taken(r, level);
          return (
            <Pressable key={r} disabled={t} onPress={() => setRole(r)} accessibilityRole="button" accessibilityLabel={r} style={({ pressed }) => [s.pick, t && { opacity: 0.5 }, pressed && { backgroundColor: COLORS.bgMuted }]}>
              <Text style={s.role}>{r}</Text>
              {t ? <Text style={s.sub}>Has a rule at level {level}</Text> : null}
            </Pressable>
          );
        })}
        <Text style={s.sub}>System roles ({list(['System Manager', 'Script Manager', 'Administrator'])}) are not listed.</Text>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  role: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  toggleOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  toggleDirty: { borderColor: COLORS.warn, borderWidth: 2 },
  toggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  bar: { backgroundColor: COLORS.text, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  barText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#fff' },
  reviewBtn: { minHeight: 44, minWidth: 110, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  reviewText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg },
});
