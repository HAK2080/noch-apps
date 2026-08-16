-- Optional bilingual customer-menu badges with a selectable animation style.
alter table public.pos_products
  add column if not exists menu_badge_key text,
  add column if not exists menu_badge_animation text not null default 'dazzle';

alter table public.pos_products
  drop constraint if exists pos_products_menu_badge_key_check,
  drop constraint if exists pos_products_menu_badge_animation_check;

alter table public.pos_products
  add constraint pos_products_menu_badge_key_check
    check (
      menu_badge_key is null
      or menu_badge_key in ('new', 'limited', 'back_in_stock', 'popular', 'must_try')
    ),
  add constraint pos_products_menu_badge_animation_check
    check (menu_badge_animation in ('dazzle', 'shimmer', 'pulse', 'float'));

comment on column public.pos_products.menu_badge_key is
  'Optional customer-menu badge: new, limited, back_in_stock, popular, or must_try.';
comment on column public.pos_products.menu_badge_animation is
  'Customer-menu badge animation: dazzle, shimmer, pulse, or float.';
