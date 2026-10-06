import { PublicKey } from '@solana/web3.js'

/**
 * Décodage de l'instruction Bubblegum V2 `mintV2`, le strict nécessaire pour
 * que `/verify-capture` sache ce qu'il co-signe (#40). Format : sérialiseur
 * généré de `@metaplex-foundation/mpl-bubblegum` 5.x (`mintV2.js`,
 * `metadataArgsV2.js`) — borsh : chaînes u32 LE + octets, Option = 1 octet
 * de tag, Vec = u32 LE + éléments.
 *
 * Pas de dépendance Umi côté serveur pour si peu : le format est figé par le
 * programme déployé, et un décodeur maison refuse tout octet non consommé.
 */

export const BUBBLEGUM_PROGRAM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'

const MINT_V2_DISCRIMINATOR = [120, 121, 23, 146, 173, 110, 199, 205]

// Comptes de mintV2 (ordre du sérialiseur généré). Les comptes optionnels
// absents valent l'ID du programme Bubblegum.
export const MINT_V2_ACCOUNTS = {
  treeCreatorOrDelegate: 2,
  leafOwner: 4,
  leafDelegate: 5,
  merkleTree: 6,
  coreCollection: 7,
} as const

export interface Creator {
  address: PublicKey
  verified: boolean
  share: number
}

export interface MintV2Args {
  name: string
  symbol: string
  uri: string
  sellerFeeBasisPoints: number
  primarySaleHappened: boolean
  isMutable: boolean
  creators: Creator[]
  collection: PublicKey | null
  hasAssetData: boolean
  hasAssetDataSchema: boolean
}

class Reader {
  private offset = 0
  private readonly view: DataView
  private readonly buffer: Uint8Array

  constructor(bytes: Uint8Array) {
    this.buffer = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get done(): boolean {
    return this.offset === this.buffer.length
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.buffer.length) {
      throw new RangeError('fin de données')
    }
    const slice = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  u8(): number {
    return this.take(1)[0]!
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true)
    this.take(2)
    return value
  }

  u32(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new RangeError('fin de données')
    }
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  bool(): boolean {
    const value = this.u8()
    if (value > 1) {
      throw new RangeError('booléen invalide')
    }
    return value === 1
  }

  bytes(): Uint8Array {
    return this.take(this.u32())
  }

  string(): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.bytes())
  }

  pubkey(): PublicKey {
    return new PublicKey(this.take(32))
  }

  /** Lit le tag d'une Option ; `read` n'est appelé que si elle est présente. */
  option<T>(read: () => T): T | null {
    return this.bool() ? read() : null
  }
}

/** Arguments d'un `mintV2`, ou null si les données ne sont pas un mintV2 bien formé. */
export function parseMintV2(data: Uint8Array): MintV2Args | null {
  if (data.length < 8 || MINT_V2_DISCRIMINATOR.some((byte, i) => data[i] !== byte)) {
    return null
  }
  try {
    const r = new Reader(data.subarray(8))
    const name = r.string()
    const symbol = r.string()
    const uri = r.string()
    const sellerFeeBasisPoints = r.u16()
    const primarySaleHappened = r.bool()
    const isMutable = r.bool()
    r.option(() => r.u8()) // tokenStandard
    const creators: Creator[] = []
    const count = r.u32()
    if (count > 5) {
      return null
    }
    for (let i = 0; i < count; i++) {
      creators.push({ address: r.pubkey(), verified: r.bool(), share: r.u8() })
    }
    const collection = r.option(() => r.pubkey())
    const hasAssetData = r.option(() => r.bytes()) !== null
    const hasAssetDataSchema = r.option(() => r.u8()) !== null
    if (!r.done) {
      return null
    }
    return {
      name,
      symbol,
      uri,
      sellerFeeBasisPoints,
      primarySaleHappened,
      isMutable,
      creators,
      collection,
      hasAssetData,
      hasAssetDataSchema,
    }
  } catch {
    return null
  }
}
