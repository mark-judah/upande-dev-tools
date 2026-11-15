import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { BottomSheet } from '@/core/ui/Dialog';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Skeleton } from '@/core/ui/Skeleton';
import { api, mapAxiosError } from '@/core/api/client';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill } from '@/features/shared/Pill';

type Row = {
  name: string;
  snapshot_time: string;
  source_type: string;
  document_name: string;
  module?: string | null;
  app?: string | null;
  changed_since_last_backup: 0 | 1;
  backed_up_by?: string | null;
  version_label?: string | null;
};
type Page = { rows: Row[]; total: number };
type Detail = { script_code?: string | null; content_json?: string | null };

const PAGE = 30;
const SOURCES = ['DocType', 'Server Script', 'Client Script'];
const MAX_CHARS = 6000;
const rel = (t: string) => {
  const d = new Date(t.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? t : formatDistanceToNow(d, { addSuffix: true });
};

export function SnapshotsScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [changedOnly, setChangedOnly] = useState(false);
  const [sel, setSel] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const seq = useRef(0);

  const fetchPage = useCallback(async (start: number) => {
    const mine = ++seq.current;
    try {
      const res = await call<Page>('code_snapshots.get_snapshots', { start, limit: PAGE }, true);
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

  const open = async (r: Row) => {
    setSel(r);
    setDetail(null);
    setDetailErr(null);
    try {
      const res = await api<{ message: Detail }>({
        method: 'GET',
        url: '/api/method/frappe.client.get_value',
        params: {
          doctype: 'Code Backup Snapshot',
          filters: JSON.stringify({ name: r.name }),
          fieldname: JSON.stringify(['script_code', 'content_json']),
        },
      });
      setDetail(res.message ?? {});
    } catch (e) {
      setDetailErr(mapAxiosError(e).message);
    }
  };

  const shown = rows.filter((r) => (!source || r.source_type === source) && (!changedOnly || r.changed_since_last_backup));
  const code = detail ? detail.script_code || detail.content_json || '' : '';
  const truncated = code.length > MAX_CHARS;

  return (
    <Screen title="Snapshots" error={rows.length === 0 && !loading ? error : null} onRetry={reload} onRefresh={reload}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
        <DecisionChip label="All" selected={source === null} onPress={() => setSource(null)} />
        {SOURCES.map((t) => <DecisionChip key={t} label={t} selected={source === t} onPress={() => setSource(t === source ? null : t)} />)}
        <DecisionChip label="Changed only" selected={changedOnly} onPress={() => setChangedOnly((v) => !v)} />
      </ScrollView>

      {loading ? (
        <View style={{ gap: spacing.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={70} />)}</View>
      ) : (
        <>
          {shown.length === 0 ? <Card><Text style={s.muted}>No snapshots match.</Text></Card> : null}
          {shown.map((r) => (
            <Pressable key={r.name} onPress={() => open(r)}>
              <Card>
                <View style={s.head}>
                  <Text style={s.title} numberOfLines={2}>{r.document_name}</Text>
                  {r.changed_since_last_backup ? <Pill label="Changed" tone="warn" /> : <Pill label="Unchanged" />}
                </View>
                <Text style={s.muted}>
                  {r.source_type} · {r.app || r.module || '—'} · {rel(r.snapshot_time)}
                </Text>
              </Card>
            </Pressable>
          ))}
          {rows.length < total ? (
            <Button
              label={`Load more (${rows.length}/${total})`}
              loading={more}
              onPress={() => {
                setMore(true);
                fetchPage(rows.length);
              }}
            />
          ) : null}
        </>
      )}

      <BottomSheet visible={!!sel} onClose={() => setSel(null)} title={sel?.document_name ?? 'Snapshot'}>
        {sel ? (
          <Text style={s.muted}>
            {sel.source_type} · {sel.app || sel.module || '—'} · {sel.snapshot_time.slice(0, 16)}
            {sel.version_label ? ` · ${sel.version_label}` : ''}
            {sel.backed_up_by ? ` · ${sel.backed_up_by}` : ''}
          </Text>
        ) : null}
        {detailErr ? <Text style={s.err}>{detailErr}</Text> : !detail ? <Skeleton height={140} style={{ marginTop: spacing.md }} /> : code ? (
          <View style={s.codeBox}>
            <Text style={s.code} selectable>{truncated ? code.slice(0, MAX_CHARS) : code}</Text>
            {truncated ? <Text style={s.muted}>… truncated ({code.length - MAX_CHARS} more characters)</Text> : null}
          </View>
        ) : (
          <Text style={s.muted}>No code stored for this snapshot.</Text>
        )}
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 4 },
  err: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.danger, marginTop: spacing.md },
  codeBox: { backgroundColor: '#171717', borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  code: { fontFamily: 'monospace', fontSize: 11, color: '#E5E5E5' },
});
