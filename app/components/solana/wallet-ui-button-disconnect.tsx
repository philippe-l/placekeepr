import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { BaseButton } from '@/components/solana/base-button'
import React from 'react'
import { useTranslation } from 'react-i18next'

export function WalletUiButtonDisconnect({ label }: { label?: string }) {
  const { t } = useTranslation()
  const { disconnect } = useMobileWallet()

  return <BaseButton label={label ?? t('wallet.disconnect')} onPress={() => disconnect()} />
}
