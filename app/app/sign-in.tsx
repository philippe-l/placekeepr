import { useTranslation } from 'react-i18next'
import { useAuth } from '@/components/auth/auth-provider'
import { AppText } from '@/components/app-text'
import { AppView } from '@/components/app-view'
import { AppConfig } from '@/constants/app-config'
import { PixelButton } from '@/components/ui/pixel-button'
import { SafeAreaView } from 'react-native-safe-area-context'
import { View } from 'react-native'
import { Image } from 'expo-image'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  return (
    <AppView
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'stretch',
      }}
    >
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'space-between',
        }}
      >
        {/* Dummy view to push the next view to the center. */}
        <View />
        <View style={{ alignItems: 'center', gap: 24 }}>
          <AppText type="title">{AppConfig.name}</AppText>
          <Image source={require('../assets/images/icon.png')} style={{ width: 128, height: 128 }} />
          <AppText type="subtitle">{t('signIn.tagline')}</AppText>
        </View>
        <View style={{ marginBottom: 16, marginHorizontal: 16 }}>
          <PixelButton
            title={t('signIn.pressStart')}
            // Aucune navigation impérative ici : le garde `Stack.Protected` de
            // `_layout.tsx` s'en charge. Dès que le compte arrive, `sign-in`
            // sort des routes du stack et React Navigation crée lui-même la
            // route `(tabs)`. Un `router.replace('/')` de plus remplaçait cette
            // route fraîche par une autre clé dans la même image : l'écran natif
            // monté était démonté aussitôt, et la couche Fabric plantait sur
            // `RetryableMountingLayerException: Unable to find viewState`
            // (3 crashes sur le terrain le 16/09/2026, à chaque reconnexion).
            onPress={() => signIn()}
          />
        </View>
      </SafeAreaView>
    </AppView>
  )
}
