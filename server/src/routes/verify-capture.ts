import { Hono } from 'hono'
import {
  bytesEqual,
  cellE4,
  i32le,
  loadVerifier,
  parseMessage,
  placePda,
  placeVaultPda,
  signMessage,
  soleProgramInstruction,
  verifierIsSigner,
  verifierOnlyIn,
  type ProgramInstruction,
} from '../cosign.ts'
import { assetExists, publicAssetUrl } from '../assets.ts'
import { BUBBLEGUM_PROGRAM, MINT_V2_ACCOUNTS, parseMintV2 } from '../bubblegum.ts'
import { REGISTER_PLACE_DISCRIMINATOR } from '../mint-proof.ts'
import { config } from '../config.ts'
import * as db from '../db.ts'
import type { PublicKey } from '@solana/web3.js'
import {
  MAX_ACCURACY_M,
  MAX_SPEED_M_S,
  MIN_PLACE_DISTANCE_M,
  captureLimitJudge,
  dailyCaptureLimit,
} from '../verification.ts'
import { skrStaked } from '../skr.ts'

/**
 * Vérification GPS d'une capture + co-signature du registre — port fidèle de
 * l'edge function Supabase (`supabase/functions/verify-capture`).
 *
 * Sans `message` : simple verdict de plausibilité. Avec `message` (message de
 * transaction sérialisé, base64) : on vérifie que la transaction contient bien
 * register_place — et **rien d'autre** du programme — avec les bonnes
 * coordonnées, le bon keeper et ce vérifieur comme signataire, puis on
 * co-signe. Le programme place_registry exige cette signature, c'est elle qui
 * rend la vérif incontournable.
 *
 * Le secret VERIFIER_KEYPAIR ne vit que dans l'environnement du service.
 * Compromettre la machine, c'est compromettre la vérif : rotation possible
 * par `set_verifier` (admin du programme).
 */

// sha256("global:register_place")[0..8]
const DISCRIMINATOR = REGISTER_PLACE_DISCRIMINATOR

// Comptes de register_place : keeper, place, config, verifier, system.
const KEEPER_ACCOUNT = 0
const PLACE_ACCOUNT = 1
const VERIFIER_ACCOUNT = 3

// Ce que l'app grave dans chaque cNFT (use-mint-place.tsx). Figé ici : le
// vérifieur ne co-signe que le mint que l'app produit, rien d'approchant.
const SYMBOL = 'PLACE'
const SELLER_FEE_BASIS_POINTS = 500
// Métadonnées déposées avant le mint, nommées par le sha256 de la photo.
const METADATA_NAME = /^[0-9a-f]{32}\.json$/

/**
 * Le `mintV2` de la capture est-il exactement celui qu'on accepte de
 * co-signer (#40) ? L'arbre est privé, son délégué est ce vérifieur : sans ce
 * contrôle, sa signature autoriserait n'importe quel mint dans l'arbre
 * officiel — autre propriétaire, métadonnées ou créateurs arbitraires.
 */
async function isExpectedMint(
  message: Parameters<typeof verifierIsSigner>[0],
  mint: ProgramInstruction,
  minter: string,
  vault: PublicKey,
  verifier: PublicKey,
): Promise<boolean> {
  const args = parseMintV2(mint.data)
  if (!args) {
    return false
  }
  const { leafOwner, leafDelegate, merkleTree, coreCollection, treeCreatorOrDelegate } = MINT_V2_ACCOUNTS
  const delegate = mint.accounts[leafDelegate]?.toBase58()
  const creator = args.creators[0]
  const metadataName = args.uri.startsWith(publicAssetUrl('')) ? args.uri.slice(publicAssetUrl('').length) : ''
  return (
    mint.accounts[merkleTree]?.toBase58() === config.merkleTree &&
    mint.accounts[leafOwner]?.toBase58() === minter &&
    // Absent (= ID du programme) : Bubblegum prend le propriétaire.
    (delegate === minter || delegate === BUBBLEGUM_PROGRAM) &&
    mint.accounts[coreCollection]?.toBase58() === BUBBLEGUM_PROGRAM &&
    verifierIsSigner(message, mint, treeCreatorOrDelegate, verifier) &&
    args.symbol === SYMBOL &&
    args.sellerFeeBasisPoints === SELLER_FEE_BASIS_POINTS &&
    args.collection === null &&
    !args.hasAssetData &&
    !args.hasAssetDataSchema &&
    // Créateur unique : la cagnotte du lieu, DÉRIVÉE de la cellule vérifiée.
    args.creators.length === 1 &&
    creator?.address.equals(vault) === true &&
    creator.share === 100 &&
    !creator.verified &&
    // Les métadonnées vivent chez nous et existent déjà : l'URI est gravée
    // on-chain et non réécrivable.
    METADATA_NAME.test(metadataName) &&
    (await assetExists(metadataName))
  )
}

export const verifyCapture = new Hono()

verifyCapture.post('/verify-capture', async (c) => {
  let payload: Record<string, unknown>
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ ok: false, reason: 'bad_request' }, 400)
  }
  const { minter, latitude, longitude, accuracy, mocked, message } = payload ?? {}
  if (
    typeof minter !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return c.json({ ok: false, reason: 'bad_request' }, 400)
  }
  if (mocked === true) {
    return c.json({ ok: false, reason: 'mock_location' })
  }
  if (typeof accuracy !== 'number' || accuracy <= 0 || accuracy > MAX_ACCURACY_M) {
    return c.json({ ok: false, reason: 'accuracy' })
  }

  let last: { distance_m: number; seconds_elapsed: number } | undefined
  try {
    last = await db.presenceCheck(minter, latitude, longitude)
  } catch (error) {
    console.error('presence_check', error)
    return c.json({ ok: false, reason: 'server_error' }, 500)
  }
  if (last) {
    const seconds = Math.max(Number(last.seconds_elapsed), 1)
    if (Number(last.distance_m) / seconds > MAX_SPEED_M_S) {
      return c.json({ ok: false, reason: 'travel_speed' })
    }
  }

  const cell: db.CaptureCell = {
    wallet: minter,
    latitude,
    longitude,
    latE4: cellE4(latitude),
    lngE4: cellE4(longitude),
  }

  // Pas de transaction soumise : verdict seul. C'est le pré-contrôle que
  // l'app fait au déclenchement, avant la photo et les uploads — un refus
  // quota/distance à la co-signature laisserait des assets orphelins. Aussi
  // le mode dégradé sans registre. Lecture seule : rien n'est enregistré.
  // Quota selon le SKR staké sur mainnet — lu ici, HORS du verrou global de
  // grantCapture : un aller-retour réseau n'a rien à faire dans une section
  // critique. Fail-open : RPC en panne = quota de base.
  const judgeCaptureLimits = captureLimitJudge(dailyCaptureLimit(await skrStaked(minter)))

  if (message === undefined) {
    let rejection
    try {
      rejection = judgeCaptureLimits(await db.captureLimits(cell, MIN_PLACE_DISTANCE_M))
    } catch (error) {
      console.error('capture_limits', error)
      return c.json({ ok: false, reason: 'server_error' }, 500)
    }
    return c.json(rejection ? { ok: false, ...rejection } : { ok: true })
  }
  if (typeof message !== 'string') {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  const verifier = loadVerifier()
  if (!verifier || !config.merkleTree) {
    console.error('VERIFIER_KEYPAIR ou MERKLE_TREE manquant')
    return c.json({ ok: false, reason: 'verifier_unavailable' }, 503)
  }

  const parsed = parseMessage(message)
  if (!parsed) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  // La transaction doit contenir register_place — et aucune autre instruction
  // du programme — avec exactement les coordonnées vérifiées, le minter
  // annoncé comme keeper, et ce service comme signataire.
  const ix = soleProgramInstruction(parsed.message, config.placeRegistryProgram)
  if (!ix) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }
  const { latE4, lngE4 } = cell
  const expectedData = new Uint8Array([...DISCRIMINATOR, ...i32le(latE4), ...i32le(lngE4)])
  if (
    !bytesEqual(ix.data, expectedData) ||
    ix.accounts[KEEPER_ACCOUNT]?.toBase58() !== minter ||
    // Le PDA est dérivé ici, pas reçu : la cellule signée est celle vérifiée.
    ix.accounts[PLACE_ACCOUNT]?.equals(placePda(latE4, lngE4)) !== true ||
    !verifierIsSigner(parsed.message, ix, VERIFIER_ACCOUNT, verifier.publicKey)
  ) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  // Le mint qui l'accompagne : un seul, dans l'arbre privé dont ce vérifieur
  // est délégué, et rien d'autre ne mobilise sa signature.
  const mint = soleProgramInstruction(parsed.message, BUBBLEGUM_PROGRAM)
  if (
    !mint ||
    !(await isExpectedMint(parsed.message, mint, minter, placeVaultPda(placePda(latE4, lngE4)), verifier.publicKey)) ||
    !verifierOnlyIn(parsed.message, [ix, mint], verifier.publicKey)
  ) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  // Dernier contrôle, APRÈS celui du message : seule une transaction qui
  // aurait été co-signée consomme du quota. Relu et enregistré sous verrou,
  // le pré-contrôle ne suffit pas (deux requêtes simultanées au seuil).
  let rejection
  try {
    rejection = await db.grantCapture(cell, MIN_PLACE_DISTANCE_M, judgeCaptureLimits)
  } catch (error) {
    console.error('grant_capture', error)
    return c.json({ ok: false, reason: 'server_error' }, 500)
  }
  if (rejection) {
    return c.json({ ok: false, ...rejection })
  }

  return c.json({
    ok: true,
    verifier: verifier.publicKey.toBase58(),
    signature: signMessage(parsed.bytes, verifier),
  })
})
