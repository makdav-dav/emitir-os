-- ============================================================
--  RECOMEÇAR (não-destrutivo) — arquiva tudo que existe hoje como
--  histórico e limpa os dados de teste. O fluxo ativo fica vazio,
--  mas o histórico e os dashboards continuam acessíveis.
--  Rode DEPOIS de os_fase8_arquivo_bairro.sql.
-- ============================================================

-- 1) apaga dados de teste (origem='teste' e a OS de teste 99/2026)
delete from public.os_itens
  where os_id in (select id from public.os_documentos where numero_formatado = '99/2026');
delete from public.os_documentos where numero_formatado = '99/2026';
delete from public.os_solicitacoes where origem = 'teste';

-- 2) arquiva tudo o que sobrou (vira histórico, sai do fluxo ativo)
update public.os_solicitacoes set arquivado = true where coalesce(arquivado,false) = false;
update public.os_documentos   set arquivado = true where coalesce(arquivado,false) = false;
