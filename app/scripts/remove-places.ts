/**
 * Retire des lieux de la chaîne, avec tout ce qui en dépend : outillage admin
 * de modération (#47), utilisé la première fois le 02/10/2026 pour sortir de la
 * carte les lieux d'un compte qui ne devait pas servir à la démo.
 *
 * Ordre imposé par le programme : `close_place` ne touche ni aux Like ni aux
 * Visit, et les compteurs de réputation se décrémentent à la fermeture de
 * chacun. Donc, par lieu :
 *   1. `close_like` pour chaque Like (rent rendu au likeur, retiré du ring buffer) ;
 *   2. `close_visit` pour chaque Visit (rent rendu au visiteur) ;
 *   3. `close_place_vault` si la cagnotte existe (solde et rent rendus au gardien —
 *      des royalties non distribuées lui reviennent donc en entier) ;
 *   4. `close_place` : la cellule redevient libre.
 *
 * Tout est découvert SUR LA CHAÎNE (getProgramAccounts), jamais dans le miroir :
 * c'est la seule source qui ne peut pas avoir oublié un compte. Le miroir se met
 * à jour après coup (colonne `mints.hidden_at`, voir le CLAUDE.md).
 *
 * Simulation par défaut. Usage :
 *   EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> KEEPER=<pubkey> npm run remove-places
 *   EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> PLACES=<pda>,<pda> npm run remove-places
 *   … CONFIRM=1 npm run remove-places      # exécute réellement
 *
 * Variante `ENGAGEMENT_OF=<pubkey>` : ferme les likes et visites qu'un wallet a
 * faits sur les lieux des AUTRES (le lieu reste). Utile quand un compte doit
 * disparaître de l'app : ses likes s'affichaient encore dans le fil d'activité
 * des gardiens. `close_like` / `close_visit` décrémentent la réputation du
 * gardien comme le ferait un unlike.
 *
 * ⚠️ Les adresses passent par l'environnement : n'en écrire aucune dans le repo.
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, type AccountMeta } from '@solana/web3.js'
import fs from 'node:fs'
import os from 'node:os'

// Discriminants (IDL place_registry).
const ACCOUNT = {
  place: [169, 120, 185, 251, 195, 252, 57, 193],
  like: [10, 133, 129, 201, 87, 218, 203, 222],
  visit: [210, 6, 191, 139, 168, 24, 25, 151],
}
const IX = {
  closeLike: [59, 56, 4, 223, 192, 175, 149, 6],
  closeVisit: [254, 191, 154, 3, 76, 226, 94, 134],
  closePlaceVault: [17, 43, 108, 90, 123, 208, 147, 15],
  closePlace: [2, 206, 71, 76, 229, 243, 94, 35],
}
// Offsets après les 8 octets du discriminant.
const PLACE_KEEPER = 8
const LIKE_LIKER = 8
const LIKE_PLACE = 40
const VISIT_VISITOR = 8
const VISIT_PLACE = 40

const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const keypairPath = (process.env.SOLANA_KEYPAIR ?? '~/.config/solana/placekeepr-dev.json').replace(/^~/, os.homedir())
const programId = process.env.EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM
const confirm = process.env.CONFIRM === '1'

if (rpcUrl.includes('mainnet') && process.env.ALLOW_MAINNET !== '1') {
  console.error('Refus : RPC mainnet détecté. Mettre ALLOW_MAINNET=1 pour forcer (à éviter).')
  process.exit(1)
}
if (!programId || (!process.env.KEEPER && !process.env.PLACES && !process.env.ENGAGEMENT_OF)) {
  console.error(
    'Requis : EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM et KEEPER=<pubkey>, PLACES=<pda>,… ou ENGAGEMENT_OF=<pubkey>.',
  )
  process.exit(1)
}

const program = new PublicKey(programId)
const connection = new Connection(rpcUrl, 'confirmed')
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program)[0]
const configPda = pda(Buffer.from('config'))

function discriminatorFilter(bytes: number[]) {
  return { memcmp: { offset: 0, bytes: Buffer.from(bytes).toString('base64'), encoding: 'base64' as const } }
}

async function accountsFor(kind: 'like' | 'visit', place: PublicKey) {
  const accounts = await connection.getProgramAccounts(program, {
    filters: [
      discriminatorFilter(ACCOUNT[kind]),
      { memcmp: { offset: kind === 'like' ? LIKE_PLACE : VISIT_PLACE, bytes: place.toBase58() } },
    ],
  })
  return accounts.map(({ pubkey, account }) => ({
    pubkey,
    owner: new PublicKey(
      account.data.subarray(
        kind === 'like' ? LIKE_LIKER : VISIT_VISITOR,
        (kind === 'like' ? LIKE_LIKER : VISIT_VISITOR) + 32,
      ),
    ),
  }))
}

function instruction(data: number[], keys: AccountMeta[]): TransactionInstruction {
  return new TransactionInstruction({ programId: program, keys, data: Buffer.from(data) })
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 2500))

async function runSteps(admin: Keypair, steps: { label: string; ix: TransactionInstruction }[]) {
  for (const step of steps) {
    if (!confirm) {
      console.log(`  · ${step.label}`)
      continue
    }
    const signature = await connection.sendTransaction(new Transaction().add(step.ix), [admin])
    await connection.confirmTransaction(signature, 'confirmed')
    console.log(`  ✓ ${step.label}  ${signature}`)
  }
}

/** Likes et visites faits PAR `wallet` sur les lieux des autres. */
async function withdrawEngagement(admin: Keypair, wallet: PublicKey) {
  const steps: { label: string; ix: TransactionInstruction }[] = []
  for (const kind of ['like', 'visit'] as const) {
    const ownerOffset = kind === 'like' ? LIKE_LIKER : VISIT_VISITOR
    const placeOffset = kind === 'like' ? LIKE_PLACE : VISIT_PLACE
    const accounts = await connection.getProgramAccounts(program, {
      filters: [discriminatorFilter(ACCOUNT[kind]), { memcmp: { offset: ownerOffset, bytes: wallet.toBase58() } }],
    })
    await pause()
    for (const { pubkey, account } of accounts) {
      const place = new PublicKey(account.data.subarray(placeOffset, placeOffset + 32))
      const placeInfo = await connection.getAccountInfo(place)
      if (!placeInfo) {
        // Lieu déjà fermé : le programme exige le compte Place pour fermer un
        // Like/Visit. Rare (close_place se joue après) — signalé, pas bloquant.
        console.log(`  ! ${kind} ${pubkey.toBase58().slice(0, 8)}… orphelin (lieu fermé), ignoré`)
        continue
      }
      const keeper = new PublicKey(placeInfo.data.subarray(PLACE_KEEPER, PLACE_KEEPER + 32))
      const keeperStats = pda(Buffer.from('keeper'), keeper.toBuffer())
      if (kind === 'like') {
        const vault = pda(Buffer.from('vault'), place.toBuffer())
        const vaultExists = (await connection.getAccountInfo(vault)) !== null
        steps.push({
          label: `close_like  ${pubkey.toBase58().slice(0, 8)}… (lieu ${place.toBase58().slice(0, 8)}…)`,
          ix: instruction(IX.closeLike, [
            { pubkey: admin.publicKey, isSigner: true, isWritable: false },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: place, isSigner: false, isWritable: false },
            { pubkey: wallet, isSigner: false, isWritable: true },
            { pubkey, isSigner: false, isWritable: true },
            { pubkey: keeperStats, isSigner: false, isWritable: true },
            { pubkey: vaultExists ? vault : program, isSigner: false, isWritable: vaultExists },
          ]),
        })
      } else {
        steps.push({
          label: `close_visit ${pubkey.toBase58().slice(0, 8)}… (lieu ${place.toBase58().slice(0, 8)}…)`,
          ix: instruction(IX.closeVisit, [
            { pubkey: admin.publicKey, isSigner: true, isWritable: false },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: place, isSigner: false, isWritable: false },
            { pubkey: wallet, isSigner: false, isWritable: true },
            { pubkey, isSigner: false, isWritable: true },
            { pubkey: keeperStats, isSigner: false, isWritable: true },
          ]),
        })
      }
    }
  }
  console.log(`Engagement de ${wallet.toBase58().slice(0, 4)}… : ${steps.length} compte(s) à fermer`)
  await runSteps(admin, steps)
}

async function main() {
  const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))))

  if (process.env.ENGAGEMENT_OF) {
    console.log(`RPC    : ${rpcUrl}`)
    console.log(`Mode   : ${confirm ? 'EXÉCUTION' : 'simulation (CONFIRM=1 pour exécuter)'}\n`)
    await withdrawEngagement(admin, new PublicKey(process.env.ENGAGEMENT_OF))
    return
  }

  let places: { pubkey: PublicKey; keeper: PublicKey }[]
  if (process.env.PLACES) {
    places = await Promise.all(
      process.env.PLACES.split(',').map(async (address) => {
        const pubkey = new PublicKey(address.trim())
        const info = await connection.getAccountInfo(pubkey)
        if (!info) throw new Error(`Lieu introuvable : ${address}`)
        return { pubkey, keeper: new PublicKey(info.data.subarray(PLACE_KEEPER, PLACE_KEEPER + 32)) }
      }),
    )
  } else {
    const keeper = new PublicKey(process.env.KEEPER!)
    const accounts = await connection.getProgramAccounts(program, {
      filters: [discriminatorFilter(ACCOUNT.place), { memcmp: { offset: PLACE_KEEPER, bytes: keeper.toBase58() } }],
    })
    places = accounts.map(({ pubkey }) => ({ pubkey, keeper }))
  }

  console.log(`RPC    : ${rpcUrl}`)
  console.log(`Admin  : ${admin.publicKey.toBase58()}`)
  console.log(`Mode   : ${confirm ? 'EXÉCUTION' : 'simulation (CONFIRM=1 pour exécuter)'}`)
  console.log(`Lieux  : ${places.length}\n`)

  for (const place of places) {
    // Le RPC devnet public limite getProgramAccounts : on respire entre deux lieux.
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const keeperStats = pda(Buffer.from('keeper'), place.keeper.toBuffer())
    const vault = pda(Buffer.from('vault'), place.pubkey.toBuffer())
    const vaultExists = (await connection.getAccountInfo(vault)) !== null
    const likes = await accountsFor('like', place.pubkey)
    const visits = await accountsFor('visit', place.pubkey)

    const steps: { label: string; ix: TransactionInstruction }[] = [
      ...likes.map((like) => ({
        label: `close_like  ${like.pubkey.toBase58().slice(0, 8)}…`,
        ix: instruction(IX.closeLike, [
          { pubkey: admin.publicKey, isSigner: true, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: place.pubkey, isSigner: false, isWritable: false },
          { pubkey: like.owner, isSigner: false, isWritable: true },
          { pubkey: like.pubkey, isSigner: false, isWritable: true },
          { pubkey: keeperStats, isSigner: false, isWritable: true },
          // Compte optionnel : l'adresse du programme signifie « absent ».
          { pubkey: vaultExists ? vault : program, isSigner: false, isWritable: vaultExists },
        ]),
      })),
      ...visits.map((visit) => ({
        label: `close_visit ${visit.pubkey.toBase58().slice(0, 8)}…`,
        ix: instruction(IX.closeVisit, [
          { pubkey: admin.publicKey, isSigner: true, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: place.pubkey, isSigner: false, isWritable: false },
          { pubkey: visit.owner, isSigner: false, isWritable: true },
          { pubkey: visit.pubkey, isSigner: false, isWritable: true },
          { pubkey: keeperStats, isSigner: false, isWritable: true },
        ]),
      })),
      ...(vaultExists
        ? [
            {
              label: 'close_place_vault',
              ix: instruction(IX.closePlaceVault, [
                { pubkey: admin.publicKey, isSigner: true, isWritable: false },
                { pubkey: configPda, isSigner: false, isWritable: false },
                { pubkey: place.pubkey, isSigner: false, isWritable: false },
                { pubkey: place.keeper, isSigner: false, isWritable: true },
                { pubkey: vault, isSigner: false, isWritable: true },
              ]),
            },
          ]
        : []),
      {
        label: 'close_place',
        ix: instruction(IX.closePlace, [
          { pubkey: admin.publicKey, isSigner: true, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: place.keeper, isSigner: false, isWritable: true },
          { pubkey: place.pubkey, isSigner: false, isWritable: true },
        ]),
      },
    ]

    console.log(
      `Lieu ${place.pubkey.toBase58()} — ${likes.length} like(s), ${visits.length} visite(s), cagnotte ${vaultExists ? 'oui' : 'non'}`,
    )
    for (const step of steps) {
      if (!confirm) {
        console.log(`  · ${step.label}`)
        continue
      }
      // Une transaction par étape : un échec s'arrête net, au bon endroit,
      // et le script se relance sans danger (ce qui est fermé n'est plus trouvé).
      const signature = await connection.sendTransaction(new Transaction().add(step.ix), [admin])
      await connection.confirmTransaction(signature, 'confirmed')
      console.log(`  ✓ ${step.label}  ${signature}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
