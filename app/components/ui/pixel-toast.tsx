import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BodyFont, PixelFont } from '@/components/app-theme'
import { PixelGlyph, type PixelGlyphName } from '@/components/ui/pixel-glyph'
import { Colors, Palette } from '@/constants/colors'

/**
 * Toast 8-bit, en remplacement du Snackbar Material natif qui jurait avec le
 * reste de l'UI : même grammaire que `PixelCard` (bordure épaisse, ombre dure
 * décalée, pas d'arrondi), pastille de couleur + glyphe pixel.
 *
 * API impérative (`showToast`) : les appelants sont des handlers d'erreur,
 * pas des composants qui voudraient porter un état. Un seul hôte, monté une
 * fois à la racine (`app/_layout.tsx`) et jamais démonté — seul son contenu
 * apparaît/disparaît, dans le même parent (cf. piège Fabric du CLAUDE.md).
 *
 * En haut de l'écran : en bas, il masquerait le bouton de capture et la barre
 * d'onglets, précisément là où l'utilisateur a le doigt.
 */

export type ToastTone = 'error' | 'info'

export interface ToastOptions {
  text: string
  tone?: ToastTone
  /** `long` pour un refus qu'il faut lire, `short` pour une confirmation. */
  duration?: 'short' | 'long'
}

const DURATION_MS = { short: 2500, long: 5000 } as const

const TONES: Record<ToastTone, { color: string; glyph: PixelGlyphName }> = {
  error: { color: Palette.raspberry, glyph: 'bang' },
  info: { color: Palette.teal, glyph: 'check' },
}

type Listener = (toast: (ToastOptions & { id: number }) | null) => void
let listener: Listener | null = null
let nextId = 0

/** Affiche un toast ; remplace celui en cours s'il y en a un. */
export function showToast(options: ToastOptions): void {
  listener?.({ ...options, id: ++nextId })
}

// Glissade en 4 paliers plutôt qu'en continu : un mouvement lisse détonne
// dans une UI pixel.
const STEPS = 4
const stepped = (t: number) => Math.min(1, Math.floor(t * STEPS) / (STEPS - 1))

export function PixelToastHost() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const offset = useRef(new Animated.Value(0)).current

  useEffect(() => {
    listener = setToast
    return () => {
      listener = null
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    offset.setValue(0)
    Animated.timing(offset, { toValue: 1, duration: 160, easing: stepped, useNativeDriver: true }).start()
    const timer = setTimeout(() => setToast(null), DURATION_MS[toast.duration ?? 'long'])
    return () => clearTimeout(timer)
  }, [toast, offset])

  const tone = TONES[toast?.tone ?? 'error']
  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] })

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {toast ? (
        <Animated.View
          style={{
            transform: [{ translateY }],
            opacity: offset.interpolate({ inputRange: [0, 0.34, 1], outputRange: [0, 1, 1] }),
          }}
        >
          <Pressable
            onPress={() => setToast(null)}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityHint={t('toast.dismiss')}
            style={styles.shadow}
          >
            <View style={[styles.face, { borderColor: tone.color }]}>
              <View style={[styles.badge, { backgroundColor: tone.color }]}>
                <PixelGlyph name={tone.glyph} color={Palette.cream} cell={3} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.title, { color: tone.color }]}>
                  {t(toast.tone === 'info' ? 'toast.info' : 'toast.error')}
                </Text>
                <Text style={styles.text}>{toast.text}</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  shadow: {
    backgroundColor: Colors.shadow,
    marginTop: 4,
    marginLeft: 4,
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 3,
    backgroundColor: Colors.surface,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  badge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 9,
  },
  text: {
    fontFamily: BodyFont,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text,
  },
})
