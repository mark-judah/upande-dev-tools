import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { EMPTY_FILTERS, filterCount, PRIORITIES, STAGE_ORDER, type Filters } from './model';

export type FilterOptions = {
  projects: { value: string; label: string }[];
  modules: string[];
  tags: string[];
};

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[s.opt, on && s.optOn]}
    >
      <Text style={[s.optText, on && s.optTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      <View style={s.wrap}>{children}</View>
    </View>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterSheet({
  visible,
  onClose,
  filters,
  onChange,
  options,
  resultCount,
}: {
  visible: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  options: FilterOptions;
  resultCount: number;
}) {
  const n = filterCount(filters);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters" subtitle={n ? `${n} active` : 'Narrow down the backlog'}>
      <Group title="Show">
        <Option label="Everyone" on={!filters.mine} onPress={() => onChange({ ...filters, mine: false })} />
        <Option label="Assigned to me" on={filters.mine} onPress={() => onChange({ ...filters, mine: true })} />
      </Group>
      <Group title="Type">
        {['Task', 'Issue', 'Request'].map((t) => (
          <Option key={t} label={t} on={filters.types.includes(t)} onPress={() => onChange({ ...filters, types: toggle(filters.types, t) })} />
        ))}
      </Group>
      <Group title="Priority">
        {PRIORITIES.map((p) => (
          <Option key={p} label={p} on={filters.priorities.includes(p)} onPress={() => onChange({ ...filters, priorities: toggle(filters.priorities, p) })} />
        ))}
      </Group>
      <Group title="Stage (Done is hidden unless chosen)">
        {STAGE_ORDER.map((p) => (
          <Option key={p} label={p} on={filters.stages.includes(p)} onPress={() => onChange({ ...filters, stages: toggle(filters.stages, p) })} />
        ))}
      </Group>
      {options.projects.length > 1 ? (
        <Group title="Project">
          {options.projects.map((p) => (
            <Option key={p.value} label={p.label} on={filters.projects.includes(p.value)} onPress={() => onChange({ ...filters, projects: toggle(filters.projects, p.value) })} />
          ))}
        </Group>
      ) : null}
      {options.modules.length ? (
        <Group title="Module">
          {options.modules.map((m) => (
            <Option key={m} label={m} on={filters.modules.includes(m)} onPress={() => onChange({ ...filters, modules: toggle(filters.modules, m) })} />
          ))}
        </Group>
      ) : null}
      {options.tags.length ? (
        <Group title="Tag">
          {options.tags.map((t) => (
            <Option key={t} label={t} on={filters.tags.includes(t)} onPress={() => onChange({ ...filters, tags: toggle(filters.tags, t) })} />
          ))}
        </Group>
      ) : null}
      <View style={s.footer}>
        <Button label="Clear" variant="outline" onPress={() => onChange(EMPTY_FILTERS)} disabled={n === 0} style={{ flex: 1 }} />
        <Button label={`Show ${resultCount}`} onPress={onClose} style={{ flex: 2 }} />
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  group: { marginBottom: spacing.lg },
  groupTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  opt: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: 220,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  optOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  optText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  optTextOn: { color: '#fff' },
  footer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
