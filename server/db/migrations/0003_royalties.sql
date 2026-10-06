-- Royalties (Phase 4) : journal comptable des mouvements de cagnotte,
-- alimenté par l'indexer. La chaîne porte l'argent (un PDA vault par lieu) et
-- la vérité du solde ; cette table porte l'historique, qu'elle n'archive pas.
--
-- Rejouable (règle de src/migrate.ts) : `if not exists` partout.
-- Contrainte CLAUDE.md : toute interaction on-chain qui produit un revenu doit
-- être loggée proprement. L'app, elle, lit les soldes **on-chain** — ce miroir
-- sert la comptabilité et l'historique, jamais la décision de distribuer.
--
-- `amount_lamports` : pour un dépôt, l'argument de l'instruction (exact) ;
-- pour une distribution, la baisse de solde du vault lue dans le payload
-- Helius — le programme calcule le montant, il n'est nulle part dans
-- l'instruction. Null si le payload ne porte pas la variation de solde : on
-- garde l'événement plutôt que de le perdre. Les parts ne sont volontairement
-- pas stockées : les recalculer ici dupliquerait le barème du programme, et
-- deux barèmes finissent toujours par diverger en silence.
create table if not exists public.royalty_events (
  signature text not null,
  -- Index de l'instruction dans la transaction : l'app peut grouper trois
  -- distributions dans une seule tx, la signature seule ne les distingue pas.
  instruction_index integer not null,
  kind text not null check (kind in ('deposit', 'distribution')),
  place_pda text not null,
  vault_pda text not null,
  -- Dépôt : qui a payé. Distribution : le gardien crédité.
  counterparty text,
  amount_lamports bigint,
  -- Distribution seulement : nombre de likeurs récents servis.
  liker_count integer,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (signature, instruction_index)
);

create index if not exists royalty_events_place_idx on public.royalty_events (place_pda, occurred_at desc);
create index if not exists royalty_events_counterparty_idx on public.royalty_events (counterparty, occurred_at desc);
