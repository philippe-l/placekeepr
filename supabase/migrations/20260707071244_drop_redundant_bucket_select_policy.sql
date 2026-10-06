-- Bucket public : les URLs d'objets sont servies sans policy SELECT.
-- Celle-ci ne servait qu'à autoriser le listing complet du bucket — inutile et trop large.
drop policy "public read place photos" on storage.objects;
