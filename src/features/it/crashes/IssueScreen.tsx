import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill } from '@/features/shared/Pill';
import { ItGate } from '../shared/ItGate';
import { useItAccess } from '../shared/useItAccess';
import { ChipRow } from './Chips';
import { CodeBlock } from './StackView';
import { useStatusFlow } from './useStatusFlow';
import {
  ago,
  fetchBreakdown,
  fetchLatest,
  fetchLog,
  fetchPeople,
  fetchProblems,
  KIND_ICON,
  KIND_LABEL,
  parseTs,
  severity,
  STATUS_COLOR,
  type IssueBreakdown,
  type Latest,
  type LogEvent,
  type PersonHit,
  type Problem,
} from './model';

const SECRET = /token|authorization|cookie|secret|password|passwd|api[_-]?key|sid$|signature|bearer/i;

/** The server already scrubs; this is a second net so a header or body field named like a secret is never drawn. */
function redact(v: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET.test(k) ? '[hidden]' : redact(x, depth + 1)]));
  }
  return v;
}

export default function IssueScreen() {
  return (
    <ItGate title="Issue">
      <Detail />
    </ItGate>
  );
}

function Detail() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const sm = useItAccess((st) => st.isSystemManager);
  const [issue, setIssue] = useState<Problem | null>(null);
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [latestErr, setLatestErr] = useState<string | null>(null);
  const [split, setSplit] = useState<IssueBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      const all = await fetchProblems({ status: 'All' });
      const found = all.rows.find((r) => r.name === name) ?? null;
      if (!found) throw new Error('This issue no longer exists.');
      setIssue(found);
      setError(null);
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setLoading(false);
    }
    fetchPeople(name).then((r) => setPeople(r.rows)).catch(() => setPeople([]));
    if (sm) {
      fetchLatest(name).then((r) => { setLatest(r.latest); setLatestErr(null); }).catch((e) => setLatestErr(mapAxiosError(e).message));
      fetchBreakdown(name).then(setSplit).catch(() => setSplit(null));
    }
  }, [name, sm]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const flow = useStatusFlow(sm, (names, to) => {
    if (to) setIssue((i) => (i ? { ...i, status: to } : i));
    load();
  });

  if (loading) {
    return (
      <Screen title="Issue">
        <View style={{ gap: spacing.md }}>
          <Skeleton height={190} radius={borderRadius.lg} />
          <Skeleton height={48} />
          <Skeleton height={120} />
          <Skeleton height={160} />
        </View>
      </Screen>
    );
  }
  if (error || !issue) {
    return <Screen title="Issue" error={error ?? 'Not found'} onRetry={() => { setLoading(true); load(); }}>{null}</Screen>;
  }

  const sev = severity(issue);
  const versions = issue.first_version && issue.first_version !== issue.version ? `${issue.first_version} → ${issue.version}` : issue.version;

  return (
    <Screen title="Issue" onRefresh={load}>
      <View style={[s.hero, issue.kind === 'crash' && { backgroundColor: '#3B0A0A' }]}>
        <View style={s.heroTop}>
          <View style={s.kindDot}>
            <Ionicons name={(KIND_ICON[issue.kind] ?? 'bug') as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
          </View>
          <Text style={s.kindT}>{KIND_LABEL[issue.kind] ?? issue.kind} in {issue.app}</Text>
          <View style={[s.status, { backgroundColor: STATUS_COLOR[issue.status] }]}>
            <Text style={s.statusT}>{issue.status}</Text>
          </View>
        </View>
        <Text style={s.title} selectable>{issue.title}</Text>
        {issue.culprit ? <Text style={s.culprit} selectable numberOfLines={2}>{issue.culprit}</Text> : null}
        <View style={s.stats}>
          <Big n={issue.people} l={issue.people === 1 ? 'person hit' : 'people hit'} />
          <Big n={issue.devices} l="devices" />
          <Big n={issue.times} l="times" />
        </View>
        <Text style={s.when}>
          {versions ? `v${versions}  ·  ` : ''}first {ago(issue.first_seen)}  ·  last {ago(issue.last_seen)}
          {issue.fixed_in ? `  ·  fixed in ${issue.fixed_in}` : ''}
        </Text>
        <Text style={[s.sev, { color: sev.color === '#D4D4D4' ? '#A3A3A3' : '#FCA5A5' }]}>{sev.label}</Text>
      </View>

      <View style={s.actions}>
        {issue.status === 'Open' ? (
          <>
            <Button label="Resolve" onPress={() => flow.ask([issue], 'Resolved')} color="#16A34A" style={{ flex: 1 }} />
            <Button label="Ignore" variant="outline" onPress={() => flow.ask([issue], 'Ignored')} style={{ flex: 1 }} />
          </>
        ) : (
          <Button label="Reopen" onPress={() => flow.ask([issue], 'Open')} style={{ flex: 1 }} />
        )}
      </View>

      <Card title={`Who was hit${people ? ` (${people.length})` : ''}`}>
        {!people ? (
          <Skeleton height={44} />
        ) : !people.length ? (
          <Text style={s.muted}>No signed-in person is attached to these events.</Text>
        ) : (
          people.map((p, i) => (
            <View key={p.user} style={[s.person, i > 0 && s.divider]}>
              <View style={s.avatar}><Text style={s.avatarT}>{(p.name || '?').slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.personN} numberOfLines={1}>{p.name}</Text>
                <Text style={s.muted}>{ago(p.last)}</Text>
              </View>
              <Text style={s.personC}>{p.times}x</Text>
            </View>
          ))
        )}
      </Card>

      {sm && split && (split.by_version.length || split.by_model.length) ? (
        <Card title="Breakdown">
          <Bars title="By app version" rows={split.by_version} />
          <Bars title="By device model" rows={split.by_model} />
        </Card>
      ) : null}

      {sm ? <LatestEvent latest={latest} err={latestErr} /> : null}

      <Events issue={issue} people={people} />

      {flow.sheet}
    </Screen>
  );
}

function Big({ n, l }: { n: number; l: string }) {
  return (
    <View>
      <Text style={s.bigN}>{n}</Text>
      <Text style={s.bigL}>{l}</Text>
    </View>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.sub}>{title}</Text>
      {rows.map((r) => (
        <View key={r.label || 'unknown'} style={s.barRow}>
          <Text style={s.barL} numberOfLines={1}>{r.label || 'Unknown'}</Text>
          <View style={s.barTrack}><View style={[s.barFill, { width: `${Math.max(4, (r.n / max) * 100)}%` }]} /></View>
          <Text style={s.barN}>{r.n}</Text>
        </View>
      ))}
    </View>
  );
}

function LatestEvent({ latest, err }: { latest: Latest | null; err: string | null }) {
  if (err) return <Card title="Latest event"><Text style={s.err}>{err}</Text></Card>;
  if (!latest) return <Card title="Latest event"><Skeleton height={120} /></Card>;
  const request = latest.request && Object.keys(latest.request).length ? JSON.stringify(redact(latest.request), null, 2) : '';
  const crumbs = latest.breadcrumbs ?? [];
  const device = [latest.device_brand, latest.device_model, latest.platform, latest.os_version].filter(Boolean).join(' ');
  return (
    <View>
      <Card title="Latest event">
        {latest.message ? <Text style={s.msg} selectable>{latest.message}</Text> : null}
        <Text style={s.muted}>
          {[latest.user_full_name, device, latest.app_version ? `v${latest.app_version}` : '', latest.screen, ago(latest.ts)].filter(Boolean).join('  ·  ')}
        </Text>
        {latest.fatal ? <View style={{ marginTop: spacing.sm }}><Pill label="Fatal" tone="danger" /></View> : null}
      </Card>
      {latest.stack ? <CodeBlock title="Stack trace" text={String(latest.stack)} /> : <Card><Text style={s.muted}>This event carries no stack trace.</Text></Card>}
      {request ? <CodeBlock title="Request" text={request} maxHeight={220} /> : null}
      {crumbs.length ? (
        <Card title="Breadcrumbs">
          {crumbs.slice(-25).map((c, i) => (
            <View key={i} style={[s.crumb, i > 0 && s.divider]}>
              <Text style={s.crumbType}>{c.type ?? 'log'}</Text>
              <Text style={s.crumbMsg} selectable>{c.message}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** The raw events of this issue, paged, with a people filter, plus a 14-day activity strip. */
function Events({ issue, people }: { issue: Problem; people: PersonHit[] | null }) {
  const [user, setUser] = useState('all');
  const [rows, setRows] = useState<LogEvent[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(10);

  // error_log has no per-issue filter, so page through the app's log and keep this issue's events.
  const pull = useCallback(
    async (from: number, reset: boolean) => {
      setLoading(true);
      setErr(null);
      try {
        let found: LogEvent[] = [];
        let p = from;
        let hasMore = true;
        for (let i = 0; i < 6 && hasMore && found.length < 8; i++, p++) {
          const res = await fetchLog({ app: issue.app, kind: issue.kind, user: user === 'all' ? undefined : user, page: p });
          found = found.concat(res.rows.filter((r) => r.issue === issue.name));
          hasMore = res.more;
        }
        setRows((cur) => (reset ? found : cur.concat(found)));
        setPage(p);
        setMore(hasMore);
      } catch (e) {
        setErr(mapAxiosError(e).message);
      } finally {
        setLoading(false);
      }
    },
    [issue.app, issue.kind, issue.name, user],
  );

  useEffect(() => {
    const t = setTimeout(() => { setShown(10); pull(0, true); }, 0);
    return () => clearTimeout(t);
  }, [pull]);

  const days = useMemo(() => {
    const out: { key: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, n: 0 });
    }
    rows.forEach((r) => {
      const d = parseTs(r.ts);
      const hit = d && out.find((o) => o.key === `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      if (hit) hit.n += 1;
    });
    return out;
  }, [rows]);
  const peak = Math.max(...days.map((d) => d.n), 1);

  return (
    <Card title="Timeline">
      <View style={s.spark} accessibilityLabel="Events in the last 14 days">
        {days.map((d) => (
          <View key={d.key} style={s.sparkCol}>
            <View style={[s.sparkBar, { height: d.n ? Math.max(4, (d.n / peak) * 44) : 2, backgroundColor: d.n ? COLORS.text : COLORS.border }]} />
          </View>
        ))}
      </View>
      <Text style={[s.muted, { marginBottom: spacing.md }]}>Last 14 days, from the events loaded below</Text>
      {people && people.length > 1 ? (
        <View style={{ marginHorizontal: -spacing.lg, marginBottom: spacing.md }}>
          <ChipRow value={user} onChange={setUser} options={[{ value: 'all', label: 'Everyone' }, ...people.map((p) => ({ value: p.user, label: p.name }))]} />
        </View>
      ) : null}
      {rows.slice(0, shown).map((r, i) => (
        <View key={r.id} style={[s.event, i > 0 && s.divider]}>
          <View style={s.eventTop}>
            <Text style={s.eventWho} numberOfLines={1}>{r.person || 'Unknown'}</Text>
            <Text style={s.muted}>{ago(r.ts)}</Text>
          </View>
          <Text style={s.eventMsg} numberOfLines={3}>{r.message || r.title}</Text>
          <Text style={s.muted} numberOfLines={1}>
            {[r.version ? `v${r.version}` : '', r.device, r.platform, r.screen].filter(Boolean).join('  ·  ')}
          </Text>
          {r.stack ? <Text style={s.mono} numberOfLines={3}>{r.stack}</Text> : null}
        </View>
      ))}
      {loading ? <Skeleton height={64} style={{ marginTop: spacing.sm }} /> : null}
      {err ? <Text style={s.err}>{err}</Text> : null}
      {!loading && !err && !rows.length ? <Text style={s.muted}>No events found{more ? ' yet' : ''} for this filter.</Text> : null}
      {!loading && rows.length > shown ? <Button label={`Show more (${rows.length - shown} loaded)`} variant="outline" onPress={() => setShown((n) => n + 10)} style={{ marginTop: spacing.md }} /> : null}
      {!loading && rows.length <= shown && more ? <Button label="Look further back" variant="outline" onPress={() => pull(page, false)} style={{ marginTop: spacing.md }} /> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#171717', borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  kindT: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)' },
  status: { borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 4 },
  statusT: { fontFamily: fontFamily.semiBold, fontSize: 12, color: '#fff' },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: '#fff', lineHeight: 24 },
  culprit: { fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  stats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  bigN: { fontFamily: fontFamily.bold, fontSize: 34, color: '#fff', lineHeight: 38 },
  bigL: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)' },
  when: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)' },
  sev: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
  sub: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textSecondary, marginBottom: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontFamily: fontFamily.semiBold, color: '#fff' },
  personN: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  personC: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  barL: { width: 110, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.bgMuted, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.text },
  barN: { width: 34, textAlign: 'right', fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  msg: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text, marginBottom: spacing.sm },
  crumb: { paddingVertical: spacing.sm, gap: 2 },
  crumbType: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase' },
  crumbMsg: { fontFamily: 'monospace', fontSize: 12, color: COLORS.text },
  spark: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 3, marginBottom: spacing.xs },
  sparkCol: { flex: 1, justifyContent: 'flex-end' },
  sparkBar: { borderRadius: 2 },
  event: { paddingVertical: spacing.md, gap: 2 },
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  eventWho: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  eventMsg: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text },
  mono: { fontFamily: 'monospace', fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
