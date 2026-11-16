import { useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { COLORS, spacing } from '@/core/theme';
import { CommentComposer, CommentList, useComments } from '@/features/comments/CommentThread';
import { DetailSkeleton, ErrorState } from './parts';

/** Overflow button for the header. */
export function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={s.menu} accessibilityRole="button" accessibilityLabel="More actions">
      <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.text} />
    </Pressable>
  );
}

/**
 * The shared page: header, a pull-to-refresh scroll view with the record, the comment thread, and the composer
 * pinned at the bottom. Screen's non-scroll body sits in a KeyboardAvoidingView, so the composer rides the keyboard.
 */
export function DetailLayout({ doctype, name, title, headerRight, hasData, loading, error, onRetry, onRefresh, footer, children }: {
  doctype: 'Task' | 'Request';
  name: string;
  title: string;
  headerRight?: ReactNode;
  hasData: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => Promise<void>;
  /** Primary action, shown above the composer. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const [refreshing, setRefreshing] = useState(false);
  const thread = useComments(doctype, name, () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150));
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([onRefresh(), thread.reload()]);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <Screen title={title} scroll={false} contentPadded={false} headerRight={headerRight}>
      <View style={s.fill}>
        {!hasData && error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          <ScrollView
            ref={scroll}
            style={s.fill}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
          >
            {!hasData && loading ? (
              <DetailSkeleton />
            ) : (
              <>
                {children}
                <CommentList thread={thread} />
              </>
            )}
          </ScrollView>
        )}
        {hasData && footer ? <View style={s.footer}>{footer}</View> : null}
        {hasData ? <CommentComposer thread={thread} /> : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  menu: { width: 44, height: 44, marginRight: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: COLORS.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
});
