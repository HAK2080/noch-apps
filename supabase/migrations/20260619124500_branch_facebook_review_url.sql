alter table public.pos_branches
  add column if not exists facebook_review_url text;

update public.pos_branches
set facebook_review_url = 'https://www.facebook.com/share/g/1HEKKx8BZP/'
where facebook_review_url is null;
