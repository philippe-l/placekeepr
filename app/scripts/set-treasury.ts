/**
 * Pose (ou fait tourner) le destinataire de la part trésorerie du split des
 * royalties : PDA ["treasury"] du programme place_registry, admin seulement.
 *
 * À jouer UNE FOIS après le déploiement du programme : tant que ce PDA
 * n'existe pas, `distribute_royalties` échoue — personne ne distribue vers une
 * trésorerie inconnue.
 *
 * Usage :
 *   EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> npm run set-treasury
 *   # destinataire par défaut : le wallet admin lui-même (wallet dev).
 *   TREASURY_DESTINATION=<pubkey> npm run set-treasury
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import fs from 'node:fs'
import os from 'node:os'
import { treasuryPda } from '../components/place/place-vault'

// sha256("global:set_treasury")[0..8].
const SET_TREASURY_DISCRIMINATOR = Uint8Array.from([57, 97, 196, 95, 195, 206, 106, 136])

const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const keypairPath = (process.env.SOLANA_KEYPAIR ?? '~/.config/solana/placekeepr-dev.json').replace(/^~/, os.homedir())
const programId = process.env.EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM

if (rpcUrl.includes('mainnet') && process.env.ALLOW_MAINNET !== '1') {
  console.error('Refus : RPC mainnet détecté. Mettre ALLOW_MAINNET=1 pour forcer (à éviter).')
  process.exit(1)
}
if (!programId) {
  console.error('EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM manquant.')
  process.exit(1)
}

async function main() {
  const program = new PublicKey(programId!)
  const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))))
  const destination = new PublicKey(process.env.TREASURY_DESTINATION ?? admin.publicKey.toBase58())
  const connection = new Connection(rpcUrl, 'confirmed')

  const configPda = PublicKey.findProgramAddressSync([Buffer.from('config')], program)[0]
  const instruction = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: treasuryPda(program), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(SET_TREASURY_DISCRIMINATOR), destination.toBuffer()]),
  })

  console.log(`RPC         : ${rpcUrl}`)
  console.log(`Admin       : ${admin.publicKey.toBase58()}`)
  console.log(`Trésorerie  : ${destination.toBase58()}`)
  console.log(`PDA         : ${treasuryPda(program).toBase58()}`)

  const transaction = new Transaction().add(instruction)
  const signature = await connection.sendTransaction(transaction, [admin])
  await connection.confirmTransaction(signature, 'confirmed')
  console.log(`\nOK — ${signature}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
