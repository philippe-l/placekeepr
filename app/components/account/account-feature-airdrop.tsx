import { AppView } from '@/components/app-view'
import { AppText } from '@/components/app-text'
import { PublicKey } from '@solana/web3.js'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { Button } from '@react-navigation/elements'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { useRequestAirdrop } from '@/components/account/use-request-airdrop'
import { toPublicKey } from '@/utils/to-public-key'

export function AccountFeatureAirdrop({ back }: { back: () => void }) {
  const { t } = useTranslation()
  const { account } = useMobileWallet()
  const amount = 1
  const requestAirdrop = useRequestAirdrop({ address: toPublicKey(account?.address) as PublicKey })

  return (
    <AppView>
      <AppText type="subtitle">{t('account.airdropSubtitle')}</AppText>
      {requestAirdrop.isPending ? (
        <ActivityIndicator />
      ) : (
        <Button
          disabled={requestAirdrop.isPending}
          onPress={() => {
            requestAirdrop
              .mutateAsync(amount)
              .then(() => {
                console.log(`Requested airdrop of ${amount} SOL to ${account?.address}`)
                back()
              })
              .catch((err) => console.log(`Error requesting airdrop: ${err}`, err))
          }}
          variant="filled"
        >
          {t('account.requestAirdrop')}
        </Button>
      )}
      {requestAirdrop.isError ? (
        <AppText style={{ color: 'red', fontSize: 12 }}>{`${requestAirdrop.error.message}`}</AppText>
      ) : null}
    </AppView>
  )
}
