import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { storage, StorageKeys } from '@/core/storage';
import { followDevHost } from '@/core/api/dev-host';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { clock } from './model';

export type Bubble = { id: string; from_staff: boolean; by: string; text: string; sent_at: string; image?: string | null; state?: 'sending' | 'failed' };

function Attachment({ url }: { url: string }) {
  const [src, setSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (/^https?:/.test(url)) return live && setSrc({ uri: url });
      const [base, cookie] = await Promise.all([storage.get(StorageKeys.instanceUrl), storage.get(StorageKeys.cookie)]);
      if (live && base) setSrc({ uri: followDevHost(base).replace(/\/$/, '') + url, headers: cookie ? { Cookie: cookie } : undefined });
    })().catch(() => {});
    return () => { live = false; };
  }, [url]);
  if (!src) return null;
  return <Image source={src} style={s.img} resizeMode="cover" accessibilityLabel="Attached screenshot" />;
}

export function ChatBubble({ m, onRetry }: { m: Bubble; onRetry?: () => void }) {
  const staff = m.from_staff;
  const failed = m.state === 'failed';
  return (
    <View style={[s.wrap, staff ? s.right : s.left]}>
      {!staff && m.by ? <Text style={s.by}>{m.by}</Text> : null}
      <View
        style={[s.bubble, staff ? s.staff : s.user, failed && s.failed, m.state === 'sending' && { opacity: 0.6 }]}
        accessible
        accessibilityLabel={`${staff ? 'You' : m.by}: ${m.text}. ${failed ? 'Not sent' : clock(m.sent_at)}`}
      >
        {m.image ? <Attachment url={m.image} /> : null}
        {m.text ? <Text style={[s.text, staff && { color: '#fff' }]} selectable>{m.text}</Text> : null}
      </View>
      {failed ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry sending" style={s.retry}>
          <Text style={s.retryT}>Not sent. Tap to retry</Text>
        </Pressable>
      ) : (
        <Text style={s.time}>{m.state === 'sending' ? 'Sending...' : clock(m.sent_at)}{staff && m.by ? ` · ${m.by}` : ''}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { maxWidth: '84%', marginBottom: spacing.md },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  by: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginBottom: 2, marginLeft: spacing.sm },
  bubble: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.sm },
  user: { backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  staff: { backgroundColor: COLORS.text, borderBottomRightRadius: 4 },
  failed: { backgroundColor: COLORS.danger },
  text: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 21 },
  time: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 3, marginHorizontal: spacing.sm },
  img: { width: 220, height: 160, borderRadius: borderRadius.md, backgroundColor: COLORS.bgMuted },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.danger },
});
