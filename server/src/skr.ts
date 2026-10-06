import { PublicKey } from '@solana/web3.js'
import { config } from './config.ts'

/**
 * SKR staké d'un wallet, lu sur MAINNET en lecture seule (prix SKR de
 * CLOCK IN). SKR n'existe que sur mainnet ; l'app, elle, reste en devnet :
 * on ne signe rien là-bas, on lit un fait public. Le même keypair a la même
 * adresse sur tous les clusters, donc le wallet Seed Vault qui capture en
 * devnet est celui qui stake en mainnet.
 *
 * Pourquoi le STAKE et pas le solde : un solde se déplace d'un wallet à
 * l'autre en une transaction, un stake reste bloqué 48 h avant retrait. C'est
 * une mise en jeu qu'on ne recycle pas entre wallets sybils — exactement ce qui
 * manque au quota de captures par wallet (#45).
 *
 * Fail-open vers le quota de base : une panne du RPC mainnet ne bloque aucune
 * capture (contrainte CLAUDE.md : rien ne doit exiger mainnet pour exister).
 *
 * Layout (IDL du Seeker Staking Program, sample officiel
 * solana-mobile/react-native-samples/skr-staking) :
 * - UserStake : disc 8, bump 1, stake_config 32, user 32 (offset 41),
 *   guardian_pool 32, shares u128 (offset 105).
 * - StakeConfig : disc 8, bump 1, authority 32, mint 32, stake_vault 32,
 *   min_stake u64, cooldown u64, total_shares u128, share_price u128
 *   (offset 137, échelle 1e9).
 * Vérifié le 29/09/2026 sur un stake réel (10 000 parts × 1,146 = 11 460 SKR,
 * cooldown relu = 172 800 s).
 */

const STAKING_PROGRAM = 'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ'
const STAKE_CONFIG = '4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw'
const USER_STAKE_DISCRIMINATOR = Buffer.from([102, 53, 163, 107, 9, 138, 87, 153])
const USER_OFFSET = 41
const SHARES_OFFSET = 105
const SHARE_PRICE_OFFSET = 137
const SHARE_PRICE_SCALE = 1_000_000_000n
const SKR_DECIMALS = 6n

/** Un stake ne bouge qu'avec 48 h de délai : 10 min de cache ne ment pas. */
const CACHE_TTL_MS = 10 * 60 * 1000
const RPC_TIMEOUT_MS = 4000

const cache = new Map<string, { staked: number; at: number }>()

function readU128(bytes: Buffer, offset: number): bigint {
  return bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n)
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.skrRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  const body = (await response.json()) as { result?: T; error?: { message: string } }
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(`RPC ${method} : ${body.error?.message ?? response.status}`)
  }
  return body.result
}

type Base64Account = { account: { data: [string, string] } }

/** SKR staké (unités entières, arrondi inférieur), 0 si aucun stake ou RPC indisponible. */
export async function skrStaked(wallet: string): Promise<number> {
  const hit = cache.get(wallet)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.staked
  }
  let staked = 0
  try {
    new PublicKey(wallet) // rejette une adresse invalide avant d'appeler le RPC
    const [stakes, stakeConfig] = await Promise.all([
      rpc<Base64Account[]>('getProgramAccounts', [
        STAKING_PROGRAM,
        {
          encoding: 'base64',
          filters: [
            { memcmp: { offset: 0, bytes: USER_STAKE_DISCRIMINATOR.toString('base64'), encoding: 'base64' } },
            { memcmp: { offset: USER_OFFSET, bytes: wallet } },
          ],
        },
      ]),
      rpc<{ value: { data: [string, string] } | null }>('getAccountInfo', [STAKE_CONFIG, { encoding: 'base64' }]),
    ])
    if (stakeConfig.value) {
      const sharePrice = readU128(Buffer.from(stakeConfig.value.data[0], 'base64'), SHARE_PRICE_OFFSET)
      // Un wallet peut déléguer à plusieurs guardians : un UserStake par pool.
      const shares = stakes.reduce(
        (sum, { account }) => sum + readU128(Buffer.from(account.data[0], 'base64'), SHARES_OFFSET),
        0n,
      )
      staked = Number((shares * sharePrice) / SHARE_PRICE_SCALE / 10n ** SKR_DECIMALS)
    }
  } catch (error) {
    console.warn('[skr] lecture du stake impossible, quota de base', error)
    // Pas de mise en cache d'un échec : la prochaine capture réessaie.
    return 0
  }
  cache.set(wallet, { staked, at: Date.now() })
  return staked
}
