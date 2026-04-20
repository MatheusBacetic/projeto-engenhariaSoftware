-- Fiscal profile fields for companies

alter table public.companies
  add column if not exists cnpj text null,
  add column if not exists state_registration text null,
  add column if not exists municipal_registration text null,
  add column if not exists tax_regime text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_cnpj_digits_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_cnpj_digits_check
      check (cnpj is null or cnpj ~ '^[0-9]{14}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_tax_regime_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_tax_regime_check
      check (tax_regime is null or tax_regime in ('MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'));
  end if;
end $$;

create unique index if not exists companies_cnpj_uidx
  on public.companies(cnpj)
  where cnpj is not null;
