-- Abandonné avant usage : le secret du vérifieur vit dans les secrets
-- d'edge function (chiffrés), pas dans une table requêtable.
drop table public.verifier_secrets;
