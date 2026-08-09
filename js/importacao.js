/* ================================================================
   EMITIR OS — Importador da planilha (.xlsx) → Supabase
   Lê "2. Entrada Para OS" → os_solicitacoes
       "OS Enviadas"       → os_documentos + os_itens
   ================================================================ */

const ABA_ENTRADA = '2. Entrada Para OS';
const ABA_ENVIADAS = 'OS Enviadas';
const ABA_AGRUPADO = 'Agrupado por Proximidade';

let _importData = null;  // { solicitacoes:[], documentos:[] }

/* ── Helpers de conversão ── */
function excelSerialParaDate(n) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(n) * 86400000);
}
function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialParaDate(v).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);      // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                 // yyyy-mm-dd
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;  // texto solto (anotação) → sem data
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
/* Recupera lat/lng cujo ponto decimal se perdeu na planilha por causa
   de locale (ex.: -25460941 → -25.460941). Desloca a vírgula até a
   coordenada cair na faixa válida. */
function normCoord(v, max) {
  let n = toNum(v);
  if (n === null) return null;
  let guard = 0;
  while (Math.abs(n) > max && guard++ < 12) n /= 10;
  return Math.abs(n) > max ? null : n;
}
function toBool(v) {
  if (v === true) return true;
  const s = String(v || '').toLowerCase();
  return s === 'true' || s === 'sim' || s.includes('pendente') || s === '1' || s === 'x';
}
function txt(v) { const s = (v === null || v === undefined) ? '' : String(v).trim(); return s; }

/* Normaliza endereço para cruzar Entrada × abas geocodificadas. */
function normEnd(s) {
  return txt(s).toLowerCase()
    .replace(/,?\s*campo largo.*$/i, '')     // remove sufixo cidade
    .replace(/[.,;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Índice endereço→{lat,lng} a partir das abas que já têm coordenada
   (saída do geocoding do Apps Script). Agrupado tem precedência. */
function construirIndiceCoord(wb) {
  const idx = {};
  const add = (end, lat, lng) => {
    const k = normEnd(end);
    if (!k) return;
    const la = normCoord(lat, 90), ln = normCoord(lng, 180);
    if (la == null || ln == null) return;
    if (!idx[k]) idx[k] = { lat: la, lng: ln };
  };
  const ag = linhasDaAba(wb, ABA_AGRUPADO);   // Endereço=3, Lat=4, Lng=5
  if (ag) for (let i = 1; i < ag.length; i++) { const r = ag[i]; if (r) add(r[3], r[4], r[5]); }
  const en = linhasDaAba(wb, ABA_ENVIADAS);   // Endereço=4, Lat=14, Lng=15
  if (en) for (let i = 1; i < en.length; i++) { const r = en[i]; if (r) add(r[4], r[14], r[15]); }
  return idx;
}

/* ── Leitura do arquivo ── */
function importarArquivo(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('Biblioteca de planilha não carregou. Recarregue a página.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      _importData = parsePlanilha(wb);
      mostrarPreviaImport();
    } catch (err) {
      showToast('Erro ao ler planilha: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function linhasDaAba(wb, nome) {
  const ws = wb.Sheets[nome];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function parsePlanilha(wb) {
  const out = { solicitacoes: [], documentos: [], avisos: [], solicComGeo: 0 };
  const coordIdx = construirIndiceCoord(wb);

  // ── Entrada Para OS ──
  const entrada = linhasDaAba(wb, ABA_ENTRADA);
  if (!entrada) out.avisos.push(`Aba "${ABA_ENTRADA}" não encontrada.`);
  else {
    for (let i = 1; i < entrada.length; i++) {
      const r = entrada[i]; if (!r) continue;
      const endereco = txt(r[1]);
      if (!endereco) continue;
      const coord = coordIdx[normEnd(endereco)];
      if (coord) out.solicComGeo++;
      out.solicitacoes.push({
        n_processo: txt(r[0]) || null,
        endereco,
        data_entrada: toISODate(r[2]),
        ponto_referencia: txt(r[3]) || null,
        trabalho: txt(r[4]) || null,
        tipo_servico: txt(r[10]) || null,
        prioridade: toNum(r[11]),
        pendente: toBool(r[12]),
        observacoes: txt(r[13]) || null,
        lat: coord ? coord.lat : null,
        lng: coord ? coord.lng : null,
        geo_status: coord ? 'ok' : 'pendente',
        status: 'aberta',
        origem: 'import'
      });
    }
  }

  // ── OS Enviadas (histórico) ──
  const enviadas = linhasDaAba(wb, ABA_ENVIADAS);
  if (!enviadas) out.avisos.push(`Aba "${ABA_ENVIADAS}" não encontrada.`);
  else {
    const mapa = {};  // OS string → doc
    for (let i = 1; i < enviadas.length; i++) {
      const r = enviadas[i]; if (!r) continue;
      const endereco = txt(r[4]);
      const osNum = txt(r[1]);
      if (!endereco || !osNum) continue;
      if (!mapa[osNum]) {
        const [num, ano] = osNum.split('/');
        mapa[osNum] = {
          numero: num || osNum,
          numero_formatado: osNum,
          ano: ano ? parseInt(ano) : null,
          doc_url: null,
          status: 'emitida',
          itens: []
        };
      }
      const doc = mapa[osNum];
      const link = txt(r[18]);
      if (link && !doc.doc_url) doc.doc_url = link;
      doc.itens.push({
        n_processo: txt(r[0]) || null,
        data_entrada: toISODate(r[3]),
        endereco,
        ponto_referencia: txt(r[5]) || null,
        trabalho: txt(r[6]) || null,
        data_execucao: toISODate(r[7]),
        tipo_servico: txt(r[12]) || null,
        prioridade: toNum(r[13]),
        pendente: false,
        lat: normCoord(r[14], 90),
        lng: normCoord(r[15], 180),
        geo_status: txt(r[16]) || null,
        ordem: toNum(r[9])
      });
    }
    out.documentos = Object.values(mapa);
  }
  return out;
}

/* ── Prévia ── */
function mostrarPreviaImport() {
  const d = _importData;
  const nItens = d.documentos.reduce((a, x) => a + x.itens.length, 0);
  document.getElementById('import-resumo').innerHTML = `
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="n">${d.solicitacoes.length}</div><div class="l">Solicitações (Entrada)</div></div>
      <div class="stat"><div class="n">${d.solicComGeo || 0}</div><div class="l">…com coordenada</div></div>
      <div class="stat"><div class="n">${d.documentos.length}</div><div class="l">OS no histórico</div></div>
      <div class="stat"><div class="n">${nItens}</div><div class="l">Itens de OS</div></div>
    </div>
    ${d.avisos.length ? '<p class="badge pendente">' + d.avisos.join(' · ') + '</p>' : ''}`;
  document.getElementById('import-preview').style.display = 'block';
  document.getElementById('import-preview').scrollIntoView({ behavior: 'smooth' });
}
function cancelarImport() {
  _importData = null;
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('file-xlsx').value = '';
}

/* ── Gravação ── */
async function confirmarImport() {
  if (!_importData) return;
  if (!sessionValida()) { showToast('Conecte-se primeiro.', 'error'); return; }
  const btn = document.getElementById('btn-confirmar-import');
  btn.disabled = true;
  const alvo = document.getElementById('import-alvo').value;
  try {
    let msgs = [];
    if (alvo === 'ambos' || alvo === 'solic') msgs.push(await gravarSolicitacoes());
    if (alvo === 'ambos' || alvo === 'hist')  msgs.push(await gravarHistorico());
    showToast(msgs.join(' · '), 'success');
    cancelarImport();
    if (typeof recarregarTudo === 'function') recarregarTudo();
  } catch (e) {
    showToast('Falha na importação: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function gravarSolicitacoes() {
  const novos = _importData.solicitacoes;
  if (!novos.length) return '0 solicitações';
  const existentes = await sbSelect('os_solicitacoes', 'select=id,n_processo,endereco,lat,lng') || [];
  const chave = x => (txt(x.n_processo) + '|' + txt(x.endereco)).toLowerCase();
  const porChave = new Map(existentes.map(e => [chave(e), e]));

  const inserir = [];
  let atualizados = 0;
  for (const x of novos) {
    const ex = porChave.get(chave(x));
    if (!ex) { inserir.push(x); continue; }
    // já existe: se agora tem coordenada e antes não tinha, atualiza
    if (x.lat != null && x.lng != null && (ex.lat == null || ex.lng == null)) {
      await sbUpdate('os_solicitacoes', { id: 'eq.' + ex.id }, { lat: x.lat, lng: x.lng, geo_status: 'ok' });
      atualizados++;
    }
  }
  for (let i = 0; i < inserir.length; i += 200) {
    await sbInsert('os_solicitacoes', inserir.slice(i, i + 200));
  }
  const partes = [];
  if (inserir.length) partes.push(`${inserir.length} nova(s)`);
  if (atualizados) partes.push(`${atualizados} c/ coordenada`);
  return partes.length ? partes.join(', ') + ' solicitação(ões)' : '0 solicitações novas';
}

async function gravarHistorico() {
  const docs = _importData.documentos;
  if (!docs.length) return '0 OS';
  const existentes = await sbSelect('os_documentos', 'select=numero_formatado') || [];
  const jaTem = new Set(existentes.map(x => txt(x.numero_formatado)));
  const inserir = docs.filter(x => !jaTem.has(txt(x.numero_formatado)));
  if (!inserir.length) return '0 OS novas';

  let nDocs = 0, nItens = 0;
  for (const doc of inserir) {
    const cab = {
      numero: doc.numero, numero_formatado: doc.numero_formatado, ano: doc.ano,
      doc_url: doc.doc_url, status: 'emitida'
    };
    const [linha] = await sbInsertReturn('os_documentos', cab);
    const osId = linha.id;
    const itens = doc.itens.map((it, idx) => ({ ...it, os_id: osId, ordem: it.ordem || (idx + 1) }));
    for (let i = 0; i < itens.length; i += 200) {
      await sbInsert('os_itens', itens.slice(i, i + 200));
    }
    nDocs++; nItens += itens.length;
  }
  return `${nDocs} OS / ${nItens} itens`;
}

/* ── Drag & drop ── */
(function () {
  const drop = document.getElementById('drop');
  if (!drop) return;
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) importarArquivo(f); });
})();
