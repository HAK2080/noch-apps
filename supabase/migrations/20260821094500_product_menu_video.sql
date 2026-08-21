alter table public.pos_products
  add column if not exists video_url text;

comment on column public.pos_products.video_url is
  'Optional public MP4 or WebM menu video. When present, customer menus prefer it over image_url.';
