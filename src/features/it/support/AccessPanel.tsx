import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { mapAxiosError } from '@/core/api/client';
import { Pill } from '@/features/shared/Pill';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { post } from '../shared/it-api';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { defaultRole, type AccessDetail } from './access-model';

/** A request for access to a doctype: what was asked, what the person has, and Grant / Decline. */
export function AccessPanel({ d, onChanged }: { d: AccessDetail; onChanged: () => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [grant, setGrant] = useState(false);
  const [decline, setDecline] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // `role` null = not touched yet (use the default), '' = a new role. Only roles that cover everything can be used:
  // the server's grant refuses a role that gives less than what was asked.
  const through = role === null ? defaultRole(d.suggested) : role || null;
  const chosen = d.suggested.find((x) => x.role === through) ?? null;
  const partial = d.suggested.filter((x) => !x.all);
  const rolesText = through ? `the existing role ${through}` : `a new role ${d.new_role}${d.new_role_exists ? ' (already exists)' : ''}`;

  const doDecline = async () => {
    setBusy(true);
    setErr(null);
    try {
      await post.access('decline', { name: d.id, note: note.trim() });
      setDecline(false);
      setNote('');
      onChanged();
    } catch (e) {
      setErr(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
      <View style={s.head}>
        <Ionicons name="key-outline" size={22} color={COLORS.text} />
        <Text style={s.title}>Access request</Text>
        <View style={{ flex: 1 }} />
        <Pill label={d.closed ? d.status : 'Waiting for you'} tone={d.closed ? 'neutral' : 'warn'} />
      </View>
      <Text style={s.line}><Text style={s.b}>{d.person}</Text> asked for access to <Text style={s.b}>{d.doctype}</Text>{d.document ? ` (${d.document})` : ''}.</Text>
      {d.reason ? <Text style={s.reason}>{`"${d.reason}"`}</Text> : null}

      <Text style={s.label}>Permissions asked</Text>
      <View style={s.pills}>
        {d.asked.map((p) => (
          <View key={p} style={[s.perm, d.have[p] ? s.permHave : s.permLack]} accessibilityLabel={`${p}: ${d.have[p] ? 'already has' : 'lacking'}`}>
            <Ionicons name={d.have[p] ? 'checkmark-circle' : 'close-circle'} size={14} color={d.have[p] ? '#166534' : '#991B1B'} />
            <Text style={[s.permT, { color: d.have[p] ? '#166534' : '#991B1B' }]}>{p}</Text>
          </View>
        ))}
      </View>
      <Text style={s.hint}>{d.lacking.length ? `Lacking: ${d.lacking.join(', ')}` : 'They already have everything asked.'}</Text>

      <Text style={s.label}>Has now</Text>
      <Text style={s.hint}>{d.profiles_now.length ? `Profiles: ${d.profiles_now.join(', ')}. ` : 'No role profile. '}{d.roles_now.length} roles{!d.enabled ? '. Account is disabled.' : '.'}</Text>

      {d.refusal ? (
        <Text style={[s.hint, { color: COLORS.danger, marginTop: spacing.sm }]}>{d.refusal}</Text>
      ) : null}

      {!d.closed && !d.refusal ? (
        <>
          <Text style={s.label}>Give it through</Text>
          <View style={s.pills}>
            {d.suggested.filter((x) => x.all).map((x) => <DecisionChip key={x.role} label={x.role} selected={through === x.role} onPress={() => setRole(x.role)} />)}
            <DecisionChip label={`New: ${d.new_role}`} selected={!through} onPress={() => setRole('')} />
          </View>
          <Text style={s.hint}>
            {chosen
              ? `${chosen.role} covers everything needed${chosen.gives.length ? `: ${chosen.gives.join(', ')}` : ''}.`
              : `A role made for ${d.doctype}${d.new_role_exists ? ' (it already exists and gets the missing permissions)' : ''}, giving exactly what was asked.`}
          </Text>
          {partial.length ? (
            <Text style={s.hint}>
              {`Only part of it: ${partial.slice(0, 4).map((x) => `${x.role} (${x.gives.join(', ') || 'some'})`).join('; ')}${partial.length > 4 ? ` and ${partial.length - 4} more` : ''}.`}
            </Text>
          ) : null}
        </>
      ) : null}

      {!d.closed ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {!d.refusal ? <Button label="Grant exactly what was asked" iconLeft="shield-checkmark-outline" onPress={() => setGrant(true)} /> : null}
          <Button label="Decline" variant="outline" color={COLORS.danger} onPress={() => { setErr(null); setDecline(true); }} />
        </View>
      ) : null}

      <ConfirmSheet
        visible={grant}
        onClose={() => setGrant(false)}
        title="Grant access"
        consequence={`${d.person} (${d.user}) will get ${d.asked.join(', ')} on ${d.doctype}, through ${rolesText}, added as a role profile. The request closes as Resolved and ${d.person} is told.`}
        confirmLabel="Grant access"
        onConfirm={async () => {
          await post.access('grant', { name: d.id, ptypes: d.asked, role: through || undefined });
          onChanged();
        }}
      />

      <BottomSheet visible={decline} onClose={() => setDecline(false)} title="Decline request" busy={busy}>
        <Text style={s.line}>{d.person} will not get access to {d.doctype}. The request closes and they see your note.</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Why not (optional)"
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          style={s.note}
          accessibilityLabel="Reason for declining"
        />
        {err ? <Text style={s.err}>{err}</Text> : null}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button label="Decline request" color={COLORS.danger} loading={busy} onPress={doDecline} />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setDecline(false)} />
        </View>
      </BottomSheet>
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  line: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
  b: { fontFamily: fontFamily.semiBold },
  reason: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.md, marginBottom: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  perm: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  permHave: { backgroundColor: '#F0FDF4' },
  permLack: { backgroundColor: '#FEF2F2' },
  permT: { fontFamily: fontFamily.medium, fontSize: fontSize.sm },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: spacing.xs },
  note: { minHeight: 80, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, textAlignVertical: 'top' },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger, marginTop: spacing.sm },
});
