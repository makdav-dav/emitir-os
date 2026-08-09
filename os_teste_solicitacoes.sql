-- ============================================================
--  DADOS DE TESTE — solicitações já geocodificadas, só para
--  testar a emissão de OS pelo app de ponta a ponta.
--  São marcadas com origem='teste' para fácil limpeza depois.
--  Coordenadas reais em Campo Largo/PR.
-- ============================================================
insert into public.os_solicitacoes
  (n_processo, endereco, data_entrada, ponto_referencia, trabalho, tipo_servico, prioridade, pendente, lat, lng, geo_status, status, origem)
values
  ('T-101/2026', 'Rua XV de Novembro, 100, Centro',        '2026-07-01', 'em frente à praça',    'Corte de árvore comprometida', 'Poda/Corte', 1,    true,  -25.4589, -49.5310, 'ok', 'aberta', 'teste'),
  ('T-102/2026', 'Rua Sete de Setembro, 250, Centro',      '2026-07-03', 'esquina com a Barão',  'Poda de manutenção',           'Poda/Corte', null, false, -25.4612, -49.5285, 'ok', 'aberta', 'teste'),
  ('T-103/2026', 'Rua Marechal Deodoro, 500, Vila Solene', '2026-07-05', null,                   'Poda de galhos secos',         'Poda/Corte', 2,    false, -25.4535, -49.5402, 'ok', 'aberta', 'teste'),
  ('T-201/2026', 'Praça da Bandeira, Centro',              '2026-06-20', 'canteiro central',     'Roçada e limpeza do canteiro', 'Jardinagem', null, false, -25.4598, -49.5325, 'ok', 'aberta', 'teste'),
  ('T-104/2026', 'Estrada da Ferraria, km 3, Ferraria',    '2026-06-28', 'perto do posto',       'Corte de eucalipto',           'Poda/Corte', null, false, -25.5050, -49.6000, 'ok', 'aberta', 'teste');
