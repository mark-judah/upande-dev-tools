import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { Pill } from '@/features/shared/Pill';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { itMobile, mobileApi, post } from '@/features/it/shared/it-api';
import { useItAccess } from '@/features/it/shared/useItAccess';
import { fmtDate, go, Note, SectionTitle } from '@/features/it/home/ui';
import { useCountdown } from '@/features/it/home/useLive';
import type { AppRow, Installer, NoteBlock, Overview, Release } from './types';

const BUCKET: Record<string, { label: string; tone: 'success' | 'warn' | 'danger' | 'neutral' }> = {
  current: { label: 'Current', tone: 'success' },
  forgot: { label: 'Needs reopen', tone: 'warn' },
  cant_update: { label: 'Needs install', tone: 'danger' },
  away: { label: 'Away', tone: 'neutral' },
  unknown: { label: 'Unknown', tone: 'neutral' },
};
const SHOW = 30;

const flat = (nodes?: { v?: string }[]) => (nodes ?? []).map((n) => n.v ?? '').join('');
function notesText(blocks: NoteBlock[]): { text: string; head?: boolean }[] {
  const out: { text: string; head?: boolean }[] = [];
  for (const b of blocks) {
    if (b.t === 'ul') (b.items ?? []).forEach((i) => out.push({ text: `•  ${flat(i)}` }));
    else if (b.t === 'h') out.push({ text: flat(b.inline), head: true });
    else out.push({ text: flat(b.inline) });
  }
  return out
    .map((l) => ({ ...l, text: l.text.replace(/^_(.*)_$/, '$1') }))
    .filter((l) => l.text.trim() && l.text.trim() !== '---');
}

function ReleaseItem({ r, last }: { r: Release; last: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = notesText(r.notes).filter((l) => !(l.head && l.text.trim() === r.tag));
  const shown = open ? lines : lines.slice(0, 3);
  return (
    <View style={s.rel}>
      <View style={s.rail}>
        <View style={[s.dot, r.latest && { backgroundColor: COLORS.success, borderColor: COLORS.success }]} />
        {!last ? <View style={s.line} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: spacing.lg }}>
        <View style={s.relHead}>
          <Text style={s.relTag}>{r.tag}</Text>
          <Pill label={r.kind === 'apk' ? 'APK' : 'OTA'} tone={r.kind === 'apk' ? 'info' : 'neutral'} />
          {r.latest ? <Pill label="Latest" tone="success" /> : null}
        </View>
        <Text style={s.relMeta}>{fmtDate(r.published_at)}{r.apk_size ? ` · ${(r.apk_size / 1048576).toFixed(1)} MB` : ''}</Text>
        {shown.map((l, i) => <Text key={i} style={l.head ? s.noteHead : s.noteLine}>{l.text}</Text>)}
        {lines.length > 3 ? (
          <Pressable onPress={() => setOpen(!open)} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={open ? 'Show less' : 'Show what is new'}>
            <Text style={s.more}>{open ? 'Show less' : `Show all ${lines.length} lines`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AppSheet({ row, onClose, onChanged }: { row: AppRow | null; onClose: () => void; onChanged: () => void }) {
  return (
    <BottomSheet visible={!!row} onClose={onClose} title={row?.app ?? ''} subtitle={row ? `${row.version ? 'v' + row.version : 'No version'} · ${row.people} people · ${row.adoption ?? '—'}% on latest` : undefined}>
      {row ? <AppBody key={row.app} row={row} onClose={onClose} onChanged={onChanged} /> : null}
    </BottomSheet>
  );
}

function AppBody({ row, onClose, onChanged }: { row: AppRow; onClose: () => void; onChanged: () => void }) {
  const isSm = useItAccess((x) => x.isSystemManager);
  const [people, setPeople] = useState<Installer[] | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [oErr, setOErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rErr, setRErr] = useState<string | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const left = useCountdown(until);
  const name = row.app;

  const loadOverview = async (app: string) => {
    try {
      setOv(await mobileApi<Overview>('monitor.app_overview', { app }));
      setOErr(null);
    } catch (e) {
      setOErr(mapAxiosError(e).message);
    }
  };

  useEffect(() => {
    if (!name) return;
    let live = true;
    itMobile<{ people: Installer[] }>('installers', { app: name })
      .then((r) => live && setPeople(r.people))
      .catch((e) => live && setPErr(mapAxiosError(e).message));
    if (isSm) {
      mobileApi<Overview>('monitor.app_overview', { app: name })
        .then((o) => live && setOv(o))
        .catch((e) => live && setOErr(mapAxiosError(e).message));
    }
    return () => { live = false; };
  }, [name, isSm]);

  const doRefresh = async () => {
    if (!name) return;
    setBusy(true); setRErr(null);
    try {
      const r = await post.mobileApi<{ refreshed: boolean; retry_in: number }>('monitor.refresh_app', { app: name });
      setUntil(Date.now() + r.retry_in * 1000);
      setConfirm(false);
      if (r.refreshed) { await loadOverview(name); onChanged(); }
    } catch (e) {
      setRErr(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const behind = (people ?? []).filter((p) => p.bucket === 'forgot' || p.bucket === 'cant_update').length;
  const list = all ? people ?? [] : (people ?? []).slice(0, SHOW);

  return (
    <>
      {behind > 0 ? (
        <Button label={`Chase ${behind} behind`} variant="outline" iconLeft="notifications-outline" onPress={() => { onClose(); go(`/it/updates?app=${encodeURIComponent(row.app)}`); }} />
      ) : null}

      <SectionTitle>Release timeline</SectionTitle>
      {!isSm ? (
        <Note>Release history, what is new and Refresh are hidden. They need the System Manager role. Who installed it is below.</Note>
      ) : oErr ? (
        <Text style={s.err} accessibilityRole="alert">{oErr}</Text>
      ) : !ov ? (
        <View style={{ gap: spacing.sm }}><Skeleton height={56} /><Skeleton height={56} /></View>
      ) : (
        <>
          <Text style={s.sum}>{ov.version.summary}</Text>
          {ov.github.error ? <Text style={s.err}>GitHub said: {ov.github.error}</Text> : null}
          {!ov.github.repo_set ? <Note>No GitHub repository is set for this app, so there is no release history.</Note> : ov.github.releases.length === 0 ? <Note>No releases found yet.</Note> : (
            <View style={{ marginTop: spacing.md }}>
              {ov.github.releases.slice(0, 12).map((r, i, a) => <ReleaseItem key={r.tag} r={r} last={i === a.length - 1} />)}
            </View>
          )}
          {confirm ? (
            <View style={s.confirm}>
              <Text style={s.confirmT}>Re-read {row.app} from GitHub now?</Text>
              <Text style={s.confirmB}>It fetches the newest OTA and APK and recalculates who is behind. Allowed once a minute per app.</Text>
              {rErr ? <Text style={s.err} accessibilityRole="alert">{rErr}</Text> : null}
              <Button label="Refresh now" onPress={doRefresh} loading={busy} />
              <Button label="Cancel" variant="ghost" onPress={() => { setConfirm(false); setRErr(null); }} disabled={busy} />
            </View>
          ) : (
            <Button label={left > 0 ? `Refresh again in ${left}s` : 'Refresh from GitHub'} variant="outline" iconLeft="refresh" disabled={left > 0} onPress={() => setConfirm(true)} />
          )}
          {!confirm && rErr ? <Text style={s.err}>{rErr}</Text> : null}
        </>
      )}

      <SectionTitle>Who installed it</SectionTitle>
      {pErr ? <Text style={s.err} accessibilityRole="alert">{pErr}</Text> : !people ? (
        <View style={{ gap: spacing.sm }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={52} />)}</View>
      ) : people.length === 0 ? (
        <Note>Nobody has installed this app yet.</Note>
      ) : (
        <>
          {list.map((p) => {
            const b = BUCKET[p.bucket] ?? BUCKET.unknown;
            return (
              <View key={p.user} style={s.person} accessible accessibilityLabel={`${p.name}, version ${p.version || 'unknown'}, ${b.label}`}>
                <Ionicons name="person-circle-outline" size={28} color={COLORS.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pName} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.pSub} numberOfLines={1}>v{p.version || '?'} · {p.device || 'device unknown'}{p.team ? ` · ${p.team}` : ''}</Text>
                </View>
                <Pill label={b.label} tone={b.tone} />
              </View>
            );
          })}
          {people.length > SHOW && !all ? <Button label={`Show all ${people.length}`} variant="ghost" onPress={() => setAll(true)} /> : null}
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  rel: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: COLORS.text, backgroundColor: COLORS.surface, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: COLORS.border, marginTop: 2 },
  relHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  relTag: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  relMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginBottom: 4 },
  noteHead: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginTop: 4 },
  noteLine: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, lineHeight: 19 },
  more: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textDecorationLine: 'underline' },
  sum: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger, marginVertical: spacing.sm },
  confirm: { backgroundColor: COLORS.bgMuted, borderRadius: 10, padding: spacing.md, gap: spacing.sm },
  confirmT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  confirmB: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, paddingVertical: spacing.xs },
  pName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  pSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
