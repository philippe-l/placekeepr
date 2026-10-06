-- Profils gardiens (Phase 4) : pseudo + avatar, purement off-chain.
--
-- **Pourquoi pas on-chain.** Un pseudo n'est pas de la réputation : il ne
-- demande aucun consensus, et son unicité — un index ici — exigerait là-bas un
-- registre de noms complet. L'avatar est une image, il passe par /assets de
-- toute façon. Corollaire assumé, à l'inverse du reste du miroir : un profil
-- ne se rejoue pas depuis la chaîne. C'est de l'affichage, pas de la preuve —
-- seule la sauvegarde quotidienne le couvre.
--
-- Rejouable (règle de src/migrate.ts) : `if not exists` partout.

create table if not exists public.profiles (
  wallet text primary key,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicité insensible à la casse, et seulement sur les pseudos posés : rien
-- n'oblige à en avoir un, et deux profils sans pseudo ne se marchent pas
-- dessus (un index unique ordinaire laisse passer les null, mais autant que la
-- condition soit lisible).
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;
