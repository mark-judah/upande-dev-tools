import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { mapAxiosError } from '@/core/api/client';
import { useToast } from '@/core/ui/Toast';
import { ItGate } from '../shared/ItGate';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itAccess, itMobile, post } from '../shared/it-api';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { AccessPanel } from './AccessPanel';
import { normalizeAccessDetail } from './access-model';
import { asText } from '@/core/text';
import { ChatBubble, type Bubble } from './ChatBubble';
import { loadReplies, saveReplies } from './canned';
import type { AccessDetail, Convo } from './model';

const POLL_MS = 30000;

type Local = Bubble & { retryText: string };

export function ConversationScreen({ id }: { id: string }) {
  return (
    <ItGate title="Conversation">
      <Thread id={id} />
    </ItGate>
  );
}

function Thread({ id }: { id: string }) {
  const toast = useToast();
  const [convo, setConvo] = useState<Convo | null>(null);
  const [access, setAccess] = useState<AccessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Local[]>([]);
  const [text, setText] = useState('');
  const [replies, setReplies] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftReplies, setDraftReplies] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState<string | null>(null);
  const list = useRef<FlatList<Bubble>>(null);
  const alive = useRef(true);
  const isChat = id.startsWith('chat:');

  const fetchAll = useCallback(async () => {
    try {
      const c = await itMobile<Convo>('conversation', { id });
      if (!alive.current) return;
      setConvo(c);
      setError(null);
      // The server now has what we sent: drop local copies that arrived.
      setLocal((l) => l.filter((m) => m.state === 'failed' || !c.messages.some((x) => x.from_staff && x.text === m.text && x.id !== m.id && c.messages.indexOf(x) >= c.messages.length - 3)));
    } catch (e) {
      if (alive.current) setError(mapAxiosError(e).message);
    }
    if (!isChat) {
      try {
        const a = normalizeAccessDetail(await itAccess<unknown>('detail', { name: id }));
        if (alive.current) setAccess(a);
      } catch {
        if (alive.current) setAccess(null); // not an access request
      }
    }
  }, [id, isChat]);

  // Poll every 30 s while this screen is focused and the app is in the foreground.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      fetchAll();
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => { if (!timer) timer = setInterval(fetchAll, POLL_MS); };
      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
      if (AppState.currentState === 'active') start();
      const sub = AppState.addEventListener('change', (st) => {
        if (st === 'active') { fetchAll(); start(); } else stop();
      });
      return () => { alive.current = false; stop(); sub.remove(); };
    }, [fetchAll]),
  );

  useEffect(() => { loadReplies().then(setReplies); }, []);

  const send = useCallback(async (body: string, tmp?: string) => {
    const key = tmp ?? `local:${Date.now()}`;
    const bubble: Local = { id: key, from_staff: true, by: 'You', text: body, sent_at: new Date().toISOString().replace('T', ' '), state: 'sending', retryText: body };
    setLocal((l) => (tmp ? l.map((m) => (m.id === tmp ? { ...m, state: 'sending' } : m)) : [...l, bubble]));
    try {
      await post.mobile('send', { id, text: body });
      setLocal((l) => l.filter((m) => m.id !== key));
      await fetchAll();
    } catch {
      setLocal((l) => l.map((m) => (m.id === key ? { ...m, state: 'failed' } : m)));
    }
  }, [id, fetchAll]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send(body);
  };

  const messages: Bubble[] = [...(convo?.messages ?? []), ...local];
  const count = messages.length;
  useEffect(() => {
    if (count) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
  }, [count]);

  if (!convo) {
    return error ? (
      <Screen title="Conversation" error={error} onRetry={fetchAll}><View /></Screen>
    ) : (
      <Screen title="Conversation">
        <View style={{ gap: spacing.md }}>
          <Skeleton height={56} radius={borderRadius.md} />
          <Skeleton height={48} width="70%" radius={borderRadius.lg} />
          <Skeleton height={64} width="60%" radius={borderRadius.lg} style={{ alignSelf: 'flex-end' }} />
          <Skeleton height={48} width="75%" radius={borderRadius.lg} />
        </View>
      </Screen>
    );
  }

  const context = [convo.device, convo.os, convo.app_version ? `app ${convo.app_version}` : ''].filter(Boolean).join(' · ');

  return (
    <Screen title={convo.person || 'Conversation'} scroll={false} contentPadded={false}>
      <View style={s.ctx}>
        <Text style={s.subject} numberOfLines={1}>{asText(convo.subject)}{convo.app ? ` · ${asText(convo.app)}` : ''}</Text>
        {context ? (
          <View style={s.ctxRow}>
            <Ionicons name="phone-portrait-outline" size={14} color={COLORS.textMuted} />
            <Text style={s.ctxT} numberOfLines={1}>{context}</Text>
          </View>
        ) : null}
        {convo.statuses.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {convo.statuses.map((st) => (
              <DecisionChip key={st} label={st} selected={convo.status === st} onPress={() => convo.status !== st && setNewStatus(st)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListHeaderComponent={access ? <View style={{ marginHorizontal: -spacing.lg, marginTop: -spacing.md, marginBottom: spacing.md }}><AccessPanel d={access} onChanged={fetchAll} /></View> : undefined}
        ListEmptyComponent={<Text style={s.empty}>No messages yet.</Text>}
        renderItem={({ item }) => (
          <ChatBubble m={item} onRetry={() => { const l = local.find((x) => x.id === item.id); if (l) send(l.retryText, l.id); }} />
        )}
      />

      <View style={s.composerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
          {replies.map((r) => (
            <Pressable key={r} onPress={() => setText((t) => (t ? `${t} ${r}` : r))} accessibilityRole="button" accessibilityLabel={`Quick reply: ${r}`} style={s.quick}>
              <Text style={s.quickT} numberOfLines={1}>{r}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => { setDraftReplies(replies); setEditing(true); }} accessibilityRole="button" accessibilityLabel="Edit quick replies" style={s.quick}>
            <Ionicons name="create-outline" size={16} color={COLORS.text} />
          </Pressable>
        </ScrollView>
        <View style={s.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Reply as you"
            placeholderTextColor={COLORS.textMuted}
            style={s.input}
            multiline
            maxLength={2000}
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={submit}
            accessibilityLabel="Reply"
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send reply"
            accessibilityState={{ disabled: !text.trim() }}
            style={[s.send, !text.trim() && { opacity: 0.35 }]}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ConfirmSheet
        visible={!!newStatus}
        onClose={() => setNewStatus(null)}
        title={`Mark ${newStatus ?? ''}`}
        consequence={`${convo.person}'s conversation "${convo.subject}" changes from ${convo.status} to ${newStatus}.`}
        confirmLabel={`Mark ${newStatus ?? ''}`}
        onConfirm={async () => {
          await post.mobile('set_conversation_status', { id, status: newStatus });
          toast.showSuccess(`Marked ${newStatus}`);
          await fetchAll();
        }}
      />

      <BottomSheet visible={editing} onClose={() => setEditing(false)} title="Quick replies">
        {draftReplies.map((r, i) => (
          <View key={i} style={s.editRow}>
            <TextInput
              value={r}
              onChangeText={(v) => setDraftReplies((d) => d.map((x, j) => (j === i ? v : x)))}
              style={[s.input, { flex: 1 }]}
              multiline
              accessibilityLabel={`Quick reply ${i + 1}`}
            />
            <Pressable onPress={() => setDraftReplies((d) => d.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove reply" style={s.rm}>
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </Pressable>
          </View>
        ))}
        <Button label="Add a reply" variant="outline" iconLeft="add" onPress={() => setDraftReplies((d) => [...d, ''])} />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Save"
          onPress={() => {
            const clean = draftReplies.map((x) => x.trim()).filter(Boolean);
            setReplies(clean);
            saveReplies(clean);
            setEditing(false);
          }}
        />
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  ctx: { backgroundColor: COLORS.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  subject: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  ctxRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctxT: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  chips: { gap: spacing.sm, paddingRight: spacing.lg, alignItems: 'center' },
  empty: { fontFamily: fontFamily.regular, color: COLORS.textMuted, textAlign: 'center', padding: spacing.xl },
  composerWrap: { backgroundColor: COLORS.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, padding: spacing.sm, gap: spacing.sm },
  quick: { minHeight: 44, maxWidth: 220, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, backgroundColor: COLORS.bgMuted, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  quickT: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, backgroundColor: COLORS.surface },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  rm: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
