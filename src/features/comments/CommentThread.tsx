import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { useAuthStore } from '@/core/auth/store';
import { mapAxiosError } from '@/core/api/client';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { addComment, getComments, type Comment } from './comments-api';

type Row = Comment & { pending?: boolean; failed?: boolean };

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim();

/** "just now", "5m ago", "3h ago", "2d ago", else the date. Frappe timestamps are server-local. */
export function relativeTime(creation: string, now = Date.now()): string {
  const t = new Date(creation.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return creation;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
  return new Date(t).toLocaleDateString();
}

/** Comment list and composer for a record. Bump `refreshKey` to reload (pull-to-refresh lives in the parent). */
export function CommentThread({ doctype, name, refreshKey = 0 }: { doctype: string; name: string; refreshKey?: number }) {
  const email = useAuthStore((s) => s.email);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = await getComments(doctype, name);
      if (mine !== seq.current) return;
      // Keep unsent/failed local rows below the server's.
      setRows((prev) => [...list, ...prev.filter((r) => r.pending || r.failed)]);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(mapAxiosError(e).message);
    }
  }, [doctype, name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  const send = async (id: string, body: string) => {
    setRows((prev) => prev.map((r) => (r.name === id ? { ...r, pending: true, failed: false } : r)));
    try {
      await addComment(doctype, name, body);
      setRows((prev) => prev.filter((r) => r.name !== id));
      load();
    } catch {
      setRows((prev) => prev.map((r) => (r.name === id ? { ...r, pending: false, failed: true } : r)));
    }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const id = `local-${Date.now()}`;
    setRows((prev) => [
      ...prev,
      { name: id, content: body, comment_by: email ?? '', full_name: 'You', creation: new Date().toISOString(), pending: true },
    ]);
    setText('');
    send(id, body);
  };

  return (
    <Card title="Comments">
      {error ? <Text style={s.error}>{error}</Text> : null}
      {rows.length === 0 && !error ? <Text style={s.muted}>No comments yet.</Text> : null}
      {rows.map((r) => {
        const mine = !!email && r.comment_by === email;
        return (
          <View key={r.name} style={[s.item, mine ? s.itemMine : s.itemTheirs]}>
            <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs, r.pending && s.dim]}>
              {!mine ? <Text style={s.who}>{r.full_name || r.comment_by}</Text> : null}
              <Text style={[s.body, mine && s.bodyMine]}>{plain(r.content)}</Text>
            </View>
            {r.failed ? (
              <Pressable onPress={() => send(r.name, r.content)} accessibilityRole="button">
                <Text style={s.retry}>Not sent. Tap to retry</Text>
              </Pressable>
            ) : (
              <Text style={s.time}>{r.pending ? 'Sending...' : relativeTime(r.creation)}</Text>
            )}
          </View>
        );
      })}
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder="Write a comment"
        placeholderTextColor={COLORS.textMuted}
        multiline
        maxLength={2000}
      />
      <Button label="Send" onPress={submit} disabled={!text.trim()} />
    </Card>
  );
}

const s = StyleSheet.create({
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.danger, marginBottom: spacing.sm },
  item: { marginBottom: spacing.sm, maxWidth: '85%' },
  itemMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  itemTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  bubbleMine: { backgroundColor: COLORS.primary },
  bubbleTheirs: { backgroundColor: COLORS.bgMuted },
  dim: { opacity: 0.6 },
  who: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary, marginBottom: 2 },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  bodyMine: { color: COLORS.textOnPrimary },
  time: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.danger, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    minHeight: 44,
    maxHeight: 120,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
  },
});
