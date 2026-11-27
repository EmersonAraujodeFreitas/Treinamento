/* =========================================================
   Painel de Controle · armazenamento dos dados no navegador
   O localStorage só comporta uns 5 MB: com vários BDs, a base
   de monitorias e o desempenho ele enchia e as gravações
   falhavam caladas (ao recarregar, os dados sumiam).
   Aqui os dados grandes passam a morar no IndexedDB (centenas
   de MB), com uma cópia em memória para o site continuar
   lendo e gravando do mesmo jeito (getItem/setItem).
   ========================================================= */
(function () {
'use strict';
const PREF = ['inovacao_treinamento_', 'inovacao_pendentes_v2', 'inovacao_mon_importacao_v1'];
const grande = k => typeof k === 'string' && PREF.some(p => k.startsWith(p));
const S = Storage.prototype, get0 = S.getItem, set0 = S.setItem, rem0 = S.removeItem;
const mem = new Map(), fila = new Map();
let db = null, ativo = false, agendado = false;

function abrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('painel-de-controle', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('bloqueado'));
  });
}
function lerTudo() {
  return new Promise((res, rej) => {
    const out = new Map(), c = db.transaction('kv').objectStore('kv').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.set(cur.key, cur.value); cur.continue(); } else res(out); };
    c.onerror = () => rej(c.error);
  });
}
function gravarFila() {
  agendado = false;
  if (!db || !fila.size) return;
  const itens = [...fila]; fila.clear();
  try {
    const tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
    itens.forEach(([k, v]) => { if (v === undefined) st.delete(k); else st.put(v, k); });
    tx.onerror = () => { itens.forEach(([k, v]) => { if (!fila.has(k)) fila.set(k, v); }); agendar(); };
  } catch (e) { itens.forEach(([k, v]) => { if (!fila.has(k)) fila.set(k, v); }); }
}
function agendar() { if (!agendado) { agendado = true; setTimeout(gravarFila, 0); } }

const pronto = (async () => {
  try {
    if (!window.indexedDB) return false;
    db = await abrir();
    (await lerTudo()).forEach((v, k) => mem.set(k, v));
    // traz o que ainda estava no localStorage e libera o espaço dele
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!grande(k)) continue;
      const v = get0.call(localStorage, k);
      if (!mem.has(k) && v !== null) { mem.set(k, v); fila.set(k, v); }
      rem0.call(localStorage, k);
    }
    ativo = true; gravarFila();
    return true;
  } catch (e) { console.warn('IndexedDB indisponível, usando localStorage', e); return false; }
})();

S.getItem = function (k) { if (ativo && this === localStorage && grande(k)) return mem.has(k) ? mem.get(k) : null; return get0.call(this, k); };
S.setItem = function (k, v) { if (ativo && this === localStorage && grande(k)) { const t = String(v); mem.set(k, t); fila.set(k, t); agendar(); return; } return set0.call(this, k, v); };
S.removeItem = function (k) { if (ativo && this === localStorage && grande(k)) { mem.delete(k); fila.set(k, undefined); agendar(); return; } return rem0.call(this, k); };
window.addEventListener('pagehide', gravarFila);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gravarFila(); });

window.ARMAZEM = {
  pronto,
  ativo: () => ativo,
  tamanho: () => { let t = 0; mem.forEach(v => { t += (v || '').length; }); return t; },
  limpar: () => { [...mem.keys()].forEach(k => { mem.delete(k); fila.set(k, undefined); }); agendar(); }
};
})();
