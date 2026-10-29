/* =========================================================
   Inovação Casa · Treinamento — acesso, perfis e sincronização
   - Entrada por usuário e senha
   - Dados compartilhados no repositório do site, criptografados
     (AES-256-GCM). Cada usuário guarda a chave dos dados embrulhada
     com a própria senha, então só quem tem login consegue abrir.
   - Tudo que for salvo/importado é enviado para todos e quem estiver
     com o site aberto recebe a atualização sozinho.
   ========================================================= */
(function () {
'use strict';

const REPO = 'EmersonAraujodeFreitas/Treinamento';
const ARQ_ACESSO = 'dados/acesso.json', ARQ_ESTADO = 'dados/estado.json';
const ADMIN_INICIAL = { usuario: 'EMERSON', senha: '12345678', nome: 'Emerson' };
const VERSAO_APP = document.currentScript ? (document.currentScript.src.split('?v=')[1] || '') : '';

const DS = {
  formacao: 'inovacao_treinamento_registros_v1', ativos: 'inovacao_treinamento_ativos_v1', analises: 'inovacao_treinamento_analises_v1',
  quadro: 'inovacao_treinamento_quadro_v1', supervisores: 'inovacao_treinamento_supervisores_v1', bairros: 'inovacao_treinamento_bairros_v1', meta: 'inovacao_treinamento_meta_v1'
};
const LISTAS = ['formacao', 'ativos', 'analises'], LWW = ['quadro', 'supervisores', 'meta'];
const CHAVE_DS = Object.fromEntries(Object.entries(DS).map(([k, v]) => [v, k]));
const K_SESSAO = 'inovacao_nuvem_sessao', K_TS = 'inovacao_nuvem_ts', K_APAG = 'inovacao_nuvem_apagados', K_CFG = 'inovacao_nuvem_config', K_SINC = 'inovacao_nuvem_sinc';

const PERFIS = ['Treinamento', 'Supervisão', 'Gerência', 'Administrador'];
const ITENS = {
  abas: [['cadastro', 'Formação · Cadastro de formação'], ['analise-trein', 'Formação · Análise treinamento'], ['analise-sup', 'Formação · Análise supervisão'], ['dashboard', 'Formação · Dashboard'], ['base', 'Formação · Base de dados'],
    ['at-cadastro', 'Ativos · Registrar treinamento'], ['at-registros', 'Ativos · Registros'], ['at-dashboard', 'Ativos · Dashboard'], ['at-base', 'Ativos · Base de dados (BD da operação)']],
  botoes: [['editar', 'Editar registros e análises'], ['excluir', 'Excluir registros'], ['exportar', 'Exportar planilhas (CSV)'], ['imprimir', 'Imprimir / PDF'], ['backup', 'Baixar e importar backup'],
    ['importarBD', 'Importar BD da operação'], ['supervisores', 'Gerenciar supervisores'], ['exemplo', 'Dados de exemplo'], ['apagar', 'Apagar tudo']]
};
const TODAS_ABAS = ITENS.abas.map(a => a[0]), TODOS_BOTOES = ITENS.botoes.map(b => b[0]);
const PERM_PADRAO = {
  'Treinamento': { abas: ['cadastro', 'analise-trein', 'dashboard', 'base', 'at-cadastro', 'at-registros', 'at-dashboard', 'at-base'], botoes: ['editar', 'excluir', 'exportar', 'imprimir', 'supervisores'] },
  'Supervisão': { abas: ['analise-sup', 'dashboard', 'at-registros', 'at-dashboard'], botoes: ['editar', 'exportar', 'imprimir'] },
  'Gerência': { abas: ['analise-trein', 'analise-sup', 'dashboard', 'base', 'at-registros', 'at-dashboard', 'at-base'], botoes: ['exportar', 'imprimir'] }
};

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const setOrig = Storage.prototype.setItem;
const gravarJ = (k, v) => { try { setOrig.call(localStorage, k, JSON.stringify(v)); } catch (e) { /* cheio */ } };
const agora = () => new Date().toISOString();
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const deb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const utf8b64 = t => b64(new TextEncoder().encode(t));
const b64utf8 = t => new TextDecoder().decode(deb64(t.replace(/\s/g, '')));
const normU = u => String(u || '').trim().toUpperCase();

/* ---------------- criptografia ---------------- */
async function chaveSenha(senha, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const chaveDados = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
async function cifrarCom(chave, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const d = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto)));
  return { iv: b64(iv), dados: b64(d) };
}
async function decifrarCom(chave, pkg) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(pkg.iv) }, chave, deb64(pkg.dados)));
}
async function embrulhar(rawDados, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const p = await cifrarCom(await chaveSenha(senha, sal), b64(rawDados));
  return { sal: b64(sal), iv: p.iv, chave: p.dados };
}
async function desembrulhar(entrada, senha) {
  const txt = await decifrarCom(await chaveSenha(senha, deb64(entrada.sal)), { iv: entrada.iv, dados: entrada.chave });
  return deb64(txt);
}

/* ---------------- estado da sessão ---------------- */
let sessao = null;          // { usuario, nome, perfil, chave (b64) }
let chaveCripto = null;     // CryptoKey dos dados
let cfg = lerJ(K_CFG, { usuarios: [], perfis: {}, token: '', ts: '' });
let shaEstado = null, ultimoRemoto = '', sujo = false, enviando = false, aplicando = false;
let statusSinc = { estado: 'local', quando: '', msg: '' };

/* ---------------- GitHub ---------------- */
const API = `https://api.github.com/repos/${REPO}/contents/`;
const cabGH = () => ({ Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
async function lerArquivo(arq, { autenticado = !!cfg.token, publico = false } = {}) {
  if (autenticado && !publico) {
    const r = await fetch(API + arq + '?ref=main&t=' + Date.now(), { headers: cabGH(), cache: 'no-store' });
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403) throw new Error('token');
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json();
    let texto = j.content && j.encoding === 'base64' ? b64utf8(j.content) : '';
    if (!texto) { const raw = await fetch(API + arq + '?ref=main', { headers: { ...cabGH(), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }); texto = await raw.text(); }
    return { sha: j.sha, texto };
  }
  // sem token: arquivo publicado no próprio site; se não achar, API pública
  try {
    const r = await fetch(arq + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t.trim().startsWith('{')) return { sha: null, texto: t }; }
  } catch (e) { /* segue */ }
  try {
    const r = await fetch(API + arq + '?ref=main', { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.ok) return { sha: null, texto: await r.text() };
  } catch (e) { /* sem rede */ }
  return null;
}
async function gravarArquivo(arq, texto, sha, mensagem) {
  const r = await fetch(API + arq, { method: 'PUT', headers: cabGH(), body: JSON.stringify({ message: mensagem, content: utf8b64(texto), branch: 'main', ...(sha ? { sha } : {}) }) });
  if (r.status === 409 || r.status === 422) { const e = new Error('conflito'); e.conflito = true; throw e; }
  if (r.status === 401 || r.status === 403) throw new Error('token');
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || 'GitHub ' + r.status); }
  return (await r.json()).content.sha;
}

/* ---------------- dados locais ---------------- */
function lerLocal() {
  const d = {};
  for (const [k, chave] of Object.entries(DS)) d[k] = lerJ(chave, null);
  return d;
}
// toda gravação do app nas chaves compartilhadas marca o que mudou
Storage.prototype.setItem = function (k, v) {
  const ds = this === localStorage ? CHAVE_DS[k] : null;
  const antes = ds ? this.getItem(k) : null;
  setOrig.call(this, k, v);
  if (!ds || aplicando || antes === v) return;
  if (LISTAS.includes(ds)) {
    try {
      const ids = new Set((JSON.parse(v) || []).map(r => r.id));
      const ap = lerJ(K_APAG, {}); ap[ds] = ap[ds] || {};
      (JSON.parse(antes || '[]') || []).forEach(r => { if (r && r.id && !ids.has(r.id)) ap[ds][r.id] = agora(); });
      gravarJ(K_APAG, ap);
    } catch (e) { /* ignora */ }
  }
  const ts = lerJ(K_TS, {}); ts[ds] = agora(); gravarJ(K_TS, ts);
  marcarSujo();
};

/* ---------------- mesclagem ---------------- */
const quando = r => r && (r.atualizadoEm || r.criadoEm) || '';
function mesclar(a, b) {
  // a e b: { datasets, apagados, ts, config }
  const out = { datasets: {}, apagados: {}, ts: {}, config: null };
  for (const ds of LISTAS) {
    const ap = { ...((a.apagados || {})[ds] || {}) };
    Object.entries((b.apagados || {})[ds] || {}).forEach(([id, t]) => { if (!ap[id] || ap[id] < t) ap[id] = t; });
    const mapa = new Map();
    [...(a.datasets[ds] || []), ...(b.datasets[ds] || [])].forEach(r => { if (!r || !r.id) return; const x = mapa.get(r.id); if (!x || quando(r) > quando(x)) mapa.set(r.id, r); });
    out.datasets[ds] = [...mapa.values()].filter(r => !ap[r.id] || quando(r) > ap[r.id]);
    out.apagados[ds] = ap;
  }
  for (const ds of LWW) {
    const ta = (a.ts || {})[ds] || '', tb = (b.ts || {})[ds] || '';
    const va = a.datasets[ds], vb = b.datasets[ds];
    if (va == null) { out.datasets[ds] = vb; out.ts[ds] = tb; }
    else if (vb == null) { out.datasets[ds] = va; out.ts[ds] = ta; }
    else if (tb > ta) { out.datasets[ds] = vb; out.ts[ds] = tb; } else { out.datasets[ds] = va; out.ts[ds] = ta; }
  }
  const ba = a.datasets.bairros || {}, bb = b.datasets.bairros || {}; const bu = {};
  [...new Set([...Object.keys(ba), ...Object.keys(bb)])].forEach(c => { bu[c] = [...new Set([...(ba[c] || []), ...(bb[c] || [])])]; });
  out.datasets.bairros = bu;
  const ca = a.config, cb = b.config;
  out.config = !ca ? cb : !cb ? ca : ((cb.ts || '') > (ca.ts || '') ? cb : ca);
  return out;
}
function estadoLocal() {
  return { datasets: lerLocal(), apagados: lerJ(K_APAG, {}), ts: lerJ(K_TS, {}), config: cfg.ts ? cfg : null };
}
function aplicar(est) {
  aplicando = true;
  try {
    for (const [ds, chave] of Object.entries(DS)) {
      const v = est.datasets[ds];
      if (v === null || v === undefined) continue;
      const txt = JSON.stringify(v);
      if (localStorage.getItem(chave) !== txt) setOrig.call(localStorage, chave, txt);
    }
    gravarJ(K_APAG, est.apagados || {});
    gravarJ(K_TS, { ...lerJ(K_TS, {}), ...(est.ts || {}) });
    if (est.config) { cfg = est.config; gravarJ(K_CFG, cfg); }
  } finally { aplicando = false; }
  window.dispatchEvent(new CustomEvent('dados-atualizados'));
  aplicarPermissoes();
}

/* ---------------- puxar / enviar ---------------- */
async function lerEstadoRemoto() {
  const arq = await lerArquivo(ARQ_ESTADO);
  if (!arq) return { sha: null, estado: null, marca: '' };
  const pkg = JSON.parse(arq.texto);
  const est = JSON.parse(await decifrarCom(chaveCripto, pkg));
  return { sha: arq.sha, estado: est, marca: pkg.atualizadoEm || '' };
}
async function puxar() {
  if (!chaveCripto) return false;
  const r = await lerEstadoRemoto();
  if (!r.estado) return false;
  if (r.sha) shaEstado = r.sha;
  if (r.marca && r.marca === ultimoRemoto && !sujo) return false;
  ultimoRemoto = r.marca;
  const local = estadoLocal();
  aplicar(mesclar(local, r.estado));
  return true;
}
function marcarSujo() {
  sujo = true; setStatus('pendente');
  clearTimeout(marcarSujo._t);
  marcarSujo._t = setTimeout(() => enviar().catch(() => {}), 2500);
}
async function enviar(forcar) {
  if (!chaveCripto || !cfg.token) { setStatus(cfg.token ? 'local' : 'sem-token'); return false; }
  if (enviando) { marcarSujo(); return false; }
  if (!sujo && !forcar) return true;
  enviando = true; setStatus('enviando');
  try {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const r = await lerEstadoRemoto();
      const base = estadoLocal();
      const final = r.estado ? mesclar(base, r.estado) : base;
      if (r.estado) aplicar(final);
      final.config = cfg;
      const marca = agora();
      const pkg = { formato: 'inovacao-casa-estado-v2', atualizadoEm: marca, por: sessao.usuario, ...(await cifrarCom(chaveCripto, JSON.stringify(final))) };
      try {
        shaEstado = await gravarArquivo(ARQ_ESTADO, JSON.stringify(pkg), r.sha, `Atualiza dados do site (${sessao.usuario})`);
        ultimoRemoto = marca; sujo = false;
        const s = { quando: marca }; gravarJ(K_SINC, s);
        setStatus('ok');
        return true;
      } catch (e) { if (!e.conflito) throw e; await new Promise(res => setTimeout(res, 600 + Math.random() * 900)); }
    }
    throw new Error('muitas atualizações ao mesmo tempo, tente de novo');
  } catch (e) {
    console.error(e); setStatus('erro', e.message === 'token' ? 'token do GitHub inválido ou sem permissão' : e.message); return false;
  } finally { enviando = false; }
}
let timerPoll = null;
function iniciarAtualizacaoAoVivo() {
  clearInterval(timerPoll);
  timerPoll = setInterval(() => { if (!document.hidden && !enviando) puxar().catch(() => {}); }, 30000);
  window.addEventListener('focus', () => { if (!enviando) puxar().catch(() => {}); });
}

/* ---------------- status no topo ---------------- */
function setStatus(e, msg) {
  statusSinc = { estado: e, quando: lerJ(K_SINC, {}).quando || '', msg: msg || '' };
  const el = document.getElementById('nuvemStatus'); if (!el) return;
  const hora = statusSinc.quando ? new Date(statusSinc.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const txt = { ok: `Sincronizado ${hora}`, pendente: 'Alterações a enviar…', enviando: 'Enviando para todos…', erro: 'Erro ao sincronizar', local: 'Só neste navegador', 'sem-token': 'Compartilhamento não ativado' }[e] || '';
  el.className = 'nuvem-status ' + e; el.title = msg || txt; $('span', el).textContent = txt;
  document.dispatchEvent(new CustomEvent('nuvem-status', { detail: statusSinc }));
}

/* ---------------- permissões ---------------- */
const ehAdmin = () => sessao && sessao.perfil === 'Administrador';
function permissoes() {
  if (!sessao || ehAdmin()) return { abas: TODAS_ABAS, botoes: TODOS_BOTOES };
  return (cfg.perfis || {})[sessao.perfil] || PERM_PADRAO[sessao.perfil] || { abas: [], botoes: [] };
}
const pode = item => { const p = permissoes(); return p.abas.includes(item) || p.botoes.includes(item); };
function aplicarPermissoes() {
  if (!sessao) return;
  const p = permissoes();
  let css = '';
  TODAS_ABAS.filter(a => !p.abas.includes(a)).forEach(a => { css += `.aba[data-aba="${a}"],#aba-${a}{display:none!important}`; });
  TODOS_BOTOES.filter(b => !p.botoes.includes(b)).forEach(b => { css += `[data-perm~="${b}"]{display:none!important}`; });
  if (!p.botoes.includes('excluir')) css += '[data-del]{display:none!important}';
  if (!p.botoes.includes('editar')) css += '.btn-icone[data-edit],.btn-icone[data-ids],#buscaEdit,#atBuscaEdit,.regs-lista [data-edit],[data-treinar]{display:none!important}td.lk{pointer-events:none;color:inherit!important;font-weight:600}';
  const areaF = ['cadastro', 'analise-trein', 'analise-sup', 'dashboard', 'base'].some(a => p.abas.includes(a));
  const areaA = ['at-cadastro', 'at-registros', 'at-dashboard', 'at-base'].some(a => p.abas.includes(a));
  if (!areaF) css += '.area[data-area="formacao"]{display:none!important}';
  if (!areaA) css += '.area[data-area="ativos"]{display:none!important}';
  let st = document.getElementById('estiloPermissoes');
  if (!st) { st = document.createElement('style'); st.id = 'estiloPermissoes'; document.head.appendChild(st); }
  st.textContent = css;
  document.body.classList.toggle('eh-admin', ehAdmin());
  // se a guia aberta não é permitida, abre a primeira permitida
  const aberta = document.querySelector('.painel.ativo');
  const nomeAberta = aberta ? aberta.id.replace(/^aba-/, '') : '';
  if (window.APP && (!nomeAberta || !p.abas.includes(nomeAberta)) && p.abas.length) window.APP.abrirAba(p.abas[0]);
}

/* ---------------- login ---------------- */
async function buscarAcesso(fresco) {
  const arq = await lerArquivo(ARQ_ACESSO, { autenticado: false, publico: true }).catch(() => null);
  let acesso = arq ? JSON.parse(arq.texto) : null;
  if (fresco || !acesso) {
    try { const r = await fetch(API + ARQ_ACESSO + '?ref=main', { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }); if (r.ok) acesso = JSON.parse(await r.text()); } catch (e) { /* sem rede */ }
  }
  return acesso;
}
async function entrar(usuario, senha) {
  usuario = normU(usuario);
  let acesso = await buscarAcesso(false);
  if (!acesso || !acesso.usuarios || !acesso.usuarios.length) {
    if (usuario === ADMIN_INICIAL.usuario && senha === ADMIN_INICIAL.senha) return { usuario, nome: ADMIN_INICIAL.nome, perfil: 'Administrador', chave: null };
    throw new Error('Usuário ou senha incorretos.');
  }
  let ent = acesso.usuarios.find(u => normU(u.usuario) === usuario);
  if (!ent) { acesso = await buscarAcesso(true) || acesso; ent = (acesso.usuarios || []).find(u => normU(u.usuario) === usuario); }
  if (!ent) throw new Error('Usuário ou senha incorretos.');
  let raw;
  try { raw = await desembrulhar(ent, senha); }
  catch (e) {
    const fresco = await buscarAcesso(true); const e2 = fresco && (fresco.usuarios || []).find(u => normU(u.usuario) === usuario);
    if (!e2 || e2.chave === ent.chave) throw new Error('Usuário ou senha incorretos.');
    try { raw = await desembrulhar(e2, senha); } catch (x) { throw new Error('Usuário ou senha incorretos.'); }
  }
  chaveCripto = await chaveDados(raw);
  const r = await lerEstadoRemoto().catch(() => ({ estado: null }));
  const conf = r.estado && r.estado.config || cfg;
  const info = (conf.usuarios || []).find(u => normU(u.usuario) === usuario);
  if (info && info.ativo === false) { chaveCripto = null; throw new Error('Este usuário está desativado. Fale com o administrador.'); }
  const perfil = info ? info.perfil : (usuario === ADMIN_INICIAL.usuario ? 'Administrador' : 'Treinamento');
  if (r.estado) { if (r.sha) shaEstado = r.sha; ultimoRemoto = ''; aplicar(mesclar(estadoLocal(), r.estado)); }
  return { usuario, nome: info ? info.nome : usuario, perfil, chave: b64(raw) };
}
function salvarSessao(manter) {
  const txt = JSON.stringify(sessao);
  sessionStorage.setItem(K_SESSAO, txt);
  if (manter) setOrig.call(localStorage, K_SESSAO, txt); else localStorage.removeItem(K_SESSAO);
}
function sair() {
  sessionStorage.removeItem(K_SESSAO); localStorage.removeItem(K_SESSAO);
  location.reload();
}

/* ---------------- carregar o site depois do login ---------------- */
const SCRIPTS = ['assets/graficos.js', 'assets/app.js', 'assets/xlsx-leitor.js', 'assets/ativos.js', 'assets/analises.js'];
function carregarApp() {
  return new Promise(res => {
    let i = 0;
    const prox = () => {
      if (i >= SCRIPTS.length) return res();
      const s = document.createElement('script'); s.src = SCRIPTS[i++] + (VERSAO_APP ? '?v=' + VERSAO_APP : ''); s.onload = prox; s.onerror = prox; document.body.appendChild(s);
    };
    prox();
  });
}
async function iniciar() {
  document.body.classList.remove('bloqueado');
  document.getElementById('login').hidden = true;
  montarTopo();
  await carregarApp();
  window.dispatchEvent(new Event('load-app'));
  aplicarPermissoes();
  setStatus(chaveCripto ? (cfg.token ? 'ok' : 'sem-token') : 'local');
  if (chaveCripto) { iniciarAtualizacaoAoVivo(); if (cfg.token) puxar().then(() => { if (sujo) enviar(); }).catch(() => {}); }
}
function montarTopo() {
  const topo = document.querySelector('.topo-in'); if (!topo || document.getElementById('usuarioTopo')) return;
  topo.insertAdjacentHTML('beforeend', `<div class="usuario-topo" id="usuarioTopo">
    <div class="nuvem-status local" id="nuvemStatus"><i></i><span></span></div>
    <button type="button" class="btn-topo admin-only" id="btnAdmin" title="Administrativo">${iconeEngrenagem}<span>Administrativo</span></button>
    <div class="quem"><b>${esc(sessao.nome || sessao.usuario)}</b><small>${esc(sessao.perfil)}</small></div>
    <button type="button" class="btn-topo" id="btnSair" title="Sair">${iconeSair}<span>Sair</span></button></div>`);
  document.getElementById('btnSair').onclick = sair;
  document.getElementById('btnAdmin').onclick = abrirAdmin;
}
const iconeEngrenagem = '<svg viewBox="0 0 24 24" class="ico-topo"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const iconeSair = '<svg viewBox="0 0 24 24" class="ico-topo"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';

/* ---------------- tela de entrada ---------------- */
function telaLogin() {
  const f = document.getElementById('loginForm'), msg = document.getElementById('loginMsg'), btn = document.getElementById('loginBtn');
  f.addEventListener('submit', async e => {
    e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.lastChild.textContent = 'Entrando…';
    try {
      sessao = await entrar(document.getElementById('loginUsuario').value, document.getElementById('loginSenha').value);
      salvarSessao(document.getElementById('loginManter').checked);
      await iniciar();
    } catch (err) { msg.textContent = err.message || 'Não foi possível entrar.'; document.getElementById('loginSenha').select(); }
    finally { btn.disabled = false; btn.lastChild.textContent = 'Entrar'; }
  });
  document.getElementById('loginUsuario').focus();
}
async function retomarSessao() {
  const s = JSON.parse(sessionStorage.getItem(K_SESSAO) || localStorage.getItem(K_SESSAO) || 'null');
  if (!s) return false;
  sessao = s;
  if (s.chave) {
    chaveCripto = await chaveDados(deb64(s.chave));
    try {
      const r = await lerEstadoRemoto();
      if (r.estado) {
        if (r.sha) shaEstado = r.sha;
        const info = ((r.estado.config || {}).usuarios || []).find(u => normU(u.usuario) === normU(s.usuario));
        if (info && info.ativo === false) { sair(); return true; }
        if (info) { sessao.perfil = info.perfil; sessao.nome = info.nome; }
        aplicar(mesclar(estadoLocal(), r.estado));
      }
    } catch (e) {
      if (String(e.name) === 'OperationError') { sair(); return true; } // chave mudou
    }
  }
  await iniciar();
  return true;
}

/* =========================================================
   PAINEL ADMINISTRATIVO
   ========================================================= */
function abrirAdmin() {
  if (!ehAdmin()) return;
  const d = document.getElementById('dlgAdmin');
  renderAdmin('usuarios');
  d.showModal();
}
function renderAdmin(aba) {
  const corpo = document.getElementById('admCorpo');
  document.querySelectorAll('#admAbas button').forEach(b => b.classList.toggle('on', b.dataset.t === aba));
  const ativo = !!chaveCripto && !!cfg.token;
  if (aba === 'publicar' || !ativo) aba = ativo ? aba : 'publicar';
  document.querySelectorAll('#admAbas button').forEach(b => b.classList.toggle('on', b.dataset.t === aba));
  if (aba === 'publicar') {
    const s = lerJ(K_SINC, {});
    corpo.innerHTML = `
      <div class="adm-bloco">
        <h3>Publicação para todos</h3>
        ${ativo ? `<p class="adm-ok">✓ Compartilhamento ativo. Tudo que for salvo ou importado é enviado para todos e aparece sozinho para quem estiver com o site aberto (em até 30 segundos).</p>
          <p class="dica">Última publicação: ${s.quando ? new Date(s.quando).toLocaleString('pt-BR') : '—'} · status: ${esc(document.querySelector('#nuvemStatus span') ? document.querySelector('#nuvemStatus span').textContent : '')}</p>
          <div class="adm-acoes"><button type="button" class="btn btn-pri" id="admPublicar">Publicar agora</button><button type="button" class="btn btn-sec" id="admPuxar">Buscar atualizações agora</button></div>`
        : `<p>Para que os usuários, os cadastros e o BD apareçam para todos, ative o compartilhamento uma vez. Os dados vão para o repositório do site <b>criptografados</b>: só quem tem login consegue abrir.</p>`}
      </div>
      <div class="adm-bloco">
        <h3>${ativo ? 'Trocar o token do GitHub' : 'Ativar compartilhamento'}</h3>
        <label class="campo"><span>Token do GitHub (Contents: Read and write no repositório Treinamento)</span><input type="password" id="admToken" placeholder="github_pat_…" autocomplete="off"></label>
        <small class="dica"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Criar token no GitHub</a> → Repository access: Only select repositories → Treinamento → Permissions: Contents = Read and write → Generate token.</small>
        ${ativo ? '' : `<label class="campo"><span>Nova senha do EMERSON (recomendado trocar a 12345678)</span><input type="password" id="admNovaSenha" placeholder="deixe em branco para manter 12345678" autocomplete="new-password"></label>`}
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="admAtivar">${ativo ? 'Salvar token' : 'Ativar e publicar agora'}</button></div>
        <p class="msg" id="admMsgPub"></p>
      </div>`;
    const msg = document.getElementById('admMsgPub');
    if (ativo) {
      document.getElementById('admPublicar').onclick = async () => { msg.textContent = 'Publicando…'; msg.className = 'msg'; sujo = true; const ok = await enviar(true); msg.textContent = ok ? 'Publicado para todos.' : 'Não foi possível publicar: ' + (statusSinc.msg || 'erro'); msg.className = 'msg ' + (ok ? 'ok' : 'erro'); renderAdmin('publicar'); };
      document.getElementById('admPuxar').onclick = async () => { msg.textContent = 'Buscando…'; ultimoRemoto = ''; await puxar().catch(() => {}); msg.textContent = 'Dados atualizados.'; msg.className = 'msg ok'; };
    }
    document.getElementById('admAtivar').onclick = async () => {
      const token = document.getElementById('admToken').value.trim();
      if (!token && !ativo) { msg.textContent = 'Informe o token do GitHub.'; msg.className = 'msg erro'; return; }
      msg.textContent = 'Conferindo o token…'; msg.className = 'msg';
      const antigo = cfg.token; if (token) cfg.token = token;
      try {
        const teste = await fetch(`https://api.github.com/repos/${REPO}`, { headers: cabGH() });
        if (!teste.ok) throw new Error('token');
        const perm = (await teste.json()).permissions || {};
        if (perm.push === false) throw new Error('token');
        if (!ativo) await ativarCompartilhamento(document.getElementById('admNovaSenha').value);
        else { cfg.ts = agora(); gravarJ(K_CFG, cfg); sujo = true; await enviar(true); }
        msg.textContent = 'Pronto! Compartilhamento ativo.'; msg.className = 'msg ok';
        setTimeout(() => renderAdmin('usuarios'), 900);
      } catch (e) { cfg.token = antigo; msg.textContent = e.message === 'token' ? 'Token inválido ou sem permissão de escrita no repositório Treinamento.' : 'Erro: ' + e.message; msg.className = 'msg erro'; }
    };
    return;
  }
  if (aba === 'usuarios') {
    const lista = (cfg.usuarios || []).slice().sort((a, b) => a.usuario.localeCompare(b.usuario));
    corpo.innerHTML = `
      <div class="adm-bloco">
        <h3>Novo usuário</h3>
        <div class="adm-grade">
          <label class="campo"><span>Usuário (login)</span><input id="nuUsuario" placeholder="Ex.: MARIA.SILVA" autocomplete="off"></label>
          <label class="campo"><span>Nome</span><input id="nuNome" placeholder="Nome para exibir"></label>
          <label class="campo"><span>Perfil</span><select id="nuPerfil">${PERFIS.map(p => `<option>${p}</option>`).join('')}</select></label>
          <label class="campo"><span>Senha</span><input type="text" id="nuSenha" placeholder="Mínimo 6 caracteres" autocomplete="off"></label>
        </div>
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="nuCriar">Criar usuário</button><span class="msg" id="nuMsg"></span></div>
      </div>
      <div class="adm-bloco">
        <h3>Usuários (${lista.length})</h3>
        <table class="tabela adm-tab"><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map(u => `<tr data-u="${esc(u.usuario)}"><td><b>${esc(u.usuario)}</b></td><td>${esc(u.nome)}</td>
          <td><select data-acao="perfil"${normU(u.usuario) === normU(sessao.usuario) ? ' disabled' : ''}>${PERFIS.map(p => `<option${p === u.perfil ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
          <td>${u.ativo === false ? '<span class="tag ruim">Desativado</span>' : '<span class="tag bom">Ativo</span>'}</td>
          <td class="adm-bts"><button type="button" class="btn btn-sec btn-mini" data-acao="senha">Nova senha</button>${normU(u.usuario) === normU(sessao.usuario) ? '' : `<button type="button" class="btn btn-sec btn-mini" data-acao="ativo">${u.ativo === false ? 'Ativar' : 'Desativar'}</button><button type="button" class="btn btn-perigo btn-mini" data-acao="excluir">Excluir</button>`}</td></tr>`).join('')}
        </tbody></table>
        <p class="msg" id="usMsg"></p>
      </div>`;
    document.getElementById('nuCriar').onclick = async () => {
      const m = document.getElementById('nuMsg');
      const usuario = normU(document.getElementById('nuUsuario').value).replace(/\s+/g, '.'), nome = document.getElementById('nuNome').value.trim() || usuario, perfil = document.getElementById('nuPerfil').value, senha = document.getElementById('nuSenha').value;
      if (!usuario) { m.textContent = 'Informe o usuário.'; m.className = 'msg erro'; return; }
      if (senha.length < 6) { m.textContent = 'A senha precisa ter ao menos 6 caracteres.'; m.className = 'msg erro'; return; }
      if ((cfg.usuarios || []).some(u => normU(u.usuario) === usuario)) { m.textContent = 'Esse usuário já existe.'; m.className = 'msg erro'; return; }
      m.textContent = 'Criando…'; m.className = 'msg';
      try { await definirSenha(usuario, senha); cfg.usuarios.push({ usuario, nome, perfil, ativo: true, criadoEm: agora() }); await salvarConfig(); renderAdmin('usuarios'); toastN(`Usuário ${usuario} criado`); }
      catch (e) { m.textContent = 'Erro: ' + e.message; m.className = 'msg erro'; }
    };
    corpo.querySelector('tbody').addEventListener('click', async e => {
      const b = e.target.closest('button[data-acao]'); if (!b) return;
      const usuario = b.closest('tr').dataset.u, u = cfg.usuarios.find(x => x.usuario === usuario), m = document.getElementById('usMsg');
      try {
        if (b.dataset.acao === 'senha') {
          const s = prompt(`Nova senha para ${usuario} (mínimo 6 caracteres):`); if (s === null) return;
          if (s.length < 6) { alert('A senha precisa ter ao menos 6 caracteres.'); return; }
          m.textContent = 'Salvando…'; await definirSenha(usuario, s); m.textContent = `Senha de ${usuario} alterada.`; m.className = 'msg ok';
          if (normU(usuario) === normU(sessao.usuario)) salvarSessao(!!localStorage.getItem(K_SESSAO));
        } else if (b.dataset.acao === 'ativo') {
          u.ativo = u.ativo === false; await salvarConfig(); renderAdmin('usuarios');
        } else if (b.dataset.acao === 'excluir') {
          if (!confirm(`Excluir o usuário ${usuario}? Ele não conseguirá mais entrar.`)) return;
          await removerAcesso(usuario); cfg.usuarios = cfg.usuarios.filter(x => x !== u); await salvarConfig(); renderAdmin('usuarios');
        }
      } catch (err) { m.textContent = 'Erro: ' + err.message; m.className = 'msg erro'; }
    });
    corpo.querySelector('tbody').addEventListener('change', async e => {
      const s = e.target.closest('select[data-acao="perfil"]'); if (!s) return;
      const u = cfg.usuarios.find(x => x.usuario === s.closest('tr').dataset.u); u.perfil = s.value; await salvarConfig(); toastN('Perfil alterado');
    });
    return;
  }
  if (aba === 'permissoes') {
    const perfis = PERFIS.filter(p => p !== 'Administrador');
    const atual = p => (cfg.perfis || {})[p] || PERM_PADRAO[p];
    const linha = (tipo, [k, t]) => `<tr><td>${t}</td>${perfis.map(p => `<td class="cel-ck"><input type="checkbox" data-p="${p}" data-tipo="${tipo}" data-k="${k}"${atual(p)[tipo].includes(k) ? ' checked' : ''}></td>`).join('')}</tr>`;
    corpo.innerHTML = `
      <div class="adm-bloco">
        <h3>O que cada perfil pode ver</h3>
        <p class="dica">O Administrador sempre vê tudo. As mudanças valem para todos assim que você salvar.</p>
        <table class="tabela adm-tab perm-tab"><thead><tr><th>Guias</th>${perfis.map(p => `<th class="cel-ck">${p}</th>`).join('')}</tr></thead>
        <tbody>${ITENS.abas.map(i => linha('abas', i)).join('')}</tbody>
        <thead><tr><th>Botões e ações</th>${perfis.map(p => `<th class="cel-ck">${p}</th>`).join('')}</tr></thead>
        <tbody>${ITENS.botoes.map(i => linha('botoes', i)).join('')}</tbody></table>
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="permSalvar">Salvar permissões</button><button type="button" class="btn btn-link" id="permPadrao">voltar ao padrão</button><span class="msg" id="permMsg"></span></div>
      </div>`;
    document.getElementById('permSalvar').onclick = async () => {
      const novo = {}; perfis.forEach(p => novo[p] = { abas: [], botoes: [] });
      corpo.querySelectorAll('input[data-p]').forEach(c => { if (c.checked) novo[c.dataset.p][c.dataset.tipo].push(c.dataset.k); });
      cfg.perfis = novo; await salvarConfig();
      const m = document.getElementById('permMsg'); m.textContent = 'Permissões salvas e publicadas.'; m.className = 'msg ok';
    };
    document.getElementById('permPadrao').onclick = () => { cfg.perfis = {}; renderAdmin('permissoes'); };
  }
}
async function salvarConfig() {
  cfg.ts = agora(); gravarJ(K_CFG, cfg); aplicarPermissoes();
  sujo = true; const ok = await enviar(true);
  if (!ok) throw new Error(statusSinc.msg || 'não foi possível publicar');
}
let acessoSha = null;
async function lerAcessoAdmin() {
  const arq = await lerArquivo(ARQ_ACESSO);
  acessoSha = arq ? arq.sha : null;
  return arq ? JSON.parse(arq.texto) : { formato: 'inovacao-casa-acesso-v1', usuarios: [] };
}
async function definirSenha(usuario, senha, rawChave) {
  const raw = rawChave || deb64(sessao.chave);
  for (let t = 0; t < 3; t++) {
    const acesso = await lerAcessoAdmin();
    const ent = { usuario, ...(await embrulhar(raw, senha)) };
    acesso.usuarios = (acesso.usuarios || []).filter(u => normU(u.usuario) !== normU(usuario)).concat(ent);
    try { acessoSha = await gravarArquivo(ARQ_ACESSO, JSON.stringify(acesso, null, 1), acessoSha, `Acesso: ${usuario}`); return; }
    catch (e) { if (!e.conflito) throw e; }
  }
  throw new Error('não foi possível salvar o acesso');
}
async function removerAcesso(usuario) {
  const acesso = await lerAcessoAdmin();
  acesso.usuarios = (acesso.usuarios || []).filter(u => normU(u.usuario) !== normU(usuario));
  acessoSha = await gravarArquivo(ARQ_ACESSO, JSON.stringify(acesso, null, 1), acessoSha, `Acesso removido: ${usuario}`);
}
async function ativarCompartilhamento(novaSenha) {
  const senha = novaSenha && novaSenha.length >= 6 ? novaSenha : ADMIN_INICIAL.senha;
  const raw = crypto.getRandomValues(new Uint8Array(32));
  chaveCripto = await chaveDados(raw);
  sessao.chave = b64(raw);
  await definirSenha(sessao.usuario, senha, raw);
  cfg.usuarios = [{ usuario: sessao.usuario, nome: sessao.nome || 'Emerson', perfil: 'Administrador', ativo: true, criadoEm: agora() }];
  cfg.ts = agora(); gravarJ(K_CFG, cfg);
  salvarSessao(!!localStorage.getItem(K_SESSAO));
  sujo = true;
  const ok = await enviar(true);
  if (!ok) throw new Error(statusSinc.msg || 'não foi possível publicar');
  iniciarAtualizacaoAoVivo();
  // remove o arquivo antigo de BD (versão anterior do compartilhamento)
  try { const old = await lerArquivo('dados/quadro.json'); if (old && old.sha) await fetch(API + 'dados/quadro.json', { method: 'DELETE', headers: cabGH(), body: JSON.stringify({ message: 'Remove BD antigo (agora fica em estado.json)', sha: old.sha, branch: 'main' }) }); } catch (e) { /* opcional */ }
}
function toastN(t) { const el = document.getElementById('toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toastN._t); toastN._t = setTimeout(() => el.hidden = true, 2600); }

/* ---------------- API para os outros módulos ---------------- */
window.NUVEM = {
  usuario: () => sessao, ehAdmin, pode, permissoes,
  publicarAgora: async () => { sujo = true; return enviar(true); },
  status: () => statusSinc, ativo: () => !!chaveCripto && !!cfg.token,
  abrirAdmin
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#admAbas button').forEach(b => b.onclick = () => renderAdmin(b.dataset.t));
  retomarSessao().then(ok => { if (!ok) telaLogin(); }).catch(e => { console.error(e); telaLogin(); });
});
})();
