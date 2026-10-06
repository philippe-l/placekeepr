import { createClient } from 'npm:@supabase/supabase-js@2'
import { Keypair, VersionedMessage } from 'npm:@solana/web3.js@1'
import nacl from 'npm:tweetnacl@1'

// Vérification GPS d'une capture (Phase 2) + co-signature du registre.
// Sans `message` : simple verdict de plausibilité. Avec `message` (message de
// transaction sérialisé, base64) : la fonction vérifie que la transaction
// contient bien l'instruction register_place attendue (bonnes coordonnées,
// bon keeper, elle-même comme signataire) puis la co-signe — le programme
// place_registry exige cette signature, c'est elle qui rend la vérif
// incontournable.
// Secret : VERIFIER_KEYPAIR (secret d'edge function, tableau JSON de 64
// octets — posé à la main dans le dashboard, jamais dans le code ou la DB).
// verify_jwt désactivé : pas d'auth Supabase côté app (clé publishable).
//
// Déployée via MCP/dashboard ; cette copie est la source de vérité du repo.

const PLACE_REGISTRY_PROGRAM = 'EXB4PeyChBveaChFW5nGTqJ2DmNp292cRFo4Ks1aC9pU'
// sha256("global:register_place")[0..8]
const DISCRIMINATOR = Uint8Array.from([193, 120, 229, 116, 127, 194, 89, 143])
const MAX_ACCURACY_M = 25
const MAX_SPEED_M_S = 250 // ~900 km/h : au-delà, déplacement implausible

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const cellE4 = (value: number) => Math.round(value * 10_000)

function i32le(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return bytes
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method' }, 405)
  }
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400)
  }
  const { minter, latitude, longitude, accuracy, mocked, message } = payload ?? {}
  if (
    typeof minter !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return json({ ok: false, reason: 'bad_request' }, 400)
  }
  if (mocked === true) {
    return json({ ok: false, reason: 'mock_location' })
  }
  if (typeof accuracy !== 'number' || accuracy <= 0 || accuracy > MAX_ACCURACY_M) {
    return json({ ok: false, reason: 'accuracy' })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await supabase.rpc('travel_check', { p_minter: minter, lat: latitude, lng: longitude })
  if (error) {
    console.error('travel_check', error)
    return json({ ok: false, reason: 'server_error' }, 500)
  }
  const last = Array.isArray(data) ? data[0] : undefined
  if (last) {
    const seconds = Math.max(Number(last.seconds_elapsed), 1)
    if (Number(last.distance_m) / seconds > MAX_SPEED_M_S) {
      return json({ ok: false, reason: 'travel_speed' })
    }
  }

  // Pas de transaction soumise : verdict seul (mode dégradé sans registre).
  if (message === undefined) {
    return json({ ok: true })
  }
  if (typeof message !== 'string') {
    return json({ ok: false, reason: 'bad_message' }, 400)
  }

  const secret = Deno.env.get('VERIFIER_KEYPAIR')
  if (!secret) {
    console.error('VERIFIER_KEYPAIR manquant (secrets edge function)')
    return json({ ok: false, reason: 'verifier_unavailable' }, 503)
  }
  const verifier = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))

  let messageBytes: Uint8Array
  let msg: VersionedMessage
  try {
    messageBytes = Uint8Array.from(atob(message), (c) => c.charCodeAt(0))
    msg = VersionedMessage.deserialize(messageBytes)
  } catch {
    return json({ ok: false, reason: 'bad_message' }, 400)
  }
  if (msg.version !== 0) {
    return json({ ok: false, reason: 'bad_message' }, 400)
  }

  // La transaction doit contenir register_place avec exactement les
  // coordonnées vérifiées, le minter annoncé comme keeper, et cette fonction
  // comme signataire — sinon on refuse de signer.
  const keys = msg.staticAccountKeys
  const registerIx = msg.compiledInstructions.find((ix) => keys[ix.programIdIndex]?.toBase58() === PLACE_REGISTRY_PROGRAM)
  if (!registerIx) {
    return json({ ok: false, reason: 'bad_message' }, 400)
  }
  const expectedData = new Uint8Array([...DISCRIMINATOR, ...i32le(cellE4(latitude)), ...i32le(cellE4(longitude))])
  const keeper = keys[registerIx.accountKeyIndexes[0]]
  const verifierIndex = registerIx.accountKeyIndexes[3]
  if (
    !bytesEqual(new Uint8Array(registerIx.data), expectedData) ||
    keeper?.toBase58() !== minter ||
    !keys[verifierIndex]?.equals(verifier.publicKey) ||
    verifierIndex >= msg.header.numRequiredSignatures
  ) {
    return json({ ok: false, reason: 'bad_message' }, 400)
  }

  const signature = nacl.sign.detached(messageBytes, verifier.secretKey)
  return json({ ok: true, verifier: verifier.publicKey.toBase58(), signature: btoa(String.fromCharCode(...signature)) })
})
