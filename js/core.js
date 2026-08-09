/* ================================================================
   EMITIR OS — núcleo: Supabase auth (Google) + REST + fila offline
   Reaproveita os padrões do coletadecampo (mesmo projeto Supabase).
   ================================================================ */
const SUPABASE_URL = 'https://bsgkloaziukpjjzxxeja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZ2tsb2F6aXVrcGpqenh4ZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNTU4OTIsImV4cCI6MjA5OTczMTg5Mn0.Nbb_1X0soL35nFnbBMJO0lkyqlcfHq-o_AYD5hys90k';
const FOTOS_BUCKET = 'fotos-campo';   // bucket público do Supabase Storage (mesmo do coletadecampo)

let sb = null;
let session = null;
let userEmail = LS.get('user_email') || null;
let syncing = false;

/* ── AUTH via Supabase (Google OAuth) ── */
function handleAuth() {
  if (!sb) { showToast('Sem conexão com a biblioteca do banco. Verifique a rede e recarregue.', 'error'); return; }
  if (session) {
    sb.auth.signOut().then(() => {
      session = null;
      updateAuthUI(false);
      showToast('Desconectado.', 'info');
    });
    return;
  }
  sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

function updateAuthUI(connected) {
  const btn = document.getElementById('btn-auth');
  const lbl = document.getElementById('auth-label');
  if (btn) btn.classList.toggle('connected', connected);
  if (lbl) lbl.textContent = connected ? (userEmail ? userEmail.split('@')[0] : 'Conectado') : 'Conectar';
  const hs = document.getElementById('home-status');
  if (hs) hs.textContent = connected
    ? 'Conectado como ' + (userEmail || '—') + '.'
    : 'Conecte-se com sua conta Google autorizada para emitir OS.';
}

function sessionValida() { return !!session; }

async function onSessionReady() {
  updateAuthUI(true);
  carregarPapel();
  if (typeof recarregarTudo === 'function') recarregarTudo();
  drainQueue();
}

/* ── Permissões por papel (admin/editor emitem OS e veem Config) ── */
let _papel = null;
function podeAdmin() { return _papel === 'admin' || _papel === 'editor'; }
async function carregarPapel() {
  try {
    const r = await sbRpc('papel_atual', {});
    _papel = (typeof r === 'string') ? r : (Array.isArray(r) ? r[0] : (r && r.papel_atual)) || null;
  } catch (e) { _papel = null; }
  aplicarPermissoes();
}
function aplicarPermissoes() {
  const restrito = !podeAdmin();
  document.querySelectorAll('.nav-btn[data-p="emitir"], .nav-btn[data-p="config"], .tile-restrito')
    .forEach(el => { el.style.display = restrito ? 'none' : ''; });
  // se estava numa página restrita, volta pro início
  const ativa = document.querySelector('.page.active');
  if (restrito && ativa && (ativa.id === 'page-emitir' || ativa.id === 'page-config')) showPage('home');
}

async function aguardarSupabaseLib(ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (typeof supabase !== 'undefined') return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function bootSupabase() {
  const ok = await aguardarSupabaseLib(8000);
  if (!ok) {
    showToast('Biblioteca do banco não carregou (rede bloqueou o CDN?). O app segue em modo offline.', 'error');
    return;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
  });
  const { data: { session: s } } = await sb.auth.getSession();
  if (s) {
    session = s;
    userEmail = s.user?.email || userEmail;
    if (userEmail) LS.set('user_email', userEmail);
    onSessionReady();
  } else {
    updateAuthUI(false);
  }
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && s) {
      session = s;
      userEmail = s.user?.email || userEmail;
      if (userEmail) LS.set('user_email', userEmail);
      onSessionReady();
    } else if (event === 'SIGNED_OUT') {
      session = null;
      updateAuthUI(false);
    }
  });
}

/* ── SUPABASE REST helpers ── */
async function sbFetch(path, opts = {}) {
  if (!session) throw new Error('SEM_SESSION');
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=minimal',
      ...(opts.headers || {})
    },
    body: opts.body
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j.message || j.hint || t; } catch(e) {}
    throw new Error(msg || ('HTTP ' + r.status));
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

function limparPayload(d) {
  return Object.fromEntries(Object.entries(d).filter(([k, v]) =>
    v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
}

/* Para insert em lote, o PostgREST exige que TODOS os objetos tenham
   o mesmo conjunto de chaves. Normaliza pela união das chaves,
   preenchendo as ausentes com null. */
function normalizarLote(arr) {
  const chaves = new Set();
  arr.forEach(o => Object.keys(o).forEach(k => { if (o[k] !== undefined) chaves.add(k); }));
  const cols = [...chaves];
  return arr.map(o => {
    const linha = {};
    cols.forEach(k => { linha[k] = (o[k] === undefined ? null : o[k]); });
    return linha;
  });
}

/* Insert simples (return=minimal). Aceita objeto único ou array. */
async function sbInsert(tabela, dados) {
  const body = Array.isArray(dados) ? normalizarLote(dados) : limparPayload(dados);
  await sbFetch(tabela, { method: 'POST', body: JSON.stringify(body) });
}

/* Insert que devolve as linhas gravadas (com id gerado). */
async function sbInsertReturn(tabela, dados) {
  const body = Array.isArray(dados) ? normalizarLote(dados) : limparPayload(dados);
  return sbFetch(tabela, { method: 'POST', body: JSON.stringify(body), prefer: 'return=representation' });
}

async function sbUpdate(tabela, filter, patch) {
  const q = Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  await sbFetch(tabela + '?' + q, { method: 'PATCH', body: JSON.stringify(patch) });
}

async function sbSelect(tabela, query) {
  return sbFetch(tabela + (query ? '?' + query : ''), { prefer: 'return=representation' });
}

async function sbDelete(tabela, filter) {
  const q = Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  await sbFetch(tabela + '?' + q, { method: 'DELETE' });
}

/* Chama uma função RPC do Postgres (ex.: baixa de item). */
async function sbRpc(fn, args) {
  return sbFetch('rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}), prefer: 'return=representation' });
}

/* ── INDEXEDDB: fila offline (para edições de solicitação sem rede) ── */
let idb = null;
function abrirDB() {
  return new Promise((resolve, reject) => {
    if (idb) return resolve(idb);
    const req = indexedDB.open('emitir_os', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' });
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror = () => reject(req.error);
  });
}
function idbPut(store, obj) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function idbDel(store, id) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function idbAll(store) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error);
  }));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
function agora() { return new Date().toISOString(); }

async function enqueue(item) {
  item.id = item.id || uuid();
  item.status = 'pendente';
  item.criado_em = item.criado_em || agora();
  await idbPut('fila', item);
  atualizarBadgeFila();
  drainQueue();
}

async function drainQueue(manual) {
  if (syncing) return;
  if (!navigator.onLine) { if (manual) showToast('Sem conexão de rede.', 'error'); atualizarBadgeFila(); return; }
  if (!sessionValida())  { if (manual) showToast('Conecte-se primeiro (botão no topo).', 'error'); atualizarBadgeFila(); return; }
  syncing = true;
  try {
    const itens = (await idbAll('fila')).sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    let ok = 0, falha = 0;
    for (const it of itens) {
      try {
        if (it.tipo === 'insert')      await sbInsert(it.tabela, it.dados);
        else if (it.tipo === 'update') await sbUpdate(it.tabela, it.filter, it.patch);
        else if (it.tipo === 'delete') await sbDelete(it.tabela, it.filter);
        await idbDel('fila', it.id);
        ok++;
      } catch (e) {
        if (e.message === 'SEM_SESSION') break;
        if (/duplicate key|already exists|23505/i.test(e.message)) { await idbDel('fila', it.id); ok++; continue; }
        it.status = 'erro'; it.erro = e.message;
        await idbPut('fila', it);
        falha++;
      }
    }
    if (ok) showToast(`${ok} registro(s) sincronizado(s).`, 'success');
    if (falha && manual) showToast(`${falha} com erro na fila.`, 'error');
  } finally {
    syncing = false;
    atualizarBadgeFila();
    if (typeof recarregarTudo === 'function') recarregarTudo();
  }
}

async function atualizarBadgeFila() {
  const n = (await idbAll('fila')).length;
  const dot = document.getElementById('fila-dot');
  if (dot) { dot.style.display = n ? 'inline-flex' : 'none'; dot.textContent = n; }
}

window.addEventListener('online', () => { document.body.classList.remove('offline'); drainQueue(); });
window.addEventListener('offline', () => document.body.classList.add('offline'));
if (!navigator.onLine) document.body.classList.add('offline');
setInterval(() => drainQueue(), 45000);

/* ── UI: navegação entre páginas ── */
const TITULOS = { home: 'Início', painel: 'Painel', importar: 'Importar planilha', solicitacoes: 'Solicitações',
  emitir: 'Emitir OS', baixa: 'Baixa de execução', os: 'OS emitidas', config: 'Configurações' };
function showPage(p) {
  document.querySelectorAll('.page').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('page-' + p);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  const t = document.getElementById('topbar-title'); if (t) t.textContent = TITULOS[p] || 'Emitir OS';
  window.scrollTo(0, 0);
}
function navTo(p) {
  if ((p === 'emitir' || p === 'config') && !podeAdmin()) {
    showToast('Sem permissão para essa área. Fale com um administrador.', 'error');
    return showPage('home');
  }
  showPage(p);
  if (p === 'solicitacoes' && typeof renderSolicitacoes === 'function') renderSolicitacoes();
  if (p === 'painel' && typeof renderPainel === 'function') renderPainel();
  if (p === 'emitir' && typeof renderEmitir === 'function') renderEmitir();
  if (p === 'baixa' && typeof renderBaixa === 'function') renderBaixa();
  if (p === 'os' && typeof renderOSEmitidas === 'function') renderOSEmitidas();
  if (p === 'config' && typeof renderConfig === 'function') renderConfig();
}

/* ── FOTOS: compressão + upload para o Storage (porta do coletadecampo) ── */
function comprimirFoto(file, maxPx, q) {
  maxPx = maxPx || 1600; q = q || 0.85;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxPx) { const k = maxPx / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao comprimir a imagem')), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

/* Sobe um blob JPEG para o bucket público e devolve a URL pública. */
async function uploadFotoStorage(blob, path) {
  if (!session) throw new Error('SEM_SESSION');
  const alvo = `${SUPABASE_URL}/storage/v1/object/${FOTOS_BUCKET}/${encodeURI(path)}`;
  const r = await fetch(alvo, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true'
    },
    body: blob
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Storage: ' + (t || r.status)); }
  return `${SUPABASE_URL}/storage/v1/object/public/${FOTOS_BUCKET}/${encodeURI(path)}`;
}

/* Comprime um File e envia; devolve a URL pública. subpasta ex.: 'os-ref'. */
async function enviarFoto(file, subpasta) {
  const blob = await comprimirFoto(file);
  const nome = (subpasta || 'os') + '/' + uuid() + '.jpg';
  return uploadFotoStorage(blob, nome);
}

/* ── boot ── */
window.addEventListener('DOMContentLoaded', () => { bootSupabase(); atualizarBadgeFila(); });
