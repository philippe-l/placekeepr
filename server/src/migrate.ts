import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.ts'

/**
 * Migrations SQL appliquées au démarrage de l'API.
 *
 * **Pourquoi ce mécanisme.** `db/schema.sql` n'est joué que par
 * l'entrypoint de l'image Postgres, au **tout premier** démarrage d'un volume
 * vide. La base du VPS existe depuis le 10/09/2026 : éditer `schema.sql` n'y
 * change donc plus rien, et sans migrations la seule façon de faire évoluer le
 * schéma serait un `psql` à la main sur le serveur — non reproductible, non
 * versionné, invisible en revue.
 *
 * **Règle des fichiers de `db/migrations/`** : ils doivent être rejouables sans
 * dommage (`create table if not exists`, `create or replace function`, `add
 * column if not exists`). Chaque objet nouveau est écrit **aux deux endroits** :
 * dans la migration, et dans `schema.sql` qui reste la forme courante lisible
 * d'un coup d'œil. Un volume neuf applique donc `schema.sql` (déjà à jour) puis
 * les migrations, qui n'ont plus rien à faire — d'où l'exigence de rejouabilité.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

// Verrou consultatif : deux conteneurs api qui démarrent ensemble ne doivent
// pas appliquer la même migration en parallèle. Clé arbitraire, stable.
const LOCK_KEY = 0x706b_6d67

export async function migrate(): Promise<void> {
  let files: string[]
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort()
  } catch (error) {
    // Répertoire absent (image mal construite) : on le dit, on ne démarre pas
    // sur un schéma dont on ignore l'état.
    throw new Error(`Migrations introuvables dans ${MIGRATIONS_DIR}: ${String(error)}`)
  }

  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY])
    await client.query(
      `create table if not exists public.schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    )
    const { rows } = await client.query<{ name: string }>('select name from public.schema_migrations')
    const applied = new Set(rows.map((row) => row.name))

    for (const name of files) {
      if (applied.has(name)) {
        continue
      }
      const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8')
      // Une migration est atomique : appliquée et enregistrée, ou ni l'un ni
      // l'autre. Sinon un échec à mi-course laisse un schéma inconnaissable.
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into public.schema_migrations (name) values ($1)', [name])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw new Error(`Migration ${name} échouée : ${String(error)}`)
      }
      console.log(`migration appliquée : ${name}`)
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    client.release()
  }
}
