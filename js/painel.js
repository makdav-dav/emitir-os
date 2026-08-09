/* ================================================================
   EMITIR OS — Painel (dashboards).
   Gráficos SVG próprios (sem lib): cor por tipo de serviço
   (categórica, validada), magnitude em tom único, execução por
   status. Mapa de concentração em Leaflet.
   ================================================================ */

const COR_TIPO_HEX = { 'Poda/Corte': '#1E7A46', 'Jardinagem': '#2A5599', 'Arborização': '#B4551F', 'Outros': '#5B6B60' };
const COR_MAG = '#1E7A46';   // magnitude (tom único)
const COR_OK = '#1E7A46';    // executado
const COR_ABERTO = '#A9711A'; // aberto
function corTipo(t) { return COR_TIPO_HEX[t] || COR_TIPO_HEX['Outros']; }

let _pnMapa = null, _pnLayer = null;

function contar(arr, keyFn) {
  const m = new Map();
  arr.forEach(x => { const k = keyFn(x) || 'Outros'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}
function mesLabel(ym) { const [a, m] = ym.split('-'); return m + '/' + a.slice(2); }

async function renderPainel() {
  const box = document.getElementById('painel-lista');
  if (!sessionValida()) { box.innerHTML = '<p class="muted">Conecte-se para ver o painel.</p>'; return; }
  box.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const [itens, abertas, docs] = await Promise.all([
      sbSelect('os_itens', 'select=tipo_servico,status_execucao,data_entrada,bairro,lat,lng&limit=5000'),
      sbSelect('os_solicitacoes', 'select=id&status=eq.aberta&arquivado=not.is.true'),
      sbSelect('os_documentos', 'select=id')
    ]);
    const its = itens || [];
    const total = its.length;
    const exec = its.filter(i => i.status_execucao === 'executado').length;
    const taxa = total ? Math.round(exec / total * 100) : 0;

    const porTipo = contar(its, i => i.tipo_servico);
    const porBairro = contar(its.filter(i => i.bairro), i => i.bairro).slice(0, 8);
    const porMes = contar(its.filter(i => i.data_entrada), i => String(i.data_entrada).slice(0, 7))
      .sort((a, b) => a.k.localeCompare(b.k)).slice(-12);
    const semBairro = its.filter(i => !i.bairro && i.lat != null).length;

    box.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="n">${(abertas || []).length}</div><div class="l">Solicitações abertas</div></div>
        <div class="stat"><div class="n">${(docs || []).length}</div><div class="l">OS emitidas</div></div>
        <div class="stat"><div class="n">${total}</div><div class="l">Serviços (itens)</div></div>
        <div class="stat"><div class="n">${taxa}%</div><div class="l">Executados</div></div>
      </div>

      <div class="pn-grid">
        <div class="card">
          <h2>Por tipo de serviço</h2>
          ${legendaTipos(porTipo)}
          ${barrasH(porTipo, { colorFn: corTipo, labelW: 130 })}
        </div>
        <div class="card">
          <h2>Execução</h2>
          ${barraExecucao(exec, total)}
        </div>
        <div class="card">
          <h2>Bairros campeões</h2>
          ${porBairro.length ? barrasH(porBairro, { color: COR_MAG, labelW: 150 })
            : '<p class="muted">Sem bairro preenchido ainda. Use “Preencher bairros do histórico” em Configurações.</p>'}
          ${semBairro ? `<p class="hint">${semBairro} serviço(s) com coordenada mas sem bairro — rode o preenchimento em Configurações.</p>` : ''}
        </div>
        <div class="card">
          <h2>Pedidos por mês (data de entrada)</h2>
          ${porMes.length ? barrasMes(porMes) : '<p class="muted">Sem datas de entrada suficientes.</p>'}
        </div>
      </div>

      <div class="card">
        <h2>Mapa de concentração</h2>
        ${legendaTipos(porTipo)}
        <div id="painel-mapa"></div>
        <p class="hint" id="pn-mapa-leg" style="margin-top:8px"></p>
      </div>`;

    desenharMapaPainel(its);
  } catch (e) { box.innerHTML = '<p class="badge pendente">Erro: ' + esc(e.message) + '</p>'; }
}

/* Legenda categórica (identidade nunca só por cor). */
function legendaTipos(entries) {
  return '<div class="pn-leg">' + entries.map(e =>
    `<span class="pn-leg-i"><span class="pn-dot" style="background:${corTipo(e.k)}"></span>${esc(e.k)}</span>`).join('') + '</div>';
}

/* Barras horizontais: rótulo à esquerda, barra, valor à direita. */
function barrasH(entries, opts) {
  opts = opts || {};
  const w = 480, rowH = 30, labelW = opts.labelW || 130, valW = 40;
  const h = entries.length * rowH + 6;
  const max = Math.max(1, ...entries.map(e => e.v));
  const barMax = w - labelW - valW - 12;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="max-width:${w}px">`;
  entries.forEach((e, i) => {
    const y = i * rowH + 3;
    const bw = Math.max(3, Math.round(e.v / max * barMax));
    const col = opts.colorFn ? opts.colorFn(e.k) : (opts.color || COR_MAG);
    s += `<text x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle" class="pv-lbl">${esc(e.k)}</text>`;
    s += `<rect x="${labelW}" y="${y + 7}" width="${bw}" height="${rowH - 14}" rx="4" fill="${col}"><title>${esc(e.k)}: ${e.v}</title></rect>`;
    s += `<text x="${labelW + bw + 6}" y="${y + rowH / 2}" dominant-baseline="middle" class="pv-val">${e.v}</text>`;
  });
  return s + '</svg>';
}

/* Barra única de execução: executado (verde) + aberto (âmbar). */
function barraExecucao(exec, total) {
  const aberto = total - exec;
  const w = 480, h = 46, gap = 2;
  const execW = total ? Math.round(exec / total * (w - gap)) : 0;
  const abW = total ? (w - gap - execW) : 0;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="max-width:${w}px">`;
  if (execW > 0) s += `<rect x="0" y="8" width="${execW}" height="22" rx="4" fill="${COR_OK}"><title>Executados: ${exec}</title></rect>`;
  if (abW > 0) s += `<rect x="${execW + gap}" y="8" width="${abW}" height="22" rx="4" fill="${COR_ABERTO}"><title>Em aberto: ${aberto}</title></rect>`;
  s += '</svg>';
  return s + `<div class="pn-leg" style="margin-top:6px">
    <span class="pn-leg-i"><span class="pn-dot" style="background:${COR_OK}"></span>Executados <b>${exec}</b></span>
    <span class="pn-leg-i"><span class="pn-dot" style="background:${COR_ABERTO}"></span>Em aberto <b>${aberto}</b></span></div>`;
}

/* Barras verticais por mês (tom único). */
function barrasMes(entries) {
  const w = 520, h = 170, padB = 26, padT = 14, padL = 6;
  const n = entries.length, max = Math.max(1, ...entries.map(e => e.v));
  const slot = (w - padL * 2) / n, bw = Math.min(38, slot - 8);
  const plotH = h - padB - padT;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="max-width:${w}px">`;
  entries.forEach((e, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const bh = Math.max(2, Math.round(e.v / max * plotH));
    const y = padT + plotH - bh;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${COR_MAG}"><title>${mesLabel(e.k)}: ${e.v}</title></rect>`;
    s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="pv-val">${e.v}</text>`;
    s += `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" class="pv-lbl">${mesLabel(e.k)}</text>`;
  });
  return s + '</svg>';
}

/* Mapa de concentração — pontos coloridos por tipo. */
function desenharMapaPainel(itens) {
  if (typeof L === 'undefined') return;
  const el = document.getElementById('painel-mapa');
  if (!el) return;
  if (_pnMapa) { try { _pnMapa.remove(); } catch (e) {} _pnMapa = null; }
  _pnMapa = L.map('painel-mapa', { scrollWheelZoom: false }).setView([-25.4589, -49.5310], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_pnMapa);
  _pnLayer = L.layerGroup().addTo(_pnMapa);
  const pts = itens.filter(i => i.lat != null && i.lng != null);
  const bounds = [];
  pts.forEach(i => {
    L.circleMarker([i.lat, i.lng], { radius: 5, color: '#fff', weight: 1, fillColor: corTipo(i.tipo_servico), fillOpacity: 0.85 })
      .bindPopup(esc(i.tipo_servico || '') + (i.bairro ? '<br>' + esc(i.bairro) : ''))
      .addTo(_pnLayer);
    bounds.push([i.lat, i.lng]);
  });
  if (bounds.length) _pnMapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  setTimeout(() => _pnMapa && _pnMapa.invalidateSize(), 150);
  const leg = document.getElementById('pn-mapa-leg');
  if (leg) leg.textContent = pts.length + ' serviço(s) com coordenada no mapa.';
}
