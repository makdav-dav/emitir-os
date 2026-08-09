-- ============================================================
--  Fase 3 — chaves do Web App do Apps Script no os_config.
--  COMO USAR:
--   1. Publique o Web App (DEPLOY_FASE3.md) e copie a URL /exec.
--   2. Cole a URL na linha OS_WEBAPP_URL abaixo (entre as aspas).
--   3. Rode este script inteiro no SQL Editor do Supabase.
--  Rodar de novo com valores novos ATUALIZA (upsert).
-- ============================================================
insert into public.os_config (chave, valor, descricao) values
  ('OS_WEBAPP_URL',   'COLE_AQUI_A_URL_/exec',        'URL /exec do Web App do Apps Script que gera o Doc'),
  ('OS_WEBAPP_TOKEN', 'DEFINA_UM_TOKEN_SECRETO',      'Segredo compartilhado — igual à constante TOKEN do .gs')
on conflict (chave) do update set valor = excluded.valor;
