-- Allow fiscal profile for both companies (PJ) and individuals (PF)

alter table public.companies
  add column if not exists is_individual boolean not null default false,
  add column if not exists cpf text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_cpf_digits_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_cpf_digits_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
end $$;

create unique index if not exists companies_cpf_uidx
  on public.companies(cpf)
  where cpf is not null;
