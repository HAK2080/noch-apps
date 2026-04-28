-- Storage RLS for the `product-images` bucket
-- Run once in Supabase SQL editor after creating the bucket.
-- Reproduces the policies live in production as of 2026-04-28.

-- Anyone can view product images (storefront fetches them anonymously)
create policy "public_read_product_images" on storage.objects
  for select using (bucket_id = 'product-images');

-- Only authenticated admin/staff can upload, update, delete
create policy "auth_insert_product_images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');

create policy "auth_update_product_images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');

create policy "auth_delete_product_images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');
