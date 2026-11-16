import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { useToast } from '@/core/ui/Toast';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Copy where the platform allows it (web), otherwise hand the text to the share sheet. */
export async function copyText(text: string): Promise<'copied' | 'shared'> {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
  if (Platform.OS === 'web' && nav?.clipboard) {
    await nav.clipboard.writeText(text);
    return 'copied';
  }
  await Share.share({ message: text });
  return 'shared';
}

/** A dark, monospace code block that scrolls sideways, with copy and share. Content is already scrubbed server-side. */
export function CodeBlock({ title, text, maxHeight = 260 }: { title: string; text: string; maxHeight?: number }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const lines = text.split('\n');
  const long = lines.length > 12;

  const copy = async () => {
    try {
      const r = await copyText(text);
      if (r === 'copied') toast.showSuccess(`${title} copied`);
    } catch {
      toast.showError('Could not copy');
    }
  };
  const share = () => Share.share({ message: text }).catch(() => {});

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={s.title}>{title}</Text>
        <View style={s.actions}>
          <Pressable onPress={copy} style={s.icon} accessibilityRole="button" accessibilityLabel={`Copy ${title}`}>
            <Ionicons name="copy-outline" size={18} color="#E5E5E5" />
          </Pressable>
          <Pressable onPress={share} style={s.icon} accessibilityRole="button" accessibilityLabel={`Share ${title}`}>
            <Ionicons name="share-outline" size={18} color="#E5E5E5" />
          </Pressable>
        </View>
      </View>
      <ScrollView style={{ maxHeight: open ? undefined : maxHeight }} nestedScrollEnabled>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
            {lines.map((l, i) => (
              <Text key={i} style={[s.code, /^\s*(at |File )/.test(l) ? s.frame : null, i === 0 ? s.first : null]}>
                {l || ' '}
              </Text>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
      {long ? (
        <Pressable onPress={() => setOpen((o) => !o)} style={s.more} accessibilityRole="button">
          <Text style={s.moreText}>{open ? 'Collapse' : `Show all ${lines.length} lines`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#0A0A0A', borderRadius: borderRadius.md, overflow: 'hidden', marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, minHeight: 44 },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: 0.6 },
  actions: { flexDirection: 'row' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  code: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: '#D4D4D4' },
  frame: { color: '#9CA3AF' },
  first: { color: '#FCA5A5' },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#262626' },
  moreText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#E5E5E5' },
});
