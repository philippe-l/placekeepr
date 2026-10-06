import { PublicKey } from '@solana/web3.js'
import { useRouter } from 'expo-router'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { AccountUiBalance } from '@/components/account/account-ui-balance'
import { AppText } from '@/components/app-text'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelCard } from '@/components/ui/pixel-card'
import { Palette } from '@/constants/colors'

/**
 * Le wallet, dissous dans l'identité gardien (décision 1a) : il faut du SOL
 * pour capturer. Reprend airdrop / envoi / réception de l'ancien onglet.
 */
export function WalletCard({ address }: { address: PublicKey }) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <PixelCard>
      <AppText type="subtitle">{t('keeper.walletTitle')}</AppText>
      <AccountUiBalance address={address} />
      <AppText style={{ color: Palette.terracotta, fontSize: 13 }}>{t('keeper.walletHint')}</AppText>
      <PixelButton
        title={t('account.airdrop')}
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/keeper/airdrop')}
      />
      <PixelButton
        title={t('account.send')}
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/keeper/send')}
      />
      <PixelButton
        title={t('account.receive')}
        variant="secondary"
        onPress={() => router.navigate('/(tabs)/keeper/receive')}
      />
    </PixelCard>
  )
}
