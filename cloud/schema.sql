-- Market Radar database (run once in Supabase: SQL Editor → New query → paste → Run).

-- One row per user: their plan and Stripe ids. Created automatically at sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile. Only the server (service role) can change plans.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Landing-page waitlist. Written only by the server.
create table if not exists public.waitlist (
  email text primary key,
  source text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
