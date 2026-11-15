import {
  Jura_300Light,
  Jura_400Regular,
  Jura_500Medium,
  Jura_600SemiBold,
} from '@expo-google-fonts/jura';
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
} from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({
    Jura_300Light,
    Jura_400Regular,
    Jura_500Medium,
    Jura_600SemiBold,
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        {/* Pushed from Home (back arrow; Home stays the active tab) */}
        <Stack.Screen name="layers" />
        <Stack.Screen name="data" />
        <Stack.Screen name="pipeline" />
      </Stack>
    </View>
  );
}
