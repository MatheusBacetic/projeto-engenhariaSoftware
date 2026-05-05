-- Billing status for companies (grace period: 15 days)

alter table public.companies
  add column if not exists payment_status text not null default 'em_dia';

alter table public.companies
  add column if not exists payment_last_paid_at timestamptz null;

alter table public.companies
  add column if not exists payment_overdue_since timestamptz null;

alter table public.companies
  add column if not exists payment_grace_until timestamptz null;

alter table public.companies
  add column if not exists payment_blocked_at timestamptz null;

alter table public.companies
  add column if not exists stripe_customer_id text null;

alter table public.companies
  add column if not exists stripe_subscription_id text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_payment_status_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_payment_status_check
      check (payment_status in ('em_dia', 'atrasado', 'bloqueado'));
  end if;
end $$;

create index if not exists companies_payment_status_idx
  on public.companies(payment_status);

create unique index if not exists companies_stripe_customer_id_uidx
  on public.companies(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists companies_stripe_subscription_id_uidx
  on public.companies(stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.recalculate_company_payment_status(p_company_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companies c
  set
    payment_grace_until = case
      when c.payment_overdue_since is null then null
      else coalesce(c.payment_grace_until, c.payment_overdue_since + interval '15 days')
    end,
    payment_status = case
      when c.payment_overdue_since is null then 'em_dia'
      when now() >= coalesce(c.payment_grace_until, c.payment_overdue_since + interval '15 days') then 'bloqueado'
      else 'atrasado'
    end,
    payment_blocked_at = case
      when c.payment_overdue_since is null then null
      when now() >= coalesce(c.payment_grace_until, c.payment_overdue_since + interval '15 days')
        then coalesce(c.payment_blocked_at, now())
      else null
    end
  where p_company_id is null or c.id = p_company_id;
end;
$$;

create or replace function public.mark_company_payment_paid(
  p_company_id uuid,
  p_paid_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companies
  set
    payment_status = 'em_dia',
    payment_last_paid_at = p_paid_at,
    payment_overdue_since = null,
    payment_grace_until = null,
    payment_blocked_at = null
  where id = p_company_id;
end;
$$;

create or replace function public.mark_company_payment_overdue(
  p_company_id uuid,
  p_overdue_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overdue_since timestamptz;
  v_grace_until timestamptz;
  v_blocked boolean;
begin
  select
    coalesce(payment_overdue_since, p_overdue_at),
    coalesce(payment_grace_until, coalesce(payment_overdue_since, p_overdue_at) + interval '15 days')
  into v_overdue_since, v_grace_until
  from public.companies
  where id = p_company_id;

  if v_overdue_since is null then
    return;
  end if;

  v_blocked := now() >= v_grace_until;

  update public.companies
  set
    payment_status = case when v_blocked then 'bloqueado' else 'atrasado' end,
    payment_overdue_since = v_overdue_since,
    payment_grace_until = v_grace_until,
    payment_blocked_at = case when v_blocked then coalesce(payment_blocked_at, now()) else null end
  where id = p_company_id;
end;
$$;

create or replace function public.company_access_allowed(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform public.recalculate_company_payment_status(p_company_id);

  select payment_status
    into v_status
  from public.companies
  where id = p_company_id;

  if v_status is null then
    return false;
  end if;

  return v_status <> 'bloqueado';
end;
$$;
