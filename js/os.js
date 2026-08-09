/* ================================================================
   EMITIR OS — camada de aplicação (Fase 1)
   Listas de solicitações / OS emitidas / config + cadastro manual.
   Clusterização e geração do documento entram na Fase 2/3.
   ================================================================ */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
function abrirModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal').classList.add('open');
}
function fecharModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-box').classList.remove('wide');
  if (typeof destruirSeletor === 'function') destruirSeletor();
}

/* Chamado após login e após sincronizações. */
async function recarregarTudo() {
  if (!sessionValida()) return;
  atualizarStats();
  const ativa = document.querySelector('.page.active')?.id;
  if (ativa === 'page-solicitacoes') renderSolicitacoes();
  else if (ativa === 'page-os') renderOSEmitidas();
  else if (ativa === 'page-config') renderConfig();
}

async function atualizarStats() {
  try {
    const [abertas, docs, itens] = await Promise.all([
      sbSelect('os_solicitacoes', 'select=id&status=eq.aberta&arquivado=not.is.true'),
      sbSelect('os_documentos', 'select=id&arquivado=not.is.true'),
      sbSelect('os_itens', 'select=id')
    ]);
    setN('st-abertas', abertas?.length); setN('st-emitidas', docs?.length); setN('st-itens', itens?.length);
  } catch (e) { /* silencioso */ }
}
function setN(id, v) { const el = document.getElementById(id); if (el) el.textContent = (v ?? '–'); }

/* Tag de tipo de serviço — cor por domínio (assinatura visual). */
function tipoTag(t) {
  const nome = t || 'Outros';
  return `<span class="tipo-tag" data-tipo="${esc(nome)}">${esc(nome)}</span>`;
}

/* ── SOLICITAÇÕES ── */
let _solicCache = {};
async function renderSolicitacoes() {
  const box = document.getElementById('solic-lista');
  if (!sessionValida()) { box.innerHTML = '<p class="muted">Conecte-se para ver as solicitações.</p>'; return; }
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const arq = (document.getElementById('solic-filtro') || {}).value || 'ativas';
    let q = 'select=*&order=prioridade.asc.nullslast,criado_em.desc&limit=1000';
    if (arq === 'ativas') q += '&arquivado=not.is.true';
    else if (arq === 'arquivadas') q += '&arquivado=is.true';
    const rows = await sbSelect('os_solicitacoes', q) || [];
    _solicCache = {};
    rows.forEach(r => _solicCache[r.id] = r);
    if (!rows.length) {
      box.innerHTML = `<div class="empty"><div class="empty-ic">🌱</div>
        <b>Nenhuma solicitação ainda</b>
        <p>Cadastre um pedido ou importe a planilha para começar.</p>
        <button class="btn" onclick="abrirNovaSolicitacao()">Nova solicitação</button></div>`;
      return;
    }
    const linhas = rows.map(r => {
      const semGeo = (r.lat == null || r.lng == null);
      return `<tr onclick="abrirEditarSolicitacao('${r.id}')" class="clik">
        <td>${esc(r.n_processo || '—')}</td>
        <td><span class="cel-end">${esc(r.endereco)}</span>
          ${r.pendente ? ' <span class="badge pendente">pendente</span>' : ''}
          ${semGeo ? ' <span class="badge pendente" title="sem coordenada">sem mapa</span>' : ''}</td>
        <td>${tipoTag(r.tipo_servico)}</td>
        <td class="num">${r.prioridade != null ? '<span class="badge prio">⚡ ' + esc(r.prioridade) + '</span>' : ''}</td>
        <td>${esc(r.trabalho || '')}</td>
        <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
        <td class="acoes" onclick="event.stopPropagation()">
          <button class="ic-btn wa-btn" title="Enviar por WhatsApp (item isolado)" onclick="whatsappSolic('${r.id}')">📱</button>
          <button class="ic-btn" title="Editar" onclick="abrirEditarSolicitacao('${r.id}')">✏️</button>
          <button class="ic-btn" title="Excluir" onclick="excluirSolicitacao('${r.id}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
    box.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="data">
      <thead><tr><th>Processo</th><th>Endereço</th><th>Tipo</th><th>Prio.</th><th>Trabalho</th><th>Status</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
      <p class="hint" style="margin-top:8px">${rows.length} solicitação(ões) · clique numa linha para editar.</p></div>`;
  } catch (e) { box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; }
}

let _tiposCache = ['Poda/Corte', 'Jardinagem', 'Arborização'];
function abrirNovaSolicitacao() { abrirFormSolicitacao(null); }
function abrirEditarSolicitacao(id) { abrirFormSolicitacao(_solicCache[id] || null); }

/* Formulário unificado: row = null (nova) ou registro existente (editar). */
function abrirFormSolicitacao(row) {
  if (!sessionValida()) { showToast('Conecte-se primeiro.', 'error'); return; }
  const editar = !!row;
  const v = row || {};
  const opts = _tiposCache.map(t => `<option ${t === v.tipo_servico ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const fotoAtual = v.foto_ref_url
    ? `<div class="hint">Foto atual:</div><img src="${esc(v.foto_ref_url)}" style="max-width:140px;border-radius:8px;margin:4px 0">` : '';
  abrirModal(`
    <h2>${editar ? 'Editar solicitação' : 'Nova solicitação'}</h2>
    <label class="field"><span>Endereço <span class="muted" style="font-weight:400">— sai assim na OS; a busca só move o pino, não altera este texto</span></span>
      <span class="ac-wrap">
        <input id="ns-end" autocomplete="off" value="${esc(v.endereco || '')}" placeholder="Ex.: Rua das Palmeiras, 1 – Colônia Dom Pedro  •  ou Praça da Matriz">
        <div id="ns-sug" class="ac-drop" style="display:none"></div>
      </span></label>
    <div class="sel-grid">
      <div>
        <label class="field"><span>N° de processo</span><input id="ns-proc" value="${esc(v.n_processo || '')}" placeholder="00000/2026"></label>
        <div class="grid2">
          <label class="field"><span>Tipo de serviço</span><select id="ns-tipo">${opts}</select></label>
          <label class="field"><span>Data de entrada</span><input id="ns-data" type="date" value="${esc(v.data_entrada || '')}"></label>
        </div>
        <label class="field"><span>Ponto de referência</span><input id="ns-ref" value="${esc(v.ponto_referencia || '')}"></label>
        <label class="field"><span>Trabalho a ser realizado</span><textarea id="ns-trab" rows="2">${esc(v.trabalho || '')}</textarea></label>
        <div class="grid2">
          <label class="field"><span>Prioridade (opcional)</span><input id="ns-prio" type="number" min="1" value="${v.prioridade != null ? esc(v.prioridade) : ''}"></label>
          <label class="field"><span>Pendente?</span><select id="ns-pend"><option value="">Não</option><option value="1" ${v.pendente ? 'selected' : ''}>Sim</option></select></label>
        </div>
        <label class="field"><span>Foto de referência (opcional)</span>
          <input id="ns-foto" type="file" accept="image/*" capture="environment" onchange="previewFotoRef(this)"></label>
        ${fotoAtual}
        <div id="ns-foto-prev"></div>
      </div>
      <div>
        <div id="ns-map" class="sel-map"></div>
        <p class="coord-read" id="ns-coord">Digite para buscar, ou arraste/clique no pino.</p>
        <p class="coord-read" id="ns-detect" style="display:none"></p>
        <p class="badge pendente" id="ns-aviso" style="display:none"></p>
        <input type="hidden" id="ns-lat" value="${v.lat != null ? esc(v.lat) : ''}">
        <input type="hidden" id="ns-lng" value="${v.lng != null ? esc(v.lng) : ''}">
        <input type="hidden" id="ns-bairro" value="${esc(v.bairro || '')}">
      </div>
    </div>
    <p class="hint" id="ns-status"></p>
    <div class="btn-row"><button class="btn" id="ns-salvar" onclick="salvarSolicitacao(${editar ? `'${row.id}'` : 'null'})">${editar ? 'Salvar alterações' : 'Salvar solicitação'}</button>
      <button class="btn secondary" onclick="fecharModal()">Cancelar</button></div>`);
  document.getElementById('modal-box').classList.add('wide');
  if (typeof initSeletorEndereco === 'function') setTimeout(() => initSeletorEndereco(v.lat, v.lng), 60);
}

function whatsappSolic(id) {
  const s = _solicCache[id];
  if (s && typeof abrirWhatsapp === 'function') abrirWhatsapp(s);
}

async function excluirSolicitacao(id) {
  const r = _solicCache[id];
  if (!r) return;
  if (!window.confirm('Excluir a solicitação "' + (r.endereco || '') + '"? Esta ação não pode ser desfeita.')) return;
  try {
    await sbDelete('os_solicitacoes', { id: 'eq.' + id });
    showToast('Solicitação excluída.', 'success');
    renderSolicitacoes(); atualizarStats();
  } catch (e) { showToast('Erro ao excluir: ' + e.message, 'error'); }
}

function previewFotoRef(input) {
  const box = document.getElementById('ns-foto-prev');
  const f = input.files && input.files[0];
  box.innerHTML = f ? `<img src="${URL.createObjectURL(f)}" style="max-width:160px;border-radius:8px;margin:4px 0">` : '';
}

/* Geocodifica via Web App do Apps Script (ação server-side, Google Maps). */
async function geocodeViaWebApp(endereco) {
  const cfg = await cfgMap();
  const url = (cfg.OS_WEBAPP_URL || '').trim();
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'geocode', token: cfg.OS_WEBAPP_TOKEN || '', endereco,
        sufixo: cfg.SUFIXO_CIDADE || ', Campo Largo, PR, Brasil' })
    });
    const out = await r.json();
    if (out.ok && out.lat != null) return { lat: out.lat, lng: out.lng };
  } catch (e) { /* rede/CORS: segue sem coord */ }
  return null;
}

async function salvarSolicitacao(id) {
  const editar = !!id;
  const endereco = document.getElementById('ns-end').value.trim();
  if (!endereco) { showToast('Escreva o endereço.', 'error'); return; }
  const btn = document.getElementById('ns-salvar');
  const st = document.getElementById('ns-status');
  btn.disabled = true;
  const setSt = m => { if (st) st.textContent = m; };

  const dados = {
    n_processo: document.getElementById('ns-proc').value.trim() || null,
    endereco,
    tipo_servico: document.getElementById('ns-tipo').value,
    data_entrada: document.getElementById('ns-data').value || null,
    ponto_referencia: document.getElementById('ns-ref').value.trim() || null,
    trabalho: document.getElementById('ns-trab').value.trim() || null,
    prioridade: document.getElementById('ns-prio').value ? Number(document.getElementById('ns-prio').value) : null,
    pendente: document.getElementById('ns-pend').value === '1',
    bairro: (document.getElementById('ns-bairro').value || '').trim() || null
  };
  if (!editar) { dados.status = 'aberta'; dados.origem = 'manual'; dados.geo_status = 'pendente'; }

  try {
    const foto = document.getElementById('ns-foto').files[0];
    if (!editar && !navigator.onLine) {
      await enqueue({ tipo: 'insert', tabela: 'os_solicitacoes', dados });
      fecharModal(); showToast('Sem rede — salvo na fila (sem geocode/foto).', 'info');
      return;
    }
    // foto de referência (só grava se enviou nova; na edição mantém a atual)
    if (foto) { setSt('Enviando foto…'); try { dados.foto_ref_url = await enviarFoto(foto, 'os-ref'); } catch (e) { showToast('Foto falhou: ' + e.message, 'error'); } }
    // coordenada: do pino; se faltar, tenta o geocode do Web App
    const latPin = parseFloat(document.getElementById('ns-lat').value);
    const lngPin = parseFloat(document.getElementById('ns-lng').value);
    let coord = (!isNaN(latPin) && !isNaN(lngPin)) ? { lat: latPin, lng: lngPin } : null;
    if (!coord) { setSt('Geocodificando…'); coord = await geocodeViaWebApp(endereco); }
    if (coord) { dados.lat = coord.lat; dados.lng = coord.lng; dados.geo_status = 'ok'; }

    setSt('Salvando…');
    if (editar) await sbUpdate('os_solicitacoes', { id: 'eq.' + id }, dados);
    else await sbInsert('os_solicitacoes', dados);
    fecharModal();
    showToast(editar ? 'Alterações salvas.' : (coord ? 'Solicitação salva.' : 'Salva sem coordenada (marque no mapa depois).'), 'success');
    recarregarTudo();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ── OS EMITIDAS ── */
async function renderOSEmitidas() {
  const box = document.getElementById('os-lista');
  if (!sessionValida()) { box.innerHTML = '<p class="muted">Conecte-se para ver o histórico.</p>'; return; }
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const arq = (document.getElementById('os-filtro') || {}).value || 'ativas';
    let q = 'select=*,os_itens(count)&order=criado_em.desc&limit=500';
    if (arq === 'ativas') q += '&arquivado=not.is.true';
    else if (arq === 'arquivadas') q += '&arquivado=is.true';
    const rows = await sbSelect('os_documentos', q) || [];
    if (!rows.length) { box.innerHTML = '<p class="muted">Nenhuma OS neste filtro.</p>'; return; }
    const linhas = rows.map(r => {
      const n = r.os_itens?.[0]?.count ?? '';
      const link = r.doc_url ? `<a href="${esc(r.doc_url)}" target="_blank" rel="noopener">abrir</a>` : '—';
      return `<tr><td>${esc(r.numero_formatado || r.numero || '—')}</td><td class="num">${esc(n)}</td>
        <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td><td>${link}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="card"><div class="tbl-wrap"><table class="data">
      <thead><tr><th>OS</th><th>Itens</th><th>Status</th><th>Documento</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
      <p class="hint" style="margin-top:8px">${rows.length} OS.</p></div>`;
  } catch (e) { box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; }
}

/* ── CONFIG ── */
async function renderConfig() {
  const box = document.getElementById('config-form');
  if (!sessionValida()) { box.innerHTML = '<p class="muted">Conecte-se para editar.</p>'; return; }
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const rows = await sbSelect('os_config', 'select=*&order=chave.asc') || [];
    const t = rows.find(r => r.chave === 'TIPOS_SERVICO');
    if (t && t.valor) _tiposCache = t.valor.split(',').map(s => s.trim()).filter(Boolean);
    const campos = rows.map(r => `
      <label class="field"><span>${esc(r.chave)}${r.descricao ? ' — <span class="muted" style="font-weight:400">'+esc(r.descricao)+'</span>' : ''}</span>
        <input data-chave="${esc(r.chave)}" value="${esc(r.valor || '')}"></label>`).join('');
    box.innerHTML = `<div class="card">${campos}
      <div class="btn-row"><button class="btn" onclick="salvarConfig()">Salvar alterações</button></div></div>

      <div class="card">
        <h2>Administração</h2>
        <p class="hint">Recomeçar arquiva tudo o que existe hoje (vira histórico, acessível nos filtros “Arquivadas” e no Painel) e deixa o fluxo ativo vazio. Não apaga nada.</p>
        <div class="btn-row">
          <button class="btn" onclick="recomecarArquivar()">Arquivar tudo e recomeçar</button>
          <button class="btn secondary" onclick="backfillBairros()">Preencher bairros do histórico</button>
        </div>
        <p class="hint" id="admin-msg" style="margin-top:8px"></p>
        <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
          <p class="hint" style="color:var(--danger)"><b>Zona de perigo</b> — apaga tudo de forma irreversível (inclui o histórico e a base dos painéis).</p>
          <button class="btn danger" onclick="apagarTudoHard()">Apagar tudo (irreversível)</button>
        </div>
      </div>`;
  } catch (e) { box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; }
}

/* Arquiva todo o conteúdo ativo (recomeço não-destrutivo). */
async function recomecarArquivar() {
  if (!window.confirm('Arquivar todas as solicitações e OS atuais? Elas saem do fluxo ativo, mas continuam acessíveis no filtro “Arquivadas” e nos painéis. Nada é apagado.')) return;
  const msg = m => { const el = document.getElementById('admin-msg'); if (el) el.textContent = m; };
  try {
    msg('Arquivando…');
    await sbUpdate('os_solicitacoes', { arquivado: 'not.is.true' }, { arquivado: true });
    await sbUpdate('os_documentos', { arquivado: 'not.is.true' }, { arquivado: true });
    msg('Pronto. Fluxo ativo zerado; histórico preservado.');
    showToast('Arquivado. Pode começar a alimentar do zero.', 'success');
    recarregarTudo();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); msg('Erro: ' + e.message); }
}

/* Backfill de bairro via geo reverso (Nominatim ~1/s). */
async function backfillBairros() {
  const msg = m => { const el = document.getElementById('admin-msg'); if (el) el.textContent = m; };
  try {
    const [sol, itn] = await Promise.all([
      sbSelect('os_solicitacoes', 'select=id,lat,lng&bairro=is.null&lat=not.is.null&limit=2000'),
      sbSelect('os_itens', 'select=id,lat,lng&bairro=is.null&lat=not.is.null&limit=2000')
    ]);
    const alvos = [
      ...(sol || []).map(r => ({ tabela: 'os_solicitacoes', ...r })),
      ...(itn || []).map(r => ({ tabela: 'os_itens', ...r }))
    ];
    if (!alvos.length) { msg('Nada a preencher — todos já têm bairro (ou sem coordenada).'); return; }
    let ok = 0;
    for (let i = 0; i < alvos.length; i++) {
      const a = alvos[i];
      msg(`Preenchendo bairros… ${i + 1}/${alvos.length}`);
      const g = await reverseGeo(a.lat, a.lng);
      if (g && g.bairro) { try { await sbUpdate(a.tabela, { id: 'eq.' + a.id }, { bairro: g.bairro }); ok++; } catch (e) {} }
      await new Promise(r => setTimeout(r, 1100)); // respeita limite do OSM
    }
    msg(`Concluído: ${ok} bairro(s) preenchido(s) de ${alvos.length}.`);
    showToast('Bairros preenchidos.', 'success');
  } catch (e) { showToast('Erro: ' + e.message, 'error'); msg('Erro: ' + e.message); }
}

/* Wipe total (irreversível). */
async function apagarTudoHard() {
  if (window.prompt('Isto APAGA TUDO (solicitações, OS e itens), inclusive o histórico. Digite APAGAR para confirmar:') !== 'APAGAR') { showToast('Cancelado.', 'info'); return; }
  const msg = m => { const el = document.getElementById('admin-msg'); if (el) el.textContent = m; };
  try {
    msg('Apagando…');
    await sbDelete('os_itens', { id: 'not.is.null' });
    await sbDelete('os_documentos', { id: 'not.is.null' });
    await sbDelete('os_solicitacoes', { id: 'not.is.null' });
    msg('Tudo apagado.');
    showToast('Banco zerado.', 'success');
    recarregarTudo();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); msg('Erro: ' + e.message); }
}

async function salvarConfig() {
  const inputs = document.querySelectorAll('#config-form input[data-chave]');
  try {
    for (const inp of inputs) {
      await sbUpdate('os_config', { chave: 'eq.' + inp.dataset.chave }, { valor: inp.value, atualizado_em: agora() });
    }
    showToast('Configurações salvas.', 'success');
    renderConfig();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

/* fecha modal ao clicar fora */
document.getElementById('modal')?.addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });
