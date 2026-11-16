import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { setStatus, type IssueStatus, type Problem } from './model';

type Ask = { items: Problem[]; target: IssueStatus };

/**
 * Every status change in Crashlytics goes through here: a confirm (with the fixed-in version for
 * System Managers resolving one issue; type-to-confirm for big bulk closes), the writes, and an
 * Undo toast that puts each issue back to the status it had.
 */
export function useStatusFlow(sm: boolean, onChanged: (names: string[], status: IssueStatus | null) => void) {
  const toast = useToast();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((items: Problem[], target: IssueStatus) => {
    if (!items.length) return;
    setVersion(items.length === 1 ? items[0].version : '');
    setError(null);
    setAsk({ items, target });
  }, []);

  const apply = useCallback(
    async (items: Problem[], target: IssueStatus, ver?: string) => {
      const failed: string[] = [];
      const done: Problem[] = [];
      for (let i = 0; i < items.length; i += 5) {
        const chunk = items.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map((p) => setStatus(p.name, target, sm, ver)));
        results.forEach((r, j) => (r.status === 'fulfilled' ? done.push(chunk[j]) : failed.push(mapAxiosError(r.reason).message)));
      }
      if (done.length) onChanged(done.map((p) => p.name), target);
      if (failed.length) {
        if (!done.length) throw new Error(failed[0]);
        throw new Error(`${done.length} changed, ${failed.length} failed: ${failed[0]}`);
      }
      return done;
    },
    [sm, onChanged],
  );

  const undo = useCallback(
    async (done: Problem[]) => {
      try {
        // Each issue goes back to what it was; Open ones are the common case.
        for (const p of done) await setStatus(p.name, p.status, sm, p.fixed_in || undefined);
        onChanged(done.map((p) => p.name), null);
        toast.showInfo(done.length === 1 ? 'Put back' : `${done.length} put back`);
      } catch (e) {
        toast.showError(mapAxiosError(e).message);
      }
    },
    [sm, onChanged, toast],
  );

  const confirm = useCallback(async () => {
    if (!ask) return;
    setBusy(true);
    setError(null);
    try {
      const done = await apply(ask.items, ask.target, version.trim() || undefined);
      const verb = ask.target === 'Resolved' ? 'Resolved' : ask.target === 'Ignored' ? 'Ignored' : 'Reopened';
      toast.showSuccess(done.length === 1 ? `${verb}: ${done[0].title.slice(0, 40)}` : `${verb} ${done.length} issues`, {
        action: { label: 'Undo', onPress: () => undo(done) },
      });
      setAsk(null);
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  }, [ask, apply, version, toast, undo]);

  const close = () => (busy ? undefined : setAsk(null));

  let sheet: ReactNode = null;
  if (ask) {
    const n = ask.items.length;
    const one = ask.items[0];
    const noun = n === 1 ? `"${one.title.slice(0, 70)}"` : `${n} issues`;
    const hit = ask.items.reduce((a, p) => a + p.people, 0);
    if (ask.target === 'Resolved' && sm && n === 1) {
      sheet = (
        <BottomSheet visible onClose={close} title="Resolve issue" subtitle={one.app} busy={busy}>
          <Text style={s.body}>
            {noun} will be marked Resolved. {one.people} {one.people === 1 ? 'person' : 'people'} hit it so far; it reopens if it comes back.
          </Text>
          <LabeledInput label="Fixed in version" value={version} onChangeText={setVersion} autoCapitalize="none" autoCorrect={false} placeholder={one.version || 'e.g. 1.2.3'} />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button label="Resolve" onPress={confirm} loading={busy} color={COLORS.success} />
            <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
          </View>
        </BottomSheet>
      );
    } else {
      const consequence =
        ask.target === 'Resolved'
          ? `${noun} will be marked Resolved${n > 1 ? `. Together they hit ${hit} people` : ''}. You can undo this right after.`
          : ask.target === 'Ignored'
            ? `${noun} will be Ignored: known and accepted, hidden from the Open inbox. You can undo this right after.`
            : `${noun} will be reopened.`;
      sheet = (
        <ConfirmSheet
          visible
          onClose={() => setAsk(null)}
          title={`${ask.target === 'Open' ? 'Reopen' : ask.target === 'Resolved' ? 'Resolve' : 'Ignore'} ${n > 1 ? `${n} issues` : 'issue'}`}
          consequence={consequence}
          confirmLabel={n > 1 ? `${ask.target === 'Resolved' ? 'Resolve' : ask.target === 'Ignored' ? 'Ignore' : 'Reopen'} ${n}` : ask.target === 'Open' ? 'Reopen' : ask.target === 'Resolved' ? 'Resolve' : 'Ignore'}
          typeToConfirm={n > 10 ? String(n) : undefined}
          onConfirm={async () => {
            const done = await apply(ask.items, ask.target);
            const verb = ask.target === 'Resolved' ? 'Resolved' : ask.target === 'Ignored' ? 'Ignored' : 'Reopened';
            toast.showSuccess(done.length === 1 ? `${verb}: ${done[0].title.slice(0, 40)}` : `${verb} ${done.length} issues`, {
              action: { label: 'Undo', onPress: () => undo(done) },
            });
          }}
        />
      );
    }
  }

  return { ask: open, sheet };
}

const s = StyleSheet.create({
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22, marginBottom: spacing.md },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger, marginTop: spacing.sm },
});
