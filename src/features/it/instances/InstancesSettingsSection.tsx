import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { useToast } from '@/core/ui/Toast';
import { useItInstances } from '@/core/it-source/instances-store';
import { instanceTitle } from '@/core/it-source/instances-model';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { InstanceRow } from './InstanceRow';
import { openInstancePicker } from './picker-ui';

/** The "IT instances" card on the Settings page: the saved instances (tap to switch), add, and manage. */
export function InstancesSettingsSection() {
  const list = useItInstances((s) => s.list);
  const activeId = useItInstances((s) => s.activeId);
  const hydrate = useItInstances((s) => s.hydrate);
  const switchTo = useItInstances((s) => s.switchTo);
  const toast = useToast();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <Card title="IT instances">
      <Text style={s.lead}>The sites whose users, apps and devices you manage from the IT screens. Your tasks and requests stay on the site you signed in to.</Text>
      <View style={{ gap: spacing.sm }}>
        {list.map((i) => (
          <InstanceRow
            key={i.id}
            instance={i}
            active={i.id === activeId}
            onPress={async () => {
              if (i.status === 'expired') return openInstancePicker({ kind: 'resign', id: i.id });
              if (i.id === activeId) return;
              await switchTo(i.id);
              toast.showSuccess(`Now managing ${instanceTitle(i)}`);
            }}
            onMenu={() => openInstancePicker({ kind: 'manage', id: i.id })}
          />
        ))}
        <Pressable onPress={() => openInstancePicker({ kind: 'add' })} accessibilityRole="button" style={({ pressed }) => [s.add, pressed && { opacity: 0.7 }]}>
          <Ionicons name="add-circle-outline" size={22} color={COLORS.text} />
          <Text style={s.addText}>Add an instance</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.md },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  addText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
});
