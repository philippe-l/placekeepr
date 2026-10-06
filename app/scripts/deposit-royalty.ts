/**
 * Vente secondaire simulée : dépose du SOL dans la cagnotte d'un lieu.
 *
 * Aucune marketplace cNFT n'existe sur devnet (Tensor, Magic Eden : mainnet
 * seulement), et les royalties cNFT ne sont de toute façon pas exécutables au
 * niveau du protocole — le versement est volontaire côté marketplace. Ce
 * script tient le rôle de la marketplace qui joue le jeu : il crédite le vault
 * du lieu, l'app affiche la cagnotte, le gardien déclenche le split.
 *
 * Usage :
 *   EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> PLACE=48.8584,2.2945 AMOUNT=0.1 \
 *     npm run deposit-royalty
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'
import fs from 'node:fs'
import os from 'node:os'
import { cellE4, placePda } from '../components/mint/register-place'
import { depositRoyaltyInstruction, placeVaultPda } from '../components/place/place-vault'

const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const keypairPath = (process.env.SOLANA_KEYPAIR ?? '~/.config/solana/placekeepr-dev.json').replace(/^~/, os.homedir())
const programId = process.env.EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM
const place = process.env.PLACE
const amount = Number(process.env.AMOUNT ?? '0.1')

if (rpcUrl.includes('mainnet') && process.env.ALLOW_MAINNET !== '1') {
  console.error('Refus : RPC mainnet détecté. Mettre ALLOW_MAINNET=1 pour forcer (à éviter).')
  process.exit(1)
}
if (!programId) {
  console.error('EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM manquant.')
  process.exit(1)
}
if (!place) {
  console.error('PLACE manquant — attendu "latitude,longitude" (ex. PLACE=48.8584,2.2945).')
  process.exit(1)
}
if (!Number.isFinite(amount) || amount <= 0) {
  console.error(`AMOUNT invalide : ${process.env.AMOUNT}`)
  process.exit(1)
}

async function main() {
  const program = new PublicKey(programId!)
  const [latitude, longitude] = place!.split(',').map(Number)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`PLACE invalide : ${place}`)
  }
  const placeAddress = placePda(cellE4(latitude), cellE4(longitude), program)

  const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))))
  const connection = new Connection(rpcUrl, 'confirmed')
  if (!(await connection.getAccountInfo(placeAddress))) {
    throw new Error(`Aucun lieu enregistré sur la cellule ${cellE4(latitude)}/${cellE4(longitude)}`)
  }

  const lamports = BigInt(Math.round(amount * LAMPORTS_PER_SOL))
  console.log(`RPC     : ${rpcUrl}`)
  console.log(`Payeur  : ${payer.publicKey.toBase58()}`)
  console.log(`Lieu    : ${placeAddress.toBase58()} (${cellE4(latitude)}/${cellE4(longitude)})`)
  console.log(`Vault   : ${placeVaultPda(placeAddress, program).toBase58()}`)
  console.log(`Montant : ${amount} SOL`)

  const transaction = new Transaction().add(depositRoyaltyInstruction(payer.publicKey, placeAddress, lamports, program))
  const signature = await connection.sendTransaction(transaction, [payer])
  await connection.confirmTransaction(signature, 'confirmed')
  console.log(`\nOK — ${signature}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
