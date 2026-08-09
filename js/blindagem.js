/* ================================================================
   BLINDAGEM — roda antes de tudo. Nenhuma linha daqui pode lançar.
   ================================================================ */

/* Storage seguro: alguns contextos do Android (file://, content://,
   visualizadores de arquivo) LANÇAM ao tocar em localStorage. Fallback em memória. */
const __mem = {};
function __mkStore(nome) {
  let nativo = null;
  try { nativo = window[nome]; nativo.setItem('__t', '1'); nativo.removeItem('__t'); }
  catch (e) { nativo = null; }
  return {
    get(k) { try { return nativo ? nativo.getItem(k) : (__mem[nome + ':' + k] ?? null); } catch (e) { return __mem[nome + ':' + k] ?? null; } },
    set(k, v) { try { if (nativo) { nativo.setItem(k, v); return; } } catch (e) {} __mem[nome + ':' + k] = String(v); },
    del(k) { try { if (nativo) { nativo.removeItem(k); return; } } catch (e) {} delete __mem[nome + ':' + k]; },
    ok: !!nativo
  };
}
const LS = __mkStore('localStorage');
const SS = __mkStore('sessionStorage');

/* Toast definido cedo, sem dependências de estado */
function showToast(msg, type) {
  try {
    const t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.className = type || 'info';
    t.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.style.display = 'none'; }, 4000);
  } catch (e) {}
}

/* Erros globais visíveis desde o primeiro instante */
window.addEventListener('error', e => showToast('Erro: ' + (e.message || 'desconhecido'), 'error'));
window.addEventListener('unhandledrejection', e => showToast('Erro: ' + (e.reason && e.reason.message ? e.reason.message : e.reason || 'desconhecido'), 'error'));

/* Diagnóstico de contexto: coisas que matam recursos no celular */
window.addEventListener('DOMContentLoaded', () => {
  try {
    const avisos = [];
    if (location.protocol === 'file:' || location.protocol === 'content:')
      avisos.push('Arquivo aberto direto (sem servidor) — login e GPS não funcionam assim. Hospede o app ou use http://localhost.');
    else if (!window.isSecureContext)
      avisos.push('Contexto inseguro (http em rede) — Chrome bloqueia GPS e câmera. Use hospedagem https.');
    if (!LS.ok) avisos.push('Armazenamento local bloqueado neste modo — sessão não persiste.');
    if (avisos.length) showToast(avisos[0], 'error');
  } catch (e) {}
});

