# Supabase — projet `placekeepr` (ref `cfsklgrqnsfkytaudwza`, eu-west-3)

## `migrations/`

Miroir de l'historique de migrations appliqué au projet (mêmes versions que
`supabase_migrations.schema_migrations`). Les migrations sont appliquées via
MCP/dashboard ; ce dossier est la copie de référence du repo — **toute nouvelle
migration appliquée doit être ajoutée ici avec sa version exacte**. Avec la CLI
Supabase, `supabase db pull` / `link` retrouveront cet historique.

Les secrets (keypair vérifieur, etc.) ne passent **jamais** par une migration :
ils vivent dans les secrets d'edge function (dashboard).

## `functions/`

Sources des edge functions déployées (copies de référence, déployées via
MCP/dashboard) :

- `verify-capture` — vérif GPS d'une capture + co-signature du registre
  (secret : `VERIFIER_KEYPAIR`). `verify_jwt` off (auth par inspection,
  aucune donnée sensible).
- `helius-webhook` — indexer Helius → table `mints` (secret :
  `HELIUS_WEBHOOK_SECRET`, = `authHeader` du webhook). `verify_jwt` off
  (auth par secret partagé, fail-closed).
