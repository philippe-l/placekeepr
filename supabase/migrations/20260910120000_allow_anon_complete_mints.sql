-- Complétion par l'app d'une ligne de mint créée par l'indexer Helius.
--
-- L'indexer insère la tx ~2 s après la chaîne, la sync de l'app passe ~9 s
-- après : la ligne existe déjà, sans photos ni position précise. Sans droit
-- d'update, les preuves n'atteignaient jamais la table — constaté sur les
-- mints du 08/07 et du 10/09/2026, tous deux avec photo_path null alors que
-- les fichiers étaient bien dans le bucket.
--
-- Restreinte aux lignes SANS photo : une preuve déjà déposée n'est jamais
-- réécrite. Transitoire — disparaît avec la bascule vers l'API auto-hébergée
-- (server/), où c'est le serveur qui valide les écritures et où la complétion
-- se fait en un seul `insert … on conflict do update` avec coalesce.
create policy "anon can complete mints without photo" on public.mints
  for update to anon using (photo_path is null) with check (true);
