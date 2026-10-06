import { AppView } from '@/components/app-view'
import { AppText } from '@/components/app-text'
import { PublicKey } from '@solana/web3.js'
import { AppQrCode } from '@/components/app-qr-code'
import { Button } from '@react-navigation/elements'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTranslation } from 'react-i18next'

export function AccountFeatureReceive({ address }: { address: PublicKey }) {
  const { t } = useTranslation()
  return (
    <AppView style={{ gap: 16 }}>
      <AppText type="subtitle">{t('account.receiveSubtitle')}</AppText>
      <AppView style={{ alignItems: 'center', gap: 16 }}>
        <AppText type="defaultSemiBold" style={{ textAlign: 'center' }}>
          {address.toString()}
        </AppText>
        <Button onPressIn={() => Clipboard.setString(address.toString())}>{t('account.copyAddress')}</Button>
        <AppQrCode value={address.toString()} />
      </AppView>
    </AppView>
  )
}
