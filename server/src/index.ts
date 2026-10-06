import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { config } from './config.ts'
import { pool } from './db.ts'
import { migrate } from './migrate.ts'
import { data } from './routes/data.ts'
import { heliusWebhook } from './routes/helius-webhook.ts'
import { profiles } from './routes/profiles.ts'
import { verifyCapture } from './routes/verify-capture.ts'
import { verifyVisit } from './routes/verify-visit.ts'

/**
 * API PlaceKeepr — remplace le couple PostgREST + edge functions de Supabase.
 * Implémente exactement le contrat `Backend` de l'app (app/utils/backend/).
 */

const app = new Hono()

app.use('*', logger())
// L'app mobile n'est pas un navigateur (pas de préflight), mais le dev web et
// les outils de test en ont besoin.
app.use('*', cors())

app.get('/health', async (c) => {
  try {
    await pool.query('select 1')
    return c.json({ ok: true })
  } catch (error) {
    console.error('health', error)
    return c.json({ ok: false }, 503)
  }
})

app.route('/', data)
app.route('/', profiles)
app.route('/', verifyCapture)
app.route('/', verifyVisit)
app.route('/', heliusWebhook)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  // Rien du détail interne ne sort : le client reçoit un code, les logs gardent
  // la trace.
  console.error('unhandled', error)
  return c.json({ error: 'server_error' }, 500)
})

// Le schéma d'abord : servir des requêtes sur une base dont on ignore la forme
// ne produirait que des 500 en boucle. Un échec ici arrête le conteneur, que
// Docker relance — visible, plutôt que silencieusement dégradé.
await migrate()

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`placekeepr-server à l'écoute sur :${info.port}`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} reçu, arrêt`)
  server.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
