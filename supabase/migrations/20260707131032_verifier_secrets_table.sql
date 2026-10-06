-- Secret du keypair vérifieur (co-signature des register_place).
-- RLS activée SANS policy : illisible pour anon/authenticated ; seules les
-- edge functions (service role) y accèdent. Le secret est inséré à la main
-- (jamais dans une migration). Mainnet : à déplacer vers un vrai gestionnaire
-- de secrets.
-- NB : abandonnée par la migration suivante au profit des secrets d'edge
-- function — conservée pour l'intégrité de l'historique.
create table public.verifier_secrets (
  id text primary key,
  keypair jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.verifier_secrets enable row level security;
