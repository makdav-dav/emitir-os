-- ============================================================
--  Fase 9 — baixa de itens isolados (enviados por WhatsApp).
--  Dá aos itens isolados (os_solicitacoes.status='whatsapp') os
--  mesmos campos de execução dos itens de OS. Idempotente.
-- ============================================================
alter table public.os_solicitacoes add column if not exists executado        boolean default false;
alter table public.os_solicitacoes add column if not exists data_execucao     date;
alter table public.os_solicitacoes add column if not exists obs_execucao      text;
alter table public.os_solicitacoes add column if not exists foto_servico_url  text;
