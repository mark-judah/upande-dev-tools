import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ChipRow } from '../crashes/Chips';
import { CodeBlock } from '../crashes/StackView';
import { ago } from '../crashes/model';
import { fetchErrorLogs, type ErrorLogs } from './server-api';

/** The Error Log list from it_error_logs, optionally narrowed to one failing method (tap a top error). Errors stay inline. */
export function ErrorsSheet({ visible, onClose, method }: { visible: boolean; onClose: () => void; method: string | null }) {
  const [days, setDays] = useState('7');
  const [data, setData] = useState<ErrorLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchErrorLogs(Number(days))
        .then((d) => { if (live) setData(d); })
        .catch((e) => { if (live) setError(mapAxiosError(e).message); })
        .finally(() => { if (live) setLoading(false); });
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [visible, days, tick]);

  const rows = (data?.rows ?? []).filter((r) => !method || r.method === method || r.error.includes(method));
  const denied = data && data.success === false;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={method ? 'Error log' : 'Recent errors'} subtitle={method ?? undefined}>
      <View style={{ marginHorizontal: -spacing.lg, marginBottom: spacing.md }}>
        <ChipRow value={days} onChange={setDays} options={[{ value: '1', label: '24 hours' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
      </View>
      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} />
        </View>
      ) : error ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.err}>{error}</Text>
          <Button label="Try again" variant="outline" onPress={() => setTick((t) => t + 1)} />
        </View>
      ) : denied ? (
        <Text style={s.err}>{data?.error === 'System Manager only' ? 'The server error log needs the System Manager role.' : data?.error ?? 'Not allowed.'}</Text>
      ) : !rows.length ? (
        <Text style={s.muted}>No errors in this window. Quiet is good.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.name} style={s.row}>
            <Pressable onPress={() => setOpenRow(openRow === r.name ? null : r.name)} style={s.head} accessibilityRole="button" accessibilityLabel={`${r.method || 'Error'}, ${ago(r.creation)}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.method} numberOfLines={2}>{r.method || '(no method)'}</Text>
                <Text style={s.muted} numberOfLines={1}>{ago(r.creation)}  ·  {r.owner}</Text>
              </View>
              <Text style={s.chev}>{openRow === r.name ? 'Hide' : 'Open'}</Text>
            </Pressable>
            {openRow === r.name ? <CodeBlock title="Error" text={r.error || '(empty)'} /> : null}
          </View>
        ))
      )}
      {data && !denied && data.total ? <Text style={[s.muted, { marginTop: spacing.md }]}>{data.total} errors in the window, newest 300 listed.</Text> : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  method: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  chev: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary, minWidth: 44, textAlign: 'right' },
});
