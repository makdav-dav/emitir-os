/* ================================================================
   EMITIR OS — Seletor de endereço: autocomplete (Photon + Nominatim,
   OpenStreetMap, grátis) filtrado a Campo Largo + mini-mapa com pino
   arrastável para conferir/corrigir. Sem chave paga.
   ================================================================ */

const CL_CENTRO = { lat: -25.4589, lng: -49.5310 };
// bbox do município de Campo Largo (aprox): [lngMin, latMin, lngMax, latMax]
const CL_BBOX = { lngMin: -49.78, latMin: -25.72, lngMax: -49.33, latMax: -25.30 };
function dentroCampoLargo(lat, lng) {
  return lat >= CL_BBOX.latMin && lat <= CL_BBOX.latMax && lng >= CL_BBOX.lngMin && lng <= CL_BBOX.lngMax;
}

function debounce(fn, ms) {
  let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}

/* ── Busca de endereços (Photon principal, Nominatim reforço) ── */
async function _photon(q) {
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${CL_CENTRO.lat}&lon=${CL_CENTRO.lng}&limit=8&lang=default`;
  const r = await fetch(u);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.features || []).map(f => {
    const p = f.properties || {}, c = f.geometry.coordinates;
    const bairro = p.district || p.suburb || p.locality || p.neighbourhood || null;
    const label = [ [p.name, p.housenumber].filter(Boolean).join(', '), bairro, p.city ].filter(Boolean).join(' – ');
    return { label: label || p.name || 'Endereço', lat: c[1], lng: c[0], bairro: bairro };
  });
}
async function _nominatim(q) {
  const vb = `${CL_BBOX.lngMin},${CL_BBOX.latMin},${CL_BBOX.lngMax},${CL_BBOX.latMax}`;
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&addressdetails=1&limit=8&viewbox=${vb}&bounded=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j || []).map(x => {
    const a = x.address || {};
    const bairro = a.suburb || a.neighbourhood || a.village || a.quarter || null;
    const label = [ [a.road, a.house_number].filter(Boolean).join(', '), bairro, a.town || a.city || a.municipality ].filter(Boolean).join(' – ');
    return { label: label || x.display_name.slice(0, 60), lat: +x.lat, lng: +x.lon, bairro: bairro };
  });
}
async function buscarEnderecos(q) {
  if (!q || q.trim().length < 3) return [];
  let res = [];
  try { res = (await _photon(q)).filter(r => dentroCampoLargo(r.lat, r.lng)); } catch (e) {}
  if (res.length < 2) {
    try {
      const n = (await _nominatim(q)).filter(r => dentroCampoLargo(r.lat, r.lng));
      res = res.concat(n);
    } catch (e) {}
  }
  // dedup por coordenada aproximada
  const vistos = new Set(), out = [];
  for (const r of res) {
    const k = r.lat.toFixed(4) + ',' + r.lng.toFixed(4);
    if (vistos.has(k)) continue; vistos.add(k); out.push(r);
    if (out.length >= 6) break;
  }
  return out;
}

/* Geocodificação reversa (Nominatim). Devolve { label, bairro }. */
async function reverseGeo(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`;
    const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json(); const a = j.address || {};
    const bairro = a.suburb || a.neighbourhood || a.village || a.quarter || null;
    const label = [ [a.road, a.house_number].filter(Boolean).join(', '), bairro,
                    a.town || a.city || a.municipality ].filter(Boolean).join(' – ') || null;
    return { label: label, bairro: bairro };
  } catch (e) { return null; }
}
function setNsBairro(b) { const el = document.getElementById('ns-bairro'); if (el && b) el.value = b; }

/* ── Widget do seletor (usado no modal de nova solicitação) ── */
let _selMapa = null, _selMarker = null;

function destruirSeletor() {
  if (_selMapa) { try { _selMapa.remove(); } catch (e) {} }
  _selMapa = null; _selMarker = null;
}

function initSeletorEndereco(initLat, initLng) {
  destruirSeletor();
  const el = document.getElementById('ns-map');
  if (!el || typeof L === 'undefined') return;
  const temInit = (initLat != null && initLng != null && !isNaN(initLat) && !isNaN(initLng));
  const centro = temInit ? { lat: +initLat, lng: +initLng } : CL_CENTRO;
  _selMapa = L.map('ns-map', { scrollWheelZoom: true }).setView([centro.lat, centro.lng], temInit ? 16 : 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_selMapa);
  _selMarker = L.marker([centro.lat, centro.lng], { draggable: true }).addTo(_selMapa);
  if (temInit) aplicarCoord(centro.lat, centro.lng, false);
  _selMarker.on('dragend', async () => {
    const p = _selMarker.getLatLng();
    aplicarCoord(p.lat, p.lng, false);
    const g = await reverseGeo(p.lat, p.lng);
    renderDetect(g && g.label); if (g && g.bairro) setNsBairro(g.bairro);
  });
  // clicar no mapa também move o pino
  _selMapa.on('click', async e => {
    aplicarCoord(e.latlng.lat, e.latlng.lng, false);
    const g = await reverseGeo(e.latlng.lat, e.latlng.lng);
    renderDetect(g && g.label); if (g && g.bairro) setNsBairro(g.bairro);
  });
  setTimeout(() => _selMapa && _selMapa.invalidateSize(), 200);

  // autocomplete no input
  const inp = document.getElementById('ns-end');
  const drop = document.getElementById('ns-sug');
  inp.addEventListener('input', debounce(async () => {
    const q = inp.value.trim();
    if (q.length < 3) { drop.style.display = 'none'; return; }
    drop.innerHTML = '<div class="ac-item muted">buscando…</div>'; drop.style.display = 'block';
    const res = await buscarEnderecos(q);
    if (!res.length) { drop.innerHTML = '<div class="ac-item muted">nenhum endereço em Campo Largo — arraste o pino no mapa</div>'; return; }
    drop.innerHTML = res.map((r, i) =>
      `<div class="ac-item" onclick="escolherSugestao(${i})">${escHtml(r.label)}</div>`).join('');
    _sugAtual = res;
  }, 450));
  inp.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 200));
}

let _sugAtual = [];
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function escolherSugestao(i) {
  const r = _sugAtual[i]; if (!r) return;
  document.getElementById('ns-sug').style.display = 'none';
  // só posiciona o pino — NÃO altera o texto que o usuário escreveu
  aplicarCoord(r.lat, r.lng, true);
  renderDetect(r.label); setNsBairro(r.bairro);
}

/* Atualiza pino, coordenada e aviso de cidade. NÃO toca no texto do endereço. */
function aplicarCoord(lat, lng, centraliza) {
  document.getElementById('ns-lat').value = lat;
  document.getElementById('ns-lng').value = lng;
  if (_selMarker) _selMarker.setLatLng([lat, lng]);
  if (centraliza && _selMapa) _selMapa.setView([lat, lng], 16);
  document.getElementById('ns-coord').textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
  const aviso = document.getElementById('ns-aviso');
  if (!dentroCampoLargo(lat, lng)) {
    aviso.textContent = '⚠️ Este ponto está fora de Campo Largo — confira no mapa.';
    aviso.style.display = 'block';
  } else { aviso.style.display = 'none'; }
}

/* Mostra o "local detectado" apenas como informação, com botão opcional
   para copiar ao texto (nunca automático). */
let _ultimoLabel = '';
function renderDetect(label) {
  const el = document.getElementById('ns-detect');
  if (!el) return;
  if (!label) { el.style.display = 'none'; _ultimoLabel = ''; return; }
  _ultimoLabel = label;
  el.innerHTML = 'local no mapa: ' + escHtml(label) +
    ' <a href="#" onclick="usarNoTexto();return false" style="margin-left:6px">usar no texto</a>';
  el.style.display = 'block';
}
function usarNoTexto() {
  if (_ultimoLabel) document.getElementById('ns-end').value = _ultimoLabel;
}
