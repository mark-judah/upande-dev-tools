import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { Input } from '@/core/ui/Input';
import { Segmented } from '@/core/ui/Segmented';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { dutyApi } from './duty-api';
import { formatRange, isOn, requestProblem, slotProblem, slotTitle, weekday, type Person, type RequestType, type Slot, type SlotDraft } from './duty-model';

export type SheetMode = { kind: 'view'; slot: Slot } | { kind: 'request'; slot: Slot } | { kind: 'edit'; slot: Slot | null };

type Props = {
  mode: SheetMode | null;
  onClose: () => void;
  setMode: (m: SheetMode) => void;
  /** Every slot of this duty type (for swaps). */
  slots: Slot[];
  dutyType: string;
  me: string;
  canManage: boolean;
  today: string;
  /** Something changed on the server: reload the rota and requests. */
  onChanged: () => void;
};

/** One sheet for a slot: see who is on it, ask for a swap or cover, or (PM) edit or delete it. */
export function SlotSheet({ mode, onClose, setMode, slots, dutyType, me, canManage, today, onChanged }: Props) {
  const title =
    mode?.kind === 'edit' ? (mode.slot ? 'Edit slot' : 'New slot') : mode?.kind === 'request' ? 'Request a change' : mode ? slotTitle(mode.slot) : '';
  const subtitle = mode && mode.kind !== 'edit' ? rangeText(mode.slot) : undefined;
  return (
    <BottomSheet visible={!!mode} onClose={onClose} title={title} subtitle={subtitle}>
      {mode?.kind === 'view' ? (
        <SlotView slot={mode.slot} me={me} canManage={canManage} today={today} onRequest={() => setMode({ kind: 'request', slot: mode.slot })} onEdit={() => setMode({ kind: 'edit', slot: mode.slot })} onClose={onClose} onChanged={onChanged} />
      ) : mode?.kind === 'request' ? (
        <RequestForm key={mode.slot.name} slot={mode.slot} slots={slots} me={me} canManage={canManage} today={today} onDone={() => { onClose(); onChanged(); }} />
      ) : mode?.kind === 'edit' ? (
        <EditSlotForm key={mode.slot?.name ?? 'new'} slot={mode.slot} dutyType={dutyType} onDone={() => { onClose(); onChanged(); }} />
      ) : null}
    </BottomSheet>
  );
}

function rangeText(s: Slot): string {
  return s.start_date === s.end_date ? `${weekday(s.start_date)} ${formatRange(s.start_date, s.end_date)}` : formatRange(s.start_date, s.end_date);
}

function SlotView({ slot, me, canManage, today, onRequest, onEdit, onClose, onChanged }: { slot: Slot; me: string; canManage: boolean; today: string; onRequest: () => void; onEdit: () => void; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const mine = isOn(slot, me);
  const past = slot.end_date < today;
  const remove = () => {
    onClose();
    showDialog(`Delete ${slotTitle(slot)}?`, 'The slot and its assignments are removed from the rota. Everyone on it is told.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await dutyApi.deleteSlot(slot.name);
            toast.showSuccess('Slot deleted');
            onChanged();
          } catch (e) {
            toast.showError(mapAxiosError(e).message);
          }
        },
      },
    ]);
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={s.label}>On duty</Text>
      {slot.assignees.length === 0 ? <Text style={s.muted}>Nobody assigned yet.</Text> : null}
      {slot.assignees.map((a) => (
        <View key={a.user} style={s.person}>
          <Ionicons name={a.user === me ? 'person' : 'person-outline'} size={18} color={COLORS.text} />
          <Text style={[s.personName, a.user === me && s.bold]}>{a.full_name}{a.user === me ? ' (you)' : ''}</Text>
        </View>
      ))}
      {slot.notes ? <Text style={s.muted}>{slot.notes}</Text> : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {!past && (mine || canManage) ? <Button label={mine ? 'Request a swap or cover' : 'Request a change for someone'} iconLeft="swap-horizontal-outline" onPress={onRequest} /> : null}
        {canManage ? <Button label="Edit slot" variant="outline" iconLeft="create-outline" onPress={onEdit} /> : null}
        {canManage ? <Button label="Delete slot" variant="ghost" color={COLORS.danger} onPress={remove} /> : null}
      </View>
      {!mine && !canManage ? <Text style={s.muted}>Only people on this slot can ask to change it. The PM approves every change.</Text> : null}
    </View>
  );
}

/** Pick a person: search the dev team, tap one. */
function PeoplePicker({ value, onPick, exclude = [], only }: { value: string; onPick: (p: Person) => void; exclude?: string[]; only?: Person[] }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[] | null>(only ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (only) return;
    let live = true;
    const t = setTimeout(() => {
      dutyApi
        .people(q.trim())
        .then((p) => live && setPeople(p))
        .catch((e) => live && setErr(mapAxiosError(e).message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, only]);
  const list = (only ?? people ?? []).filter((p) => !exclude.includes(p.user) && (!only || !q || p.full_name.toLowerCase().includes(q.toLowerCase()))).slice(0, 30);
  return (
    <View>
      {!only || only.length > 6 ? <Input value={q} onChangeText={setQ} placeholder="Search people" autoCorrect={false} autoCapitalize="none" /> : null}
      {err ? <Text style={s.error}>{err}</Text> : null}
      {!only && people === null && !err ? <ActivityIndicator color={COLORS.text} /> : null}
      <View style={s.chips}>
        {list.map((p) => (
          <DecisionChip key={p.user} label={p.full_name} selected={value === p.user} onPress={() => onPick(p)} />
        ))}
        {people && !list.length ? <Text style={s.muted}>Nobody matches.</Text> : null}
      </View>
    </View>
  );
}

function RequestForm({ slot, slots, me, canManage, today, onDone }: { slot: Slot; slots: Slot[]; me: string; canManage: boolean; today: string; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<RequestType>('Swap');
  const [fromUser, setFromUser] = useState(isOn(slot, me) ? me : (slot.assignees[0]?.user ?? ''));
  const [swapSlotName, setSwapSlotName] = useState<string | null>(null);
  const [toUser, setToUser] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swapSlot = slots.find((x) => x.name === swapSlotName) ?? null;
  // Slots worth swapping into: not past, not this one, and not one the leaving person is already on.
  const candidates = useMemo(() => slots.filter((x) => x.end_date >= today && x.name !== slot.name && !isOn(x, fromUser)), [slots, today, slot.name, fromUser]);
  const problem = requestProblem({ type, slot, fromUser, toUser, swapSlot, reason });

  const send = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await dutyApi.requestChange({ slot: slot.name, request_type: type, to_user: toUser, from_user: fromUser, swap_slot: type === 'Swap' ? swapSlot?.name : null, reason: reason.trim() || undefined });
      toast.showSuccess('Request sent to the PM for approval');
      onDone();
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        value={type}
        onChange={(t) => {
          setType(t);
          setToUser('');
          setSwapSlotName(null);
          setError(null);
        }}
        options={[{ value: 'Swap', label: 'Swap slots' }, { value: 'Replace', label: 'Someone covers' }]}
      />
      {canManage && slot.assignees.length > 1 ? (
        <View>
          <Text style={s.label}>Who leaves this slot</Text>
          <PeoplePicker value={fromUser} only={slot.assignees} onPick={(p) => { setFromUser(p.user); setSwapSlotName(null); setToUser(''); }} />
        </View>
      ) : null}
      {type === 'Swap' ? (
        <>
          <Text style={s.label}>Slot to take in return</Text>
          {candidates.length === 0 ? <Text style={s.muted}>No upcoming slot to swap with.</Text> : null}
          <View style={{ gap: spacing.xs }}>
            {candidates.slice(0, 20).map((c) => (
              <Pressable key={c.name} onPress={() => { setSwapSlotName(c.name); setToUser(''); }} accessibilityRole="button" accessibilityState={{ selected: swapSlotName === c.name }} style={[s.slotPick, swapSlotName === c.name && s.slotPickOn]}>
                <Text style={s.slotPickTitle} numberOfLines={1}>{slotTitle(c)}</Text>
                <Text style={s.muted} numberOfLines={1}>{c.label ? `${rangeText(c)} · ` : ''}{c.assignees.map((a) => a.full_name).join(', ') || 'Nobody'}</Text>
              </Pressable>
            ))}
          </View>
          {swapSlot ? (
            <View>
              <Text style={s.label}>Swap with</Text>
              <PeoplePicker value={toUser} only={swapSlot.assignees} exclude={[fromUser]} onPick={(p) => setToUser(p.user)} />
            </View>
          ) : null}
        </>
      ) : (
        <View>
          <Text style={s.label}>Who covers</Text>
          <PeoplePicker value={toUser} exclude={slot.assignees.map((a) => a.user)} onPick={(p) => setToUser(p.user)} />
        </View>
      )}
      <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Travelling that week" maxLength={300} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button label="Send for approval" onPress={send} loading={busy} disabled={!!problem} />
      <Text style={s.muted}>Nothing changes until the PM approves. Everyone involved is notified.</Text>
    </View>
  );
}

function EditSlotForm({ slot, dutyType, onDone }: { slot: Slot | null; dutyType: string; onDone: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(slot?.label ?? '');
  const [start, setStart] = useState(slot?.start_date ?? '');
  const [end, setEnd] = useState(slot?.end_date ?? '');
  const [notes, setNotes] = useState(slot?.notes ?? '');
  const [people, setPeople] = useState<Person[]>(slot?.assignees ?? []);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft: SlotDraft = { name: slot?.name, duty_type: dutyType, label: label.trim(), start_date: start.trim(), end_date: end.trim(), notes: notes.trim(), assignees: people.map((p) => p.user) };
  const problem = slotProblem(draft);

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await dutyApi.saveSlot(draft);
      toast.showSuccess(slot ? 'Slot saved' : 'Slot added');
      onDone();
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Input label="Label (optional)" value={label} onChangeText={setLabel} placeholder="Week 47" maxLength={60} />
      <View style={s.dates}>
        <View style={{ flex: 1 }}>
          <Input label="Start" value={start} onChangeText={(v) => { setStart(v); if (!end || end < v) setEnd(v); }} placeholder="2026-11-16" autoCapitalize="none" autoCorrect={false} maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="End" value={end} onChangeText={setEnd} placeholder="2026-11-22" autoCapitalize="none" autoCorrect={false} maxLength={10} />
        </View>
      </View>
      <Text style={s.label}>On duty</Text>
      <View style={s.chips}>
        {people.map((p) => (
          <Pressable key={p.user} onPress={() => setPeople((cur) => cur.filter((x) => x.user !== p.user))} accessibilityRole="button" accessibilityLabel={`Remove ${p.full_name}`} style={s.tag}>
            <Text style={s.tagText}>{p.full_name}</Text>
            <Ionicons name="close" size={14} color={COLORS.textSecondary} />
          </Pressable>
        ))}
        <Pressable onPress={() => setAdding((v) => !v)} accessibilityRole="button" style={[s.tag, s.tagAdd]}>
          <Ionicons name={adding ? 'chevron-up' : 'add'} size={14} color={COLORS.text} />
          <Text style={s.tagText}>{adding ? 'Done' : 'Add person'}</Text>
        </Pressable>
      </View>
      {adding ? <PeoplePicker value="" exclude={people.map((p) => p.user)} onPick={(p) => setPeople((cur) => [...cur, p])} /> : null}
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={300} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button label={slot ? 'Save slot' : 'Add slot'} onPress={save} loading={busy} disabled={!!problem} />
      {problem && (start || end) ? <Text style={[s.muted, { marginTop: spacing.sm }]}>{problem}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary, marginBottom: spacing.xs },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  personName: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  bold: { fontFamily: fontFamily.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  slotPick: { padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  slotPickOn: { borderColor: COLORS.text, backgroundColor: COLORS.bgMuted },
  slotPickTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  dates: { flexDirection: 'row', gap: spacing.md },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, backgroundColor: COLORS.bgMuted },
  tagAdd: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.textMuted, backgroundColor: COLORS.surface },
  tagText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
});
