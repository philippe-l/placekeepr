import { PublicKey } from '@solana/web3.js'

/**
 * Contournement d'un bug @wallet-ui/react-native-web3js : son cache AsyncStorage
 * ne « revive » que account.publicKey — account.address redevient une string
 * base58 au redémarrage de l'app, malgré son type déclaré PublicKey.
 * À utiliser partout où une vraie PublicKey est passée à web3.js.
 */
export function toPublicKey(value: PublicKey | string): PublicKey
export function toPublicKey(value: PublicKey | string | undefined): PublicKey | undefined
export function toPublicKey(value: PublicKey | string | undefined): PublicKey | undefined {
  if (value === undefined) {
    return undefined
  }
  return value instanceof PublicKey ? value : new PublicKey(value)
}
