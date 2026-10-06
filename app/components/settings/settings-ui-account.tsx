import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { ellipsify } from '@/utils/ellipsify'
import { AppText } from '@/components/app-text'
import { AppView } from '@/components/app-view'
import { WalletUiButtonConnect } from '@/components/solana/wallet-ui-button-connect'
import { WalletUiButtonDisconnect } from '@/components/solana/wallet-ui-button-disconnect'
import { useTranslation } from 'react-i18next'

export function SettingsUiAccount() {
  const { t } = useTranslation()
  const { account } = useMobileWallet()
  return (
    <AppView>
      <AppText type="subtitle">{t('settings.account')}</AppText>
      {account ? (
        <AppView style={{ flexDirection: 'column', justifyContent: 'flex-end' }}>
          <AppText>{t('settings.connectedTo', { address: ellipsify(account.address.toString(), 8) })}</AppText>
          <WalletUiButtonDisconnect />
        </AppView>
      ) : (
        <AppView style={{ flexDirection: 'column', justifyContent: 'flex-end' }}>
          <AppText>{t('common.connectWallet')}</AppText>
          <WalletUiButtonConnect />
        </AppView>
      )}
    </AppView>
  )
}
