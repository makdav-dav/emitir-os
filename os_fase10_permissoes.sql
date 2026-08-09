-- ============================================================
--  Fase 10 — só admin/editor podem EMITIR OS (nível de banco).
--  Restringe a inserção de os_documentos/os_itens a quem pode
--  editar tudo (admin/editor). Coletores seguem podendo cadastrar
--  solicitações e dar baixa (via RPC), mas não emitir OS.
--  Complementa a diferenciação na interface. Idempotente.
-- ============================================================
drop policy if exists "coletores inserem" on public.os_documentos;
drop policy if exists "editores inserem"  on public.os_documentos;
create policy "editores inserem" on public.os_documentos
  for insert to authenticated with check (public.pode_editar_tudo());

drop policy if exists "coletores inserem" on public.os_itens;
drop policy if exists "editores inserem"  on public.os_itens;
create policy "editores inserem" on public.os_itens
  for insert to authenticated with check (public.pode_editar_tudo());

-- (os_config já é restrito a pode_editar_tudo desde o os_schema.sql.)
