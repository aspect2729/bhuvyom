import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FutureIcon, HomeIcon, LabIcon } from '@/components/TabIcons';
import { GlassPill } from '@/components/GlassPill';
import { colors, fonts } from '@/theme/tokens';

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color: focused ? colors.text : 'rgba(242,242,242,0.62)' }]}>
        {label}
      </Text>
      {focused ? <View style={styles.indicator} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottom = 12 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom,
          height: 64,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarBackground: () => <GlassPill style={styles.tabGlass} />,
        tabBarShowLabel: true,
        tabBarItemStyle: {
          height: 60,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <HomeIcon color={focused ? colors.text : 'rgba(242,242,242,0.62)'} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="lab"
        options={{
          title: 'Sim Lab',
          tabBarIcon: ({ focused }) => (
            <LabIcon color={focused ? colors.text : 'rgba(242,242,242,0.62)'} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Sim Lab" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="future"
        options={{
          title: 'Future',
          tabBarIcon: ({ focused }) => (
            <FutureIcon color={focused ? colors.text : 'rgba(242,242,242,0.62)'} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Future" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabGlass: {
    ...StyleSheet.absoluteFill,
    borderRadius: 32,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  indicator: {
    position: 'absolute',
    bottom: -10,
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.amber,
  },
});
