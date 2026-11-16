import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { ItGate } from '../shared/ItGate';
import { ErrorsSheet } from './ErrorsSheet';
import { fetchHealth, type Health } from './server-api';

type Tone = 'ok' | 'warn' | 'bad' | 'unknown';
type TileData = { key: string; label: string; value: string; sub?: string; tone: Tone; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void };

const TONE_COLOR: Record<Tone, string> = { ok: COLORS.success, warn: COLORS.warn, bad: COLORS.danger, unknown: '#A3A3A3' };
const TONE_WORD: Record<Tone, string> = { ok: 'healthy', warn: 'needs a look', bad: 'needs attention', unknown: 'unknown' };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function size(mb?: number | null): string {
  const v = num(mb);
  return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`;
}

export function buildTiles(h: Health, openErrors: (m: string | null) => void): TileData[] {
  const sched = (h.scheduler_status ?? '').toString();
  const queues = h.queues ?? [];
  const backlog = queues.reduce((a, q) => a + num(q.pending), 0);
  const deepest = queues.reduce((m, q) => (num(q.pending) > num(m?.pending) ? q : m), queues[0]);
  const errs = num(h.total_errors);
  const failMail = num(h.failed_emails);
  const pendMail = num(h.pending_emails);
  const logins = num(h.failed_logins);
  const sock = (h.socketio ?? '').toString();
  return [
    { key: 'sched', label: 'Scheduler', value: sched || 'Unknown', sub: 'background jobs', tone: !sched ? 'unknown' : /active|enabled|on/i.test(sched) && !/in/i.test(sched.slice(0, 2)) ? 'ok' : 'bad', icon: 'timer-outline' },
    { key: 'workers', label: 'Workers', value: String(num(h.background_workers)), sub: 'background workers', tone: h.background_workers == null ? 'unknown' : num(h.background_workers) > 0 ? 'ok' : 'bad', icon: 'hardware-chip-outline' },
    { key: 'queues', label: 'Queues', value: String(backlog), sub: deepest && backlog ? `most in ${deepest.queue}` : 'nothing waiting', tone: backlog === 0 ? 'ok' : backlog < 25 ? 'warn' : 'bad', icon: 'layers-outline' },
    { key: 'jobs', label: 'Failing jobs', value: String(num(h.failing_jobs)), sub: (h.failing_jobs_list?.[0]?.job as string) || 'all scheduled jobs run', tone: num(h.failing_jobs) === 0 ? 'ok' : 'bad', icon: 'alert-circle-outline' },
    { key: 'errors', label: 'Errors', value: String(errs), sub: 'tap for the log', tone: errs === 0 ? 'ok' : errs < 10 ? 'warn' : 'bad', icon: 'bug-outline', onPress: () => openErrors(null) },
    { key: 'mail', label: 'Email queue', value: `${pendMail}`, sub: failMail ? `${failMail} failed` : 'pending, none failed', tone: failMail > 0 ? 'bad' : pendMail > 50 ? 'warn' : 'ok', icon: 'mail-outline' },
    { key: 'sessions', label: 'Active sessions', value: String(num(h.active_sessions)), sub: `${num(h.total_users)} users, ${num(h.new_users)} new`, tone: 'ok', icon: 'people-outline' },
    { key: 'logins', label: 'Failed logins', value: String(logins), sub: 'recent window', tone: logins > 100 ? 'bad' : logins > 20 ? 'warn' : 'ok', icon: 'lock-closed-outline' },
    { key: 'db', label: 'Database', value: size(h.db_storage_mb), sub: h.database_version ? String(h.database_version).split(' ')[0] : 'size on disk', tone: num(h.db_storage_mb) > 51200 ? 'warn' : 'ok', icon: 'server-outline' },
    { key: 'files', label: 'Files', value: size(num(h.public_files_mb) + num(h.private_files_mb)), sub: `public ${size(h.public_files_mb)}, private ${size(h.private_files_mb)}`, tone: 'ok', icon: 'folder-outline' },
    { key: 'backups', label: 'Backups', value: String(num(h.onsite_backups)), sub: `${size(h.backups_size_mb)} on site`, tone: num(h.onsite_backups) === 0 ? 'bad' : 'ok', icon: 'save-outline' },
    { key: 'socket', label: 'Realtime', value: sock ? (/fail|down|error/i.test(sock) ? 'Down' : 'Up') : 'Unchecked', sub: `socket.io${h.cache_memory ? `, cache ${h.cache_memory}` : ''}`, tone: !sock ? 'unknown' : /fail|down|error/i.test(sock) ? 'bad' : 'ok', icon: 'pulse-outline' },
  ];
}

export function ServerScreen() {
  return (
    <ItGate title="Server pulse">
      <Pulse />
    </ItGate>
  );
}

function Pulse() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [sheet, setSheet] = useState<{ method: string | null } | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const h = await fetchHealth();
      if (!alive.current) return;
      if (!h || h.error) {
        setError(h?.error ?? 'The server sent no health report.');
      } else {
        setHealth(h);
        setError(null);
        setUpdated(new Date());
      }
    } catch (e) {
      if (alive.current) setError(mapAxiosError(e).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Poll every minute, but only while this screen is the one being looked at.
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 60000);
      return () => clearInterval(t);
    }, [load]),
  );

  if (loading) {
    return (
      <Screen title="Server pulse">
        <View style={{ gap: spacing.md }}>
          <Skeleton height={92} radius={borderRadius.lg} />
          <View style={s.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={s.cell}><Skeleton height={104} radius={borderRadius.md} /></View>)}</View>
        </View>
      </Screen>
    );
  }
  if (!health) {
    return <Screen title="Server pulse" error={error ?? 'No data'} onRetry={() => { setLoading(true); load(); }}>{null}</Screen>;
  }

  const open = (m: string | null) => setSheet({ method: m });
  const tiles = buildTiles(health, open);
  const bad = tiles.filter((t) => t.tone === 'bad');
  const warn = tiles.filter((t) => t.tone === 'warn');
  const top = (health.top_errors ?? []).filter((e) => e.title);
  const queues = health.queues ?? [];
  const maxQ = Math.max(1, ...queues.map((q) => num(q.pending)));

  return (
    <Screen title="Server pulse" onRefresh={load}>
      <View style={[s.hero, bad.length > 0 && { backgroundColor: '#3B0A0A' }]} accessibilityRole="summary">
        <View style={s.heroTop}>
          <Ionicons name={bad.length ? 'warning' : warn.length ? 'alert-circle' : 'checkmark-circle'} size={30} color={bad.length ? '#FCA5A5' : warn.length ? COLORS.warn : COLORS.success} />
          <Text style={s.heroT}>
            {bad.length ? `${bad.length} ${bad.length === 1 ? 'thing needs' : 'things need'} attention` : warn.length ? 'Mostly fine, keep an eye on it' : 'All systems nominal'}
          </Text>
        </View>
        {[...bad, ...warn].length ? (
          <View style={s.pills}>
            {[...bad, ...warn].map((t) => (
              <View key={t.key} style={s.pill}>
                <View style={[s.dot, { backgroundColor: TONE_COLOR[t.tone] }]} />
                <Text style={s.pillT}>{t.label} {t.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.heroS}>Scheduler, queues, mail, backups and realtime all look healthy.</Text>
        )}
        {error ? <Text style={s.stale}>Last refresh failed: {error}. Showing the previous reading.</Text> : null}
        <Text style={s.heroS}>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, refreshes every minute` : ''}</Text>
      </View>

      <View style={s.grid}>
        {tiles.map((t) => (
          <View key={t.key} style={s.cell}>
            <Tile t={t} />
          </View>
        ))}
      </View>

      {queues.length ? (
        <Card title="Queue depth">
          {queues.map((q) => (
            <View key={q.queue} style={s.qRow}>
              <Text style={s.qL}>{q.queue}</Text>
              <View style={s.qTrack}><View style={[s.qFill, { width: `${Math.max(num(q.pending) ? 6 : 0, (num(q.pending) / maxQ) * 100)}%`, backgroundColor: num(q.pending) > 25 ? COLORS.danger : COLORS.text }]} /></View>
              <Text style={s.qN}>{num(q.pending)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {(health.failing_jobs_list ?? []).length ? (
        <Card title="Failing jobs">
          {(health.failing_jobs_list ?? []).map((j, i) => (
            <View key={i} style={[s.item, i > 0 && s.divider]}>
              <Text style={s.itemT}>{j.job ?? 'Unknown job'}</Text>
              {j.details ? <Text style={s.itemS} numberOfLines={3}>{j.details}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card title="Top errors">
        {top.length ? (
          top.map((e, i) => (
            <Pressable key={e.title + i} onPress={() => open(e.title)} style={[s.err, i > 0 && s.divider]} accessibilityRole="button" accessibilityLabel={`${e.title}, ${num(e.occurrences)} occurrences. Show the errors`}>
              <Text style={s.errT} numberOfLines={2}>{e.title}</Text>
              <View style={s.badge}><Text style={s.badgeT}>{num(e.occurrences)}x</Text></View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </Pressable>
          ))
        ) : (
          <Text style={s.itemS}>No repeating errors reported.</Text>
        )}
        <Button label="Browse the error log" variant="outline" onPress={() => open(null)} style={{ marginTop: spacing.md }} />
      </Card>

      <ErrorsSheet visible={!!sheet} method={sheet?.method ?? null} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function Tile({ t }: { t: TileData }) {
  const bad = t.tone === 'bad';
  const label = `${t.label}: ${t.value}. ${TONE_WORD[t.tone]}. ${t.sub ?? ''}`;
  const body = (
    <>
      <View style={s.tileTop}>
        <Ionicons name={t.icon} size={18} color={bad ? '#FCA5A5' : COLORS.textSecondary} />
        <View style={[s.dot, { backgroundColor: TONE_COLOR[t.tone] }]} />
      </View>
      <Text style={[s.tileV, bad && { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit>{t.value}</Text>
      <Text style={[s.tileL, bad && { color: '#fff' }]} numberOfLines={1}>{t.label}</Text>
      {t.sub ? <Text style={[s.tileS, bad && { color: 'rgba(255,255,255,0.7)' }]} numberOfLines={2}>{t.sub}</Text> : null}
    </>
  );
  const style = [s.tile, bad && { backgroundColor: '#3B0A0A', borderColor: '#3B0A0A' }];
  return t.onPress ? (
    <Pressable onPress={t.onPress} style={style} accessibilityRole="button" accessibilityLabel={label}>{body}</Pressable>
  ) : (
    <View style={style} accessible accessibilityLabel={label}>{body}</View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#171717', borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroT: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: '#fff' },
  heroS: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)' },
  stale: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#FCD34D' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pillT: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#fff' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, marginBottom: spacing.sm },
  cell: { width: '50%', padding: spacing.xs },
  tile: { backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.md, minHeight: 112, gap: 2 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  tileV: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: COLORS.text, lineHeight: 34 },
  tileL: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  tileS: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  qL: { width: 64, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  qTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.bgMuted, overflow: 'hidden' },
  qFill: { height: 8, borderRadius: 4 },
  qN: { width: 36, textAlign: 'right', fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  item: { paddingVertical: spacing.sm, gap: 2 },
  itemT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  itemS: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  err: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  errT: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  badge: { backgroundColor: COLORS.bgMuted, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeT: { fontFamily: fontFamily.semiBold, fontSize: 12, color: COLORS.text },
});
