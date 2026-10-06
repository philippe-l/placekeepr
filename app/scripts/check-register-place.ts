// Vérification du module register-place.ts contre le programme devnet déployé :
// simule la tx sur la cellule de test déjà enregistrée (attendu : « already in
// use ») puis sur une cellule libre (attendu : succès). Rien n'est envoyé, les
// signatures ne sont pas vérifiées en simulation (pas besoin du vérifieur).
// Usage : EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> EXPO_PUBLIC_PLACE_VERIFIER=<pubkey> \
//   npx tsx scripts/check-register-place.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { registerPlaceInstruction } from '../components/mint/register-place'

const KEEPER = new PublicKey('HxtrSNxnAoktrQqFKLcJ64XC1Ggt4QAwcRXQoDkamaLd')
const connection = new Connection('https://api.devnet.solana.com', 'confirmed')

async function simulate(latitude: number, longitude: number): Promise<string> {
  const ix = registerPlaceInstruction(KEEPER, latitude, longitude)
  if (!ix) {
    throw new Error('EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM manquant')
  }
  const tx = new Transaction().add(ix)
  tx.feePayer = KEEPER
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  const result = await connection.simulateTransaction(tx)
  if (result.value.err) {
    return `échec : ${result.value.logs?.find((l) => l.includes('already in use')) ?? JSON.stringify(result.value.err)}`
  }
  return 'succès'
}

async function main() {
  // Cellule (0.0001, 0.0001) : enregistrée lors de la vérif du déploiement.
  console.log('cellule prise  →', await simulate(0.0001, 0.0001))
  // Cellule (0.0002, 0.0002) : jamais enregistrée.
  console.log('cellule libre  →', await simulate(0.0002, 0.0002))
}

main()
