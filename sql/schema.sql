-- ============================================================
-- Registro de Visitas PH — Schema (Supabase / PostgreSQL)
-- Torres T100 y T200, pisos 1-6, unidades con letras de la A a la P.
-- Ejemplos de unidad: 4A, 3B, 1D, 6P.
-- ============================================================

-- ---------- Tipos enumerados ----------
create type public.app_role as enum ('owner', 'guard');
create type public.visit_type as enum ('walk', 'car');
create type public.visit_status as enum ('registered', 'arrived', 'left');

-- ---------- users ----------
-- Perfiles de Telegram. El WhatsApp del propietario se guarda aquí
-- (normalizado con indicativo, p.ej. 507XXXXXXXX) para uso futuro.
create table if not exists public.users (
  id bigserial primary key,
  telegram_id bigint unique not null,
  first_name text,
  username text,
  role public.app_role not null default 'owner',
  whatsapp text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- units ----------
-- Unidades físicas de la propiedad horizontal.
create table if not exists public.units (
  id bigserial primary key,
  tower text not null check (tower in ('T100', 'T200')),
  unit text not null,               -- p.ej. "4A", "3B", "1D"
  floor int not null check (floor between 1 and 6),
  letter text not null,             -- "A".."P"
  unique (tower, unit)
);

-- ---------- user_units ----------
-- Liga a un propietario con su unidad (puede tener varias).
create table if not exists public.user_units (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  unit_id bigint not null references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, unit_id)
);

-- ---------- visits ----------
-- Visita a una unidad. El QR de Telegram apunta a la visita vía
-- start_payload / confirm_code. El "inicio del horario" se confirma
-- cuando el guardia marca la llegada (arrived_at).
create table if not exists public.visits (
  id bigserial primary key,
  confirm_code text unique not null, -- para el deep-link t.me/bot?start=visita_XXXX
  unit_id bigint not null references public.units(id) on delete cascade,
  owner_user_id bigint references public.users(id) on delete set null,
  visitor_name text not null,
  visit_type public.visit_type not null default 'walk',
  plate text,                        -- obligatorio si visit_type = 'car'
  status public.visit_status not null default 'registered',
  registered_by_user_id bigint references public.users(id) on delete set null,
  qr_enabled boolean not null default true,
  registered_at timestamptz not null default now(),
  confirmed_at timestamptz,          -- guardia revisa el QR (reserva)
  arrived_at timestamptz,            -- guardia confirma la llegada
  exited_at timestamptz              -- salida (propietario o guardia)
);

-- ---------- Índices ----------
create index if not exists idx_visits_status on public.visits(status);
create index if not exists idx_visits_unit on public.visits(unit_id);
create index if not exists idx_user_units_user on public.user_units(user_id);
create index if not exists idx_units_tower on public.units(tower);

-- ---------- triggers: updated_at ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ============================================================
-- SEED de unidades: T100 y T200, pisos 1-6, letras A-P.
-- ============================================================
insert into public.units (tower, unit, floor, letter)
select
  t.tower,
  f.floor || l.letter as unit,
  f.floor,
  l.letter
from (values ('T100'), ('T200')) as t(tower)
cross join generate_series(1, 6) as f(floor)
cross join (
  select chr(64 + gs) as letter
  from generate_series(1, 16) as gs   -- A (1) a P (16)
) as l
on conflict (tower, unit) do nothing;
