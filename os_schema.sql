-- ============================================================
--  EMITIR OS — Schema Supabase (Fase 0)
--  Mesmo projeto/DB do coletadecampo. Reusa as funções de papel
--  e o padrão de RLS de acesso_rls.sql (papel_atual / is_autorizado
--  / pode_editar_tudo / criado_por = auth.jwt()->>'email').
--  Idempotente: pode rodar de novo sem quebrar.
-- ============================================================

-- ── Pré-requisito: as funções abaixo já existem no projeto
--    (definidas em acesso_rls.sql). Recriadas aqui por segurança,
--    caso este schema seja aplicado num projeto limpo. ──────────
create or replace function public.papel_atual() returns text
  language sql stable security definer set search_path = public as
  $$ select papel from usuarios_autorizados
     where email = (auth.jwt() ->> 'email') $$;

create or replace function public.is_autorizado() returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.papel_atual() is not null $$;

create or replace function public.pode_editar_tudo() returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.papel_atual() in ('admin','editor') $$;

create or replace function public.pode_coletar() returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.papel_atual() in ('admin','editor','coletor') $$;


-- ════════════════════════════════════════════════════════════
--  1) os_config — espelha a aba "Infos" (chave/valor)
-- ════════════════════════════════════════════════════════════
create table if not exists public.os_config (
  chave          text primary key,
  valor          text,
  descricao      text,
  atualizado_em  timestamptz default now(),
  atualizado_por text default (auth.jwt() ->> 'email')
);

-- ════════════════════════════════════════════════════════════
--  2) os_solicitacoes — pool de entrada (aba "2. Entrada Para OS")
--     Uma linha = um pedido que pode entrar numa OS.
--     lat/lng já vêm geocodificados (fluxo híbrido: geocoding
--     continua no Apps Script / planilha).
-- ════════════════════════════════════════════════════════════
create table if not exists public.os_solicitacoes (
  id               uuid primary key default gen_random_uuid(),
  n_processo       text,
  endereco         text not null,
  data_entrada     date,
  ponto_referencia text,
  trabalho         text,
  tipo_servico     text,                 -- Poda/Corte | Jardinagem | Arborização | ...
  prioridade       numeric,              -- null = sem prioridade
  pendente         boolean default false,
  observacoes      text,
  lat              double precision,
  lng              double precision,
  geo_status       text,                 -- 'ok' | 'sem_geo' | 'pendente'
  status           text not null default 'aberta',  -- aberta | agrupada | emitida | arquivada
  origem           text default 'manual',           -- manual | import | processo
  criado_em        timestamptz default now(),
  criado_por       text default (auth.jwt() ->> 'email')
);
create index if not exists ix_os_solic_status on public.os_solicitacoes (status);
create index if not exists ix_os_solic_tipo   on public.os_solicitacoes (tipo_servico);

-- ════════════════════════════════════════════════════════════
--  3) os_documentos — cabeçalho de cada OS emitida
--     (substitui "OS Enviadas" + parte do "_BACKUP_OS")
-- ════════════════════════════════════════════════════════════
create table if not exists public.os_documentos (
  id                uuid primary key default gen_random_uuid(),
  numero            text,                 -- "07" (raw)
  numero_formatado  text,                 -- "07/2026"
  ano               int,
  contrato          text,
  empresa           text,
  data_limite       date,
  data_geracao      timestamptz default now(),
  responsavel1      text,
  cargo1            text,
  responsavel2      text,
  cargo2            text,
  doc_url           text,                 -- link do Google Doc gerado
  pdf_url           text,
  status            text not null default 'emitida',  -- rascunho | emitida | concluida
  criado_em         timestamptz default now(),
  criado_por        text default (auth.jwt() ->> 'email')
);
create index if not exists ix_os_doc_numero on public.os_documentos (numero_formatado);

-- ════════════════════════════════════════════════════════════
--  4) os_itens — linhas que compõem uma OS (snapshot histórico)
--     Espelha "_BACKUP_OS". solicitacao_id é opcional (import
--     histórico pode não ter solicitação viva correspondente).
-- ════════════════════════════════════════════════════════════
create table if not exists public.os_itens (
  id               uuid primary key default gen_random_uuid(),
  os_id            uuid not null references public.os_documentos(id) on delete cascade,
  solicitacao_id   uuid references public.os_solicitacoes(id) on delete set null,
  -- snapshot dos valores no momento da emissão --
  n_processo       text,
  data_entrada     date,
  endereco         text,
  ponto_referencia text,
  trabalho         text,
  data_execucao    date,
  tipo_servico     text,
  prioridade       numeric,
  pendente         boolean default false,
  bloco            text,                 -- ex: "Poda/Corte — Bloco 1"
  ordem            int,                  -- sequência dentro da OS
  lat              double precision,
  lng              double precision,
  geo_status       text,
  criado_em        timestamptz default now(),
  criado_por       text default (auth.jwt() ->> 'email')
);
create index if not exists ix_os_itens_os on public.os_itens (os_id);

-- ════════════════════════════════════════════════════════════
--  RLS — mesmo padrão de arbo_pontos (acesso_rls.sql)
-- ════════════════════════════════════════════════════════════
alter table public.os_config       enable row level security;
alter table public.os_solicitacoes enable row level security;
alter table public.os_documentos   enable row level security;
alter table public.os_itens        enable row level security;

-- os_config: todos autorizados leem; só editor/admin escreve
drop policy if exists "config leem"   on public.os_config;
drop policy if exists "config editam" on public.os_config;
create policy "config leem"   on public.os_config for select to authenticated using (public.is_autorizado());
create policy "config editam" on public.os_config for all    to authenticated
  using (public.pode_editar_tudo()) with check (public.pode_editar_tudo());

-- Macro-padrão para as 3 tabelas transacionais:
--   ler: autorizados | inserir: coletores | upd/del: edita tudo OU o próprio
do $$
declare t text;
begin
  foreach t in array array['os_solicitacoes','os_documentos','os_itens'] loop
    execute format('drop policy if exists "autorizados leem" on public.%I', t);
    execute format('drop policy if exists "coletores inserem" on public.%I', t);
    execute format('drop policy if exists "edita tudo ou o proprio (upd)" on public.%I', t);
    execute format('drop policy if exists "edita tudo ou o proprio (del)" on public.%I', t);

    execute format('create policy "autorizados leem" on public.%I for select to authenticated using (public.is_autorizado())', t);
    execute format('create policy "coletores inserem" on public.%I for insert to authenticated with check (public.pode_coletar())', t);
    execute format($p$create policy "edita tudo ou o proprio (upd)" on public.%I for update to authenticated
      using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')))
      with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')))$p$, t);
    execute format($p$create policy "edita tudo ou o proprio (del)" on public.%I for delete to authenticated
      using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')))$p$, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  SEED — os_config a partir da aba "Infos"
-- ════════════════════════════════════════════════════════════
insert into public.os_config (chave, valor, descricao) values
  ('RAIO_KM',        '2.0',                                        'Distância máx. (km) para agrupar por proximidade'),
  ('SUFIXO_CIDADE',  ', Campo Largo, PR, Brasil',                  'Complemento para geocodificação'),
  ('TIPOS_SERVICO',  'Poda/Corte, Jardinagem, Arborização',       'Ordem obrigatória das tabelas no documento'),
  ('OS_TEMPLATE_ID', '1llnmc9dLeW_FQxpBJniA8-kww0nk0fFELpvjCHE41ms','ID do Google Doc modelo'),
  ('OS_CONTRATO',    '132/2020',                                   'Número do contrato do cabeçalho'),
  ('OS_NUMERO',      '7',                                          'Numeração da próxima OS'),
  ('OS_EMPRESA',     'Ecosystem Serviços Urbanos Ltda.',           'Empresa executora'),
  ('OS_DATA_LIMITE', '2026-05-20',                                 'Prazo final (do serial 46162 da planilha; editável)'),
  ('OS_RESPONSAVEL1','Eduarda V. M. B. Gonçalves',                 'Primeiro assinante'),
  ('OS_CARGO1',      'Divisão do Horto Municipal',                 'Cargo do primeiro assinante'),
  ('OS_RESPONSAVEL2','Deborah N. S. de Araujo Macarini',           'Segundo assinante'),
  ('OS_CARGO2',      'Departamento de Produção Vegetal e Arborização','Cargo do segundo assinante')
on conflict (chave) do nothing;
