import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Row = {
  module_name: string;
  status_message?: string;
  current_branch?: string;
  commits_ahead?: number;
  commits_behind?: number;
  has_uncommitted_changes?: 0 | 1;
  risk_level?: string;
  last_checked_at?: string;
};

type Dash = { apps?: Row[] };

const riskTone = (r?: string) => (r === 'Critical' || r === 'High' ? 'danger' : r === 'Medium' ? 'warn' : 'success');

export function ReposScreen() {
  const { data, loading, error, reload } = useLoad(() => call<Dash>('dashboard.get_dashboard_data', {}, true));
  const rows = data?.apps ?? [];
  return (
    <Screen title="Repos" loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {rows.length === 0 ? (
        <Card><Text style={s.muted}>No repo checks recorded yet.</Text></Card>
      ) : (
        rows.map((r) => (
          <Card key={r.module_name}>
            <View style={s.head}>
              <Text style={s.name}>{r.module_name}</Text>
              <Pill label={r.risk_level ?? 'Low'} tone={riskTone(r.risk_level)} />
            </View>
            <Text style={s.muted}>{r.current_branch ?? '-'} · {r.commits_ahead ?? 0} ahead · {r.commits_behind ?? 0} behind</Text>
            {r.has_uncommitted_changes ? <Pill label="Uncommitted changes" tone="warn" /> : null}
            {r.status_message ? <Text style={s.muted}>{r.status_message}</Text> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: 2 },
});
