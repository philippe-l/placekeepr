/**
 * Crée un arbre de Merkle Bubblegum V2 *privé* sur le réseau pointé par
 * SOLANA_RPC_URL (devnet par défaut), puis en délègue le mint au vérifieur.
 *
 * Pourquoi privé (#40) : un arbre public accepte un `mintV2` de n'importe quel
 * wallet — sans registre, sans vérif GPS, avec des métadonnées arbitraires.
 * Privé, seul le délégué (le vérifieur, qui co-signe déjà chaque capture) peut
 * y minter : la chaîne vérif GPS → co-signature protège alors le mint, plus
 * seulement le registre.
 *
 * Usage :
 *   TREE_DELEGATE=<pubkey vérifieur> npm run create-tree
 *   PUBLIC_TREE=1 npm run create-tree      # mode dégradé sans registre seulement
 *
 * Le créateur (SOLANA_KEYPAIR, wallet dev par défaut) garde le droit de
 * changer de délégué — à refaire à chaque rotation du vérifieur (`set_verifier`),
 * sinon plus aucun mint ne passe.
 *
 * Reporter l'adresse affichée dans app/.env → EXPO_PUBLIC_MERKLE_TREE et dans
 * server/.env → MERKLE_TREE.
 */
import {
  createTreeV2,
  fetchTreeConfigFromSeeds,
  mplBubblegum,
  setTreeDelegate,
} from '@metaplex-foundation/mpl-bubblegum'
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import fs from 'node:fs'
import os from 'node:os'

const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const keypairPath = (process.env.SOLANA_KEYPAIR ?? '~/.config/solana/placekeepr-dev.json').replace(/^~/, os.homedir())

// Garde-fou : devnet uniquement pendant la phase d'apprentissage (voir CLAUDE.md).
if (rpcUrl.includes('mainnet') && process.env.ALLOW_MAINNET !== '1') {
  console.error('Refus : RPC mainnet détecté. Mettre ALLOW_MAINNET=1 pour forcer (à éviter).')
  process.exit(1)
}

if (!fs.existsSync(keypairPath)) {
  console.error(`Keypair introuvable : ${keypairPath}`)
  console.error('Créer un wallet dédié au projet : solana-keygen new -o ~/.config/solana/placekeepr-dev.json')
  process.exit(1)
}

const isPublic = process.env.PUBLIC_TREE === '1'
const treeDelegate = process.env.TREE_DELEGATE ?? ''
if (!isPublic && !treeDelegate) {
  console.error('TREE_DELEGATE manquant : pubkey du vérifieur (EXPO_PUBLIC_PLACE_VERIFIER).')
  process.exit(1)
}

async function main() {
  const umi = createUmi(rpcUrl).use(mplBubblegum())
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secretKey)))

  console.log(`RPC      : ${rpcUrl}`)
  console.log(`Payer    : ${umi.identity.publicKey}`)

  const merkleTree = generateSigner(umi)
  // 2^14 = 16 384 cNFTs, buffer 64 : largement assez pour le devnet,
  // et le moins cher en rent (~0,3 SOL). À redimensionner pour la prod.
  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    public: isPublic,
  })
  await builder.sendAndConfirm(umi)
  console.log(`\nArbre créé (${isPublic ? 'PUBLIC' : 'privé'}) : ${merkleTree.publicKey}`)

  if (!isPublic) {
    await setTreeDelegate(umi, {
      merkleTree: merkleTree.publicKey,
      newTreeDelegate: publicKey(treeDelegate),
    }).sendAndConfirm(umi)
    // Relu on-chain plutôt que supposé : un délégué raté = aucun mint possible.
    const config = await fetchTreeConfigFromSeeds(umi, { merkleTree: merkleTree.publicKey })
    console.log(`Créateur : ${config.treeCreator}`)
    console.log(`Délégué  : ${config.treeDelegate}`)
    console.log(`Public   : ${config.isPublic}`)
    if (config.treeDelegate !== publicKey(treeDelegate) || config.isPublic) {
      throw new Error('Arbre mal configuré : délégué ou visibilité inattendus')
    }
  }

  console.log(`\nÀ reporter :\n  app/.env    EXPO_PUBLIC_MERKLE_TREE=${merkleTree.publicKey}`)
  console.log(`  server/.env MERKLE_TREE=${merkleTree.publicKey}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
