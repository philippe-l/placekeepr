import { Stack, useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WalletUiDropdown } from '@/components/solana/wallet-ui-dropdown'
import { UiIconSymbol } from '@/components/ui/ui-icon-symbol'
import { useThemeColor } from '@/hooks/use-theme-color'

export default function Layout() {
  const { t } = useTranslation()
  const router = useRouter()
  const icon = useThemeColor('text')
  return (
    <Stack screenOptions={{ headerTitle: t('tabs.keeper') }}>
      <Stack.Screen
        name="index"
        options={{
          // Réglages derrière l'engrenage (décision 1a : plus d'onglet dédié).
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              hitSlop={8}
              onPress={() => router.navigate('/(tabs)/keeper/settings')}
            >
              <UiIconSymbol size={28} name="gearshape.fill" color={icon} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="settings"
        options={{ headerTitle: t('settings.title'), headerRight: () => <WalletUiDropdown /> }}
      />
      <Stack.Screen name="airdrop" options={{ headerTitle: t('account.airdrop') }} />
      <Stack.Screen name="send" options={{ headerTitle: t('account.send') }} />
      <Stack.Screen name="receive" options={{ headerTitle: t('account.receive') }} />
    </Stack>
  )
}
