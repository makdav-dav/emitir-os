-- ============================================================
--  ⚠️  ZERAR TUDO — DESTRUTIVO E IRREVERSÍVEL.
--  Apaga TODAS as solicitações, OS e itens (inclui o histórico
--  importado e a base dos dashboards). Use só se tiver certeza.
--  As fotos no Storage NÃO são apagadas por aqui.
-- ============================================================
delete from public.os_itens;
delete from public.os_documentos;
delete from public.os_solicitacoes;
-- os_config é preservado (URL do Web App, token, responsáveis, etc.)
