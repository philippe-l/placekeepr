import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { PortalHost } from '@rn-primitives/portal'
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono'
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p'
import { useFonts } from 'expo-font'
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import '@/i18n'
import { AppProviders } from '@/components/app-providers'
import { PixelToastHost } from '@/components/ui/pixel-toast'
import { syncMintLog } from '@/components/mint/sync-mint-log'
import { restoreMintLog } from '@/components/mint/restore-mint-log'
import { useInvalidateMintLog } from '@/components/mint/use-mint-log'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { toPublicKey } from '@/utils/to-public-key'
import { useCallback, useEffect } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { View } from 'react-native'
import { useTrackLocations } from '@/hooks/use-track-locations'
import { AppSplashController } from '@/components/app-splash-controller'
import { useAuth } from '@/components/auth/auth-provider'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  // Use this hook to track the locations for analytics or debugging.
  // Delete if you don't need it.
  useTrackLocations((pathname, params) => {
    console.log(`Track ${pathname}`, { params })
  })
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    PressStart2P_400Regular,
    DMMono_400Regular,
    DMMono_500Medium,
    // MaterialIcons est préchargée ici plutôt que laissée au composant
    // d'icône : `@expo/vector-icons` rend un `<Text />` vide tant que sa fonte
    // n'est pas là, puis bascule sur un composant d'un autre type — React
    // démonte donc une vue native et en monte une autre sous chaque icône, à
    // chaque lancement. Ça n'a pas suffi à corriger le crash du 16/09/2026,
    // mais c'est une bascule de structure inutile, et la pratique Expo
    // recommandée est bien de précharger les fontes d'icônes.
    ...MaterialIcons.font,
  })

  useEffect(() => {
    // Rattrape le backlog du journal local (mints d'avant Supabase, échecs
    // réseau passés) — best-effort, l'app ne dépend pas du backend.
    syncMintLog().catch((error) => console.warn('Sync backend échouée', error))
  }, [])

  const onLayoutRootView = useCallback(async () => {
    console.log('onLayoutRootView')
    if (loaded) {
      console.log('loaded')
      // This tells the splash screen to hide immediately! If we call this after
      // `setAppIsReady`, then we may see a blank screen while the app is
      // loading its initial state and rendering its first pixels. So instead,
      // we hide the splash screen once we know the root view has already
      // performed layout.
      await SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    // Async font loading only occurs in development.
    return null
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppProviders>
        <AppSplashController />
        <RootNavigator />
        <AuthGate />
        <CollectionRestorer />
        {/* Après la navigation : le toast passe par-dessus les écrans et la modale de connexion. */}
        <PixelToastHost />
        {/* UI mono-thème claire : icônes système toujours sombres. */}
        <StatusBar style="dark" />
      </AppProviders>
      <PortalHost />
    </View>
  )
}

/**
 * L'arbre `(tabs)` est déclaré en permanence et n'est JAMAIS retiré du stack.
 *
 * Il l'était avant, via deux groupes `Stack.Protected` qu'on échangeait à la
 * connexion : déconnexion = arbre détruit, reconnexion = arbre reconstruit
 * dans la même session JS. Fabric ne s'en remet pas — le registre de vues
 * ressort incohérent (une icône de la barre d'onglets posée sans son
 * conteneur), et le premier onglet ouvert ensuite plante sur
 * `RetryableMountingLayerException: Unable to find viewState` (5 fois le
 * 16/09/2026, toujours au premier montage d'onglet après reconnexion ;
 * jamais au démarrage à froid, où l'arbre n'est monté qu'une fois).
 *
 * L'écran de connexion se présente donc PAR-DESSUS les onglets, en modale
 * plein écran : les onglets restent montés dessous, il n'y a plus de
 * reconstruction, donc plus de registre à corrompre.
 */
function RootNavigator() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* Célébration de capture (4a) : takeover plein cadre à la confirmation de tx. */}
      <Stack.Screen name="capture-celebrate" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      {/* Fiche lieu plein écran (3a mon-lieu / 3b autre-gardien). */}
      <Stack.Screen name="place/[signature]" />
      <Stack.Screen name="+not-found" />
      <Stack.Screen
        name="sign-in"
        options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
      />
    </Stack>
  )
}

/**
 * Empile ou retire l'écran de connexion selon l'état du wallet. La navigation
 * se fait dans un effet, donc après le commit : jamais pendant un rendu, et
 * jamais dans la même image que le changement d'état qui la déclenche.
 */
/**
 * Restaure la collection du wallet connecté depuis le backend (captures
 * absentes du journal local : app réinstallée, téléphone neuf, passage au
 * build signé dApp Store). Relancé à chaque changement de wallet — un
 * Seed Vault multi-comptes a une collection par compte. Best-effort : hors
 * ligne, le journal local reste ce qu'il est.
 */
function CollectionRestorer() {
  const { account, connection } = useMobileWallet()
  const invalidateMintLog = useInvalidateMintLog()
  const wallet = account ? toPublicKey(account.publicKey).toBase58() : null
  const endpoint = connection.rpcEndpoint

  useEffect(() => {
    if (!wallet) {
      return
    }
    restoreMintLog(wallet, endpoint)
      .then((restored) => {
        if (restored > 0) {
          console.log(`Collection restaurée : ${restored} lieu(x)`)
          invalidateMintLog()
        }
      })
      .catch((error) => console.warn('Restauration de la collection échouée', error))
    // invalidateMintLog change d'identité à chaque rendu : seul le wallet compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, endpoint])

  return null
}

function AuthGate() {
  const { isAuthenticated, isRestoring } = useAuth()
  const segments = useSegments()
  const navigationState = useRootNavigationState()
  const isOnSignIn = segments[0] === 'sign-in'
  const isNavigationReady = Boolean(navigationState?.key)

  useEffect(() => {
    // Tant que le cache du wallet n'a pas répondu, on ne décide rien : sinon
    // l'écran de connexion s'ouvre puis se referme à chaque lancement.
    if (!isNavigationReady || isRestoring) {
      return
    }
    if (!isAuthenticated && !isOnSignIn) {
      router.push('/sign-in')
    } else if (isAuthenticated && isOnSignIn) {
      router.back()
    }
  }, [isAuthenticated, isNavigationReady, isOnSignIn, isRestoring])

  return null
}
