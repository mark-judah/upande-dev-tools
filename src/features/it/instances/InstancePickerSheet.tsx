import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { Input } from '@/core/ui/Input';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { useItInstances } from '@/core/it-source/instances-store';
import { findInstance, hostLabel, instanceTitle, type ItInstance } from '@/core/it-source/instances-model';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { InstanceRow } from './InstanceRow';
import { InstanceSignInForm } from './InstanceSignInForm';
import { useInstancePicker } from './picker-ui';

/**
 * The IT instance sheet: every saved instance (the active one checked), switch with one tap, add one, sign in again
 * to an expired one, rename or remove. Mounted once at the root by `InstancePickerHost`.
 */
export function InstancePickerSheet() {
  const open = useInstancePicker((s) => s.open);
  const view = useInstancePicker((s) => s.view);
  const setView = useInstancePicker((s) => s.setView);
  const close = useInstancePicker((s) => s.close);
  const list = useItInstances((s) => s.list);
  const activeId = useItInstances((s) => s.activeId);
  const hydrate = useItInstances((s) => s.hydrate);
  const switchTo = useItInstances((s) => s.switchTo);
  const toast = useToast();

  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  const target = view.kind === 'resign' || view.kind === 'manage' ? findInstance({ list, activeId }, view.id) : null;
  // The instance was removed while its page was open: back to the list.
  useEffect(() => {
    if ((view.kind === 'resign' || view.kind === 'manage') && !target) setView({ kind: 'list' });
  }, [view, target, setView]);

  const pick = async (i: ItInstance) => {
    if (i.status === 'expired') return setView({ kind: 'resign', id: i.id });
    if (i.id === activeId) return close();
    await switchTo(i.id);
    close();
    toast.showSuccess(`Now managing ${instanceTitle(i)}`);
  };

  const done = (i: ItInstance) => {
    close();
    setView({ kind: 'list' });
    toast.showSuccess(`Now managing ${instanceTitle(i)}`);
  };

  const title =
    view.kind === 'add' ? 'Add an IT instance' : view.kind === 'resign' ? 'Sign in again' : view.kind === 'manage' && target ? instanceTitle(target) : 'IT instances';
  const subtitle =
    view.kind === 'list'
      ? 'Users, apps and devices come from the active one'
      : view.kind === 'manage' && target?.nickname
        ? hostLabel(target.url)
        : view.kind === 'resign' && target
          ? instanceTitle(target)
          : undefined;

  return (
    <BottomSheet visible={open} onClose={close} title={title} subtitle={subtitle}>
      {view.kind !== 'list' ? (
        <Pressable onPress={() => setView({ kind: 'list' })} style={s.backRow} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
          <Text style={s.backText}>All instances</Text>
        </Pressable>
      ) : null}

      {view.kind === 'list' ? (
        <View style={{ gap: spacing.sm }}>
          {list.length === 0 ? (
            <Text style={s.empty}>No IT instances yet. Add the site whose users, apps and devices you want to manage.</Text>
          ) : (
            list.map((i) => (
              <InstanceRow key={i.id} instance={i} active={i.id === activeId} onPress={() => void pick(i)} onMenu={() => setView({ kind: 'manage', id: i.id })} />
            ))
          )}
          <Pressable onPress={() => setView({ kind: 'add' })} accessibilityRole="button" style={({ pressed }) => [s.addRow, pressed && { opacity: 0.75 }]}>
            <Ionicons name="add-circle-outline" size={22} color={COLORS.text} />
            <Text style={s.addText}>Add an instance</Text>
          </Pressable>
          <Text style={s.note}>Tasks, requests and deployments always stay on the site you signed in to.</Text>
        </View>
      ) : view.kind === 'add' ? (
        <InstanceSignInForm onDone={done} onCancel={() => setView({ kind: 'list' })} />
      ) : view.kind === 'resign' && target ? (
        <InstanceSignInForm instance={target} onDone={done} onCancel={() => setView({ kind: 'list' })} />
      ) : view.kind === 'manage' && target ? (
        <ManageInstance key={target.id} instance={target} active={target.id === activeId} onSignIn={() => setView({ kind: 'resign', id: target.id })} />
      ) : null}
    </BottomSheet>
  );
}

function ManageInstance({ instance, active, onSignIn }: { instance: ItInstance; active: boolean; onSignIn: () => void }) {
  const rename = useItInstances((s) => s.rename);
  const remove = useItInstances((s) => s.remove);
  const switchTo = useItInstances((s) => s.switchTo);
  const close = useInstancePicker((s) => s.close);
  const setView = useInstancePicker((s) => s.setView);
  const toast = useToast();
  const [name, setName] = useState(instance.nickname ?? '');

  const save = async () => {
    await rename(instance.id, name);
    toast.showSuccess('Name saved');
    setView({ kind: 'list' });
  };

  const confirmRemove = () => {
    close();
    showDialog(
      `Remove ${instanceTitle(instance)}?`,
      `${hostLabel(instance.url)} is removed from this phone with its saved session.${active ? ' The IT screens will ask you to choose another instance.' : ''} You can add it again any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await remove(instance.id);
            setView({ kind: 'list' });
          },
        },
      ],
    );
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Input
        label="Nickname"
        value={name}
        onChangeText={setName}
        placeholder={hostLabel(instance.url)}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        autoCorrect={false}
      />
      <Button label="Save name" onPress={() => void save()} disabled={name.trim() === (instance.nickname ?? '')} />
      <View style={s.divider} />
      {!active && instance.status === 'connected' ? (
        <Action
          icon="swap-horizontal-outline"
          label="Make active"
          onPress={async () => {
            await switchTo(instance.id);
            close();
            toast.showSuccess(`Now managing ${instanceTitle(instance)}`);
          }}
        />
      ) : null}
      <Action icon="log-in-outline" label={instance.status === 'expired' ? 'Sign in again' : 'Sign in with another account'} onPress={onSignIn} />
      <Action icon="trash-outline" label="Remove this instance" onPress={confirmRemove} danger />
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? COLORS.danger : COLORS.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[s.actionLabel, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, paddingVertical: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.textMuted },
  addText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  actionLabel: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md },
});
