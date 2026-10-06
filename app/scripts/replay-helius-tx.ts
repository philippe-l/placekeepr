// Rejoue des transactions vers l'indexer (POST /helius-webhook), comme si
// Helius venait de les livrer.
//
// Usage (tsx ne lit pas .env : variables en préfixe) :
//   HELIUS_WEBHOOK_SECRET=<secret> npx tsx scripts/replay-helius-tx.ts <signature> [<signature>…]
//
// Pourquoi : Helius ne relivre un lot que sur réponse non-2xx. Une transaction
// reçue par un indexer qui ne savait pas encore la décoder (répondu 200, rien
// écrit) est perdue pour le miroir — cas du 18/09/2026 : dépôt et distribution
// de royalties livrés à un serveur pas encore redéployé. C'est ce script qui
// rend vrai le « reconstructible depuis la chaîne » du README serveur.
//
// Le payload est reconstruit depuis un RPC Solana standard, pas depuis l'API
// Helius : l'indexer ne lit que signature, timestamp, instructions de premier
// niveau (programme, comptes, data base58) et variation de solde par compte.
// Pas de clé Helius requise, et le rejeu survit à un changement d'indexeur.
//
// Sans risque de doublon : toutes les écritures de l'indexer sont idempotentes
// (`on conflict`, compteurs de visites recalculés depuis l'historique).

import { Connection, PublicKey, type VersionedTransactionResponse } from '@solana/web3.js'
import { base58 } from '@metaplex-foundation/umi/serializers'

const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const webhookUrl = process.env.HELIUS_WEBHOOK_URL ?? 'https://placekeepr.app/helius-webhook'
const secret = process.env.HELIUS_WEBHOOK_SECRET
const signatures = process.argv.slice(2)

if (!secret) {
  console.error('HELIUS_WEBHOOK_SECRET manquant')
  process.exit(1)
}
if (signatures.length === 0) {
  console.error('Usage : replay-helius-tx.ts <signature> [<signature>…]')
  process.exit(1)
}

/** Forme « enhanced » réduite aux champs que lit l'indexer. */
function toEnhanced(signature: string, tx: VersionedTransactionResponse) {
  const message = tx.transaction.message
  // Comptes statiques puis adresses chargées des lookup tables : même ordre
  // que les index d'instruction (tx v0 comprises).
  const keys: PublicKey[] = [
    ...message.staticAccountKeys,
    ...(tx.meta?.loadedAddresses?.writable ?? []),
    ...(tx.meta?.loadedAddresses?.readonly ?? []),
  ]
  const pre = tx.meta?.preBalances ?? []
  const post = tx.meta?.postBalances ?? []
  return {
    signature,
    timestamp: tx.blockTime ?? undefined,
    instructions: message.compiledInstructions.map((ix) => ({
      programId: keys[ix.programIdIndex].toBase58(),
      accounts: ix.accountKeyIndexes.map((i) => keys[i].toBase58()),
      data: base58.deserialize(ix.data)[0],
    })),
    accountData: keys.map((key, i) => ({
      account: key.toBase58(),
      nativeBalanceChange: (post[i] ?? 0) - (pre[i] ?? 0),
    })),
  }
}

async function main() {
  const connection = new Connection(rpcUrl, 'confirmed')
  const payload = []
  for (const signature of signatures) {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 })
    if (!tx) {
      console.error('Transaction introuvable :', signature)
      process.exit(1)
    }
    if (tx.meta?.err) {
      // Helius livre aussi les tx échouées ; l'indexer ne doit rien en tirer.
      console.warn('Transaction en échec, rejouée quand même :', signature)
    }
    payload.push(toEnhanced(signature, tx))
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: secret as string },
    body: JSON.stringify(payload),
  })
  console.log(response.status, await response.text())
  if (!response.ok) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
