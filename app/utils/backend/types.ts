/**
 * Contrat du backend PlaceKeepr, indépendant de l'hébergeur.
 *
 * Aucun type de ce fichier ne doit trahir l'implémentation : ni client
 * Supabase, ni builder PostgREST, ni forme de réponse HTTP. C'est ce qui
 * permet de remplacer le backend (Supabase → API maison sur VPS) sans
 * toucher une ligne des hooks ni des écrans.
 *
 * Convention conservée du client Supabase : `getBackend()` rend `null` quand
 * l'env n'est pas configuré, et l'app reste fonctionnelle en mode local pur
 * (journal AsyncStorage seul).
 */

/** Lieu voisin, tel que servi par la requête géospatiale (dédup par cellule). */
export interface NearbyPlace {
  signature: string
  minter: string
  latitude: number
  longitude: number
  photoPath: string | null
  thumbPath: string | null
  mintedAt: string
  distanceM: number
  /** Likes actifs sur la cellule (miroir des likes on-chain). */
  likeCount: number
  /** Passages vérifiés sur la cellule, tous visiteurs confondus. */
  visitCount: number
  /** Visiteurs distincts (#44) — base du statut « confirmé » (`place-confirmation.ts`). */
  distinctVisitors: number
}

/** Lieu inscrit au registre, vu depuis son gardien. */
export interface KeeperPlace {
  pda: string
  latE4: number
  lngE4: number
  /** Tx d'inscription du lieu — clé de navigation vers la fiche. */
  registerSignature: string | null
  /** Visiteurs distincts (#44). */
  distinctVisitors: number
}

/**
 * Une capture d'un wallet telle que le backend la connaît : de quoi
 * reconstruire le journal local d'un téléphone neuf ou réinstallé.
 */
export interface MinterMint {
  signature: string
  latitude: number
  longitude: number
  photoPath: string | null
  thumbPath: string | null
  metadataPath: string | null
  cluster: string
  rpcEndpoint: string | null
  mintedAt: string
}

/** État de synchronisation des mints déjà connus du backend. */
export interface MintSyncState {
  /** Toutes les signatures présentes en base, quelle que soit leur complétude. */
  known: Set<string>
  /**
   * Celles dont la ligne porte déjà ses chemins d'assets. Une ligne insérée
   * par l'indexer arrive **sans** photos ni position précise : elle est connue
   * mais incomplète, et l'app doit encore la compléter.
   */
  complete: Set<string>
}

/** Like actif (non retiré) sur un lieu. */
export interface ActiveLike {
  placePda: string
  liker: string
  likedAt: string
}

/**
 * Visites d'un wallet sur un lieu — agrégat du PDA Visit on-chain. Le détail
 * de chaque passage vit dans le miroir ; ici on n'expose que ce dont l'app a
 * besoin : combien de fois, et quand pour la dernière.
 */
export interface PlaceVisit {
  placePda: string
  visitor: string
  visitCount: number
  /** Premier passage de ce visiteur : date à laquelle il est devenu « distinct ». */
  firstVisitedAt: string
  lastVisitedAt: string
}

/** Ligne comptable d'un mint (contrainte CLAUDE.md : tout mint est loggué). */
export interface MintRecord {
  signature: string
  minter: string
  latitude: number
  longitude: number
  photoPath: string | null
  thumbPath: string | null
  metadataPath: string | null
  cluster: string
  rpcEndpoint: string | null
  mintedAt: string
}

/** Dépôt d'un asset (photo de preuve, miniature, JSON de métadonnées). */
export interface AssetUpload {
  path: string
  bytes: Uint8Array
  contentType: string
  /**
   * Conflit de chemin : `error` (défaut) remonte l'erreur, `skip` la ravale.
   * La photo est une preuve, jamais réécrite — un doublon signifie qu'une
   * sync précédente l'a déjà déposée, ce n'est pas un échec.
   */
  ifExists?: 'error' | 'skip'
}

export interface VerifyCaptureInput {
  minter: string
  latitude: number
  longitude: number
  accuracy: number
  /** Message de transaction sérialisé en base64, à inspecter puis co-signer. */
  message?: string
}

export interface VerifyCaptureResult {
  ok: boolean
  /** Motif de refus, tel que rendu par le vérifieur (`ok: false` seulement). */
  reason?: string
  /** Distance au lieu existant le plus proche, servie avec un refus `too_close`. */
  distanceM?: number
  /** Quota appliqué (5, ou 10 si SKR-backed), servi avec un refus `daily_quota`. */
  limit?: number
  /** Signature du vérifieur, exigée par le programme place_registry. */
  signature?: string
}

/**
 * Statut SKR d'un wallet : SKR staké sur MAINNET, lu en lecture seule par le
 * serveur (l'app reste en devnet). Au-delà de `minStake`, le wallet est
 * « SKR-backed » et son quota de captures double.
 */
export interface SkrStatus {
  staked: number
  backed: boolean
  dailyCaptures: number
  minStake: number
}

export interface VerifyVisitInput {
  visitor: string
  /** Cellule visée, en 1e-4 degrés — le serveur en dérive le PDA du lieu. */
  latE4: number
  lngE4: number
  latitude: number
  longitude: number
  accuracy: number
  /** Message de transaction sérialisé en base64, à inspecter puis co-signer. */
  message: string
}

export interface VerifyVisitResult {
  ok: boolean
  /** Motif de refus (`ok: false` seulement) : `too_far` s'ajoute à ceux de la capture. */
  reason?: string
  /** Distance au centre de la cellule, servie avec un refus `too_far`. */
  distanceM?: number
  /** Signature du vérifieur, exigée par le programme place_registry. */
  signature?: string
}

/**
 * Profil d'affichage d'un wallet : pseudo et avatar. Purement off-chain — un
 * pseudo ne demande aucun consensus, et son unicité, triviale ici, exigerait
 * un registre de noms complet côté programme. Seule donnée du backend qui ne
 * se rejoue pas depuis la chaîne.
 */
export interface Profile {
  wallet: string
  displayName: string | null
  avatarPath: string | null
  updatedAt: string
}

/**
 * Mise à jour de profil, signée par le wallet concerné. Le texte signé ne
 * circule pas : le serveur le **reconstruit** depuis les autres champs
 * (`components/profile/profile-message.ts` en est le miroir), pour ne jamais
 * appliquer autre chose que ce qui a été signé.
 */
export interface ProfileUpdate {
  wallet: string
  displayName: string | null
  avatarPath: string | null
  /** Horodatage ISO du message — le serveur refuse au-delà de 5 minutes. */
  issuedAt: string
  /** Signature base64 du message canonique par le wallet (MWA `signMessages`). */
  signature: string
}

/**
 * Pseudo déjà porté par un autre wallet. Seule erreur *métier* de
 * `saveProfile` : l'app doit la distinguer d'une panne réseau pour afficher
 * « pseudo pris » plutôt que « réessaie ».
 */
export class ProfileNameTaken extends Error {
  constructor() {
    super('Pseudo déjà pris')
  }
}

export interface Backend {
  // ── Lecture ──────────────────────────────────────────────────────────────
  /** Lieux d'autres gardiens autour d'un point, du plus proche au plus loin. */
  nearbyPlaces(lat: number, lng: number, radiusM: number): Promise<NearbyPlace[]>
  /** Lieux dont ce wallet est gardien. */
  placesByKeeper(keeper: string): Promise<KeeperPlace[]>
  /** Likes actifs sur un lot de lieux, du plus récent au plus ancien. */
  activeLikes(placePdas: string[], options?: { limit?: number }): Promise<ActiveLike[]>
  /** Nombre de likes actifs sur un lieu (compte serveur, sans rapatrier les lignes). */
  activeLikeCount(placePda: string): Promise<number>
  /** Visiteurs d'un lot de lieux, du passage le plus récent au plus ancien. */
  placeVisits(placePdas: string[], options?: { limit?: number }): Promise<PlaceVisit[]>
  /** Total des passages vérifiés sur un lieu (compte serveur). */
  placeVisitCount(placePda: string): Promise<number>
  /**
   * Signatures connues du backend et leur complétude — base du diff de la sync.
   * L'indexer Helius gagne systématiquement la course contre l'app (~2 s contre
   * ~9 s après la tx) : diffuser sur la seule présence laisserait les photos
   * définitivement absentes de la table.
   */
  mintSyncState(): Promise<MintSyncState>
  /** Captures d'un wallet, pour restaurer la collection après réinstallation. */
  mintsByMinter(minter: string): Promise<MinterMint[]>
  /**
   * Profils d'un lot de wallets. Les wallets sans profil sont **absents** du
   * résultat plutôt que rendus vides : l'affichage retombe alors sur l'adresse
   * tronquée, qui reste le défaut partout.
   */
  profiles(wallets: string[]): Promise<Profile[]>

  // ── Écriture ─────────────────────────────────────────────────────────────
  /**
   * Insère une ligne de mint, **ou complète** celle déjà créée par l'indexer :
   * chemins d'assets et position GPS précise (l'indexer ne connaît que la
   * cellule). N'écrase jamais une preuve déjà déposée ni `indexed_at`.
   */
  saveMint(record: MintRecord): Promise<void>
  /** Dépose un asset et rend son URL publique. */
  uploadAsset(upload: AssetUpload): Promise<string>
  /** URL publique d'un asset déjà déposé (sans appel réseau). */
  publicAssetUrl(path: string | null | undefined): string | undefined
  /**
   * Pose le profil du wallet signataire et rend son état après écriture.
   * Jette `ProfileNameTaken` si le pseudo est déjà porté.
   */
  saveProfile(update: ProfileUpdate): Promise<Profile>

  // ── Vérification ─────────────────────────────────────────────────────────
  /** Verdict GPS serveur + co-signature de la transaction de capture. */
  verifyCapture(input: VerifyCaptureInput): Promise<VerifyCaptureResult>
  /**
   * Verdict de présence + co-signature de la transaction de visite. Le
   * programme exige cette signature : sans backend capable de la produire,
   * il n'y a pas de visite possible (contrairement au mint, qui a un mode
   * dégradé sans registre).
   */
  verifyVisit(input: VerifyVisitInput): Promise<VerifyVisitResult>
  /** Statut SKR (stake mainnet, lecture seule) et quota de captures associé. */
  skrStatus(wallet: string): Promise<SkrStatus>
}
