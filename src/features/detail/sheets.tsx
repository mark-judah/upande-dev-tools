import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, addMonths, endOfMonth, format, getDay, nextMonday, startOfMonth } from 'date-fns';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { todayKey } from '@/core/date';
import { Avatar, ChipRow } from './parts';
import type { Person } from './api';

const key = (d: Date) => format(d, 'yyyy-MM-dd');

function Calendar({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()));
  const first = startOfMonth(month);
  const lead = (getDay(first) + 6) % 7; // Monday first
  const days = endOfMonth(month).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayKey();
  return (
    <View>
      <View style={s.monthHead}>
        <Pressable onPress={() => setMonth(addMonths(month, -1))} style={s.nav} accessibilityRole="button" accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </Pressable>
        <Text style={s.monthTitle}>{format(month, 'MMMM yyyy')}</Text>
        <Pressable onPress={() => setMonth(addMonths(month, 1))} style={s.nav} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
        </Pressable>
      </View>
      <View style={s.grid}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={[s.cell, s.dow]}>{d}</Text>
        ))}
        {cells.map((n, i) => {
          if (!n) return <View key={i} style={s.cell} />;
          const k = key(new Date(month.getFullYear(), month.getMonth(), n));
          const on = k === value;
          return (
            <Pressable
              key={i}
              style={s.cell}
              onPress={() => onPick(k)}
              accessibilityRole="button"
              accessibilityLabel={format(new Date(`${k}T00:00:00`), 'EEEE d MMMM')}
              accessibilityState={{ selected: on }}
            >
              <View style={[s.day, on && s.dayOn, !on && k === today && s.dayToday]}>
                <Text style={[s.dayText, on && { color: '#fff' }]}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Quick due dates, a month grid for anything else, and a way to clear it. */
export function DueSheet({ visible, value, onClose, onPick }: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (date: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const now = new Date();
  const quick = [
    { label: 'Today', date: key(now) },
    { label: 'Tomorrow', date: key(addDays(now, 1)) },
    { label: 'Next week', date: key(nextMonday(now)) },
  ];
  const close = () => {
    setPicking(false);
    onClose();
  };
  const choose = (d: string | null) => {
    setPicking(false);
    onPick(d);
  };
  return (
    <BottomSheet visible={visible} onClose={close} title="Due date" subtitle={value ? `Currently ${format(new Date(`${value}T00:00:00`), 'EEE d MMM yyyy')}` : 'No date set'}>
      <ChipRow>
        {quick.map((q) => (
          <DecisionChip key={q.label} label={q.label} selected={value === q.date} onPress={() => choose(q.date)} />
        ))}
        <DecisionChip label="Pick a date" selected={picking} onPress={() => setPicking((v) => !v)} />
      </ChipRow>
      {picking ? <Calendar value={value} onPick={choose} /> : null}
      {value ? <Button label="Clear date" variant="outline" onPress={() => choose(null)} singleLine /> : null}
    </BottomSheet>
  );
}

/** Pick one or more people for a task. The server replaces the whole set. */
export function AssigneeSheet({ visible, people, loading, error, initial, onClose, onSave, onRetry }: {
  visible: boolean;
  people: Person[];
  loading: boolean;
  error: string | null;
  initial: string[];
  onClose: () => void;
  onSave: (emails: string[]) => void;
  onRetry: () => void;
}) {
  const [picked, setPicked] = useState<string[] | null>(null);
  const [q, setQ] = useState('');
  const sel = picked ?? initial;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? people.filter((p) => `${p.full_name} ${p.name}`.toLowerCase().includes(needle)) : people;
    // Selected people first so they are never lost below the fold.
    return [...list].sort((a, b) => Number(sel.includes(b.name)) - Number(sel.includes(a.name))).slice(0, 60);
  }, [people, q, sel]);
  const toggle = (email: string) => setPicked(sel.includes(email) ? sel.filter((e) => e !== email) : [...sel, email]);
  const changed = sel.length > 0 && (sel.length !== initial.length || sel.some((e) => !initial.includes(e)));
  const close = () => {
    setPicked(null);
    setQ('');
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={close} title="Assign to" subtitle="Pick who is doing this. Saving replaces the current assignees.">
      <View style={s.search}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search people"
          placeholderTextColor={COLORS.textMuted}
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search people"
        />
      </View>
      {loading ? <Text style={s.muted}>Loading people...</Text> : null}
      {error ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.muted}>{error}</Text>
          <Button label="Try again" variant="outline" onPress={onRetry} singleLine />
        </View>
      ) : null}
      {shown.map((p) => {
        const on = sel.includes(p.name);
        return (
          <Pressable
            key={p.name}
            onPress={() => toggle(p.name)}
            style={s.person}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={p.full_name || p.name}
          >
            <Avatar name={p.full_name || p.name} />
            <View style={{ flex: 1 }}>
              <Text style={s.personName} numberOfLines={1}>{p.full_name || p.name}</Text>
              <Text style={s.personMail} numberOfLines={1}>{p.name}</Text>
            </View>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? COLORS.text : COLORS.textMuted} />
          </Pressable>
        );
      })}
      {!loading && !error && shown.length === 0 ? <Text style={s.muted}>No one matches &quot;{q}&quot;.</Text> : null}
      <Button label="Save" disabled={!changed} onPress={() => { onSave(sel); setPicked(null); setQ(''); }} singleLine />
    </BottomSheet>
  );
}

export type MenuItem = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean };

/** The header's overflow actions. */
export function MenuSheet({ visible, items, onClose }: { visible: boolean; items: MenuItem[]; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Actions">
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={() => {
            onClose();
            // Let the sheet finish closing before whatever opens next.
            setTimeout(it.onPress, 250);
          }}
          style={s.menuRow}
          accessibilityRole="button"
          accessibilityLabel={it.label}
        >
          <Ionicons name={it.icon} size={22} color={it.danger ? COLORS.danger : COLORS.text} />
          <Text style={[s.menuText, it.danger && { color: COLORS.danger }]} numberOfLines={1}>{it.label}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

/** Edit a request's own words (title and description). Only changed fields are sent. */
export function EditRequestSheet({ visible, title, description, saving, onClose, onSave }: {
  visible: boolean;
  title: string;
  description: string;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { title?: string; description?: string }) => void;
}) {
  const [t, setT] = useState<string | null>(null);
  const [d, setD] = useState<string | null>(null);
  const tv = t ?? title;
  const dv = d ?? description;
  const dirty = (t !== null && t.trim() !== title) || (d !== null && d.trim() !== description.trim());
  const reset = () => { setT(null); setD(null); };
  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose(); }} title="Edit request" busy={saving}>
      <Text style={s.label}>Title</Text>
      <TextInput value={tv} onChangeText={setT} style={s.input} placeholder="Title" placeholderTextColor={COLORS.textMuted} accessibilityLabel="Title" returnKeyType="next" />
      <Text style={s.label}>Description</Text>
      <TextInput
        value={dv}
        onChangeText={setD}
        style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
        multiline
        placeholder="What do you need?"
        placeholderTextColor={COLORS.textMuted}
        accessibilityLabel="Description"
      />
      <Button
        label="Save changes"
        loading={saving}
        disabled={!dirty || !tv.trim()}
        singleLine
        onPress={() => {
          onSave({ ...(t !== null && t.trim() !== title ? { title: t.trim() } : {}), ...(d !== null && d.trim() !== description.trim() ? { description: d.trim() } : {}) });
          reset();
        }}
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  monthTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  dow: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', textAlignVertical: 'center', lineHeight: 44 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: COLORS.text },
  dayToday: { borderWidth: 1, borderColor: COLORS.text },
  dayText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, backgroundColor: COLORS.bgMuted },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  personName: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  personMail: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  menuText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
});
