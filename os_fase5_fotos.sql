-- ============================================================
--  Fase 5 — foto de referência do local + geocoding automático.
--  Uma foto de referência por ponto (os_solicitacoes.foto_ref_url),
--  carregada para o item ao emitir (os_itens.foto_ref_url).
--  Reusa o bucket 'fotos-campo' (público) do coletadecampo.
--  Idempotente.
-- ============================================================
alter table public.os_solicitacoes add column if not exists foto_ref_url text;
alter table public.os_itens        add column if not exists foto_ref_url text;
