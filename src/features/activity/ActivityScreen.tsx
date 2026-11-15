import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Skeleton } from '@/core/ui/Skeleton';
import { mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill } from '@/features/shared/Pill';

type Row = {
  name: string;
  activity_time: string;
  activity_type: string;
  title: string;
  description?: string | null;
  status: string;
  source?: string | null;
  performed_by?: string | null;
};
type Page = { rows: Row[]; total: number };

const PAGE = 30;
const TYPES = ['Backup', 'Git Monitor', 'Differences', 'Hooks', 'Error'];
const tone = (s: string) => (s === 'Success' ? 'success' : s === 'Warning' ? 'warn' : s === 'Error' ? 'danger' : 'info');
const rel = (t: string) => {
  const d = new Date(t.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? t : formatDistanceToNow(d, { addSuffix: true });
};

export function ActivityScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const seq = useRef(0);

  const fetchPage = useCallback(async (start: number) => {
    const mine = ++seq.current;
    try {
      const res = await call<Page>('activity_log.get_activity_log', { start, limit: PAGE }, true);
      if (mine !== seq.current) return;
      setRows((prev) => (start === 0 ? res.rows : [...prev, ...res.rows]));
      setTotal(res.total);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(mapAxiosError(e).message);
    } finally {
      if (mine === seq.current) {
        setLoading(false);
        setMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchPage(0), 0);
    return () => clearTimeout(t);
  }, [fetchPage]);

  const reload = useCallback(() => fetchPage(0), [fetchPage]);
  const loadMore = () => {
    setMore(true);
    fetchPage(rows.length);
  };

  const shown = type ? rows.filter((r) => r.activity_type === type) : rows;

  return (
    <Screen title="Activity" error={rows.length === 0 && !loading ? error : null} onRetry={reload} onRefresh={reload}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
        <DecisionChip label="All" selected={type === null} onPress={() => setType(null)} />
        {TYPES.map((t) => <DecisionChip key={t} label={t} selected={type === t} onPress={() => setType(t === type ? null : t)} />)}
      </ScrollView>

      {loading ? (
        <View style={{ gap: spacing.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={70} />)}</View>
      ) : (
        <>
          {shown.length === 0 ? (
            <Card><Text style={s.muted}>{type ? `No ${type} activity loaded yet.` : 'No activity recorded.'}</Text></Card>
          ) : null}
          {shown.map((r) => (
            <Card key={r.name}>
              <View style={s.head}>
                <Text style={s.title} numberOfLines={2}>{r.title}</Text>
                <Pill label={r.status} tone={tone(r.status)} />
              </View>
              {r.description ? <Text style={s.desc} numberOfLines={3}>{r.description}</Text> : null}
              <Text style={s.muted}>
                {r.activity_type} · {rel(r.activity_time)}{r.performed_by ? ` · ${r.performed_by}` : ''}
              </Text>
            </Card>
          ))}
          {rows.length < total ? (
            <Button label={`Load more (${rows.length}/${total})`} onPress={loadMore} loading={more} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  desc: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 4 },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 4 },
});
