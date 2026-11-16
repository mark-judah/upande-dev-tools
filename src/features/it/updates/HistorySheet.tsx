import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { itMobile } from '@/features/it/shared/it-api';
import { fmtDate } from '@/features/it/home/ui';

type Rem = { user: string; app: string; kind: string; sent_by: string; sent_at: string; delivered: number | boolean; installed_version: string; target_version: string };

export function HistorySheet({ visible, onClose, app }: { visible: boolean; onClose: () => void; app?: string }) {
  const [n, setN] = useState(0);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Reminder history" subtitle="The last 60 pushes sent from here">
      {visible ? <HistoryBody key={n} app={app} onRetry={() => setN(n + 1)} /> : null}
    </BottomSheet>
  );
}

function HistoryBody({ app, onRetry }: { app?: string; onRetry: () => void }) {
  const [rows, setRows] = useState<Rem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    itMobile<{ rows: Rem[] }>('reminders', { app: app || undefined, limit: 60 })
      .then((r) => live && setRows(r.rows))
      .catch((e) => live && setErr(mapAxiosError(e).message));
    return () => { live = false; };
  }, [app]);

  return (
    <>
      {err ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.err} accessibilityRole="alert">{err}</Text>
          <Button label="Try again" variant="outline" onPress={onRetry} />
        </View>
      ) : !rows ? (
        <View style={{ gap: spacing.sm }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)}</View>
      ) : rows.length === 0 ? (
        <Text style={s.sub}>No reminders have been sent yet.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={s.row} accessible accessibilityLabel={`${r.user} reminded ${fmtDate(r.sent_at)} ${r.delivered ? 'delivered' : 'not delivered'}`}>
            <Ionicons name={r.delivered ? 'checkmark-circle' : 'close-circle'} size={20} color={r.delivered ? '#16A34A' : COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{r.user}</Text>
              <Text style={s.sub} numberOfLines={1}>{r.app.replace(/^Upande /, '')} · v{r.installed_version || '?'} to v{r.target_version || '?'} · {fmtDate(r.sent_at)} · by {r.sent_by}</Text>
            </View>
          </View>
        ))
      )}
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
});
