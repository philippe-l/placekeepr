# `server/` — API PlaceKeepr auto-hébergée

Remplace le couple **PostgREST + edge functions** de Supabase. Implémente
exactement le contrat `Backend` de l'app (`app/utils/backend/types.ts`), ce qui
rend la bascule invisible pour l'app : une variable d'environnement.

**Pourquoi** : le plan free Supabase met le projet en veille après ~7 jours
d'inactivité. C'est intenable pour une démo qu'on ne contrôle pas.

## Pile

Hono + `@hono/node-server` · Postgres 17 + PostGIS · Node 22 en _type
stripping_ natif — **pas d'étape de build**.

Pas de reverse proxy dans cette stack : les ports 80/443 appartiennent au nginx
de la stack BaladeZen, qui relaie vers l'alias réseau `placekeepr-api` (voir
`nginx/placekeepr.conf`). Les assets sont servis par l'API elle-même — ils
vivent dans un volume Docker que ce nginx ne monte pas.

## Routes

| Méthode | Route                             | Contrat            |
| ------- | --------------------------------- | ------------------ |
| `GET`   | `/health`                         | —                  |
| `GET`   | `/places/nearby?lat&lng&radius_m` | `nearbyPlaces`     |
| `GET`   | `/places?keeper=`                 | `placesByKeeper`   |
| `GET`   | `/likes?places=a,b&limit=`        | `activeLikes`      |
| `GET`   | `/likes/count?place=`             | `activeLikeCount`  |
| `GET`   | `/visits?places=a,b&limit=`       | `placeVisits`      |
| `GET`   | `/visits/count?place=`            | `placeVisitCount`  |
| `GET`   | `/profiles?wallets=a,b`           | `profiles`         |
| `PUT`   | `/profiles`                       | `saveProfile`      |
| `GET`   | `/mints/sync-state`               | `mintSyncState`    |
| `POST`  | `/mints`                          | `saveMint`         |
| `GET`   | `/assets/:name`                   | (lecture publique) |
| `POST`  | `/assets/:name`                   | `uploadAsset`      |
| `POST`  | `/verify-capture`                 | `verifyCapture`    |
| `POST`  | `/verify-visit`                   | `verifyVisit`      |
| `POST`  | `/helius-webhook`                 | (indexer)          |

L'indexer décode `register_place`, `like_place`/`unlike_place`, `visit_place` et
— depuis la Phase 4 — `deposit_royalty`/`distribute_royalties` vers
`royalty_events`, le journal comptable des cagnottes. L'app, elle, lit les
soldes **on-chain** : ce miroir ne décide jamais d'une distribution.

## Protection contre l'abus (#41)

L'API est anonyme, à l'exception de `PUT /profiles`. Elle tourne sur le disque de BaladeZen.
Trois garde-fous :

- **Rate limit nginx**, par IP (`nginx/placekeepr.conf`, zones `pk_*`).
  `POST /assets` : 10/min, rafale de 20. `/verify-capture` et `/verify-visit`
  partagent un même compteur : 10/min, rafale de 10. Tout le reste : 20/s,
  rafale de 100, parce que la carte charge toutes les miniatures d'un coup.
  `/helius-webhook` n'est pas limité : il est déjà fermé par secret, et Helius
  livre en rafale. Au-delà du seuil, la réponse est un 429.
- **Le nom est le contenu** (`src/assets.ts`). Une photo ou un avatar doit
  s'appeler `<sha256[:32]>.jpg|png` d'après ses propres octets. Un JSON
  Metaplex ou une miniature doit porter le stem d'une photo **déjà déposée**.
  L'existence du fichier est testée avant ce contrôle : un renvoi de la sync
  reçoit toujours son 409.
- **Garde disque** : sous `MIN_FREE_DISK_BYTES` d'espace libre (10 Gio par
  défaut), plus aucun upload n'est accepté (507). Le débit seul ne protège pas
  le disque : 10 fichiers de 8 Mio par minute, sur une journée, le rempliraient.

Lectures publiques. Écritures **validées côté serveur** (zod, liste blanche
d'extensions, taille plafonnée) — c'est ce que la RLS `anon` de Supabase ne
faisait pas, et ça règle le point « durcir RLS » de la roadmap.

`PUT /profiles` est la seule route **authentifiée** : le wallet signe un
message canonique (`src/wallet-auth.ts`), pas une transaction — un pseudo ne
coûte ni SOL ni rent. Le serveur **reconstruit** ce message depuis les champs
reçus avant de vérifier la signature : accepter le texte du client
reviendrait à vérifier une chose et à en appliquer une autre. Le format est
dupliqué dans `app/components/profile/profile-message.ts` ; le modifier d'un
seul côté fait échouer toutes les écritures en 401, sans que rien ne désigne
la cause.

## Schéma et migrations

`db/schema.sql` n'est joué que par l'entrypoint de l'image Postgres, au **tout
premier** démarrage d'un volume vide. Sur la base du VPS, en service depuis le
10/09/2026, l'éditer ne change donc plus rien.

Toute évolution de schéma passe **aussi** par un fichier de `db/migrations/`,
appliqué au démarrage de l'API (`src/migrate.ts`, table `schema_migrations`,
verrou consultatif, une transaction par migration). Le déploiement reste
`docker compose up -d --build` : la migration part avec le conteneur.

Deux règles, sinon les deux chemins divergent :

1. **Tout objet nouveau est écrit aux deux endroits** — la migration (chemin
   d'exécution) et `schema.sql` (forme courante, lisible d'un coup d'œil).
2. **Les migrations sont rejouables** (`if not exists`, `create or replace`,
   `drop function if exists` avant un changement de signature) : sur un volume
   neuf, `schema.sql` est déjà à jour et les migrations passent derrière.

`db/schema.sql`
reprend à l'identique les tables, index et fonctions de `supabase/migrations/`,
sans ce qui n'existe que chez Supabase :

| Retiré                                | Pourquoi                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| RLS + policies `to anon`              | Le rôle `anon` est une invention PostgREST. Ici aucun client ne parle à Postgres. |
| `storage.buckets` / `storage.objects` | Le stockage est un répertoire sur disque, servi par l'API.                        |
| `verifier_secrets`                    | Créée puis supprimée dans l'historique.                                           |

**PostGIS vit dans `public`**, pas dans `extensions` comme chez Supabase :
l'image `postgis/postgis` pose l'extension via `template1` avant ce script, et
un `with schema extensions` y est silencieusement ignoré — le type
`extensions.geography` reste alors introuvable et Postgres refuse de démarrer.
Seul le type de colonne est donc écrit sans qualification ; les **corps de
fonctions restent identiques** à la production Supabase (ils n'appellent
PostGIS que sans qualification), et le schéma `extensions` est créé vide pour
que leur `search_path` reste valide.

## Déploiement

L'ordre compte. `proxy_pass http://placekeepr-api:8787` est résolu au
**chargement** de la conf nginx : si l'alias n'existe pas encore, nginx refuse
de démarrer — et emporte BaladeZen avec lui.

```bash
# 1. DNS : placekeepr.app → IP du VPS, AVANT la demande de certificat.

# 2. La stack, d'abord — l'alias réseau doit exister.
cp .env.example .env        # POSTGRES_PASSWORD, VERIFIER_KEYPAIR, HELIUS_WEBHOOK_SECRET
docker compose up -d --build
docker compose exec api wget -qO- http://localhost:8787/health

# 3. Certificat, via le webroot certbot déjà en place.
cd /home/debian/baladezen/infra
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d placekeepr.app -d www.placekeepr.app

# 4. nginx ensuite, jamais avant.
cp .../nginx/placekeepr.conf nginx/conf.d/
docker compose exec nginx nginx -t     # ← impératif
docker compose exec nginx nginx -s reload

curl https://placekeepr.app/health
```

> ⚠️ `.app` est **HSTS-preloaded** au niveau du registre : HTTPS obligatoire,
> aucun fallback HTTP côté navigateur. Le challenge ACME http-01 fonctionne
> quand même (le validateur Let's Encrypt n'applique pas HSTS), mais aucun test
> en `http://` n'est possible depuis un navigateur — utiliser un autre hostname
> en local.

### Restaurer le dump Supabase

```bash
docker compose exec -T db psql -U placekeepr -d placekeepr \
  < ../backups/supabase-2026-09-09/data/restore.sql
docker run --rm -v placekeepr_assets:/assets \
  -v "$PWD/../backups/supabase-2026-09-09/photos":/src:ro \
  alpine cp -a /src/. /assets/
```

## Co-signature : la règle de l'instruction unique

Le vérifieur signe un **message de transaction**, pas une instruction. Toute
instruction de ce message qui exige sa signature est donc autorisée du même
coup — `register_place` comme `visit_place`.

D'où `soleProgramInstruction()` (`src/cosign.ts`) : les deux routes refusent
tout message contenant **plus d'une** instruction `place_registry`. Sans cette
règle, joindre un second `register_place` (cellule arbitraire) à une capture
légitime le faisait co-signer au passage : une vérification GPS payait deux
inscriptions.

Le PDA du lieu n'est jamais accepté du client : il est **dérivé** des
coordonnées vérifiées et comparé à celui de la transaction. Pour une visite, le
client annonce la cellule visée, le serveur en dérive le PDA, exige qu'il
corresponde, puis vérifie que le fix GPS est à ≤ 50 m du centre de cellule —
sans lire le miroir, pour qu'un trou d'indexation ne puisse ni bloquer une
visite légitime ni en autoriser une fausse.

## Secrets

`VERIFIER_KEYPAIR` est **tout ce qui rend la vérification GPS incontournable** :
compromettre la machine, c'est compromettre la vérif. Fichier `.env` en `600`,
jamais dans le compose ni dans le repo. Rotation possible sans redéploiement via
`set_verifier` (admin du programme).

## Sauvegardes

`scripts/backup.sh`, à planifier en cron (voir l'en-tête du script).

Ce qui est en jeu n'est pas symétrique :

- `mints`, `places`, `likes`, `visit_events`, `royalty_events` sont
  **reconstructibles** depuis la chaîne — mais pas tout seuls : Helius ne
  relivre un lot que sur réponse non-2xx. Une transaction acceptée (200) par
  un indexer qui ne savait pas encore la décoder est perdue pour le miroir
  (cas des royalties le 18/09/2026, serveur pas encore redéployé). Le rejeu
  passe par `app/scripts/replay-helius-tx.ts`, qui reconstruit le payload
  depuis un RPC standard et le poste sur `/helius-webhook` — idempotent. Les
  signatures à rejouer se listent avec `getSignaturesForAddress` sur le
  programme ou le compte concerné.
  **Corollaire : déployer l'indexer avant le programme qu'il décode**, pas
  après.
- `profiles` n'est **pas** reconstructible : off-chain par construction,
  la sauvegarde est son seul filet.
- Les **assets ne le sont pas**. Ce sont les preuves. C'est la seule donnée
  irremplaçable du système — et ils vivent dans un volume Docker que rien
  d'autre ne réplique.

Une sauvegarde jamais restaurée n'est pas une sauvegarde : teste la restauration
une fois, pour de vrai.
