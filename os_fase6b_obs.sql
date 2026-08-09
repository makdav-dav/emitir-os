-- ============================================================
--  Fase 6b — Observação na baixa + baixa rápida.
--  Adiciona os_itens.obs_execucao e atualiza a RPC os_dar_baixa
--  para receber p_obs. Rode DEPOIS do os_fase6_baixa.sql.
-- ============================================================
alter table public.os_itens add column if not exists obs_execucao text;

-- Substitui a RPC pela versão com p_obs (remove a assinatura antiga)
drop function if exists public.os_dar_baixa(uuid, text, date, text);

create or replace function public.os_dar_baixa(
  p_item   uuid,
  p_status text,
  p_data   date default null,
  p_foto   text default null,
  p_obs    text default null
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
     set status_execucao  = p_status,
         data_execucao    = p_data,
         foto_servico_url = coalesce(p_foto, foto_servico_url),
         obs_execucao     = p_obs,
         executado_por    = case when p_status = 'executado' then (auth.jwt() ->> 'email') else null end
   where id = p_item
   returning os_id into v_os;

  if v_os is null then raise exception 'Item não encontrado.'; end if;

  update public.os_documentos d
     set status = case when not exists (
           select 1 from public.os_itens i
            where i.os_id = v_os and coalesce(i.status_execucao,'aberto') <> 'executado'
         ) then 'concluida' else 'emitida' end
   where d.id = v_os;
end $$;

grant execute on function public.os_dar_baixa(uuid, text, date, text, text) to authenticated;
