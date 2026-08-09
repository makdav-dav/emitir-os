/* ================================================================
   EMITIR OS — Fase 2: curadoria + clusterização + sequenciamento + mapa
   Algoritmo portado do AppScript (haversine + clusterização gulosa +
   ordenação por prioridade). Preview agrupado por Tipo → Bloco e mapa
   Leaflet com pontos numerados.
   ================================================================ */

/* Paleta dos blocos (espelha CORES do AppScript). */
const CORES = [
  '#0066CC','#9C27B0','#2E7D32','#F57F17','#C62828','#00838F','#BF360C',
  '#4527A0','#558B2F','#283593','#FF6F00','#4E342E','#37474F','#689F38','#AD1457'
];
const COR_TIPO = {
  'Jardinagem':  '#1A237E',
  'Poda/Corte':  '#1B5E20',
  'Arborização': '#BF360C',
  'Outros':      '#37474F'
};

let _emCfg = { raio: 2.0, tipos: ['Poda/Corte','Jardinagem','Arborização'], sufixo: ', Campo Largo, PR, Brasil', data_limite: '' };
let _emSolic = [];              // solicitações abertas carregadas
let _emSel = new Set();         // ids selecionados
let _emMapa = null, _emLayer = null;
let _emOrdem = [];             // ordemFinal para o mapa
let _emGrupos = [];            // grupos (tipo→bloco→membros) do último agrupamento

/* ── Geometria (porta do AppScript) ── */
function rad(g) { return g * Math.PI / 180; }
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function recalcularCentroide(g) {
  let sLat = 0, sLng = 0, n = 0;
  g.membros.forEach(p => { sLat += p.lat; sLng += p.lng; n++; });
  if (n) { g.lat = sLat / n; g.lng = sLng / n; }
  return g;
}
function clusterizar(pontos, raioKm) {
  const centroides = [];
  for (const p of pontos) {
    let melhor = -1, melhorDist = Infinity;
    for (let g = 0; g < centroides.length; g++) {
      const d = haversine(p.lat, p.lng, centroides[g].lat, centroides[g].lng);
      if (d <= raioKm && d < melhorDist) { melhorDist = d; melhor = g; }
    }
    if (melhor === -1) centroides.push({ lat: p.lat, lng: p.lng, membros: [p] });
    else { centroides[melhor].membros.push(p); recalcularCentroide(centroides[melhor]); }
  }
  return centroides;
}
function ordenarPorPrioridade(a, b) {
  const pa = a.prioridade, pb = b.prioridade;
  if (pa != null && pb != null) return pa - pb;
  if (pa != null) return -1;
  if (pb != null) return 1;
  return 0;
}

/* ── Carga + config ── */
async function renderEmitir() {
  if (!sessionValida()) { document.getElementById('em-lista').innerHTML = '<p class="muted">Conecte-se e importe solicitações.</p>'; initMapa(); return; }
  try {
    const cfg = await sbSelect('os_config', 'select=chave,valor') || [];
    const mapa = Object.fromEntries(cfg.map(r => [r.chave, r.valor]));
    if (mapa.RAIO_KM) _emCfg.raio = parseFloat(String(mapa.RAIO_KM).replace(',', '.')) || 2.0;
    if (mapa.TIPOS_SERVICO) _emCfg.tipos = mapa.TIPOS_SERVICO.split(',').map(s => s.trim()).filter(Boolean);
    if (mapa.SUFIXO_CIDADE) _emCfg.sufixo = mapa.SUFIXO_CIDADE;
    _emCfg.data_limite = mapa.OS_DATA_LIMITE || '';
  } catch (e) { /* usa defaults */ }

  try {
    _emSolic = await sbSelect('os_solicitacoes', 'select=*&status=in.(aberta,agrupada)&arquivado=not.is.true&order=prioridade.asc.nullslast,endereco.asc&limit=1000') || [];
  } catch (e) { document.getElementById('em-lista').innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; return; }

  // filtro de tipos
  const tiposPresentes = [...new Set(_emSolic.map(s => s.tipo_servico).filter(Boolean))];
  const sel = document.getElementById('em-filtro-tipo');
  sel.innerHTML = '<option value="">Todos os tipos</option>' + tiposPresentes.map(t => `<option>${esc(t)}</option>`).join('');
  renderListaSel();
  initMapa();
}

function renderListaSel() {
  const box = document.getElementById('em-lista');
  const filtro = document.getElementById('em-filtro-tipo').value;
  const lista = _emSolic.filter(s => !filtro || s.tipo_servico === filtro);
  if (!lista.length) { box.innerHTML = '<p class="muted">Nenhuma solicitação aberta. Importe ou cadastre.</p>'; atualizarContador(); return; }
  box.innerHTML = lista.map(s => {
    const temGeo = s.lat != null && s.lng != null;
    const on = _emSel.has(s.id) ? ' on' : '';
    const prio = s.prioridade != null ? ` <span class="badge prio">⚡ ${esc(s.prioridade)}</span>` : '';
    const pend = s.pendente ? ' <span class="badge pendente">pendente</span>' : '';
    const geo = temGeo ? '' : ' <span class="badge pendente">sem coordenada</span>';
    return `<label class="sel-item${on}${temGeo ? '' : ' sem-geo'}">
      <input type="checkbox" ${_emSel.has(s.id) ? 'checked' : ''} onchange="toggleSel('${s.id}', this.checked)">
      <span style="flex:1;min-width:0">
        <span class="end">${esc(s.endereco)}</span>${prio}${pend}${geo}
        <span class="meta">${esc(s.tipo_servico || 'sem tipo')}${s.n_processo ? ' · proc. ' + esc(s.n_processo) : ''}${s.trabalho ? ' · ' + esc(s.trabalho) : ''}</span>
      </span>
      <button class="ic-btn wa-btn" title="Enviar no WhatsApp (item isolado, fora da OS)"
        onclick="event.preventDefault();event.stopPropagation();whatsappItem('${s.id}')">📱</button></label>`;
  }).join('');
  atualizarContador();
}
function toggleSel(id, checked) {
  if (checked) _emSel.add(id); else _emSel.delete(id);
  // reflete o realce sem re-render completo
  renderListaSel();
}
function marcarTodos(v) {
  const filtro = document.getElementById('em-filtro-tipo').value;
  _emSolic.filter(s => !filtro || s.tipo_servico === filtro).forEach(s => { if (v) _emSel.add(s.id); else _emSel.delete(s.id); });
  renderListaSel();
}
function atualizarContador() {
  const sel = _emSolic.filter(s => _emSel.has(s.id));
  const comGeo = sel.filter(s => s.lat != null && s.lng != null).length;
  document.getElementById('em-contador').textContent =
    `${sel.length} selecionada(s)` + (sel.length ? ` · ${comGeo} com coordenada` : '');
}

/* ── WhatsApp: item isolado (não entra na OS) ── */
function montarTextoWhatsapp(s) {
  const L = [];
  L.push('🌳 *SMMA Campo Largo — ' + (s.tipo_servico || 'Serviço') + '*');
  L.push('📍 ' + s.endereco);
  if (s.ponto_referencia) L.push('🔖 Ref.: ' + s.ponto_referencia);
  if (s.trabalho) L.push('🪚 Serviço: ' + s.trabalho);
  if (s.prioridade != null) L.push('⚡ Prioridade ' + s.prioridade);
  if (s.n_processo) L.push('📄 Processo ' + s.n_processo);
  if (s.lat != null && s.lng != null) L.push('🗺️ https://www.google.com/maps?q=' + s.lat + ',' + s.lng);
  if (s.foto_ref_url) L.push('📷 ' + s.foto_ref_url);
  return L.join('\n');
}

function whatsappItem(id) {
  const s = _emSolic.find(x => x.id === id);
  if (s) abrirWhatsapp(s);
}
/* Abre o modal de WhatsApp para uma solicitação (usado no Emitir e no cadastro). */
function abrirWhatsapp(s) {
  if (!s) return;
  const texto = montarTextoWhatsapp(s);
  abrirModal(`
    <h2>Enviar no WhatsApp</h2>
    <p class="hint">Item isolado — não entra na OS. Edite o texto se quiser, copie e mande no grupo.</p>
    <label class="field"><span>Mensagem</span>
      <textarea id="wa-text" rows="9" style="font-size:13px">${esc(texto)}</textarea></label>
    <div class="btn-row">
      <button class="btn" onclick="copiarWA()">Copiar texto</button>
      <button class="btn secondary" onclick="abrirWhatsappWeb()">Abrir no WhatsApp</button>
      <button class="btn secondary" onclick="marcarWhatsappEnviado('${s.id}')">Marcar como enviado ✓</button>
      <button class="btn secondary" onclick="fecharModal()">Fechar</button>
    </div>
    <p class="hint" id="wa-msg" style="margin-top:8px"></p>`);
}
function copiarWA() {
  const t = document.getElementById('wa-text').value;
  navigator.clipboard.writeText(t).then(
    () => { document.getElementById('wa-msg').textContent = 'Texto copiado.'; showToast('Texto copiado.', 'success'); },
    () => { document.getElementById('wa-text').select(); document.getElementById('wa-msg').textContent = 'Selecione e copie manualmente (Ctrl+C).'; }
  );
}
function abrirWhatsappWeb() {
  const t = document.getElementById('wa-text').value;
  window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
}
async function marcarWhatsappEnviado(id) {
  try {
    await sbUpdate('os_solicitacoes', { id: 'eq.' + id }, { status: 'whatsapp' });
    fecharModal();
    showToast('Marcado como enviado no WhatsApp.', 'success');
    if (typeof _emSel !== 'undefined') _emSel.delete(id);
    const ativa = document.querySelector('.page.active')?.id;
    if (ativa === 'page-emitir' && typeof renderEmitir === 'function') renderEmitir();
    else if (ativa === 'page-solicitacoes' && typeof renderSolicitacoes === 'function') renderSolicitacoes();
    if (typeof atualizarStats === 'function') atualizarStats();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

/* ── Agrupamento + sequenciamento ── */
async function agruparSelecionadas() {
  const sel = _emSolic.filter(s => _emSel.has(s.id));
  if (!sel.length) { showToast('Selecione ao menos uma solicitação.', 'error'); return; }

  // Geocodifica os selecionados sem coordenada (como o algoritmo original).
  const faltando = sel.filter(s => s.lat == null || s.lng == null);
  if (faltando.length && typeof geocodeViaWebApp === 'function') {
    showToast('Geocodificando ' + faltando.length + ' endereço(s) sem coordenada…', 'info');
    let ok = 0;
    for (const s of faltando) {
      const c = await geocodeViaWebApp(s.endereco);
      if (c && c.lat != null) {
        s.lat = c.lat; s.lng = c.lng;
        try { await sbUpdate('os_solicitacoes', { id: 'eq.' + s.id }, { lat: c.lat, lng: c.lng, geo_status: 'ok' }); } catch (e) {}
        ok++;
      }
    }
    if (ok) showToast(ok + ' endereço(s) geocodificado(s).', 'success');
  }

  const comGeo = sel.filter(s => s.lat != null && s.lng != null);
  const semGeo = sel.filter(s => s.lat == null || s.lng == null);
  if (!comGeo.length) { showToast('Não consegui geocodificar nenhum endereço selecionado. Confira os endereços ou o Web App.', 'error'); }

  const pontos = comGeo.map(s => ({
    id: s.id, endereco: s.endereco, tipo: s.tipo_servico || 'Outros',
    prioridade: s.prioridade, pendente: s.pendente,
    n_processo: s.n_processo, trabalho: s.trabalho, ponto_referencia: s.ponto_referencia,
    data_entrada: s.data_entrada, foto_ref_url: s.foto_ref_url || null,
    lat: Number(s.lat), lng: Number(s.lng)
  }));

  // ordem de tipos: os configurados primeiro, depois os extras
  const tipos = _emCfg.tipos.slice();
  pontos.forEach(p => { if (!tipos.includes(p.tipo)) tipos.push(p.tipo); });

  const gruposGlobais = [];
  tipos.forEach(tipo => {
    const pts = pontos.filter(p => p.tipo === tipo);
    if (!pts.length) return;
    const grupos = clusterizar(pts, _emCfg.raio);
    grupos.sort((a, b) => b.membros.length - a.membros.length)
      .forEach((g, i) => {
        g.membros.sort(ordenarPorPrioridade);
        const nomeBloco = `${tipo} — Bloco ${i + 1}`;
        g.membros.forEach(p => { p.nomeBloco = nomeBloco; });
        gruposGlobais.push({ nomeBloco, tipo, membros: g.membros });
      });
  });

  // numeração global sequencial
  _emGrupos = gruposGlobais;
  let n = 1;
  _emOrdem = [];
  gruposGlobais.forEach((bloco, blocoIdx) => {
    bloco.blocoIdx = blocoIdx;
    bloco.membros.forEach(p => {
      p.numero = n++;
      _emOrdem.push({ ponto: p, blocoIdx, tipo: bloco.tipo });
    });
  });

  renderPreview(gruposGlobais, semGeo);
  desenharMapa(_emOrdem);
}

function renderPreview(grupos, semGeo) {
  const box = document.getElementById('em-preview');
  if (!grupos.length) { box.innerHTML = ''; return; }
  let html = `<div class="card"><h2>Prévia da OS — ${_emOrdem.length} ponto(s) em ${grupos.length} bloco(s)</h2>`;
  grupos.forEach(bloco => {
    const cor = CORES[bloco.blocoIdx % CORES.length];
    html += `<div class="bloco-h" style="background:${cor}">${esc(bloco.nomeBloco)} · ${bloco.membros.length} ponto(s)</div>`;
    html += '<div class="tbl-wrap"><table class="data"><thead><tr><th>#</th><th>Processo</th><th>Endereço</th><th>Trabalho</th><th>Prio.</th></tr></thead><tbody>';
    bloco.membros.forEach(p => {
      html += `<tr>
        <td><span class="pin" style="background:${cor}">${p.numero}</span></td>
        <td>${esc(p.n_processo || '—')}${p.pendente ? '<br><span class="badge pendente">pendente</span>' : ''}</td>
        <td>${p.prioridade != null ? '⚡ ' : ''}${esc(p.endereco)}</td>
        <td>${esc(p.trabalho || '')}</td>
        <td>${p.prioridade != null ? '<span class="badge prio">'+esc(p.prioridade)+'</span>' : ''}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  });
  if (semGeo.length) {
    html += `<p class="badge pendente" style="margin-top:12px">${semGeo.length} selecionada(s) sem coordenada — ficam de fora do agrupamento até serem geocodificadas.</p>`;
  }
  html += `<div class="sel-tools" style="margin-top:14px">
    <label class="field" style="margin:0"><span>Data-limite da OS</span>
      <input type="date" id="em-datalimite" value="${esc(_emCfg.data_limite || '')}"></label>
    <button class="btn" onclick="emitirDocumento()" style="align-self:end">Gerar documento da OS →</button>
  </div>
  <p class="hint">A data-limite é o prazo que sai no texto da OS. Ajuste aqui antes de gerar.</p></div>`;
  box.innerHTML = html;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Fase 3: gerar o Google Doc via Apps Script + gravar a OS ── */
async function cfgMap() {
  const rows = await sbSelect('os_config', 'select=chave,valor') || [];
  return Object.fromEntries(rows.map(r => [r.chave, r.valor]));
}
function fmtBR(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
function formatarNumeroOS(raw, ano) {
  const num = String(raw || '').replace(/[^0-9]/g, '');
  if (!num) return String(raw || '');
  return (num.length === 1 ? '0' + num : num) + '/' + ano;
}

async function emitirDocumento() {
  if (!_emGrupos.length) { showToast('Agrupe as solicitações primeiro.', 'error'); return; }
  if (!sessionValida()) { showToast('Conecte-se primeiro.', 'error'); return; }

  const btns = document.querySelectorAll('#em-preview .btn');
  btns.forEach(b => b.disabled = true);
  try {
    const cfg = await cfgMap();
    const url = (cfg.OS_WEBAPP_URL || '').trim();
    if (!url) { showToast('Falta configurar OS_WEBAPP_URL (aba Config).', 'error'); return; }

    const ano = new Date().getFullYear();
    const numRaw = String(cfg.OS_NUMERO || '').trim();
    const numFmt = formatarNumeroOS(numRaw, ano);
    const tiposOrder = (cfg.TIPOS_SERVICO || '').split(',').map(s => s.trim()).filter(Boolean);
    // data-limite: usa a informada na tela; senão, a da config
    const dlInput = document.getElementById('em-datalimite');
    const dataLimiteISO = (dlInput && dlInput.value) ? dlInput.value : (cfg.OS_DATA_LIMITE || '');

    // agrupa membros por tipo (na ordem configurada), reordenando por prioridade
    const porTipo = {};
    _emGrupos.forEach(b => { (porTipo[b.tipo] = porTipo[b.tipo] || []).push(...b.membros); });
    Object.values(porTipo).forEach(arr => arr.sort(ordenarPorPrioridade));
    const ordem = tiposOrder.slice();
    Object.keys(porTipo).forEach(t => { if (!ordem.includes(t)) ordem.push(t); });
    const tiposArr = ordem.filter(t => porTipo[t] && porTipo[t].length).map(t => ({
      tipo: t,
      itens: porTipo[t].map(p => ({
        processo: p.n_processo || '', data_entrada: fmtBR(p.data_entrada), endereco: p.endereco,
        ponto_ref: p.ponto_referencia || '', trabalho: p.trabalho || '', data_exec: '',
        prioridade: (p.prioridade == null ? '' : p.prioridade), pendente: !!p.pendente,
        foto_ref_url: p.foto_ref_url || ''
      }))
    }));

    const payload = {
      token: cfg.OS_WEBAPP_TOKEN || '',
      config: {
        numero_formatado: numFmt, contrato: cfg.OS_CONTRATO || '', empresa: cfg.OS_EMPRESA || '',
        data_limite: fmtBR(dataLimiteISO), servicos_desc: cfg.OS_SERVICOS || 'Corte e Poda',
        template_id: cfg.OS_TEMPLATE_ID || '',
        responsavel1: cfg.OS_RESPONSAVEL1 || '', cargo1: cfg.OS_CARGO1 || '',
        responsavel2: cfg.OS_RESPONSAVEL2 || '', cargo2: cfg.OS_CARGO2 || '',
        tipos_ordem: tiposOrder
      },
      tipos: tiposArr
    };

    showToast('Gerando documento no Google Docs…', 'info');
    // text/plain evita o preflight CORS (Apps Script não responde OPTIONS)
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const out = await resp.json();
    if (!out.ok) throw new Error(out.erro || 'Falha no Apps Script');

    // grava a OS no banco (cabeçalho + itens snapshot) e baixa as solicitações
    const [doc] = await sbInsertReturn('os_documentos', {
      numero: numRaw, numero_formatado: numFmt, ano,
      contrato: cfg.OS_CONTRATO || null, empresa: cfg.OS_EMPRESA || null,
      data_limite: dataLimiteISO || null, doc_url: out.url, status: 'emitida',
      responsavel1: cfg.OS_RESPONSAVEL1 || null, cargo1: cfg.OS_CARGO1 || null,
      responsavel2: cfg.OS_RESPONSAVEL2 || null, cargo2: cfg.OS_CARGO2 || null
    });

    const itens = [];
    _emGrupos.forEach(b => b.membros.forEach(p => itens.push({
      os_id: doc.id, solicitacao_id: p.id,
      n_processo: p.n_processo || null, data_entrada: p.data_entrada || null,
      endereco: p.endereco, ponto_referencia: p.ponto_referencia || null, trabalho: p.trabalho || null,
      data_execucao: null, tipo_servico: p.tipo, prioridade: p.prioridade, pendente: !!p.pendente,
      bloco: p.nomeBloco || null, ordem: p.numero, lat: p.lat, lng: p.lng, geo_status: 'ok',
      foto_ref_url: p.foto_ref_url || null
    })));
    for (let i = 0; i < itens.length; i += 200) await sbInsert('os_itens', itens.slice(i, i + 200));

    // marca solicitações como emitidas
    for (const it of itens) {
      try { await sbUpdate('os_solicitacoes', { id: 'eq.' + it.solicitacao_id }, { status: 'emitida' }); } catch (e) {}
    }
    // avança o número da próxima OS
    const prox = String((parseInt(numRaw, 10) || 0) + 1);
    try { await sbUpdate('os_config', { chave: 'eq.OS_NUMERO' }, { valor: prox }); } catch (e) {}

    showToast('OS ' + numFmt + ' emitida! Abrindo o documento…', 'success');
    window.open(out.url, '_blank', 'noopener');
    _emSel.clear(); _emGrupos = []; _emOrdem = [];
    document.getElementById('em-preview').innerHTML = '';
    renderEmitir();
    if (typeof atualizarStats === 'function') atualizarStats();
  } catch (e) {
    showToast('Erro ao emitir: ' + e.message, 'error');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

/* ── Mapa Leaflet ── */
function initMapa() {
  if (_emMapa || typeof L === 'undefined') return;
  const el = document.getElementById('mapa');
  if (!el) return;
  _emMapa = L.map('mapa', { scrollWheelZoom: true }).setView([-25.4589, -49.5583], 12); // Campo Largo
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(_emMapa);
  _emLayer = L.layerGroup().addTo(_emMapa);
  setTimeout(() => _emMapa.invalidateSize(), 200);
}

function desenharMapa(ordem) {
  initMapa();
  if (!_emMapa) return;
  _emMapa.invalidateSize();
  _emLayer.clearLayers();
  const pts = ordem.filter(o => o.ponto.lat && o.ponto.lng);
  if (!pts.length) { document.getElementById('mapa-legenda').textContent = 'Nenhum ponto com coordenada.'; return; }
  const bounds = [];
  pts.forEach(o => {
    const cor = CORES[o.blocoIdx % CORES.length];
    const icon = L.divIcon({
      className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      html: `<span class="pin" style="background:${cor};box-shadow:0 0 0 2px #fff">${o.ponto.numero}</span>`
    });
    L.marker([o.ponto.lat, o.ponto.lng], { icon })
      .bindPopup(`<b>${o.ponto.numero}. ${esc(o.ponto.endereco)}</b><br>${esc(o.tipo)}${o.ponto.trabalho ? '<br>' + esc(o.ponto.trabalho) : ''}`)
      .addTo(_emLayer);
    bounds.push([o.ponto.lat, o.ponto.lng]);
  });
  _emMapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  document.getElementById('mapa-legenda').textContent = `${pts.length} ponto(s) numerado(s) por bloco.`;
}
