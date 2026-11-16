import { StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, fontFamily } from '@/core/theme';
import { useCaptureUi } from '@/features/capture/capture-ui';
import { useCaptureQueue } from '@/features/capture/capture-queue';

type Icon = keyof typeof Ionicons.glyphMap;

const tabIcon = (name: Icon, outline: Icon) =>
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? name : outline} size={24} color={color as string} />;
  };

function CaptureIcon() {
  return (
    <View style={s.capture}>
      <Ionicons name="add" size={30} color="#fff" />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const setOpen = useCaptureUi((st) => st.setOpen);
  const queued = useCaptureQueue((st) => st.queue.length);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.text,
        tabBarInactiveTintColor: '#8A8A8A',
        tabBarLabelStyle: { fontFamily: fontFamily.medium, fontSize: 11 },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('sunny', 'sunny-outline') }} />
      <Tabs.Screen name="backlog" options={{ title: 'Work', tabBarIcon: tabIcon('list', 'list-outline') }} />
      <Tabs.Screen
        name="capture"
        options={{
          title: 'Capture',
          tabBarLabel: () => null,
          tabBarIcon: () => <CaptureIcon />,
          tabBarBadge: queued > 0 ? queued : undefined,
          tabBarAccessibilityLabel: queued > 0 ? `Capture, ${queued} waiting to sync` : 'Capture',
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault(); // it is a button, not a screen
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setOpen(true);
          },
        }}
      />
      <Tabs.Screen name="deployments" options={{ title: 'Ship', tabBarIcon: tabIcon('rocket', 'rocket-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('menu', 'menu-outline') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  capture: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
