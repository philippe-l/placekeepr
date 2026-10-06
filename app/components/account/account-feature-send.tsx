import { AppView } from '@/components/app-view'
import { AppText } from '@/components/app-text'
import { PublicKey } from '@solana/web3.js'
import { ActivityIndicator, TextInput, View } from 'react-native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@react-navigation/elements'
import { useTransferSol } from '@/components/account/use-transfer-sol'
import { useThemeColor } from '@/hooks/use-theme-color'

export function AccountFeatureSend({ address }: { address: PublicKey }) {
  const { t } = useTranslation()
  const transferSol = useTransferSol({ address })
  const [destinationAddress, setDestinationAddress] = useState('')
  const [amount, setAmount] = useState('1')
  const backgroundColor = useThemeColor('surface')
  const textColor = useThemeColor('text')

  return (
    <AppView>
      <AppText type="subtitle">{t('account.sendSubtitle')}</AppText>
      {transferSol.isPending ? (
        <ActivityIndicator />
      ) : (
        <View style={{ gap: 16 }}>
          <AppText>{t('account.amountSol')}</AppText>
          <TextInput
            style={{
              backgroundColor,
              color: textColor,
              borderWidth: 1,
              borderRadius: 25,
              paddingHorizontal: 16,
            }}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <AppText>{t('account.destinationAddress')}</AppText>
          <TextInput
            style={{
              backgroundColor,
              color: textColor,
              borderWidth: 1,
              borderRadius: 25,
              paddingHorizontal: 16,
            }}
            value={destinationAddress}
            onChangeText={setDestinationAddress}
          />

          <Button
            disabled={transferSol.isPending}
            onPress={() => {
              transferSol
                .mutateAsync({ amount: parseFloat(amount), destination: new PublicKey(destinationAddress) })
                .then(() => {
                  console.log(`Sent ${amount} SOL to ${destinationAddress}`)
                })
                .catch((err) => console.log(`Error sending SOL: ${err}`, err))
            }}
            variant="filled"
          >
            {t('account.sendSol')}
          </Button>
        </View>
      )}
      {transferSol.isError ? (
        <AppText style={{ color: 'red', fontSize: 12 }}>{`${transferSol.error.message}`}</AppText>
      ) : null}
    </AppView>
  )
}
