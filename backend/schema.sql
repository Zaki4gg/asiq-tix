set search_path to public;

create table if not exists events (
  id             text primary key,
  title          text not null,
  date_iso       timestamptz not null,
  venue          text not null,
  description    text default '',
  image_url      text,
  price_pol      numeric(18,6) not null default 0,
  sold_tickets   integer not null default 0,
  total_tickets  integer not null default 0,
  listed         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
before update on events
for each row
execute function set_updated_at();

create index if not exists idx_events_listed_date on events (listed, date_iso desc);

-- =============== ADMINS (untuk whitelist admin wallet) ===============
create table if not exists admins (
  address   text primary key,
  note      text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  wallet_address text primary key,
  role text not null default 'customer',  -- 'customer' | 'promotor' | 'admin'
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

alter table events
  add column if not exists promoter_wallet text;


-- tambah jenis 'withdraw' ke constraint kind
ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_kind_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_kind_check
  CHECK (kind = ANY (ARRAY['topup','purchase','refund','withdraw']));

ALTER TABLE public.transactions
  ADD COLUMN tx_hash text;
