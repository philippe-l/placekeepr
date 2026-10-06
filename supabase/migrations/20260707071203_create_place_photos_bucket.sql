-- Bucket des photos de preuve + miniatures pixel-art.
-- Public en lecture (les métadonnées NFT pointeront dessus), upload anon
-- pendant la phase devnet sans auth — même TODO de durcissement que la table mints.
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true);

create policy "public read place photos" on storage.objects
  for select using (bucket_id = 'place-photos');
create policy "anon upload place photos" on storage.objects
  for insert to anon with check (bucket_id = 'place-photos');
