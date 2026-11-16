import { useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/core/auth/store';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean; underline?: boolean; href?: string };
type Block =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'h'; spans: Span[] }
  | { kind: 'li'; spans: Span[]; marker: string; depth: number }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'code'; text: string }
  | { kind: 'img'; src: string; alt: string };

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' });
const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Splits plain text into spans so bare URLs become tappable. */
function linkify(text: string, base: Omit<Span, 'text'> = {}): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ ...base, text: text.slice(last, i) });
    out.push({ ...base, text: m[0], href: base.href ?? m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ ...base, text: text.slice(last) });
  return out;
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? '') : '';
};

/** A small HTML subset (what Frappe's text editor emits) to blocks: paragraphs, lists, code, quotes, images. */
export function parseHtml(html: string): Block[] {
  if (!/<[a-z][^>]*>/i.test(html)) {
    const blocks: Block[] = [];
    for (const para of decode(html).split(/\n{2,}/)) {
      if (para.trim()) blocks.push({ kind: 'p', spans: linkify(para.trim()) });
    }
    return blocks;
  }
  const blocks: Block[] = [];
  let spans: Span[] = [];
  const style = { bold: 0, italic: 0, code: 0, strike: 0, underline: 0 };
  let href: string | undefined;
  let inPre = false;
  let pre = '';
  let quote = 0;
  let heading = false;
  const lists: { ordered: boolean; n: number }[] = [];
  let liMarker: string | null = null;

  const flush = () => {
    const trimmed = spans.filter((s) => s.text.length);
    spans = [];
    if (!trimmed.length || !trimmed.some((s) => s.text.trim())) return;
    // Trim the outer whitespace of the block.
    trimmed[0] = { ...trimmed[0], text: trimmed[0].text.replace(/^\s+/, '') };
    const l = trimmed.length - 1;
    trimmed[l] = { ...trimmed[l], text: trimmed[l].text.replace(/\s+$/, '') };
    if (liMarker !== null) blocks.push({ kind: 'li', spans: trimmed, marker: liMarker, depth: Math.max(0, lists.length - 1) });
    else if (heading) blocks.push({ kind: 'h', spans: trimmed });
    else if (quote > 0) blocks.push({ kind: 'quote', spans: trimmed });
    else blocks.push({ kind: 'p', spans: trimmed });
    liMarker = null;
  };

  for (const tok of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (tok[0] !== '<') {
      if (inPre) pre += decode(tok);
      else {
        const text = decode(tok).replace(/\s+/g, ' ');
        const base = { bold: !!style.bold, italic: !!style.italic, code: !!style.code, strike: !!style.strike, underline: !!style.underline, href };
        spans.push(...(href || style.code ? [{ ...base, text }] : linkify(text, base)));
      }
      continue;
    }
    const m = tok.match(/^<\s*(\/)?\s*([a-z0-9]+)/i);
    if (!m) continue;
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    const d = closing ? -1 : 1;
    switch (tag) {
      case 'b': case 'strong': style.bold = Math.max(0, style.bold + d); break;
      case 'i': case 'em': style.italic = Math.max(0, style.italic + d); break;
      case 'u': style.underline = Math.max(0, style.underline + d); break;
      case 's': case 'del': case 'strike': style.strike = Math.max(0, style.strike + d); break;
      case 'code': if (!inPre) style.code = Math.max(0, style.code + d); break;
      case 'a': href = closing ? undefined : attr(tok, 'href') || undefined; break;
      case 'br': if (inPre) pre += '\n'; else spans.push({ text: '\n' }); break;
      case 'pre':
        if (closing) {
          inPre = false;
          if (pre.trim()) blocks.push({ kind: 'code', text: pre.replace(/^\n+|\s+$/g, '') });
          pre = '';
        } else {
          flush();
          inPre = true;
        }
        break;
      case 'ul': case 'ol':
        flush();
        if (closing) lists.pop();
        else lists.push({ ordered: tag === 'ol', n: 0 });
        break;
      case 'li':
        flush();
        if (!closing && lists.length) {
          const top = lists[lists.length - 1];
          top.n += 1;
          liMarker = top.ordered ? `${top.n}.` : '•';
        }
        break;
      case 'blockquote': flush(); quote = Math.max(0, quote + d); break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        flush();
        heading = !closing;
        break;
      case 'p': case 'div': case 'tr': case 'table':
        flush();
        break;
      case 'img': {
        flush();
        const src = attr(tok, 'src');
        if (src) blocks.push({ kind: 'img', src, alt: attr(tok, 'alt') });
        break;
      }
      default: break;
    }
  }
  if (inPre && pre.trim()) blocks.push({ kind: 'code', text: pre.trim() });
  flush();
  return blocks;
}

export const open = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

/** Spans as nested, selectable-friendly Text children. Links are tappable. */
export function Spans({ spans, linkColor = '#1D4ED8' }: { spans: Span[]; linkColor?: string }) {
  return (
    <>
      {spans.map((sp, i) => (
        <Text
          key={i}
          onPress={sp.href ? () => open(sp.href as string) : undefined}
          accessibilityRole={sp.href ? 'link' : undefined}
          style={[
            sp.bold && { fontFamily: fontFamily.semiBold },
            sp.italic && { fontStyle: 'italic' },
            sp.strike && { textDecorationLine: 'line-through' },
            sp.code && s.inlineCode,
            (sp.href || sp.underline) && { textDecorationLine: 'underline' },
            sp.href && { color: linkColor },
          ]}
        >
          {sp.text}
        </Text>
      ))}
    </>
  );
}

/** Text with tappable links, for plain strings such as comments. */
export function LinkText({ text, style, linkColor }: { text: string; style?: object; linkColor?: string }) {
  return (
    <Text selectable style={style}>
      <Spans spans={linkify(text)} linkColor={linkColor} />
    </Text>
  );
}

function ImageBlock({ src, alt }: { src: string; alt: string }) {
  const instance = useAuthStore((st) => st.instanceUrl);
  const [failed, setFailed] = useState(false);
  const url = /^https?:\/\//i.test(src) ? src : src.startsWith('/') && instance ? instance.replace(/\/+$/, '') + src : null;
  if (!url) return <Text style={s.p} selectable>{`[image: ${alt || src}]`}</Text>;
  if (failed) {
    return (
      <Pressable onPress={() => open(url)} style={s.imgLink} accessibilityRole="link" accessibilityLabel={`Open image ${alt}`}>
        <Text style={s.link}>{alt ? `Image: ${alt}` : 'Open image'}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => open(url)} accessibilityRole="imagebutton" accessibilityLabel={alt || 'Open image'}>
      <Image source={{ uri: url }} style={s.img} resizeMode="cover" onError={() => setFailed(true)} />
    </Pressable>
  );
}

/** Renders rich text (HTML or plain) as native Text. Everything is selectable so a stack trace can be copied. */
export function HtmlView({ html }: { html: string }) {
  const blocks = parseHtml(html);
  return (
    <View style={s.wrap}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return <Text key={i} selectable style={s.h}><Spans spans={b.spans} /></Text>;
          case 'li':
            return (
              <View key={i} style={[s.li, { paddingLeft: b.depth * spacing.lg }]}>
                <Text style={s.marker}>{b.marker}</Text>
                <Text selectable style={[s.p, s.flex]}><Spans spans={b.spans} /></Text>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={s.quote}>
                <Text selectable style={s.p}><Spans spans={b.spans} /></Text>
              </View>
            );
          case 'code':
            return (
              <ScrollView key={i} horizontal style={s.codeBox} contentContainerStyle={s.codeContent} showsHorizontalScrollIndicator>
                <Text selectable style={s.codeText}>{b.text}</Text>
              </ScrollView>
            );
          case 'img':
            return <ImageBlock key={i} src={b.src} alt={b.alt} />;
          default:
            return <Text key={i} selectable style={s.p}><Spans spans={b.spans} /></Text>;
        }
      })}
    </View>
  );
}

/** Collapses long content behind "Show more". */
export function Collapsible({ children, maxHeight = 180 }: { children: ReactNode; maxHeight?: number }) {
  const [full, setFull] = useState<number | null>(null);
  const [open_, setOpen] = useState(false);
  const long = full !== null && full > maxHeight + 24;
  return (
    <View>
      <View style={long && !open_ ? { maxHeight, overflow: 'hidden' } : undefined}>
        <View onLayout={(e) => setFull(e.nativeEvent.layout.height)}>{children}</View>
      </View>
      {long ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={s.more}
          accessibilityRole="button"
          accessibilityLabel={open_ ? 'Show less' : 'Show more'}
        >
          <Text style={s.moreText} numberOfLines={1}>{open_ ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  flex: { flex: 1 },
  p: { fontFamily: fontFamily.regular, fontSize: fontSize.md, lineHeight: 22, color: COLORS.text },
  h: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, lineHeight: 22, color: COLORS.text, marginTop: spacing.xs },
  li: { flexDirection: 'row', gap: spacing.sm },
  marker: { fontFamily: fontFamily.regular, fontSize: fontSize.md, lineHeight: 22, color: COLORS.textMuted, minWidth: 16, textAlign: 'right' },
  quote: { borderLeftWidth: 3, borderLeftColor: COLORS.border, paddingLeft: spacing.md },
  inlineCode: { fontFamily: MONO, fontSize: fontSize.sm, backgroundColor: COLORS.bgMuted },
  codeBox: { backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  codeContent: { padding: spacing.md },
  codeText: { fontFamily: MONO, fontSize: fontSize.sm, lineHeight: 19, color: COLORS.text },
  img: { width: '100%', maxWidth: 320, height: 180, borderRadius: borderRadius.sm, backgroundColor: COLORS.bgMuted },
  imgLink: { minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: '#1D4ED8', textDecorationLine: 'underline' },
  more: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: spacing.lg },
  moreText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
});

/** Plain text of a rich-text field, one blank line between blocks (for editing and empty checks). */
export function htmlToText(html: string): string {
  return parseHtml(html)
    .map((b) => (b.kind === 'code' ? b.text : b.kind === 'img' ? '' : b.kind === 'li' ? `${b.marker} ${b.spans.map((x) => x.text).join('')}` : b.spans.map((x) => x.text).join('')))
    .filter(Boolean)
    .join('\n\n');
}
