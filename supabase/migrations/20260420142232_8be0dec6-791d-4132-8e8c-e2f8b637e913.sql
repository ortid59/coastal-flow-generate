-- ============================================================
-- 0001_init.sql — Coastal Maverick Proposal Generator schema
-- ============================================================
create extension if not exists "pgcrypto";

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  client_name text not null,
  campaign_name text not null,
  campaign_date date default current_date,
  markets text[],
  flight_start date,
  flight_end date,
  margin_pct numeric default 20,
  client_logo_url text,
  status text default 'draft',
  canva_design_url text,
  portal_token text unique,
  created_at timestamptz default now()
);

create table public.vendor_files (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns on delete cascade,
  kind text check (kind in ('excel','pdf','logo')),
  vendor text,
  storage_path text not null,
  original_name text,
  created_at timestamptz default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns on delete cascade,
  market text,
  vendor text,
  unit_number text not null,
  format text,
  size text,
  unit_count numeric,
  location_description text,
  latitude numeric,
  longitude numeric,
  facing text,
  read_direction text,
  weekly_impressions numeric,
  four_week_impressions numeric,
  spot_length text,
  loop_length text,
  sov_pct numeric,
  current_advertisers numeric,
  start_date date,
  end_date date,
  four_week_periods numeric,
  rate_card_4wk numeric,
  negotiated_rate_4wk numeric,
  rate_4week numeric,
  production_cost numeric,
  install_cost numeric,
  total_cost numeric,
  cpm numeric,
  artwork_due_date date,
  notes text,
  recommended boolean default false,
  included boolean default true,
  billboard_photo_url text,
  inset_map_url text,
  minimap_url text,
  insight_bullets text[],
  low_res_flag boolean default false,
  created_at timestamptz default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns on delete cascade,
  kind text,
  status text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.campaigns enable row level security;
alter table public.vendor_files enable row level security;
alter table public.units enable row level security;
alter table public.jobs enable row level security;

create policy "own campaigns" on public.campaigns for all using (user_id = auth.uid());
create policy "own files" on public.vendor_files for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
create policy "own units" on public.units for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
create policy "own jobs" on public.jobs for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

create policy "portal public read campaigns" on public.campaigns for select using (portal_token is not null);
create policy "portal public read units" on public.units for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.portal_token is not null));

-- ============================================================
-- 0002_allowlist_and_storage.sql
-- ============================================================

-- Allowlist table (managed via migrations only — no RLS-writable surface)
create table public.allowed_users (
  email text primary key,
  note text,
  created_at timestamptz default now()
);
alter table public.allowed_users enable row level security;
-- No policies = no client access. Only server-side (service role / SECURITY DEFINER) can read.

insert into public.allowed_users (email, note) values
  ('heather@coastalmaverick.com', 'owner'),
  ('david@advisoraipartners.com', 'admin'),
  ('aamish@advisoraipartners.com', 'admin');

-- Block non-allowlisted signups at the auth.users insert boundary
create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.allowed_users where lower(email) = lower(new.email)) then
    raise exception 'Email % is not on the Coastal Maverick allowlist', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_allowlist_before_insert
  before insert on auth.users
  for each row execute function public.enforce_allowlist();

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('uploads',  'uploads',  false),
  ('photos',   'photos',   false),
  ('minimaps', 'minimaps', true),
  ('logos',    'logos',    true),
  ('portals',  'portals',  true)
on conflict (id) do nothing;

-- Private buckets (uploads, photos): owner-only via campaign membership.
-- Path convention: {campaign_id}/...
create policy "owners read uploads"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

create policy "owners write uploads"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

create policy "owners delete uploads"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

create policy "owners read photos"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

create policy "owners write photos"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );

-- Public buckets (logos, minimaps, portals): public read, authenticated write.
create policy "public read logos"
  on storage.objects for select using (bucket_id = 'logos');
create policy "auth write logos"
  on storage.objects for insert with check (bucket_id = 'logos' and auth.uid() is not null);

create policy "public read minimaps"
  on storage.objects for select using (bucket_id = 'minimaps');
create policy "auth write minimaps"
  on storage.objects for insert with check (bucket_id = 'minimaps' and auth.uid() is not null);

create policy "public read portals"
  on storage.objects for select using (bucket_id = 'portals');
create policy "auth write portals"
  on storage.objects for insert with check (bucket_id = 'portals' and auth.uid() is not null);
