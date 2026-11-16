import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Skeleton } from '@/core/ui/Skeleton';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { useToast } from '@/core/ui/Toast';
import { Pill } from '@/features/shared/Pill';
import { useLoad } from '@/features/shared/useLoad';
import { ItGate } from '../shared/ItGate';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itDevices, post } from '../shared/it-api';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { LinkPicker, type PickItem } from './LinkPicker';
import { ago, flagLabel, STATUS, type DeviceFull, type DeviceState, type Tree } from './model';

type Pending =
  | { kind: 'state'; state: DeviceState }
  | { kind: 'asset'; id: string; label: string }
  | { kind: 'custodian'; id: string; label: string }
  | { kind: 'unasset' }
  | { kind: 'uncustodian' }
  | { kind: 'merge'; label: string; ids: string[] }
  | { kind: 'split'; label: string; ids: string[] };

export function DeviceDetailScreen({ id }: { id: string }) {
  return (
    <ItGate title="Device">
      <Detail id={id} />
    </ItGate>
  );
}

function Detail({ id }: { id: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad<Tree>(() => itDevices<Tree>('device_tree', { tests: 1 }));
  const dev = useMemo<DeviceFull | null>(() => {
    for (const m of data?.models ?? []) for (const d of m.devices) if (d.install_ids.includes(id)) return d;
    return null;
  }, [data, id]);

  const [state, setState] = useState<DeviceState | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pick, setPick] = useState<'asset' | 'custodian' | 'merge' | null>(null);

  if (loading && !data) {
    return (
      <Screen title="Device">
        <Skeleton height={150} radius={borderRadius.lg} style={{ marginBottom: spacing.md }} />
        <Skeleton height={220} radius={borderRadius.md} style={{ marginBottom: spacing.md }} />
        <Skeleton height={120} radius={borderRadius.md} />
      </Screen>
    );
  }
  if (!dev) {
    return <Screen title="Device" error={error ?? 'This device is no longer in the fleet.'} onRetry={reload}><View /></Screen>;
  }

  const curState = state ?? dev.state;
  const curNotes = notes ?? dev.notes;
  const st = STATUS[dev.status] ?? STATUS.unknown;
  const ids = dev.install_ids;
  const stateChanged = curState !== dev.state || curNotes !== dev.notes;

  const run = async (p: Pending) => {
    if (p.kind === 'state') {
      await Promise.all(ids.map((i) => post.mobile('set_device', { id: i, state: p.state, notes: curNotes })));
      setState(null); setNotes(null);
    } else if (p.kind === 'asset') await post.devices('link_asset', { install_ids: ids, asset: p.id });
    else if (p.kind === 'custodian') await post.devices('link_custodian', { install_ids: ids, employee: p.id });
    else if (p.kind === 'unasset') await post.devices('unlink_asset', { install_ids: ids });
    else if (p.kind === 'uncustodian') await post.devices('unlink_custodian', { install_ids: ids });
    else if (p.kind === 'merge') await post.devices('merge_devices', { install_ids: ids, into_ids: p.ids });
    else await post.devices('split_device', { install_ids: p.ids });
    toast.showSuccess('Done');
    reload();
  };

  const copy = (p: Pending): { title: string; text: string; label: string; danger?: boolean; type?: string } => {
    const name = `${dev.device} (${dev.owner_name || 'no owner'})`;
    switch (p.kind) {
      case 'state': return p.state === 'Active'
        ? { title: 'Mark active', text: `${name} goes back to Active and the note is saved.`, label: 'Mark active' }
        : { title: `Mark ${p.state.toLowerCase()}`, text: `${name} will be listed as ${p.state}${p.state === 'Retired' ? ' and left out of the active fleet' : ''}. Nothing is locked or wiped. You can change it back.`, label: `Mark ${p.state.toLowerCase()}`, danger: true };
      case 'asset': return { title: 'Link asset', text: `${name} becomes the asset ${p.label}. An asset holds one device; any other link of this device is let go.`, label: 'Link asset' };
      case 'custodian': return { title: 'Set custodian', text: `${p.label} will be recorded as the person who has ${name}.`, label: 'Set custodian' };
      case 'unasset': return { title: 'Unlink asset', text: `${name} will no longer be tied to asset ${dev.asset?.asset_name}.`, label: 'Unlink', danger: true };
      case 'uncustodian': return { title: 'Remove custodian', text: `${dev.custodian?.name} will no longer be recorded as having ${name}.`, label: 'Remove', danger: true };
      case 'merge': return { title: 'Merge devices', text: `Say that ${name} and ${p.label} are the same physical phone. Their installs, people, asset and custodian are combined (the target's custodian wins). Splitting later is possible but manual.`, label: 'Merge', danger: true, type: 'MERGE' };
      default: return { title: 'Split off', text: `${p.label} is taken out of this device and stands on its own again. Its custodian link is cleared.`, label: 'Split off', danger: true };
    }
  };
  const c = pending ? copy(pending) : null;

  return (
    <Screen title={dev.device} onRefresh={reload}>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <Ionicons name={dev.platform === 'ios' ? 'logo-apple' : 'phone-portrait-outline'} size={28} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.heroT} numberOfLines={2}>{dev.device}</Text>
            <Text style={s.heroS}>{dev.owner_name || 'No owner'} · {ago(dev.last_seen)}</Text>
          </View>
        </View>
        <View style={s.heroPills}>
          <Pill label={curState === 'Active' ? st.label : curState} tone={curState === 'Active' ? st.tone : 'danger'} />
          {dev.flags.map((f) => <Pill key={f} label={flagLabel(f)} tone="warn" />)}
        </View>
        <View style={s.stats}>
          <Stat label="Battery" value={dev.battery != null ? `${dev.battery}%` : 'n/a'} bar={dev.battery} />
          <Stat label="Free" value={dev.storage_free_gb != null ? `${dev.storage_free_gb} GB` : 'n/a'} />
          <Stat label="Network" value={dev.network || 'n/a'} />
        </View>
      </View>

      <Card title="Device info">
        <KV k="App" v={`${dev.app} v${dev.app_version || '?'}`} />
        <KV k="OS" v={`${dev.platform} ${dev.os_version}`} />
        <KV k="Build" v={dev.build_number} />
        <KV k="Serial" v={dev.serial_number} mono />
        <KV k="Android ID" v={dev.android_id} mono />
        <KV k="MAC" v={dev.mac_address} mono />
        <KV k="Local IP" v={dev.local_ip} mono />
        <KV k="Seen from IP" v={dev.ip_seen ?? ''} mono />
        <KV k="Apps" v={dev.apps.join(', ')} />
        {dev.ids.map((x) => <KV key={x.key} k={`Install${dev.ids.length > 1 ? ' (' + x.apps[0] + ')' : ''}`} v={x.install_ids.join(', ')} mono />)}
      </Card>

      <Card title={`People (${dev.people.length})`}>
        {dev.people.length === 0 ? <Text style={s.muted}>Nobody has signed in on this device.</Text> : null}
        {dev.people.map((p) => (
          <View key={p.user} style={s.person} accessible accessibilityLabel={`${p.name}, last seen ${ago(p.last_seen)}, ${p.logins} logins`}>
            <View style={s.avatar}><Text style={s.avatarT}>{(p.name || p.user).slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.pName}>{p.name}</Text>
              <Text style={s.muted}>{p.user}</Text>
              <Text style={s.muted}>First {ago(p.first_seen)} · last {ago(p.last_seen)} · {p.logins} login{p.logins === 1 ? '' : 's'}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card title="State and notes">
        <View style={s.chips}>
          {(['Active', 'Lost', 'Retired'] as const).map((x) => <DecisionChip key={x} label={x} selected={curState === x} onPress={() => setState(x)} />)}
        </View>
        <TextInput
          value={curNotes}
          onChangeText={setNotes}
          placeholder="Where it is, who has it, what happened"
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={1000}
          style={s.notes}
          accessibilityLabel="Device notes"
        />
        <Button label="Save state and notes" disabled={!stateChanged} onPress={() => setPending({ kind: 'state', state: curState })} style={{ marginTop: spacing.md }} />
      </Card>

      <Card title="Asset and custodian">
        {data?.links_ready === false ? <Text style={s.muted}>Links are not set up on this site yet (needs a migrate).</Text> : (
          <>
            <LinkLine
              icon="cube-outline" label="Asset"
              value={dev.asset ? `${dev.asset.asset_name}${dev.asset.location ? ' · ' + dev.asset.location : ''}` : null}
              onLink={() => setPick('asset')} onUnlink={() => setPending({ kind: 'unasset' })}
            />
            <LinkLine
              icon="person-circle-outline" label="Custodian"
              value={dev.custodian ? `${dev.custodian.name}${dev.custodian.via === 'asset' ? ' (via asset)' : ''}` : null}
              onLink={() => setPick('custodian')} onUnlink={dev.custodian?.via === 'direct' ? () => setPending({ kind: 'uncustodian' }) : undefined}
            />
          </>
        )}
      </Card>

      <Card title="Duplicates">
        <Text style={s.muted}>The same phone can appear twice after a reinstall or when it runs several apps. Merge such entries into one device, or split a wrong merge.</Text>
        <Button label="Merge with another device" variant="outline" iconLeft="git-merge-outline" onPress={() => setPick('merge')} style={{ marginTop: spacing.md }} />
        {dev.merged ? dev.ids.map((x) => (
          <View key={x.key} style={s.splitRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.pName} numberOfLines={1}>{x.id || x.install_ids[0].slice(0, 8)}</Text>
              <Text style={s.muted} numberOfLines={1}>{x.apps.join(', ')} · {ago(x.last_seen)}</Text>
            </View>
            <Button label="Split off" size="sm" variant="outline" color={COLORS.danger} onPress={() => setPending({ kind: 'split', label: x.id || x.apps.join(', '), ids: x.install_ids })} />
          </View>
        )) : null}
      </Card>

      <LinkPicker
        visible={pick === 'asset'} onClose={() => setPick(null)} title="Link an asset" placeholder="Search assets by name or id"
        fetch={async (q) => (await itDevices<{ rows: { name: string; asset_name: string; location: string; device_id: string }[] }>('find_assets', { search: q })).rows
          .map((a): PickItem => ({ key: a.name, title: a.asset_name || a.name, sub: [a.name, a.location, a.device_id ? 'already linked' : ''].filter(Boolean).join(' · '), value: a }))}
        onPick={(it) => { setPick(null); setPending({ kind: 'asset', id: (it.value as { name: string }).name, label: it.title }); }}
      />
      <LinkPicker
        visible={pick === 'custodian'} onClose={() => setPick(null)} title="Who has this device?" placeholder="Search employees"
        fetch={async (q) => (await itDevices<{ rows: { name: string; employee_name: string; department: string }[] }>('find_custodians', { search: q })).rows
          .map((e): PickItem => ({ key: e.name, title: e.employee_name, sub: [e.name, e.department].filter(Boolean).join(' · '), value: e }))}
        onPick={(it) => { setPick(null); setPending({ kind: 'custodian', id: (it.value as { name: string }).name, label: it.title }); }}
      />
      <LinkPicker
        visible={pick === 'merge'} onClose={() => setPick(null)} title="Merge into which device?" placeholder="Search model, id or person"
        fetch={async (q) => (await itDevices<{ rows: { label: string; sub: string; install_ids: string[] }[] }>('find_devices', { search: q, exclude: ids })).rows
          .map((r): PickItem => ({ key: r.install_ids[0], title: r.label, sub: r.sub, value: r }))}
        onPick={(it) => { setPick(null); setPending({ kind: 'merge', label: it.title, ids: (it.value as { install_ids: string[] }).install_ids }); }}
      />

      {c && pending ? (
        <ConfirmSheet
          visible
          onClose={() => setPending(null)}
          title={c.title}
          consequence={c.text}
          confirmLabel={c.label}
          danger={c.danger}
          typeToConfirm={c.type}
          onConfirm={() => run(pending)}
        />
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number | null }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={s.statL}>{label}</Text>
      <Text style={s.statV}>{value}</Text>
      {bar != null ? <ProgressBar value={bar / 100} scale={1} height={4} trackColor="#404040" fillColor="#fff" /> : null}
    </View>
  );
}

function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.k}>{k}</Text>
      <Text style={[s.v, mono && { fontFamily: 'monospace', fontSize: fontSize.sm }]} selectable>{v}</Text>
    </View>
  );
}

function LinkLine({ icon, label, value, onLink, onUnlink }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null; onLink: () => void; onUnlink?: () => void }) {
  return (
    <View style={s.link}>
      <Ionicons name={icon} size={26} color={COLORS.text} />
      <View style={{ flex: 1 }}>
        <Text style={s.k}>{label}</Text>
        <Text style={s.v}>{value ?? 'Not linked'}</Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Button label={value ? 'Change' : 'Link'} size="sm" variant="outline" onPress={onLink} />
        {value && onUnlink ? <Button label="Unlink" size="sm" variant="ghost" color={COLORS.danger} onPress={onUnlink} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: COLORS.text, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroT: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: '#fff' },
  heroS: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#A3A3A3' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stats: { flexDirection: 'row', gap: spacing.lg },
  stat: { flex: 1, gap: 4 },
  statL: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: 0.4 },
  statV: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#fff' },
  kv: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  k: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  v: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  person: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bgMuted, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  pName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  notes: { minHeight: 80, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.md, padding: spacing.md, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, textAlignVertical: 'top' },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
});
