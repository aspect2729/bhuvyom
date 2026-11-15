import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, OrbitMark, SoundIcon } from '@/components/Icons';
import { useSound } from '@/lib/sound';
import { colors, em, fonts, surfaces } from '@/theme/tokens';

type Props = {
  /** Title shown after the mark / back arrow. Defaults to the app name. */
  title?: string;
  /** Pushed screens: back arrow instead of the app mark. */
  back?: boolean;
  onBack?: () => void;
};

/** Header from the handoff: app mark (or back arrow) + title + "Sound OFF" toggle. */
export function AppHeader({ title = 'BhuVyom', back = false, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [soundOn, toggleSound] = useSound();

  const goBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {back ? (
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <BackIcon color={colors.text} />
        </Pressable>
      ) : (
        <OrbitMark />
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        onPress={toggleSound}
        accessibilityRole="button"
        accessibilityLabel={soundOn ? 'Sound on' : 'Sound off'}
        accessibilityState={{ selected: soundOn }}
        style={styles.sound}
      >
        <SoundIcon on={soundOn} color={colors.text2} />
        <Text style={styles.soundText}>{soundOn ? 'ON' : 'OFF'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    letterSpacing: em(18, 0.18),
    color: colors.text,
  },
  sound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: surfaces.borderHeader,
    backgroundColor: surfaces.cardStrong,
  },
  soundText: { fontFamily: fonts.display, fontSize: 11, letterSpacing: em(11, 0.14), color: colors.text2 },
});
