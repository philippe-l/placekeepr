# Projet : App Proof-of-Location NFT (Solana / Seeker)

## Concept

App mobile « Strava des lieux » : les utilisateurs mintent des cNFTs à des emplacements physiques, vérifiés par GPS + photo.

**Mécaniques clés :**

- Premier à mint un lieu = **gardien** du lieu
- **Réputation** accumulée via l'engagement des visiteurs (likes, visites)
- **Royalties** sur ventes secondaires : split entre gardien / trésorerie app / likers récents

## Stack technique

### Mobile

- **React Native + Expo** (déjà maîtrisé)
- **MapLibre** pour la carto
- Mobile Wallet Adapter Solana (cible Seeker)

### Off-chain

- **API maison** (`server/`) : Hono + Node 22, auto-hébergée sur VPS. A remplacé
  Supabase le 10/09/2026 (l'auto-pause du plan free était intenable pour une démo).
- **PostGIS** : requêtes géospatiales (lieux à proximité, clusters, etc.)
- **Helius webhooks** : indexation des events on-chain → API maison

### On-chain (Solana)

- **Programme Anchor** :
  - Registry d'unicité des lieux (1 seul NFT par coord. à un seuil de précision)
  - PDAs de réputation par gardien
  - Logique de split des royalties
- **cNFTs via Metaplex Bubblegum** (compressed pour coûts/scalabilité)

## Architecture

```
   [App RN/Expo]
        │
        ├──► [Supabase + PostGIS]  ◄── [Helius indexer]
        │       (geo, photos, cache)         ▲
        │                                    │
        └──► [Solana RPC] ──► [Anchor program]
                              [cNFTs Bubblegum]
```

## Roadmap (10–12 semaines, soirs/WE)

1. **Phase 1** — Setup wallet/devnet, premier mint cNFT depuis l'app _(fait — premier cNFT minté
   depuis le Seeker le 11/06/2026, flow caméra inclus)_
2. **Phase 2** — Programme Anchor : registry d'unicité + vérif GPS côté client + serveur
   _(fait — registre + co-signature vérifieur, 07/07/2026)_
3. **Phase 3** — Réputation gardien + indexer Helius → Supabase _(fait — likes on-chain,
   miroir Supabase, boucle complète validée sur Seeker le 08/07/2026 ; refonte UI 1a/4a/5a
   livrée dans la foulée : 3 onglets, écran Gardien, célébration, fiche lieu)_
4. **Phase 4** — Royalties + UX gardien/visiteur. Visites (présence physique
   co-signée) : programme le 10/07/2026, app + serveur + indexer le 14/09/2026 —
   boucle complète, réputation pondérée (like 1, visite 2) affichée partout.
   Pseudos/avatars le 17/09/2026 (off-chain, signature de message).
   Royalties le 18/09/2026 : programme déployé en devnet et APK rebuildé le
   jour même ; chaîne like → ring buffer → distribution validée sur le Seeker
   le 24/09/2026 (60/20/20 constaté on-chain). L'indexer royalties n'a atteint
   le VPS que le 25/09 : les deux événements manqués ont été rejoués
   (`replay-helius-tx`).

**Sortie de Supabase (10/09/2026)** — migration vers `server/` sur le VPS, chaîne
complète validée en production le jour même : capture → vérif GPS co-signée →
registre + mint → miroir → indexer. Le durcissement RLS qui figurait ici tombe de
lui-même : plus aucun client n'écrit en base, l'API valide côté serveur.

**Échéance** : hackathon Solana Mobile **CLOCK IN**, soumission avant le
**8 octobre 2026**. Les gagnants doivent publier sur le dApp Store — devnet seul
ne suffira pas.

## Code : structure & commandes

L'app Expo vit dans `app/` (template `solana-foundation/templates/mobile/web3js-expo`,
Expo SDK 55, expo-router). Le programme Anchor vit dans `program/` (workspace
`anchor init` 1.1.2, tests Rust in-process via LiteSVM). L'API auto-hébergée vit
dans `server/` (Hono, voir `server/README.md`).

```bash
cd app
npm run android        # build dev + lance sur device/émulateur Android (requis : MWA ne marche pas dans Expo Go)
npm run dev            # metro seul (si build dev déjà installé)
npm run build          # tsc --noEmit + expo prebuild -p android
npm run ci             # tsc + lint + format check + prebuild
npm run lint           # expo lint --fix
TREE_DELEGATE=<pubkey vérifieur> npm run create-tree   # arbre Bubblegum V2 PRIVÉ délégué au vérifieur (#40)
# Les deux scripts royalties tournent sous tsx, qui ne lit PAS .env : variables en préfixe.
EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> npm run set-treasury      # pose le PDA ["treasury"] (admin) — UNE FOIS par déploiement
EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> PLACE=48.8584,2.2945 AMOUNT=0.1 npm run deposit-royalty   # vente secondaire simulée
HELIUS_WEBHOOK_SECRET=<secret> npm run replay-helius-tx -- <sig> [<sig>…]   # rejoue des tx vers l'indexer (miroir en retard)

cd server
npm run dev            # API en local (node --watch, type stripping natif)
npm run typecheck      # tsc --noEmit
docker compose up -d --build   # sur le VPS uniquement

cd program
anchor build           # compile le programme SBF (toolchain : voir ci-dessous)
anchor test            # cargo test — LiteSVM in-process, pas de validator local
anchor deploy --provider.cluster devnet   # déploie, payé par le wallet dev (Anchor.toml)
```

Pas de tests unitaires côté app pour l'instant ; le programme, lui, est testé (LiteSVM).

**Toolchain programme** : `anchor` et `solana` (CLI) via Homebrew ; la toolchain de
build SBF (`cargo-build-sbf`) vient de l'installeur Anza
(`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`,
binaire dans `~/.local/share/solana/install/active_release/bin` — la formule brew
ne l'embarque pas). **Piège PATH** : `cargo-build-sbf` invoque `cargo +toolchain`,
qui n'existe que via le shim rustup → `~/.cargo/bin` doit précéder `/opt/homebrew/bin`
dans le PATH pour `anchor build`/`test` (sinon « no such command: +1.89.0-sbpf… »).
**Déploiement devnet** (18/09/2026) : le compte ProgramData est alloué à
419 184 o. Un `.so` plus gros exige `solana program extend <program> <octets>`
**avant** `anchor deploy`, sinon l'upgrade échoue. Le compte a été sur-financé
par l'ancien tarif de rent : tant que l'extension reste sous ~419 Ko elle ne
coûte que les frais de tx, seul le buffer de déploiement (~2,1 SOL) doit être
disponible, et il est remboursé après l'upgrade. Anchor 1.x enchaîne ensuite
sur l'écriture d'un **compte IDL on-chain** qui échoue (`Failed to initialize
IDL`) : sans importance, l'app construit ses instructions à la main — vérifier
que la ligne `Sending upgrade transaction... Signature:` est bien passée avant,
elle, et comparer le `shasum` de `solana program dump` au `.so` local — **tronqué à
la taille du `.so`** (`head -c $(stat -f %z <.so>)`) : le dump rend tout le
ProgramData, complété de zéros, et son hash brut diffère toujours.

Le keypair du program ID est dans `program/target/deploy/`
(gitignoré — à sauvegarder pour pouvoir redéployer sous le même ID ailleurs).

### Points d'architecture app

- **Config réseau** : `app/constants/app-config.ts`. Tout passe par `EXPO_PUBLIC_SOLANA_NETWORK`,
  `EXPO_PUBLIC_SOLANA_RPC_URL`, `EXPO_PUBLIC_MERKLE_TREE` (voir `app/.env.example`).
  Mainnet n'apparaît dans le sélecteur de cluster que si demandé explicitement par l'env.
- **Wallet** : `useMobileWallet()` de `@wallet-ui/react-native-web3js` fournit
  `account`, `connection`, `signAndSendTransactions`. Pattern de référence :
  `app/components/account/use-transfer-sol.tsx`.
- **Mint cNFT** : `app/components/mint/use-mint-place.tsx` — instruction `mintV2`
  (Bubblegum V2) construite avec Umi + noop signer, convertie en web3.js via
  `umi-web3js-adapters`, signée par MWA. **Arbre privé** (#40, 28/09/2026,
  `Cz88mxAU…`), créé par `scripts/create-tree.ts` et **délégué au vérifieur** :
  le mint n'y entre qu'avec sa co-signature (`treeCreatorOrDelegate` = noop
  signer du vérifieur côté app). Le précédent arbre, public (`E8zNHekC…`),
  acceptait un `mintV2` de n'importe quel wallet, sans registre ni vérif GPS :
  c'est constaté sur devnet, un wallet jetable y a minté. Les cNFT d'avant le
  28/09 y restent.
  `/verify-capture` inspecte le mint (`server/src/bubblegum.ts`). Il exige :
  - un seul `mintV2`, sur `MERKLE_TREE` ;
  - `leafOwner` = minter ;
  - un créateur unique, le vault **dérivé** de la cellule ;
  - des royalties à 500 bps, le symbole `PLACE`, aucune collection ;
  - une URI pointant vers un JSON **déjà déposé** chez nous.
  
  Délégué de l'arbre, le vérifieur est aussi l'autorité de
  `updateMetadataV2` : d'où la règle `verifierOnlyIn` de `cosign.ts`, sur les
  deux routes co-signantes.
  **Rotation du vérifieur** (`set_verifier`) : refaire `setTreeDelegate`
  (créateur = wallet dev) dans la foulée, sinon plus aucun mint ne passe.
  Le mode dégradé sans registre exige un arbre public (`PUBLIC_TREE=1`).
  Photo obligatoire (caméra seulement, position figée au déclenchement) ; photo persistée
  dans `documents/mints/<signature>.jpg` (= la preuve, jamais altérée) + miniature
  pixel-art `<signature>.thumb.png` pour l'affichage in-app (`pixelate-place-photo.ts` :
  downscale 64 px → posterisation → upscale ×6 nearest, pur JS) et journal des mints en AsyncStorage
  (`mint-log.ts`) — source d'affichage de l'app, miroité vers Supabase (voir ci-dessous).
  Unicité on-chain : `register-place.ts` préfixe la tx de mint d'une instruction
  `register_place` (programme `place_registry`, `EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM`,
  instruction construite à la main — discriminator + args LE, pas de client Anchor
  embarqué) ; cellule prise → toute la tx échoue (« already in use » → message
  `map.placeTaken`). Sans la var d'env : mint sans registre, mode dégradé.
  Métadonnées cNFT réelles : `place-metadata.ts` uploade photo + JSON Metaplex sous un
  `placeId` (UUID) **avant** le mint — l'URI doit entrer dans l'instruction `mintV2`,
  la signature n'existe pas encore. Échec d'upload = échec de la capture ; un mint
  abandonné après upload laisse un orphelin dans le bucket (assumé en devnet).
  Sans Supabase configuré, repli sur l'URI placeholder.
- **Backend** (`server/`, VPS depuis le 10/09/2026) : Hono + `@hono/node-server`,
  Postgres 17 + PostGIS, Node 22 en *type stripping* natif (**pas d'étape de build**,
  et donc pas de propriété de paramètre ni d'`enum` : `tsc` les accepte, l'exécution
  non). L'app parle au **contrat `Backend`** (`app/utils/backend/types.ts`), jamais à
  un client concret : `http-backend.ts` (VPS) l'implémente, `index.ts` le crée si
  `EXPO_PUBLIC_API_URL` est posée, sinon mode local pur (`supabase-backend.ts` a été
  retiré le 06/10/2026).
  Routes alignées sur le contrat + `/health` (voir `server/README.md`).
  **Migrations** : `db/schema.sql` n'est joué qu'au premier démarrage d'un volume
  Postgres vide — donc plus jamais sur le VPS. Toute évolution passe *aussi* par
  `server/db/migrations/`, appliqué au démarrage de l'API (`src/migrate.ts`,
  table `schema_migrations`, verrou consultatif, une transaction par migration).
  Deux règles : tout objet nouveau est écrit dans la migration **et** dans
  `schema.sql` (la forme courante lisible), et les migrations sont rejouables.
  Sync : `app/components/mint/sync-mint-log.ts` — best-effort, lancée au démarrage
  (`_layout.tsx`) et après chaque mint. **Le diff ne porte pas sur la seule présence
  de la signature** : l'indexer insère la tx ~2 s après la chaîne quand la sync passe
  ~9 s après, donc une ligne peut exister sans photos ni position précise.
  `mintSyncState()` distingue *connue* de *complète*, et `saveMint()` insère **ou
  complète**. Ne jamais revenir à un simple insert-or-ignore : les photos ne
  remontaient plus depuis juillet à cause de ça.
  `forget-place.ts` reste local : la ligne en base est comptable, on ne l'efface pas.
- **Audit de sécurité du 29/09/2026**, avant le passage en public :
  - **`POST /mints` exige une preuve on-chain** (`server/src/mint-proof.ts`). La
    route était anonyme : on y inventait une capture n'importe où, au nom de
    n'importe qui, et l'upsert *écrasait* photo et position (`coalesce` dans le
    mauvais ordre). Désormais le serveur relit la tx sur `SOLANA_RPC_URL` avant
    d'écrire : elle a réussi, son payeur est le minter, et son `register_place`
    porte la cellule de la position envoyée. Dans l'upsert, la valeur existante
    gagne toujours, et la position ne complète qu'une ligne de l'indexer.
  - **Positions publiques arrondies à la cellule** (`/places/nearby`, `/mints`) : la
    position précise d'une capture localisait un domicile au mètre près. Elle
    reste en base pour le contrôle de vitesse.
  - **EXIF retiré** des photos avant le hash (`app/utils/strip-jpeg-metadata.ts`,
    sans réencodage) : modèle du téléphone et heure exacte, parfois GPS.
  - **Supabase mis en pause** : il n'est plus utilisé, et sa clé publishable
    partait dans l'APK. Il est gardé plutôt que supprimé, parce que les cNFT de
    juillet pointent vers son stockage. Retirer `EXPO_PUBLIC_SUPABASE_*` du `.env`
    de build release.
    Le 06/10/2026, après l'audit de la plateforme CLOCK IN, le code client
    Supabase est **retiré** de l'app (`supabase-backend.ts`, `supabase-js`,
    `EXPO_PUBLIC_SUPABASE_*`) : l'API maison est le seul backend, et sans
    `EXPO_PUBLIC_API_URL` l'app tourne en mode local pur.
  - Même passe : licence **MIT** (`LICENSE`, `Cargo.toml` du programme) et image
    Docker du serveur **figée par digest**. Le build local sur Mac échoue en
    arm64 (`utf-8-validate` sans binaire précompilé) : valider avec
    `--platform linux/amd64`, l'architecture du VPS.
  - Une entrée refusée par le serveur ne bloque plus la sync des suivantes.
- **VPS** : OVH `151.80.233.39`, alias SSH `baladezen-vps`, stack dans
  `/home/debian/placekeepr/`. **Machine partagée avec BaladeZen**, dont le nginx
  détient 80/443 et gère certbot pour plusieurs domaines. PlaceKeepr n'embarque donc
  pas de reverse proxy : l'API rejoint le réseau externe `baladezen_web` sous l'alias
  `placekeepr-api`, et `server/nginx/placekeepr.conf` se dépose dans leur `conf.d/`.
  **Ordre impératif** : démarrer la stack AVANT de recharger nginx, et obtenir le
  certificat avant de déposer la conf — `proxy_pass` vers un alias et les chemins de
  certificat sont résolus au chargement, une conf invalide empêche nginx de démarrer
  **et emporte BaladeZen**. Toujours `nginx -t` avant `nginx -s reload`.
  Secrets dans `server/.env` (600, générés sur place). Sauvegarde quotidienne à
  03:00 UTC : timer systemd `placekeepr-backup.timer` → `server/scripts/backup.sh`
  (dump + assets dans `/home/debian/backups/placekeepr`, rétention 14 j).
  Elle est sur le même disque que les données : elle couvre la fausse manœuvre, pas
  la panne disque. **Les assets sont la seule donnée non reconstructible** — le reste
  se rejoue depuis la chaîne via l'indexer.
- **Indexer Helius** (Phase 3) : route `POST /helius-webhook`
  (`server/src/routes/helius-webhook.ts`) — reçoit les tx « enhanced » du programme,
  décode `register_place`, réconcilie `mints` : `indexed_at` posé sur les lignes
  déclarées par l'app, insertion des tx inconnues (précision cellule, sans photos).
  Décode aussi `like_place`/`unlike_place` vers les tables miroir `places` et `likes`
  (état courant par PDA Like, `unliked_at` null = actif, re-like = réactivation de la
  même ligne). `nearby_places` v2 : dédup par cellule (fiche canonique = celle dont la
  tx a inscrit le registre, sinon la plus ancienne) + `like_count`. Auth par secret
  partagé `HELIUS_WEBHOOK_SECRET`, comparé à temps constant, fail-closed.
  Enregistrement : `app/scripts/register-helius-webhook.ts` (requiert `HELIUS_API_KEY`),
  idempotent — il met à jour l'abonnement existant. **Piège Helius** : la réponse de
  *liste* n'expose pas `accountAddresses`, seul le GET unitaire le fait ; s'y fier crée
  un doublon qui livre en parallèle vers deux backends. `indexed_at` null = ligne
  jamais confirmée par la chaîne.
- **Vérif GPS** (Phase 2) : `app/components/mint/verify-capture.ts` — au déclenchement,
  position fraîche expo-location, rejet si `mocked` (position simulée Android) ou
  précision > 25 m ; à la capture, la route `POST /verify-capture`
  (`server/src/routes/verify-capture.ts`) rend son verdict (vitesse de déplacement
  depuis la dernière capture du wallet, fonction SQL `travel_check` PostGIS,
  > ~900 km/h = refus) **puis co-signe la transaction** après l'avoir inspectée
  (bonnes coordonnées, bon keeper, elle-même signataire). Le programme
  `place_registry` exige cette signature (PDA config ["config"] : admin = wallet dev,
  vérifieur rotatif via `set_verifier`) — la vérif est incontournable, même en
  appelant le programme direct. Secret : `VERIFIER_KEYPAIR` dans `server/.env`
  (jamais commité) ; pubkey côté app : `EXPO_PUBLIC_PLACE_VERIFIER`. Un verdict de
  refus est un **200 avec `ok:false`** ; un non-2xx est une vraie erreur. Messages
  `map.rejected.*`. Limite restante : `mocked` ne voit pas le spoof système (device
  rooté) — territoire Play Integrity, hors scope devnet.
  **Règle de l'instruction unique** (`server/src/cosign.ts`, 14/09/2026) : le
  vérifieur signe un **message**, pas une instruction — toute instruction du
  message exigeant sa signature était autorisée du même coup. Joindre un second
  `register_place` à une capture légitime le faisait co-signer au passage. Les
  deux routes co-signantes refusent donc tout message portant plus d'une
  instruction `place_registry`, et le PDA du lieu est **dérivé** des coordonnées
  vérifiées, jamais cru sur parole. Ne jamais assouplir ça pour « batcher ».
  Généralisée le 28/09/2026 (#40) : `verifierOnlyIn` refuse tout message où la
  clé du vérifieur apparaît dans une instruction **non inspectée** (transfert
  système depuis lui, `updateMetadataV2` Bubblegum…). Une instruction tierce
  qui ne le mentionne pas reste admise.
  Le contrôle de vitesse passe par `presence_check` (dernier événement physique
  du wallet, capture **ou** visite) : `travel_check`, qui ne voyait que les
  mints, laissait se téléporter en alternant les deux.
  **Limites de capture** (#45, #46 — 28/09/2026). La co-signature est refusée
  dans deux cas :
  - `daily_quota` : le wallet a déjà obtenu 5 co-signatures sur 24 h glissantes ;
  - `too_close` : un lieu se trouve à moins de 50 m (`distanceM` est renvoyé).
  
  Le compte se fait sur `capture_grants`, qui journalise chaque co-signature
  **accordée**, et non sur `mints`, qui arrive trop tard pour empêcher deux
  captures parallèles. Le contrôle et l'écriture partagent une transaction, sous un
  verrou consultatif **global** qui couvre aussi deux wallets voisins simultanés.
  Une reprise de la même cellule ne consomme pas de quota, et la distance ignore
  les propres co-signatures du wallet : sans ça, une capture échouée buterait sur
  elle-même.
  L'app fait un **pré-contrôle en lecture seule au déclenchement**, avant la
  caméra (`precheckCapture`, appel sans `message`) : les uploads précèdent la
  co-signature, un refus à ce stade laisserait des assets orphelins. Une panne
  réseau au pré-contrôle ne bloque pas, le serveur retranche à la co-signature.
  La distance est un contrôle best-effort, qui dépend du miroir `places` : un trou
  d'indexation la laisse passer. La même cellule reste bloquée on-chain. Les
  lieux legacy (qui n'existent que dans `mints`) ne comptent pas.
- **Assets** : `place-metadata.ts` uploade photo + JSON Metaplex **avant** le mint —
  l'URI doit entrer dans l'instruction `mintV2`, la signature n'existe pas encore.
  Le `placeId` est dérivé du **sha256 du contenu de la photo**, pas tiré au hasard :
  une reprise de la même capture retombe sur les mêmes chemins au lieu d'abandonner
  une paire d'orphelins de plus (5 tentatives le 10/09/2026 = 5 paires, une seule
  référencée). Les deux dépôts tolèrent donc le conflit. Écriture en création
  exclusive côté serveur : **une preuve n'est jamais réécrite**. L'URI des
  métadonnées est **gravée on-chain et non réécrivable** — ne jamais y mettre un
  hostname qu'on ne possède pas (les cNFT de juillet pointent encore sur
  `supabase.co`, définitivement).
- **Piège MWA connu** : après restauration du cache AsyncStorage, `account.address` est une
  string base58 malgré son type `PublicKey` (bug upstream @wallet-ui). Toujours passer par
  `toPublicKey()` (`app/utils/to-public-key.ts`) avant un appel web3.js.
- **Seed Vault Wallet** : il faut le passer manuellement en Devnet (réglages du wallet)
  sinon « Incohérence de réseau » à la signature. Le wallet gère **plusieurs comptes** :
  s'il est positionné sur un compte autre que celui autorisé par l'app, il rejette la
  demande sans rien afficher — la bottom sheet se ferme en 2 s et aucune tx ne part.
  Symptôme trompeur : tout le reste (uploads, vérif GPS, co-signature) a réussi.
- **Piège build release** : `.env` n'est PAS dans les entrées surveillées par gradle.
  Changer une `EXPO_PUBLIC_*` puis lancer `assembleRelease` réinstalle l'ancien bundle
  sans rien signaler (« BUILD SUCCESSFUL in 3s »). Supprimer
  `android/app/build/generated/assets/react/release` pour forcer
  `createBundleReleaseJsAndAssets`. Vérifier par la date du bundle, pas par la sortie
  gradle.
- **Clé de signature release** (29/09/2026) : `~/.config/placekeepr/placekeepr-release.jks`,
  alias `placekeepr`, RSA 2048, valide jusqu'en 2054, SHA-256
  `6bd71c4e8cbfbccb615e5108df2eb579fca2c0ce0efde006566ed87d256c4bc4`. Le mot de passe
  est dans le **Trousseau macOS** (`placekeepr-release-keystore`) et dans
  `~/.gradle/gradle.properties` (`PLACEKEEPR_RELEASE_*`, fichier en 600). Tout est
  **hors du repo**.
  C'est l'identité de l'app sur le dApp Store : **la perdre interdit toute mise à
  jour**. Elle doit être sauvegardée ailleurs que sur ce Mac.
  Elle est injectée par `app/plugins/with-release-signing.js`, qui applique aussi
  arm64 seul (APK de 63 Mo au lieu de 185). Sans les propriétés, le release est
  signé en debug : le build passe, mais l'APK n'est pas publiable. Vérifier avec
  `apksigner verify --print-certs`, qui doit afficher `CN=PlaceKeepr`.
  Un APK signé avec cette clé **ne s'installe pas par-dessus** un build signé en
  debug : il faut désinstaller, ce qui efface le journal local des captures.
- **Piège Fabric / vues natives** : ne jamais répartir des vues natives entre **deux
  listes sœurs** selon un état. Un élément qui change de camp est démonté d'un parent
  et remonté dans l'autre au même commit, ce que la couche de montage ne supporte pas
  (`RetryableMountingLayerException: Unable to find viewState for tag`, crash fatal en
  release). Remonter la condition en **prop** dans une liste unique à clé stable.
- **L'arbre `(tabs)` ne doit jamais être détruit puis reconstruit** dans la même
  session JS (16/09/2026). Il l'était : deux groupes `Stack.Protected` échangés à
  l'authentification, donc déconnexion = arbre détruit, reconnexion = arbre
  reconstruit. Fabric n'y survit pas — le registre de vues ressort incohérent (une
  icône de la barre d'onglets posée **sans son conteneur**, structure que
  `TabBarIcon` ne produit jamais), et le premier onglet ouvert ensuite plante sur
  `Unable to find viewState`. Jamais au démarrage à froid, où l'arbre n'est monté
  qu'une fois : d'où le « ça remarche à la relance ». L'écran de connexion est donc
  une **modale plein écran posée par-dessus** les onglets (`app/_layout.tsx`,
  composant `AuthGate` : navigation dans un effet, jamais pendant un rendu).
  Corollaire : les écrans d'onglet tournent aussi **déconnectés** — tout hook lisant
  le wallet doit tolérer `null` (`enabled:` sur les queries, garde sur l'écran
  Gardien). Ne pas revenir à `Stack.Protected` autour de `(tabs)`.
  Fausses pistes écartées en chemin, inutile de les refaire : `router.replace('/')`
  après `signIn()`, `detachInactiveScreens={false}`, préchargement de la fonte
  d'icônes (gardé, mais pour une autre raison).
- **Distinguer « déconnecté » de « restauration en cours »** : le store de
  `@wallet-ui/react-native-web3js` expose `accounts: null` dans les deux cas.
  `auth-provider.tsx` lève l'ambiguïté en lisant sa clé de cache AsyncStorage
  (`authorization-cache`, filet de 3 s). Sans ça l'écran de connexion clignote à
  chaque lancement, le temps que le compte remonte.
- **Fiches de la carte** : elles vivent dans un overlay en `absoluteFill`, et
  `flexShrink` vaut **0** par défaut en RN — une carte non bornée déborde par le bas
  et son bouton FERMER sort de l'écran (fiche impossible à refermer, vu le
  16/09/2026). Hauteur bornée (`flexShrink: 1` sur la carte **et** sur la face
  interne via `contentStyle` de `PixelCard`), bloc d'infos scrollable, actions
  épinglées dessous.
- **Debug en build release** : `console.log` **remonte** dans logcat sous le tag
  `ReactNativeJS` (vérifié le 16/09/2026 ; la note inverse qui figurait ici était
  fausse et a coûté une matinée). C'est le moyen le plus rapide de diagnostiquer un
  crash natif : instrumenter, rebuilder, croiser avec `adb logcat -b crash`.
  Deux réflexes qui ont tout débloqué : `adb logcat -G 32M` avant de reproduire (ce
  device fait tourner le tampon en ~3 min), et le dump `MountItemDispatcher`
  (« displaying mount state ») qui suit l'exception Fabric — il liste les
  INSERT/REMOVE et les tailles en **pixels**, ce qui permet de remonter au composant
  (84 px = 28 dp). Restent invisibles les erreurs avalées par un `.catch()`.
- **DNS** : la box du réseau local (`192.168.1.1`) cache les enregistrements et les
  sert au Mac **et** au téléphone. Après un changement DNS, les deux peuvent rester
  sur l'ancienne IP bien après la propagation publique. Vérifier avec
  `dig @1.1.1.1`, et côté Android basculer le DNS privé sur `dns.google` pour
  contourner.
- **Carte** : `app/app/(tabs)/map.tsx`, MapLibre RN v11 (API `Map`/`Camera`),
  style tuiles OpenFreeMap par défaut (`EXPO_PUBLIC_MAP_STYLE_URL` pour surcharger).
  Lieux des autres gardiens : RPC PostGIS `nearby_places` (rayon 50 km autour du GPS,
  hook `use-nearby-places.ts`, dédup par signature avec le journal local), marqueurs
  teal + fiche `nearby-place-card.tsx` (miniature via l'URL publique du bucket).
- **Likes & réputation gardien** (Phase 3) : programme — `Like` PDA
  `["like", place, likeur]` daté (unicité par `init`, unlike = `close` + rent rendu),
  `KeeperStats` PDA `["keeper", gardien]` agrégeant `likes_received` et
  `visits_received` (`init_if_needed` au premier engagement, payé par l'émetteur ;
  compteurs bruts — la pondération réputation = likes + 2 × visites se calcule à
  l'affichage), auto-like interdit, pas de co-signature vérifieur (liker à
  distance est voulu). **Retirer un lieu** (modération, #47) :
  `KEEPER=<pubkey>` ou `PLACES=<pda>,…` puis `npm run remove-places` (dans `app/`,
  avec `EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM` en préfixe). Le script **simule** par
  défaut ; `CONFIRM=1` exécute. Il découvre on-chain les Like, Visit et la cagnotte,
  puis les ferme dans l'ordre, et le lieu en dernier. L'indexer ne décode pas ces
  instructions admin. Le miroir se met donc à jour à la main :
  - `update mints set hidden_at = now()` sur les lignes du lieu (masquées de la
    carte et de la restauration, mais conservées) ;
  - `delete` des lignes `places`, `likes` et `visits` de son PDA.
  
  Premier usage le 02/10/2026 : les 5 lieux du compte qui ne devait pas servir à la
  démo.
  **Variante `ENGAGEMENT_OF=<pubkey>`** : ferme les likes et visites qu'un wallet a
  faits sur les lieux des **autres**. Le miroir se nettoie avec un `delete` dans
  `likes` et `visits` sur ce wallet. Sans ça, ses likes restaient dans le fil
  d'activité des gardiens. C'est ce qu'on a vu sur les rushes du 03/10/2026.
  `close_place` (admin seulement) :
  outil de reset devnet/modération, rent rendu au gardien, la cellule redevient
  libre — ne touche pas aux Like/Visit PDAs, les fermer d'abord. App : `like-place.ts`
  (instructions à la main depuis l'IDL) + hook `use-place-like.tsx` — état lu
  on-chain (compte `Place` = source de vérité du gardien, pas le `minter`
  Supabase), toggle MWA sur la fiche nearby. Lieux legacy (pré-registre) : pas
  de bouton. `liked_at` on-chain = matière première du split « likers récents »
  (Phase 4). Compteur de likes par lieu : miroir Supabase via l'indexer (voir
  ci-dessous), affiché sur la fiche nearby avec la réputation.
- **Visites (programme)** : `visit_place` — présence physique **co-signée par le
  vérifieur** (même exigence que `register_place`). `Visit` PDA
  `["visit", place, visiteur]` : compteur + `last_visited_at`, créé une fois
  (`init_if_needed`, rent payé au premier passage), cooldown **24 h** on-chain
  (`VISIT_COOLDOWN_SECONDS`), auto-visite interdite. L'historique détaillé des
  passages vit dans le miroir Supabase (indexer), la chaîne garde l'agrégat.
  Outils admin : `close_visit` (rent au visiteur, décompte la totalité des
  passages — avant `close_place`) et `close_keeper_stats` (reset devnet, ferme
  les stats sans les désérialiser — tolère le layout d'avant `visits_received` ;
  la migration devnet du 10/07/2026 a fermé les comptes legacy 49 octets).
  Layout KeeperStats : keeper 8..40, likes u64 LE 40..48, visits u64 LE 48..56
  (57 o) ; Visit : visitor 8..40, place 40..72, count u64 LE 72..80,
  last_visited_at i64 LE 80..88 (89 o).
- **Visites (app + serveur)**, 14/09/2026 : route co-signante
  `POST /verify-visit` — fix GPS frais, précision ≤ 25 m, **≤ 50 m du centre de
  la cellule**, contrôle de vitesse, puis co-signature. Ce qui lie la position
  au lieu ne passe pas par la base : le client annonce la cellule visée, le
  serveur en dérive le PDA et exige que ce soit celui de la transaction — un
  trou d'indexation ne peut donc ni bloquer une visite légitime ni en autoriser
  une fausse. Cooldown, auto-visite et existence du lieu restent contrôlés
  on-chain (le programme le fait mieux). App : `components/place/visit-place.ts`
  (instruction à la main), `use-place-visit.tsx` (état lu **on-chain** sur le PDA
  Visit — c'est lui qui porte le cooldown que le programme appliquera), bouton
  sur la fiche plein écran seulement : la carte garde le like (geste à distance),
  la visite a besoin de place pour expliquer cooldown et refus.
  Miroir : `visit_events` (l'historique des passages, qui n'existe **nulle part**
  on-chain) + `visits` (agrégat par couple lieu/visiteur), décodés par l'indexer.
  Le compteur est **recalculé** depuis l'historique, jamais incrémenté — Helius
  rejoue ses lots sur réponse non-2xx.
  **Réputation pondérée** : `reputationScore()` dans `components/keeper/ranks.ts`
  (like 1, visite 2), appliquée à l'affichage — changer le barème ne demande
  aucune migration. Les paliers du feed se détectent par **franchissement** et
  non par égalité : un saut de 2 points peut enjamber un seuil.
- **Lieu « confirmé »** (#44, 28/09/2026) : un lieu est confirmé à partir de
  `CONFIRMED_MIN_VISITORS` visiteurs **distincts** (2 en devnet,
  `components/place/place-confirmation.ts`). La visite est une présence
  co-signée, faite par un tiers : c'est une « proof of interest » que personne
  ne vote. **Off-chain et appliqué à l'affichage** : le serveur ne rend qu'un
  compteur brut (`distinctVisitors`, une ligne de `visits` par couple
  lieu/visiteur). Changer le seuil ne demande donc ni migration ni
  redéploiement. On le sert via `nearby_places` v4 (migration 0005) et
  `/places?keeper=` ; la fiche plein écran le lit via `placeVisits`.
  Affichage :
  - **carte** : marqueur des autres gardiens atténué tant que le lieu n'est pas
    confirmé, pastille ambre une fois confirmé ; **sous le zoom 12**, seuls les
    lieux confirmés des autres restent affichés, les siens toujours ;
  - **fiches** : badge ambre, ou jauge « encore N visiteur(s) » ;
  - **grille Gardien** : coche ambre ;
  - **feed** : événement daté au **premier passage du K-ième visiteur**, détecté
    par franchissement.
  
  Le gardien ne peut pas visiter son propre lieu : valider sur le Seeker demande
  donc **K wallets en plus du gardien**. Rendre les royalties conditionnelles à
  la confirmation exige un compteur on-chain (#48, après le hackathon).
- **SKR-backed** (prix SKR de CLOCK IN, 29/09/2026) : un wallet qui a au moins
  **1 000 SKR stakés sur mainnet** voit son quota de captures passer de 5 à 10
  par jour et reçoit le badge rose « SKR-BACKED ». Le serveur (`server/src/skr.ts`)
  **lit** le Seeker Staking Program sur mainnet, en lecture seule
  (`getProgramAccounts` filtré sur `user`, parts × `share_price` du StakeConfig).
  Rien n'est jamais signé sur mainnet : le même keypair a la même adresse sur
  tous les clusters, l'app reste en devnet.
  Le **stake** compte, pas le solde : un solde passe d'un wallet à l'autre en
  une transaction, un stake est bloqué 48 h. C'est ce qui rend le quota plus
  coûteux à contourner avec des wallets sybils.
  **Fail-open** : si le RPC mainnet tombe (`SKR_RPC_URL`, public par défaut), le
  quota de base s'applique, et rien ne dépend de mainnet pour exister. Cache de
  10 min, lecture faite **hors** du verrou global de `grantCapture`. Route
  `GET /skr/:wallet`.
  Pour la démo, il faut un compte Seed Vault **dédié** qui a au moins 1 000 SKR
  stakés. Jamais le compte principal : voir la règle de la section Wallets.
- **Pseudos & avatars** (Phase 4, 17/09/2026) : **off-chain**, table `profiles`
  du serveur. Un pseudo n'est pas de la réputation — il ne demande aucun
  consensus, et son unicité (index unique sur `lower(display_name)`) exigerait
  on-chain un registre de noms complet ; l'avatar est une image, il passe par
  `/assets` de toute façon. Corollaire assumé : **seule donnée du miroir qui ne
  se rejoue pas depuis la chaîne** — la sauvegarde quotidienne est son seul
  filet. Auth : `PUT /profiles` est la seule route authentifiée, par
  **signature de message** MWA (`signMessages`), pas par transaction — ni SOL
  ni rent. Le serveur **reconstruit** le message signé depuis les champs reçus
  (`server/src/wallet-auth.ts`), jamais le texte du client : même réflexe que
  le PDA dérivé de `cosign.ts`. Format dupliqué dans
  `app/components/profile/profile-message.ts` — le changer d'un seul côté met
  toutes les écritures en 401 sans que le symptôme désigne le format.
  **Piège MWA, vérifié sur device le 17/09/2026** : `signMessages` ne rend pas
  la même chose selon le wallet. La spec MWA décrit un *payload signé* =
  message + signature concaténés ; le **Seed Vault du Seeker rend la signature
  seule** (64 o pour un message de 171 o). `signatureFromSignedPayload`
  reconnaît donc les deux formes et refuse tout le reste avec les deux tailles
  attendues. Un `.slice(-64)` aurait marché sur Seed Vault **par accident** et
  découpé 64 octets au milieu du message face à un wallet conforme — panne
  invisible jusqu'à la démo, et 401 muet côté serveur.
  Pseudo : 3–20 caractères `[A-Za-z0-9_-]`, sans espace ni accent (Press Start
  2P n'a ni l'un ni l'autre). Avatar : `utils/pixelate.ts` (extrait de
  `pixelate-place-photo.ts`, partagé), grille 32 px ×6, nommé par le sha256 du
  contenu comme les photos de lieu. Affichage : `displayNameOf()` retombe sur
  l'adresse tronquée, qui reste le cas courant ; `useProfiles()` récupère tout
  un écran en une requête. Édition dans Réglages — écran qui a dû passer en
  `ScrollView` : `AppPage` ne défile pas (`flex: 1`, pas de liste) et
  `flexShrink` vaut 0 en RN, donc le bloc de trop pousse les suivants hors
  écran sans aucun moyen d'y accéder. Chaîne validée de bout en bout sur le
  Seeker le 17/09/2026 (pseudo + avatar, contre le VPS).
- **Royalties** (Phase 4, 18/09/2026) : le point de départ est une contrainte, pas
  un choix. Les royalties cNFT **ne sont pas exécutables au niveau du protocole** —
  Bubblegum ne stocke que `seller_fee_basis_points` et `creators[]` dans le hash de
  la feuille, le versement reste volontaire côté marketplace — et ce `creators[]`
  est **figé au mint**. « Likers récents » étant mouvant, le split ne peut pas y
  vivre : le cNFT désigne un créateur unique et non vérifié, le **PDA vault du
  lieu**, et le partage se fait dans `place_registry` à la distribution. Les cNFT de
  juillet portent encore `creators: [gardien, 100 %]` et ne nourriront **jamais** de
  vault.
  `PlaceVault` `["vault", place]` détient les lamports **et** le ring buffer des
  10 derniers likeurs. Pas sur le compte `Place` : ses 57 octets déjà en devnet ne
  survivraient pas à 320 de plus, toute désérialisation de lieu existant casserait.
  Créé paresseusement au premier like ou premier dépôt, **jamais** dans
  `register_place` — une seconde instruction `place_registry` dans la tx de capture
  ferait refuser la co-signature (règle de l'instruction unique). Même raisonnement
  pour la trésorerie, qui vit dans un PDA `["treasury"]` et pas dans `Config` :
  ajouter un champ au Config déployé casserait `register_place` jusqu'à migration.
  `distribute_royalties` est **permissionless et sans signataire** — gardien lu du
  compte Place, trésorerie du PDA, likeurs du buffer : rien ne vient de l'appelant,
  qui n'avance que les frais. 60 % gardien, 20 % trésorerie, 20 % aux likeurs
  récents actifs ; arrondis et part likers non réclamée au gardien ; vault laissé
  **exactement à son plancher de rent** (le vider ferait ramasser le compte, ring
  buffer compris). `unlike_place` et `close_like` **sortent le likeur du buffer** :
  sans ça, liker puis unliker — rent remboursé — gardait une part acquise
  gratuitement. Le vault y est un compte **optionnel**, les likes d'avant la Phase 4
  n'en ont pas (Anchor attend l'adresse du programme pour dire « absent »).
  Côté app : `components/place/place-vault.ts` (PDA, layout, instructions),
  `use-keeper-royalties.tsx` + carte Revenus — soldes lus **on-chain**, jamais le
  miroir : c'est la seule source qui ne peut pas accuser un retard d'indexation au
  moment de distribuer. Jusqu'à 3 lieux par transaction.
  Miroir `royalty_events` (indexer) = comptabilité seulement. Le montant d'une
  distribution ne figure dans aucun argument d'instruction : il se lit sur la
  variation de solde du vault dans le payload Helius, attribuable parce qu'une
  distribution ne touche qu'un vault. Les parts n'y sont pas stockées — deux
  barèmes finissent toujours par diverger.
  **Aucune marketplace cNFT sur devnet** (Tensor, Magic Eden : mainnet) : la vente
  secondaire est simulée par `npm run deposit-royalty`.
  **Après chaque déploiement, jouer `npm run set-treasury` une fois** : sans le PDA
  `["treasury"]`, toute distribution échoue. Et le déploiement est une **rupture
  pour l'app installée** — `like_place` a gagné un compte, un APK antérieur ne peut
  plus liker. Déployer et rebuilder dans la foulée.
- **Thème 8-bit** : palette « Coucher de soleil chaud » dans `app/constants/colors.ts`
  (référence figée : `docs/design/placekeepr-sunset.html`), **UI mono-thème claire**
  (pas de dark mode) mais carte toujours sombre. Typo : Press Start 2P titres et grands
  nombres seulement (illisible en corps de texte), corps + labels en DM Mono (`BodyFont`).
  Composants `PixelButton` (variants primary/secondary/danger/like/reputation) et
  `PixelCard` (accent coral/teal/amber, variant dashed = « bientôt ») dans
  `app/components/ui/`. Pas de border-radius, ombres dures décalées ; amber réservé
  à la réputation/rareté. Marqueurs : corail = mes lieux,
  teal = autres gardiens.
- **i18n** : i18next + react-i18next + expo-localization (langue du device au lancement,
  surchargée par le sélecteur des réglages — persistée en AsyncStorage `placekeepr:language`).
  Catalogues `app/i18n/fr.ts` / `en.ts` (`en` typé sur `fr` — toute clé manquante casse tsc).
  Lexique produit : en FR le verbe est **« capturer »**, « mint » réservé au vocabulaire
  technique (frais, tx) ; en EN le verbe produit est « mint », gardien = **keeper**.
  Aucune string UI en dur : tout passe par `t()`.
- **Wallets** : le wallet **dev** `HxtrSNxn…` sert à l'admin du programme et aux
  scripts uniquement. Les captures, likes et visites se font avec des comptes **Seed
  Vault** du Seeker, dédiés au devnet et à la démo. Vérifier le solde devnet du compte
  **réellement connecté** dans l'app (écran Réglages).
  **Règle absolue** : aucune adresse de wallet personnel, et surtout **aucun wallet
  qui a de l'activité mainnet**, n'est écrite dans ce repo, un commit, une PR, une
  issue, le deck ou la vidéo. Un compte Seed Vault a la même adresse sur tous les
  clusters : l'utiliser en devnet expose aussi le wallet mainnet. L'audit du
  29/09/2026 a trouvé le compte Seed Vault principal (qui a du SKR staké) écrit en
  dur dans le code et dans ce fichier. Le repo public est parti d'un instantané
  nettoyé, sans historique.
- **Wallet dev** : keypair dédié `~/.config/solana/placekeepr-dev.json` (jamais commité),
  pubkey `HxtrSNxnAoktrQqFKLcJ64XC1Ggt4QAwcRXQoDkamaLd`, sans activité mainnet. Il ne
  sert qu'aux scripts (`create-tree`, `set-treasury`). SOL devnet :
  https://faucet.solana.com.
- `android/` et `ios/` sont générés (CNG/prebuild), jamais édités à la main ni commités.

## Contraintes & conventions

- **Workflow git** : le développement se fait dans le repo **privé**
  `philippe-l/placekeepr-dev` (renommé le 02/10/2026). `main` = stable, `development` =
  intégration. Chaque feature sur sa branche, PR vers `development`. Pas de commit direct
  sur `main`.
  Le repo **public** `philippe-l/placekeepr` ne reçoit que des **instantanés** : jamais
  l'historique du privé, ni ses PR. Il y en avait trop, avec le wallet principal dedans
  (voir la règle de la section Wallets). Pour publier, partir de `main` :
  1. `git archive main` vers un dossier propre ;
  2. scanner adresses, e-mails, secrets **et coordonnées** : aucune position
     proche du domicile de Philippe (les tests et exemples utilisent la tour
     Eiffel, 48.8584, 2.2945). Les deux premiers instantanés publics portaient
     la cellule du domicile dans les tests, vu le 06/10/2026 ;
  3. recopier dans un clone du public, un commit, push ;
  4. publier la release avec l'APK reconstruit depuis ce même état.

- **Devnet uniquement** pendant toute la phase d'apprentissage. Le code doit basculer devnet/mainnet **via config / variables d'env**, jamais en dur.
- Wallet **pro séparé** du wallet perso.
- Toute interaction on-chain qui produit potentiellement un revenu (mint, royalty reçue) doit être **logguée proprement** côté Supabase pour la comptabilité future.
- Pas de dépendance à des services qui exigeraient mainnet pour exister.

## Contexte dev

Solo freelance, développeur mobile (apps géolocalisées). Préférence pour les retours **directs et sans diplomatie excessive** : si une approche est mauvaise, le dire.
