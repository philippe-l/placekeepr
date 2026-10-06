import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { ConfettiRain } from '@/components/capture/confetti-rain'
import { useMintLog } from '@/components/mint/use-mint-log'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'

/**
 * Célébration de la première capture d'un lieu (décision 4a) : takeover
 * plein cadre sur fond plum, à la confirmation de la tx — LE moment fort
 * de l'app, il ne finit plus dans un toast.
 */
export default function CaptureCelebrateScreen() {
  const { signature } = useLocalSearchParams<{ signature: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const mintLog = useMintLog()

  const entries = mintLog.data ?? []
  const entry = entries.find((candidate) => candidate.signature === signature)
  // Badge jalon débloqué par CETTE capture (le journal contient déjà l'entrée).
  const badgeKey = entries.length === 1 ? 'firstCapture' : entries.length === 10 ? 'tenPlaces' : null

  const pop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(pop, {
      toValue: 1,
      duration: 550,
      delay: 150,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start()
  }, [pop])

  return (
    <View style={styles.screen}>
      <ConfettiRain />
      <SafeAreaView style={styles.content}>
        <AppText style={styles.newKeeper}>{t('capture.newKeeper')}</AppText>
        <Animated.View
          style={{
            opacity: pop,
            transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
          }}
        >
          <AppText style={styles.title}>{t('capture.youAreKeeper')}</AppText>
        </Animated.View>

        {entry?.thumbUri || entry?.photoUri ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: entry.thumbUri ?? entry.photoUri }} style={styles.photo} contentFit="cover" />
            {/* Tampon corail : le lieu est estampillé au nom de sa cellule. */}
            <View style={styles.stamp}>
              <AppText style={styles.stampText}>
                {entry.latitude.toFixed(4)} · {entry.longitude.toFixed(4)}
              </AppText>
            </View>
          </View>
        ) : null}

        <AppText style={styles.forLife}>{t('capture.forLife')}</AppText>

        {badgeKey ? (
          <View style={styles.badge}>
            <PixelGlyph name="star" color={Palette.amber} cell={3} />
            <AppText style={styles.badgeText}>
              {t('capture.badgeUnlocked', { badge: t(`keeper.badge.${badgeKey}`) })}
            </AppText>
          </View>
        ) : null}

        <PixelButton title={t('capture.seeMyPlace')} onPress={() => router.back()} style={styles.button} />
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.plum,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 24,
  },
  newKeeper: {
    fontFamily: PixelFont,
    fontSize: 10,
    color: Palette.amber,
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 30,
    lineHeight: 42,
    color: Palette.cream,
    textAlign: 'center',
  },
  photoWrap: {
    borderWidth: 3,
    borderColor: Palette.cream,
  },
  photo: {
    width: 180,
    height: 180,
  },
  stamp: {
    position: 'absolute',
    left: -10,
    bottom: 12,
    backgroundColor: Palette.coral,
    borderWidth: 2,
    borderColor: Palette.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    transform: [{ rotate: '-4deg' }],
  },
  stampText: {
    fontFamily: PixelFont,
    fontSize: 9,
    color: Palette.cream,
  },
  forLife: {
    fontSize: 14,
    color: Palette.cream,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.ink,
    borderWidth: 2,
    borderColor: Palette.amber,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontFamily: PixelFont,
    fontSize: 9,
    color: Palette.amber,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
})
