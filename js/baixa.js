/* ================================================================
   EMITIR OS — Fase 6: baixa / execução dos itens da OS.
   - Baixa rápida no próprio card (obs opcional + ✓), sem foto.
   - Modal completo para registrar foto do serviço + data + obs.
   Usa a RPC os_dar_baixa (RLS segura). Funciona no PC e no celular.
   ================================================================ */

let _bxItens = {};   // id → item (cache p/ o modal)

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function dataBR(iso) { return iso ? String(iso).split('-').reverse().join('/') : ''; }

async function renderBaixa() {
  const box = document.getElementById('bx-lista');
  if (!sessionValida()) { box.innerHTML = '<p class="muted">Conecte-se para ver os itens.</p>'; return; }
  box.innerHTML = '<p class="muted">Carregando…</p>';

  try {
    const sel = document.getElementById('bx-os');
    if (sel && sel.options.length <= 1) {
      const docs = await sbSelect('os_documentos', 'select=id,numero_formatado&order=criado_em.desc&limit=500') || [];
      sel.innerHTML = '<option value="">Todas as OS</option>' +
        docs.map(d => `<option value="${d.id}">OS ${esc(d.numero_formatado || d.id)}</option>`).join('');
    }
  } catch (e) { /* segue */ }

  const osSel = document.getElementById('bx-os').value;
  const stSel = document.getElementById('bx-status').value;
  if (stSel === 'isolado') return renderIsolados();
  let q = 'select=*,os_documentos(numero_formatado)&order=os_id.asc,ordem.asc&limit=1000';
  if (osSel) q += '&os_id=eq.' + osSel;
  if (stSel) q += '&status_execucao=eq.' + stSel;

  try {
    const itens = await sbSelect('os_itens', q) || [];
    _bxItens = {};
    itens.forEach(i => _bxItens[i.id] = i);
    document.getElementById('bx-contador').textContent = `${itens.length} item(ns)`;
    if (!itens.length) { box.innerHTML = '<p class="muted">Nenhum item com esse filtro.</p>'; return; }
    box.innerHTML = itens.map(cardBaixa).join('');
  } catch (e) {
    box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>';
  }
}

function cardBaixa(it) {
  const exec = it.status_execucao === 'executado';
  const numero = it.os_documentos?.numero_formatado || '';
  const thumb = it.foto_ref_url
    ? `<img class="bx-thumb" src="${esc(it.foto_ref_url)}" onclick="window.open('${esc(it.foto_ref_url)}','_blank')">`
    : `<div class="bx-thumb noimg">sem<br>foto</div>`;
  const prio = it.prioridade != null ? ` <span class="badge prio">⚡ ${esc(it.prioridade)}</span>` : '';

  // linha inferior: baixa rápida (aberto) ou resumo (executado)
  let rodape;
  if (exec) {
    rodape = `<div class="bx-done">
      ${it.data_execucao ? '<span class="meta">✅ ' + dataBR(it.data_execucao) + '</span>' : ''}
      ${it.obs_execucao ? '<span class="meta">· ' + esc(it.obs_execucao) + '</span>' : ''}
      ${it.foto_servico_url ? '<a href="' + esc(it.foto_servico_url) + '" target="_blank">foto</a>' : ''}
      <button class="btn secondary" onclick="abrirBaixa('${it.id}')">Ver / editar</button>
      <button class="btn danger" onclick="baixaRapida('${it.id}','aberto')">Reabrir</button>
    </div>`;
  } else {
    rodape = `<div class="bx-quick">
      <input id="obsq-${it.id}" class="bx-obs-quick" placeholder="observação (opcional)">
      <button class="btn" onclick="baixaRapida('${it.id}','executado')" title="marca executado hoje, sem foto">✓ Executado</button>
      <button class="btn secondary" onclick="abrirBaixa('${it.id}')" title="com foto e data">📷</button>
    </div>`;
  }

  return `<div class="card baixa-card">
    <div class="bx-row">
      ${thumb}
      <div class="bx-info">
        <b>${it.ordem ? it.ordem + '. ' : ''}${esc(it.endereco)}</b>${prio}
        <div class="meta">${esc(it.tipo_servico || '')}${numero ? ' · OS ' + esc(numero) : ''}</div>
        ${it.ponto_referencia ? '<div class="meta">Ref: ' + esc(it.ponto_referencia) + '</div>' : ''}
      </div>
      <span class="badge ${exec ? 'emitida' : 'aberta'}">${exec ? '✅ executado' : 'em aberto'}</span>
    </div>
    ${rodape}
  </div>`;
}

/* Núcleo: dá baixa (com ou sem foto) via RPC. */
async function executarBaixa(id, status, opts) {
  opts = opts || {};
  let foto = null;
  if (status === 'executado' && opts.fotoFile) foto = await enviarFoto(opts.fotoFile, 'os-serv');
  const data = status === 'executado' ? (opts.data || hojeISO()) : null;
  await sbRpc('os_dar_baixa', { p_item: id, p_status: status, p_data: data, p_foto: foto, p_obs: opts.obs || null });
}

/* Baixa rápida direto do card (sem modal, sem foto). */
async function baixaRapida(id, status) {
  try {
    const inp = document.getElementById('obsq-' + id);
    const obs = inp ? inp.value.trim() : '';
    await executarBaixa(id, status, { obs });
    showToast(status === 'executado' ? 'Baixa registrada.' : 'Item reaberto.', 'success');
    renderBaixa();
    if (typeof atualizarStats === 'function') atualizarStats();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

/* ── Itens isolados (enviados por WhatsApp, fora da OS) ── */
let _bxIso = {};
async function renderIsolados() {
  const box = document.getElementById('bx-lista');
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const rows = await sbSelect('os_solicitacoes', "select=*&status=eq.whatsapp&order=criado_em.desc&limit=1000") || [];
    _bxIso = {}; rows.forEach(r => _bxIso[r.id] = r);
    document.getElementById('bx-contador').textContent = `${rows.length} isolado(s)`;
    if (!rows.length) { box.innerHTML = '<p class="muted">Nenhum item isolado (enviado por WhatsApp) ainda.</p>'; return; }
    box.innerHTML = rows.map(cardIsolado).join('');
  } catch (e) { box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; }
}
function cardIsolado(s) {
  const done = !!s.executado;
  const prio = s.prioridade != null ? ` <span class="badge prio">⚡ ${esc(s.prioridade)}</span>` : '';
  let rodape;
  if (done) {
    rodape = `<div class="bx-done">
      ${s.data_execucao ? '<span class="meta">✅ ' + dataBR(s.data_execucao) + '</span>' : '<span class="meta">✅ executado</span>'}
      ${s.obs_execucao ? '<span class="meta">· ' + esc(s.obs_execucao) + '</span>' : ''}
      <button class="btn danger" onclick="baixaIsolado('${s.id}','aberto')">Reabrir</button>
    </div>`;
  } else {
    rodape = `<div class="bx-quick">
      <input id="obsi-${s.id}" class="bx-obs-quick" placeholder="observação (opcional)">
      <button class="btn" onclick="baixaIsolado('${s.id}','executado')">✓ Executado</button>
    </div>`;
  }
  return `<div class="card baixa-card">
    <div class="bx-row">
      <div class="bx-info">
        <b>${esc(s.endereco)}</b>${prio}
        <div class="meta">${esc(s.tipo_servico || '')}${s.n_processo ? ' · proc. ' + esc(s.n_processo) : ''}${s.trabalho ? ' · ' + esc(s.trabalho) : ''}</div>
      </div>
      <span class="badge whatsapp">📱 isolado</span>
    </div>
    ${rodape}
  </div>`;
}
async function baixaIsolado(id, status) {
  try {
    const done = status === 'executado';
    const inp = document.getElementById('obsi-' + id);
    const patch = done
      ? { executado: true, data_execucao: hojeISO(), obs_execucao: (inp && inp.value.trim()) || null }
      : { executado: false, data_execucao: null, obs_execucao: null };
    await sbUpdate('os_solicitacoes', { id: 'eq.' + id }, patch);
    showToast(done ? 'Baixa registrada.' : 'Item reaberto.', 'success');
    renderIsolados();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

/* Modal completo (foto + data + obs). */
function abrirBaixa(id) {
  const it = _bxItens[id];
  if (!it) return;
  const exec = it.status_execucao === 'executado';
  const refImg = it.foto_ref_url ? `<div class="hint">Referência do local:</div><img src="${esc(it.foto_ref_url)}" style="max-width:100%;border-radius:8px;margin:4px 0">` : '';
  const servImg = it.foto_servico_url ? `<div class="hint">Foto do serviço atual:</div><img src="${esc(it.foto_servico_url)}" style="max-width:100%;border-radius:8px;margin:4px 0">` : '';
  abrirModal(`
    <h2>Baixa — ${esc(it.endereco)}</h2>
    <p class="meta">${esc(it.tipo_servico || '')}${it.trabalho ? ' · ' + esc(it.trabalho) : ''}</p>
    ${refImg}
    <label class="field"><span>Data de execução</span>
      <input type="date" id="bx-data" value="${it.data_execucao || hojeISO()}"></label>
    <label class="field"><span>Observação</span>
      <textarea id="bx-obs" rows="2" placeholder="ex.: feito parcial, faltou acesso, etc.">${esc(it.obs_execucao || '')}</textarea></label>
    <label class="field"><span>Foto do serviço executado</span>
      <input type="file" id="bx-foto" accept="image/*" capture="environment" onchange="previewBxFoto(this)"></label>
    <div id="bx-foto-prev"></div>
    ${servImg}
    <p class="hint" id="bx-status-msg"></p>
    <div class="btn-row">
      <button class="btn" id="bx-btn-exec" onclick="marcarBaixa('${it.id}','executado')">${exec ? 'Atualizar' : 'Marcar como executado'}</button>
      ${exec ? `<button class="btn danger" onclick="marcarBaixa('${it.id}','aberto')">Reabrir</button>` : ''}
      <button class="btn secondary" onclick="fecharModal()">Cancelar</button>
    </div>`);
}

function previewBxFoto(input) {
  const f = input.files && input.files[0];
  document.getElementById('bx-foto-prev').innerHTML = f
    ? `<img src="${URL.createObjectURL(f)}" style="max-width:100%;border-radius:8px;margin:4px 0">` : '';
}

async function marcarBaixa(id, status) {
  const btn = document.getElementById('bx-btn-exec');
  if (btn) btn.disabled = true;
  const msg = m => { const el = document.getElementById('bx-status-msg'); if (el) el.textContent = m; };
  try {
    const fInput = document.getElementById('bx-foto');
    const obs = (document.getElementById('bx-obs') || {}).value || '';
    const data = (document.getElementById('bx-data') || {}).value || '';
    if (status === 'executado' && fInput && fInput.files[0]) msg('Enviando foto…'); else msg('Salvando…');
    await executarBaixa(id, status, { fotoFile: fInput && fInput.files[0], data, obs: obs.trim() });
    fecharModal();
    showToast(status === 'executado' ? 'Baixa registrada.' : 'Item reaberto.', 'success');
    renderBaixa();
    if (typeof atualizarStats === 'function') atualizarStats();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
