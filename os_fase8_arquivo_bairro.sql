-- ============================================================
--  Fase 8 — Arquivo (histórico) + bairro (para dashboards).
--  Idempotente.
-- ============================================================
alter table public.os_solicitacoes add column if not exists arquivado boolean default false;
alter table public.os_documentos   add column if not exists arquivado boolean default false;
alter table public.os_solicitacoes add column if not exists bairro text;
alter table public.os_itens        add column if not exists bairro text;

create index if not exists ix_os_solic_arq on public.os_solicitacoes (arquivado);
create index if not exists ix_os_doc_arq   on public.os_documentos (arquivado);
create index if not exists ix_os_solic_bairro on public.os_solicitacoes (bairro);
create index if not exists ix_os_itens_bairro  on public.os_itens (bairro);
