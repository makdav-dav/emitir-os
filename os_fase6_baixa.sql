-- ============================================================
--  Fase 6 — Baixa / execução dos itens da OS.
--  Colunas de execução em os_itens + RPC controlada os_dar_baixa
--  (SECURITY DEFINER) para a equipe de campo dar baixa em itens
--  que não criou, mexendo SÓ nos campos de execução.
--  Idempotente.
-- ============================================================
alter table public.os_itens add column if not exists status_execucao  text default 'aberto';  -- aberto | executado
alter table public.os_itens add column if not exists executado_por     text;
alter table public.os_itens add column if not exists foto_servico_url  text;
-- data_execucao (date) já existe desde a Fase 0.

create index if not exists ix_os_itens_status_exec on public.os_itens (status_execucao);

-- ── RPC: dá baixa num item e recalcula o status da OS ──────────
--   Qualquer usuário autorizado pode chamar; a função (definer)
--   atualiza apenas os campos de execução, ignorando quem criou.
create or replace function public.os_dar_baixa(
  p_item   uuid,
  p_status text,
  p_data   date default null,
  p_foto   text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_os uuid;
begin
  if not public.is_autorizado() then
    raise exception 'Usuário não autorizado.';
  end if;
  if p_status not in ('aberto','executado') then
    raise exception 'Status inválido: %', p_status;
  end if;

  update public.os_itens
     set status_execucao = p_status,
         data_execucao   = p_data,
         foto_servico_url = coalesce(p_foto, foto_servico_url),
         executado_por   = case when p_status = 'executado' then (auth.jwt() ->> 'email') else null end
   where id = p_item
   returning os_id into v_os;

  if v_os is null then raise exception 'Item não encontrado.'; end if;

  -- rollup: OS vira 'concluida' quando não há mais itens em aberto
  update public.os_documentos d
     set status = case when not exists (
           select 1 from public.os_itens i
            where i.os_id = v_os and coalesce(i.status_execucao,'aberto') <> 'executado'
         ) then 'concluida' else 'emitida' end
   where d.id = v_os;
end $$;

grant execute on function public.os_dar_baixa(uuid, text, date, text) to authenticated;
