// Enregistre — ou met à jour — le webhook Helius qui alimente l'indexer :
// toutes les transactions du programme place_registry sur devnet, au format
// « enhanced ».
//
// Usage :
//   HELIUS_API_KEY=<clé> HELIUS_WEBHOOK_SECRET=<secret> npx tsx scripts/register-helius-webhook.ts
//   HELIUS_API_KEY=<clé> npx tsx scripts/register-helius-webhook.ts --list
//   HELIUS_API_KEY=<clé> npx tsx scripts/register-helius-webhook.ts --delete <id>
//
// Le script est idempotent : s'il existe déjà un webhook sur ce programme, il
// le met à jour (PUT) au lieu d'en créer un second. Sans ça, l'ancien
// abonnement continuerait à livrer en parallèle vers l'ancienne cible.
//
// Le secret doit être identique au HELIUS_WEBHOOK_SECRET du serveur : Helius
// l'envoie en header Authorization à chaque livraison, et l'API est
// fail-closed.

const PLACE_REGISTRY_PROGRAM = 'EXB4PeyChBveaChFW5nGTqJ2DmNp292cRFo4Ks1aC9pU'
// Cible par défaut : l'API auto-hébergée. Surchargeable pour un autre
// environnement — jamais en dur ailleurs que dans ce défaut.
const WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL ?? 'https://placekeepr.app/helius-webhook'

const apiKey = process.env.HELIUS_API_KEY
if (!apiKey) {
  console.error('HELIUS_API_KEY manquant')
  process.exit(1)
}
const heliusApi = `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`

interface Webhook {
  webhookID: string
  webhookURL: string
  accountAddresses?: string[]
  authHeader?: string
}

async function listWebhooks(): Promise<Webhook[]> {
  const response = await fetch(heliusApi)
  if (!response.ok) {
    console.error('Échec de la liste :', response.status, await response.text())
    process.exit(1)
  }
  return (await response.json()) as Webhook[]
}

/**
 * La liste de Helius **omet `accountAddresses`** — seul le GET unitaire le
 * renvoie. Se fier au champ de la liste ne matche donc jamais, et le script
 * crée un doublon au lieu de mettre à jour (constaté le 10/09/2026 : deux
 * abonnements actifs livrant vers deux backends).
 */
async function withAddresses(hook: Webhook): Promise<Webhook> {
  if (hook.accountAddresses) {
    return hook
  }
  const response = await fetch(`https://api.helius.xyz/v0/webhooks/${hook.webhookID}?api-key=${apiKey}`)
  return response.ok ? ((await response.json()) as Webhook) : hook
}

async function main() {
  const deleteIndex = process.argv.indexOf('--delete')
  if (deleteIndex !== -1) {
    const id = process.argv[deleteIndex + 1]
    if (!id) {
      console.error('Usage : --delete <webhookID>')
      process.exit(1)
    }
    const response = await fetch(`https://api.helius.xyz/v0/webhooks/${id}?api-key=${apiKey}`, { method: 'DELETE' })
    if (!response.ok) {
      console.error('Échec de la suppression :', response.status, await response.text())
      process.exit(1)
    }
    console.log(`Webhook ${id} supprimé`)
    return
  }

  if (process.argv.includes('--list')) {
    const hooks = await Promise.all((await listWebhooks()).map(withAddresses))
    // authHeader masqué : c'est le secret partagé, il n'a rien à faire dans un
    // terminal ni dans un historique de shell.
    console.log(
      JSON.stringify(
        hooks.map((h) => ({ ...h, authHeader: h.authHeader ? '***' : undefined })),
        null,
        2,
      ),
    )
    return
  }

  const secret = process.env.HELIUS_WEBHOOK_SECRET
  if (!secret) {
    console.error('HELIUS_WEBHOOK_SECRET manquant (doit égaler celui du serveur)')
    process.exit(1)
  }

  const payload = {
    webhookURL: WEBHOOK_URL,
    transactionTypes: ['ANY'],
    accountAddresses: [PLACE_REGISTRY_PROGRAM],
    webhookType: 'enhancedDevnet',
    authHeader: secret,
  }

  const hooks = await Promise.all((await listWebhooks()).map(withAddresses))
  const existing = hooks.find((hook) => hook.accountAddresses?.includes(PLACE_REGISTRY_PROGRAM))

  const response = existing
    ? await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    : await fetch(heliusApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

  const body = await response.json()
  if (!response.ok) {
    console.error('Échec :', response.status, body)
    process.exit(1)
  }
  console.log(
    existing
      ? `Webhook ${existing.webhookID} mis à jour\n  ${existing.webhookURL}\n  → ${WEBHOOK_URL}`
      : `Webhook créé : ${body.webhookID ?? JSON.stringify(body)}\n  → ${WEBHOOK_URL}`,
  )
}

main()
