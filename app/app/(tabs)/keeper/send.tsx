import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AccountFeatureSend } from '@/components/account/account-feature-send'
import { AppView } from '@/components/app-view'
import { toPublicKey } from '@/utils/to-public-key'

export default function Send() {
  const { account } = useMobileWallet()

  if (!account) {
    // Le garde racine (`Stack.Protected`, `app/_layout.tsx`) démonte tout
    // l'arbre `(tabs)` dès que le compte disparaît : rien à naviguer ici.
    // Un `router.replace()` pendant le render partirait dans le commit même
    // où l'arbre est détruit — c'est ce télescopage qui fait planter Fabric.
    return null
  }

  return (
    <AppView style={{ flex: 1, padding: 16 }}>
      <AccountFeatureSend address={toPublicKey(account.address)} />
    </AppView>
  )
}
