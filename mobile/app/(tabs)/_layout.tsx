import { Tabs } from 'expo-router';
import { BottomNav, type TabKey } from '@/components/BottomNav';
import { colors } from '@/theme/tokens';

/** Bottom tabs from the handoff: Home · Systems · Simulate · Compare · Forecast. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, emitter, navigateToTab }) => (
        <BottomNav
          active={state.routes[state.index].name as TabKey}
          onSelect={(key) => {
            const route = state.routes.find((r) => r.name === key);
            if (!route) return;
            const focused = state.routes[state.index].key === route.key;
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          }}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="systems" options={{ title: 'Systems' }} />
      <Tabs.Screen name="simulate" options={{ title: 'Simulate' }} />
      <Tabs.Screen name="compare" options={{ title: 'Compare' }} />
      <Tabs.Screen name="forecast" options={{ title: 'Forecast' }} />
    </Tabs>
  );
}
