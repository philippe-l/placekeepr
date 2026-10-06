import { VersionedTransaction } from '@solana/web3.js'
import { cellE4, soleProgramInstruction } from './cosign.ts'
import { config } from './config.ts'

/**
 * Preuve on-chain d'une capture, avant d'écrire la ligne `mints` que l'app
 * déclare (`POST /mints`, audit du 29/09/2026). La route était anonyme : on y
 * inventait une capture à n'importe quel endroit au nom de n'importe quel
 * wallet — elle s'affichait sur la carte de tous et s'injectait dans la
 * collection restaurée de la victime.
 *
 * Désormais ce que le client affirme ne vaut que confirmé par la chaîne :
 * la transaction existe et a réussi, le minter annoncé en est le **payeur**
 * (le wallet qui a signé et payé la capture), et elle porte **un**
 * `register_place` dont la cellule est celle de la position envoyée. La
 * position précise reste celle du client, mais elle ne peut plus sortir de sa
 * cellule (~11 m).
 */

export const REGISTER_PLACE_DISCRIMINATOR = Uint8Array.from([193, 120, 229, 116, 127, 194, 89, 143])

export type CaptureProof = 'ok' | 'not_found' | 'failed' | 'wrong_minter' | 'not_a_capture' | 'wrong_cell'

const ATTEMPTS = 3
const RETRY_DELAY_MS = 1500

type TransactionResult = { meta: { err: unknown } | null; transaction: [string, string] } | null

async function fetchTransaction(signature: string): Promise<TransactionResult> {
  // L'app déclare la capture juste après la confirmation : un RPC en léger
  // retard peut ne pas encore la connaître. Quelques tentatives, pas plus.
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(config.solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'base64', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
      }),
      signal: AbortSignal.timeout(5000),
    })
    const body = (await response.json()) as { result?: TransactionResult; error?: { message: string } }
    if (body.error) {
      // Signature mal formée : le RPC la refuse (« Invalid param »). Ce n'est
      // pas une panne, c'est une capture qui n'existe pas.
      if (body.error.message.startsWith('Invalid param')) {
        return null
      }
      throw new Error(`getTransaction : ${body.error.message}`)
    }
    if (body.result || attempt >= ATTEMPTS) {
      return body.result ?? null
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
}

export async function proveCapture(
  signature: string,
  minter: string,
  latitude: number,
  longitude: number,
): Promise<CaptureProof> {
  const result = await fetchTransaction(signature)
  if (!result) {
    return 'not_found'
  }
  if (result.meta?.err !== null && result.meta?.err !== undefined) {
    return 'failed'
  }
  const message = VersionedTransaction.deserialize(Buffer.from(result.transaction[0], 'base64')).message
  if (message.staticAccountKeys[0]?.toBase58() !== minter) {
    return 'wrong_minter'
  }
  const ix = soleProgramInstruction(message, config.placeRegistryProgram)
  if (!ix || ix.data.length !== 16 || REGISTER_PLACE_DISCRIMINATOR.some((byte, i) => ix.data[i] !== byte)) {
    return 'not_a_capture'
  }
  const data = Buffer.from(ix.data)
  if (data.readInt32LE(8) !== cellE4(latitude) || data.readInt32LE(12) !== cellE4(longitude)) {
    return 'wrong_cell'
  }
  return 'ok'
}
