/* =========================================================
   Inovação Casa · Treinamento — acesso e sincronização com o servidor
   - Usuário e senha conferidos no SERVIDOR (Cloudflare Worker + D1)
   - O servidor só entrega os dados que o perfil pode ver e recusa
     gravações sem permissão; nada fica guardado no GitHub
   - Alterações vão para o servidor e chegam para quem estiver com o
     site aberto em poucos segundos
   ========================================================= */
(function () {
'use strict';

const API = String(window.TREINAMENTO_API || localStorage.getItem('inovacao_api_url') || '').replace(/\/+$/, '');
const VERSAO_APP = document.currentScript ? (document.currentScript.src.split('?v=')[1] || '') : '';
const DS = {
  formacao: 'inovacao_treinamento_registros_v1', ativos: 'inovacao_treinamento_ativos_v1', analises: 'inovacao_treinamento_analises_v1',
  quadro: 'inovacao_treinamento_quadro_v1', supervisores: 'inovacao_treinamento_supervisores_v1', bairros: 'inovacao_treinamento_bairros_v1', meta: 'inovacao_treinamento_meta_v1'
};
const LISTAS = ['formacao', 'ativos', 'analises'], VALORES = ['quadro', 'supervisores', 'bairros', 'meta'];
const CHAVE_DS = Object.fromEntries(Object.entries(DS).map(([k, v]) => [v, k]));
const K_SESSAO = 'inovacao_sessao_v2', K_PEND = 'inovacao_pendentes_v2', K_MIGRADO = 'inovacao_migrado_v2';
const PERFIS = ['Treinamento', 'Supervisão', 'Gerência', 'Administrador'];
const ITENS = {
  abas: [['cadastro', 'Formação · Cadastro de formação'], ['analise-trein', 'Formação · Análise treinamento'], ['analise-sup', 'Formação · Análise supervisão'], ['dashboard', 'Formação · Dashboard'], ['base', 'Formação · Base de dados'],
    ['at-cadastro', 'Ativos · Registrar treinamento'], ['at-registros', 'Ativos · Registros'], ['at-dashboard', 'Ativos · Dashboard'], ['at-base', 'Ativos · Base de dados (BD da operação)']],
  botoes: [['editar', 'Editar registros e análises'], ['excluir', 'Excluir registros'], ['exportar', 'Exportar planilhas (CSV)'], ['imprimir', 'Imprimir / PDF'], ['backup', 'Baixar e importar backup'],
    ['importarBD', 'Importar BD da operação'], ['supervisores', 'Gerenciar supervisores'], ['exemplo', 'Dados de exemplo'], ['apagar', 'Apagar tudo']]
};
const TODAS_ABAS = ITENS.abas.map(a => a[0]), TODOS_BOTOES = ITENS.botoes.map(b => b[0]);
const MAX_LOTE = 30;
['inovacao_nuvem_config', 'inovacao_nuvem_sessao', 'inovacao_nuvem_ts', 'inovacao_nuvem_apagados', 'inovacao_nuvem_sinc', 'inovacao_treinamento_gh_token', 'inovacao_treinamento_senha_equipe'].forEach(k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ok */ } });

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const setOrig = Storage.prototype.setItem;
const gravarJ = (k, v) => { try { setOrig.call(localStorage, k, JSON.stringify(v)); } catch (e) { /* cheio */ } };
const normU = u => String(u || '').trim().toUpperCase();
function toastN(t) { const el = document.getElementById('toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toastN._t); toastN._t = setTimeout(() => el.hidden = true, 3200); }

/* ---------------- estado ---------------- */
let sessao = null;             // { token, usuario:{usuario,nome,perfil}, permissoes, manter }
let versaoLocal = -1, aplicando = false, enviando = false, statusSinc = { estado: 'local', msg: '' };
const modoLocal = () => !API;

/* ---------------- servidor ---------------- */
async function api(metodo, caminho, corpo) {
  if (!API) throw new Error('Servidor não configurado.');
  let r;
  try {
    r = await fetch(API + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(sessao && sessao.token ? { Authorization: 'Bearer ' + sessao.token } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' });
  } catch (e) { const x = new Error('Sem conexão com o servidor.'); x.rede = true; throw x; }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && caminho !== '/login') { encerrar(j.erro || 'Sua sessão terminou. Entre novamente.'); throw new Error(j.erro || 'Sessão encerrada'); }
  if (!r.ok) { const x = new Error(j.erro || 'Erro ' + r.status); x.status = r.status; throw x; }
  return j;
}

/* ---------------- alterações locais → pendentes ---------------- */
function pendentes() { return lerJ(K_PEND, { listas: {}, valores: {} }); }
Storage.prototype.setItem = function (k, v) {
  const ds = this === localStorage ? CHAVE_DS[k] : null;
  const antes = ds ? this.getItem(k) : null;
  setOrig.call(this, k, v);
  if (!ds || aplicando || antes === v || !sessao) return;
  const p = pendentes();
  if (LISTAS.includes(ds)) {
    let velho = [], novo = [];
    try { velho = JSON.parse(antes || '[]') || []; novo = JSON.parse(v || '[]') || []; } catch (e) { return; }
    const mv = new Map(velho.filter(r => r && r.id).map(r => [r.id, JSON.stringify(r)]));
    const l = p.listas[ds] = p.listas[ds] || { salvar: {}, apagar: {} };
    const idsNovos = new Set();
    novo.forEach(r => { if (!r || !r.id) return; idsNovos.add(r.id); const t = JSON.stringify(r); if (mv.get(r.id) !== t) { l.salvar[r.id] = r; delete l.apagar[r.id]; } });
    mv.forEach((_, id) => { if (!idsNovos.has(id)) { l.apagar[id] = true; delete l.salvar[id]; } });
  } else {
    try { p.valores[ds] = JSON.parse(v); } catch (e) { return; }
  }
  gravarJ(K_PEND, p);
  agendarEnvio();
};
function contarPendentes(p = pendentes()) {
  let n = Object.keys(p.valores || {}).length;
  Object.values(p.listas || {}).forEach(l => { n += Object.keys(l.salvar || {}).length + Object.keys(l.apagar || {}).length; });
  return n;
}

/* ---------------- enviar e receber ---------------- */
function agendarEnvio() {
  if (modoLocal()) return;
  setStatus('pendente');
  clearTimeout(agendarEnvio._t); agendarEnvio._t = setTimeout(() => enviar().catch(() => {}), 1200);
}
async function enviar() {
  if (modoLocal() || !sessao) return false;
  if (enviando) { agendarEnvio(); return false; }
  let p = pendentes();
  if (!contarPendentes(p)) { setStatus('ok'); return true; }
  enviando = true; setStatus('enviando');
  const recusados = [];
  try {
    let primeiro = true;
    while (contarPendentes(p)) {
      const lote = { listas: {}, valores: {} }; let n = 0;
      if (primeiro) { lote.valores = p.valores || {}; }
      for (const ds of LISTAS) {
        const l = (p.listas || {})[ds]; if (!l) continue;
        for (const [id, rec] of Object.entries(l.salvar || {})) { if (n >= MAX_LOTE) break; (lote.listas[ds] = lote.listas[ds] || { salvar: [], apagar: [] }).salvar.push(rec); n++; }
        for (const id of Object.keys(l.apagar || {})) { if (n >= MAX_LOTE) break; (lote.listas[ds] = lote.listas[ds] || { salvar: [], apagar: [] }).apagar.push(id); n++; }
      }
      const r = await api('POST', '/sincronizar', lote);
      (r.recusados || []).forEach(x => recusados.push(x));
      // tira do pendente o que foi enviado (mesmo se recusado: o servidor manda a versão correta depois)
      p = pendentes();
      if (primeiro) { Object.keys(lote.valores).forEach(k => { if (JSON.stringify(p.valores[k]) === JSON.stringify(lote.valores[k])) delete p.valores[k]; }); }
      for (const [ds, l] of Object.entries(lote.listas)) {
        const pl = p.listas[ds]; if (!pl) continue;
        l.salvar.forEach(rec => { if (pl.salvar[rec.id] && JSON.stringify(pl.salvar[rec.id]) === JSON.stringify(rec)) delete pl.salvar[rec.id]; });
        l.apagar.forEach(id => delete pl.apagar[id]);
      }
      gravarJ(K_PEND, p);
      primeiro = false;
      if (!n && !Object.keys(lote.valores).length) break;
    }
    if (recusados.length) toastN(`${recusados.length} alteração(ões) não foram aceitas pelo servidor por falta de permissão.`);
    await puxar(true);
    setStatus('ok');
    return true;
  } catch (e) {
    if (!sessao) return false;
    setStatus('erro', e.message); return false;
  } finally { enviando = false; if (contarPendentes()) agendarEnvio(); }
}
function aplicarEstado(est) {
  const p = pendentes();
  aplicando = true;
  try {
    for (const ds of LISTAS) {
      const servidor = est.datasets[ds];
      if (servidor === null || servidor === undefined) { setOrig.call(localStorage, DS[ds], '[]'); delete p.listas[ds]; continue; }
      const mapa = new Map(servidor.map(r => [r.id, r]));
      const l = p.listas[ds] || { salvar: {}, apagar: {} };
      Object.values(l.salvar || {}).forEach(r => mapa.set(r.id, r));
      Object.keys(l.apagar || {}).forEach(id => mapa.delete(id));
      setOrig.call(localStorage, DS[ds], JSON.stringify([...mapa.values()]));
    }
    for (const v of VALORES) {
      if (Object.prototype.hasOwnProperty.call(p.valores || {}, v)) continue;
      const val = est.datasets[v];
      if (val === null || val === undefined) localStorage.removeItem(DS[v]); else setOrig.call(localStorage, DS[v], JSON.stringify(val));
    }
  } finally { aplicando = false; }
  gravarJ(K_PEND, p);
  versaoLocal = est.versao;
  sessao.permissoes = est.permissoes; sessao.usuario = est.usuario; salvarSessao();
  window.dispatchEvent(new CustomEvent('dados-atualizados'));
  aplicarPermissoes(); atualizarTopo();
}
async function puxar(forcar) {
  if (modoLocal() || !sessao) return false;
  if (!forcar) { const v = await api('GET', '/versao'); if (v.versao === versaoLocal) return false; }
  aplicarEstado(await api('GET', '/estado'));
  return true;
}
let timerPoll = null;
function iniciarAtualizacaoAoVivo() {
  clearInterval(timerPoll);
  timerPoll = setInterval(() => { if (!document.hidden && !enviando && sessao) puxar(false).then(() => setStatus(contarPendentes() ? 'pendente' : 'ok')).catch(e => { if (e.rede) setStatus('erro', e.message); }); }, 15000);
  window.addEventListener('focus', () => { if (!enviando && sessao) puxar(false).catch(() => {}); });
}

/* ---------------- status no topo ---------------- */
function setStatus(e, msg) {
  statusSinc = { estado: e, msg: msg || '' };
  const el = document.getElementById('nuvemStatus'); if (!el) return;
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const txt = { ok: `Sincronizado ${hora}`, pendente: 'Alterações a enviar…', enviando: 'Enviando…', erro: 'Sem conexão com o servidor', local: 'Modo local (sem servidor)' }[e] || '';
  el.className = 'nuvem-status ' + e; el.title = msg || txt; $('span', el).textContent = txt;
  document.dispatchEvent(new CustomEvent('nuvem-status', { detail: statusSinc }));
}

/* ---------------- permissões (tela) ---------------- */
const ehAdmin = () => !!sessao && sessao.usuario.perfil === 'Administrador';
function permissoes() {
  if (!sessao) return { abas: [], botoes: [] };
  if (ehAdmin()) return { abas: TODAS_ABAS, botoes: TODOS_BOTOES };
  return sessao.permissoes || { abas: [], botoes: [] };
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
  if (!['cadastro', 'analise-trein', 'analise-sup', 'dashboard', 'base'].some(a => p.abas.includes(a))) css += '.area[data-area="formacao"]{display:none!important}';
  if (!['at-cadastro', 'at-registros', 'at-dashboard', 'at-base'].some(a => p.abas.includes(a))) css += '.area[data-area="ativos"]{display:none!important}';
  let st = document.getElementById('estiloPermissoes');
  if (!st) { st = document.createElement('style'); st.id = 'estiloPermissoes'; document.head.appendChild(st); }
  st.textContent = css;
  document.body.classList.toggle('eh-admin', ehAdmin());
  const aberta = document.querySelector('.painel.ativo');
  const nome = aberta ? aberta.id.replace(/^aba-/, '') : '';
  if (window.APP && (!nome || !p.abas.includes(nome)) && p.abas.length) window.APP.abrirAba(p.abas[0]);
  if (!p.abas.length && window.APP) document.querySelector('main').innerHTML = '<div class="vazio"><b>Seu perfil ainda não tem nenhuma guia liberada.</b><p>Fale com o administrador do site.</p></div>';
}

/* ---------------- sessão ---------------- */
function salvarSessao() {
  const txt = JSON.stringify(sessao);
  sessionStorage.setItem(K_SESSAO, txt);
  if (sessao.manter) setOrig.call(localStorage, K_SESSAO, txt); else localStorage.removeItem(K_SESSAO);
}
function limparDadosLocais() {
  Object.values(DS).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem(K_PEND);
}
function sair() {
  if (contarPendentes() && !modoLocal() && !confirm('Ainda há alterações não enviadas ao servidor. Sair mesmo assim? Elas serão perdidas.')) return;
  sessionStorage.removeItem(K_SESSAO); localStorage.removeItem(K_SESSAO);
  if (!modoLocal()) limparDadosLocais(); // nada fica guardado no computador depois de sair
  location.reload();
}
function encerrar(msg) {
  sessionStorage.removeItem(K_SESSAO); localStorage.removeItem(K_SESSAO);
  if (!modoLocal()) limparDadosLocais();
  sessionStorage.setItem('inovacao_msg_login', msg || '');
  location.reload();
}

/* ---------------- carregar o site ---------------- */
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
let iniciado = false;
async function iniciar() {
  if (iniciado) return; iniciado = true;
  document.body.classList.remove('bloqueado');
  document.getElementById('login').hidden = true;
  montarTopo();
  await carregarApp();
  window.dispatchEvent(new Event('load-app'));
  aplicarPermissoes();
  setStatus(modoLocal() ? 'local' : contarPendentes() ? 'pendente' : 'ok');
  if (!modoLocal()) { iniciarAtualizacaoAoVivo(); if (contarPendentes()) enviar(); }
}
const iconeEngrenagem = '<svg viewBox="0 0 24 24" class="ico-topo"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const iconeSair = '<svg viewBox="0 0 24 24" class="ico-topo"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
function montarTopo() {
  const topo = document.querySelector('.topo-in'); if (!topo || document.getElementById('usuarioTopo')) return;
  topo.insertAdjacentHTML('beforeend', `<div class="usuario-topo" id="usuarioTopo">
    <div class="nuvem-status local" id="nuvemStatus"><i></i><span></span></div>
    <button type="button" class="btn-topo admin-only" id="btnAdmin" title="Administrativo">${iconeEngrenagem}<span>Administrativo</span></button>
    <button type="button" class="quem" id="btnQuem" title="Trocar minha senha"><b></b><small></small></button>
    <button type="button" class="btn-topo" id="btnSair" title="Sair">${iconeSair}<span>Sair</span></button></div>`);
  document.getElementById('btnSair').onclick = sair;
  document.getElementById('btnAdmin').onclick = abrirAdmin;
  document.getElementById('btnQuem').onclick = () => { if (!modoLocal()) abrirTrocaSenha(false); };
  atualizarTopo();
}
function atualizarTopo() {
  const q = document.getElementById('btnQuem'); if (!q || !sessao) return;
  $('b', q).textContent = sessao.usuario.nome || sessao.usuario.usuario; $('small', q).textContent = sessao.usuario.perfil + (modoLocal() ? ' · local' : '');
}

/* ---------------- login ---------------- */
function telaLogin() {
  const f = document.getElementById('loginForm'), msg = document.getElementById('loginMsg'), btn = document.getElementById('loginBtn');
  const aviso = sessionStorage.getItem('inovacao_msg_login'); if (aviso) { msg.textContent = aviso; sessionStorage.removeItem('inovacao_msg_login'); }
  if (modoLocal()) {
    f.insertAdjacentHTML('beforeend', `<div class="login-aviso"><b>Servidor ainda não configurado.</b> Só o administrador entra, e os dados ficam apenas neste navegador.
      <details><summary>Configurar servidor</summary><input id="loginApi" placeholder="https://treinamento-inovacao-casa.SEU-USUARIO.workers.dev"><button type="button" class="btn btn-sec" id="loginApiOk">Salvar endereço</button></details></div>`);
    document.getElementById('loginApiOk').onclick = () => { const v = document.getElementById('loginApi').value.trim(); if (/^https:\/\//.test(v)) { localStorage.setItem('inovacao_api_url', v); location.reload(); } else alert('Informe o endereço começando com https://'); };
  }
  f.addEventListener('submit', async e => {
    e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.firstChild.textContent = 'Entrando…';
    const usuario = document.getElementById('loginUsuario').value, senha = document.getElementById('loginSenha').value, manter = document.getElementById('loginManter').checked;
    try {
      if (modoLocal()) {
        if (normU(usuario) !== 'EMERSON' || senha !== '12345678') throw new Error('Usuário ou senha incorretos.');
        sessao = { token: '', usuario: { usuario: 'EMERSON', nome: 'Emerson', perfil: 'Administrador' }, permissoes: { abas: TODAS_ABAS, botoes: TODOS_BOTOES }, manter };
        salvarSessao(); await iniciar(); return;
      }
      const r = await api('POST', '/login', { usuario, senha, manter });
      // outro usuário neste computador: não mistura dados
      const anterior = lerJ('inovacao_ultimo_usuario', '');
      if (anterior && anterior !== r.usuario.usuario) limparDadosLocais();
      gravarJ('inovacao_ultimo_usuario', r.usuario.usuario);
      sessao = { token: r.token, usuario: r.usuario, permissoes: r.permissoes, manter };
      salvarSessao();
      if (r.usuario.trocarSenha) { abrirTrocaSenha(true, senha); return; }
      await entrarNoSite();
    } catch (err) { msg.textContent = err.message || 'Não foi possível entrar.'; document.getElementById('loginSenha').select(); }
    finally { btn.disabled = false; btn.firstChild.textContent = 'Entrar'; }
  });
  document.getElementById('loginUsuario').focus();
}
async function entrarNoSite() {
  // primeira entrada do administrador neste navegador: envia ao servidor o que já existia aqui
  if (ehAdmin() && !localStorage.getItem(K_MIGRADO)) {
    const p = pendentes(); let n = 0;
    for (const ds of LISTAS) { const l = p.listas[ds] = p.listas[ds] || { salvar: {}, apagar: {} }; (lerJ(DS[ds], []) || []).forEach(r => { if (r && r.id) { l.salvar[r.id] = r; n++; } }); }
    for (const v of VALORES) { const val = lerJ(DS[v], null); if (val !== null && val !== undefined && !(Array.isArray(val) && !val.length)) p.valores[v] = val; }
    gravarJ(K_PEND, p); setOrig.call(localStorage, K_MIGRADO, '1');
    if (n) toastN(`${n} registros deste navegador serão enviados ao servidor.`);
  }
  aplicarEstado(await api('GET', '/estado'));
  await iniciar();
}
async function retomarSessao() {
  const s = JSON.parse(sessionStorage.getItem(K_SESSAO) || localStorage.getItem(K_SESSAO) || 'null');
  if (!s) return false;
  sessao = s;
  if (modoLocal()) { if (s.token) return false; await iniciar(); return true; }
  try { aplicarEstado(await api('GET', '/estado')); }
  catch (e) {
    if (e.status === 403) { abrirTrocaSenha(true); return true; }
    if (!e.rede) return false;
    toastN('Sem conexão com o servidor: mostrando os últimos dados deste computador.');
  }
  await iniciar();
  return true;
}

/* ---------------- trocar senha ---------------- */
function abrirTrocaSenha(obrigatoria, senhaAtual) {
  const d = document.getElementById('dlgSenhaNova');
  document.getElementById('snTitulo').textContent = obrigatoria ? 'Crie uma senha nova para continuar' : 'Trocar minha senha';
  document.getElementById('snAtualCampo').hidden = !!senhaAtual;
  document.getElementById('snAtual').value = senhaAtual || '';
  document.getElementById('snNova').value = ''; document.getElementById('snConf').value = ''; document.getElementById('snMsg').textContent = '';
  document.getElementById('snCancelar').hidden = obrigatoria;
  d.dataset.obrigatoria = obrigatoria ? '1' : '';
  d.showModal(); setTimeout(() => document.getElementById(senhaAtual ? 'snNova' : 'snAtual').focus(), 50);
}
function ligarTrocaSenha() {
  const d = document.getElementById('dlgSenhaNova');
  d.addEventListener('cancel', e => { if (d.dataset.obrigatoria) e.preventDefault(); });
  document.getElementById('snForm').addEventListener('submit', async e => {
    if (e.submitter && e.submitter.value === 'cancelar') return;
    e.preventDefault();
    const m = document.getElementById('snMsg'), nova = document.getElementById('snNova').value;
    if (nova.length < 8) { m.textContent = 'A senha precisa ter ao menos 8 caracteres.'; return; }
    if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) { m.textContent = 'Use letras e números na senha.'; return; }
    if (nova !== document.getElementById('snConf').value) { m.textContent = 'A confirmação não confere.'; return; }
    try {
      const r = await api('POST', '/senha', { atual: document.getElementById('snAtual').value, nova });
      sessao.token = r.token; sessao.usuario.trocarSenha = false; salvarSessao();
      d.close(); toastN('Senha alterada.');
      if (!iniciado) await entrarNoSite();
    } catch (err) { m.textContent = err.message; }
  });
}

/* =========================================================
   PAINEL ADMINISTRATIVO
   ========================================================= */
function abrirAdmin() {
  if (!ehAdmin()) return;
  renderAdmin(modoLocal() ? 'servidor' : 'usuarios');
  document.getElementById('dlgAdmin').showModal();
}
async function renderAdmin(aba) {
  const corpo = document.getElementById('admCorpo');
  document.querySelectorAll('#admAbas button').forEach(b => b.classList.toggle('on', b.dataset.t === aba));
  if (modoLocal() && aba !== 'servidor') aba = 'servidor';
  if (aba === 'servidor') {
    const pend = contarPendentes();
    corpo.innerHTML = `<div class="adm-bloco"><h3>Servidor</h3>
      ${modoLocal() ? `<p>O servidor ainda não está configurado. Enquanto isso, os dados ficam só neste navegador e apenas o EMERSON entra.</p>
        <label class="campo"><span>Endereço do servidor (Cloudflare Worker)</span><input id="admApi" placeholder="https://treinamento-inovacao-casa.SEU-USUARIO.workers.dev"></label>
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="admApiOk">Conectar</button></div>`
      : `<p class="adm-ok">✓ Conectado a ${esc(API)}</p>
        <p class="dica">Usuários, senhas e permissões são conferidos no servidor. Cada perfil recebe só os dados que pode ver. Versão dos dados: ${versaoLocal} · alterações aguardando envio: ${pend}</p>
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="admPublicar">Publicar agora</button><button type="button" class="btn btn-sec" id="admPuxar">Buscar atualizações</button><button type="button" class="btn btn-sec" id="admMigrar">Enviar todos os dados deste navegador</button></div>`}
      <p class="msg" id="admMsg"></p></div>
      <div class="adm-bloco"><h3>Trazer dados do sistema anterior</h3>
        <p class="dica">Os cadastros feitos na versão anterior (que guardava os dados no GitHub) são trazidos para cá e enviados ao servidor. Use o usuário e a senha que você usava naquela versão.</p>
        <div class="adm-grade"><label class="campo"><span>Usuário anterior</span><input id="antUsuario" value="EMERSON"></label><label class="campo"><span>Senha anterior</span><input type="password" id="antSenha" autocomplete="off"></label></div>
        <div class="adm-acoes"><button type="button" class="btn btn-sec" id="antImportar">Importar dados anteriores</button></div><p class="msg" id="antMsg"></p></div>`;
    const m = document.getElementById('admMsg');
    document.getElementById('antImportar').onclick = async () => {
      const am = document.getElementById('antMsg'); am.textContent = 'Abrindo os dados anteriores…'; am.className = 'msg';
      try {
        const r = await importarAntigo(document.getElementById('antUsuario').value, document.getElementById('antSenha').value);
        am.innerHTML = `${r.n} registros trazidos${modoLocal() ? ' para este navegador (vão para o servidor quando ele for conectado)' : ' e enviados ao servidor'}.` + (r.usuarios.length ? `<br>Usuários da versão anterior para recriar na aba Usuários: <b>${r.usuarios.map(u => esc(u.usuario) + ' (' + esc(u.perfil) + ')').join(', ')}</b>` : '');
        am.className = 'msg ok';
        if (!modoLocal()) enviar();
      } catch (e) { am.textContent = e.message; am.className = 'msg erro'; }
    };
    if (modoLocal()) { document.getElementById('admApiOk').onclick = () => { const v = document.getElementById('admApi').value.trim(); if (!/^https:\/\//.test(v)) { m.textContent = 'O endereço precisa começar com https://'; m.className = 'msg erro'; return; } localStorage.setItem('inovacao_api_url', v); localStorage.removeItem(K_SESSAO); sessionStorage.removeItem(K_SESSAO); location.reload(); }; return; }
    document.getElementById('admPublicar').onclick = async () => { m.textContent = 'Publicando…'; m.className = 'msg'; const ok = await enviar(); await puxar(true).catch(() => {}); m.textContent = ok ? 'Publicado. Todos recebem em até 15 segundos.' : 'Não foi possível publicar: ' + statusSinc.msg; m.className = 'msg ' + (ok ? 'ok' : 'erro'); };
    document.getElementById('admPuxar').onclick = async () => { m.textContent = 'Buscando…'; await puxar(true).catch(e => { m.textContent = e.message; }); m.textContent = 'Atualizado.'; m.className = 'msg ok'; };
    document.getElementById('admMigrar').onclick = async () => {
      if (!confirm('Enviar ao servidor todos os registros que estão neste navegador? Registros iguais não são duplicados.')) return;
      localStorage.removeItem(K_MIGRADO); m.textContent = 'Enviando…'; await entrarNoSite().catch(() => {}); const ok = await enviar(); m.textContent = ok ? 'Dados enviados.' : 'Erro: ' + statusSinc.msg; m.className = 'msg ' + (ok ? 'ok' : 'erro');
    };
    return;
  }
  corpo.innerHTML = '<p class="dica">Carregando…</p>';
  if (aba === 'usuarios') {
    let lista = [];
    try { lista = (await api('GET', '/admin/usuarios')).usuarios; } catch (e) { corpo.innerHTML = `<p class="msg erro">${esc(e.message)}</p>`; return; }
    corpo.innerHTML = `
      <div class="adm-bloco"><h3>Novo usuário</h3>
        <div class="adm-grade">
          <label class="campo"><span>Usuário (login)</span><input id="nuUsuario" placeholder="Ex.: MARIA.SILVA" autocomplete="off"></label>
          <label class="campo"><span>Nome</span><input id="nuNome" placeholder="Nome para exibir"></label>
          <label class="campo"><span>Perfil</span><select id="nuPerfil">${PERFIS.map(p => `<option>${p}</option>`).join('')}</select></label>
          <label class="campo"><span>Senha provisória</span><input type="text" id="nuSenha" placeholder="Mínimo 8 caracteres" autocomplete="off"></label>
        </div>
        <p class="dica">No primeiro acesso a pessoa é obrigada a criar a própria senha.</p>
        <div class="adm-acoes"><button type="button" class="btn btn-pri" id="nuCriar">Criar usuário</button><span class="msg" id="nuMsg"></span></div></div>
      <div class="adm-bloco"><h3>Usuários (${lista.length})</h3>
        <table class="tabela adm-tab"><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map(u => { const eu = normU(u.usuario) === normU(sessao.usuario.usuario); return `<tr data-u="${esc(u.usuario)}"><td><b>${esc(u.usuario)}</b></td><td>${esc(u.nome)}</td>
          <td><select data-acao="perfil"${eu ? ' disabled' : ''}>${PERFIS.map(p => `<option${p === u.perfil ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
          <td>${u.ativo ? '<span class="tag bom">Ativo</span>' : '<span class="tag ruim">Desativado</span>'}${u.trocar_senha ? ' <span class="tag alerta">senha provisória</span>' : ''}</td>
          <td class="adm-bts"><button type="button" class="btn btn-sec btn-mini" data-acao="senha">Nova senha</button>${eu ? '' : `<button type="button" class="btn btn-sec btn-mini" data-acao="ativo">${u.ativo ? 'Desativar' : 'Ativar'}</button><button type="button" class="btn btn-perigo btn-mini" data-acao="excluir">Excluir</button>`}</td></tr>`; }).join('')}
        </tbody></table><p class="msg" id="usMsg"></p></div>`;
    document.getElementById('nuCriar').onclick = async () => {
      const m = document.getElementById('nuMsg');
      try {
        await api('POST', '/admin/usuarios', { usuario: document.getElementById('nuUsuario').value, nome: document.getElementById('nuNome').value, perfil: document.getElementById('nuPerfil').value, senha: document.getElementById('nuSenha').value });
        toastN('Usuário criado'); renderAdmin('usuarios');
      } catch (e) { m.textContent = e.message; m.className = 'msg erro'; }
    };
    corpo.querySelector('tbody').addEventListener('click', async e => {
      const b = e.target.closest('button[data-acao]'); if (!b) return;
      const usuario = b.closest('tr').dataset.u, m = document.getElementById('usMsg'), url = '/admin/usuarios/' + encodeURIComponent(usuario);
      try {
        if (b.dataset.acao === 'senha') { const s = prompt(`Senha provisória para ${usuario} (mínimo 8 caracteres). A pessoa terá que trocar no próximo acesso:`); if (!s) return; await api('PATCH', url, { senha: s }); m.textContent = `Senha de ${usuario} redefinida.`; m.className = 'msg ok'; }
        if (b.dataset.acao === 'ativo') { await api('PATCH', url, { ativo: b.textContent === 'Ativar' }); renderAdmin('usuarios'); }
        if (b.dataset.acao === 'excluir') { if (!confirm(`Excluir o usuário ${usuario}?`)) return; await api('DELETE', url); renderAdmin('usuarios'); }
      } catch (err) { m.textContent = err.message; m.className = 'msg erro'; }
    });
    corpo.querySelector('tbody').addEventListener('change', async e => {
      const s = e.target.closest('select[data-acao="perfil"]'); if (!s) return;
      try { await api('PATCH', '/admin/usuarios/' + encodeURIComponent(s.closest('tr').dataset.u), { perfil: s.value }); toastN('Perfil alterado'); } catch (err) { alert(err.message); }
    });
    return;
  }
  if (aba === 'permissoes') {
    let dados; try { dados = await api('GET', '/admin/permissoes'); } catch (e) { corpo.innerHTML = `<p class="msg erro">${esc(e.message)}</p>`; return; }
    const perfis = ['Treinamento', 'Supervisão', 'Gerência'];
    const atual = p => (dados.perfis || {})[p] || dados.padrao[p];
    const linha = (tipo, [k, t]) => `<tr><td>${t}</td>${perfis.map(p => `<td class="cel-ck"><input type="checkbox" data-p="${p}" data-tipo="${tipo}" data-k="${k}"${atual(p)[tipo].includes(k) ? ' checked' : ''}></td>`).join('')}</tr>`;
    corpo.innerHTML = `<div class="adm-bloco"><h3>O que cada perfil pode ver e fazer</h3>
      <p class="dica">Vale no servidor: quem não tem a guia não recebe aqueles dados, e quem não tem o botão não consegue gravar. O Administrador sempre vê tudo.</p>
      <table class="tabela adm-tab perm-tab"><thead><tr><th>Guias</th>${perfis.map(p => `<th class="cel-ck">${p}</th>`).join('')}</tr></thead><tbody>${ITENS.abas.map(i => linha('abas', i)).join('')}</tbody>
      <thead><tr><th>Botões e ações</th>${perfis.map(p => `<th class="cel-ck">${p}</th>`).join('')}</tr></thead><tbody>${ITENS.botoes.map(i => linha('botoes', i)).join('')}</tbody></table>
      <div class="adm-acoes"><button type="button" class="btn btn-pri" id="permSalvar">Salvar permissões</button><span class="msg" id="permMsg"></span></div></div>`;
    document.getElementById('permSalvar').onclick = async () => {
      const novo = {}; perfis.forEach(p => novo[p] = { abas: [], botoes: [] });
      corpo.querySelectorAll('input[data-p]').forEach(c => { if (c.checked) novo[c.dataset.p][c.dataset.tipo].push(c.dataset.k); });
      const m = document.getElementById('permMsg');
      try { await api('PUT', '/admin/permissoes', { perfis: novo }); m.textContent = 'Permissões salvas. Valem para todos na hora.'; m.className = 'msg ok'; } catch (e) { m.textContent = e.message; m.className = 'msg erro'; }
    };
    return;
  }
  if (aba === 'log') {
    let log = []; try { log = (await api('GET', '/admin/log')).log; } catch (e) { corpo.innerHTML = `<p class="msg erro">${esc(e.message)}</p>`; return; }
    const nomes = { login: 'Entrou', 'login-falhou': 'Senha errada', salvou: 'Salvou dados', 'trocou-senha': 'Trocou a senha', 'criou-usuario': 'Criou usuário', 'alterou-usuario': 'Alterou usuário', 'excluiu-usuario': 'Excluiu usuário', 'alterou-permissoes': 'Alterou permissões' };
    corpo.innerHTML = `<div class="adm-bloco"><h3>Últimos acessos e alterações</h3><table class="tabela adm-tab"><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
      ${log.map(l => `<tr><td>${new Date(l.quando).toLocaleString('pt-BR')}</td><td>${esc(l.usuario)}</td><td>${l.acao === 'login-falhou' ? '<span class="tag ruim">Senha errada</span>' : esc(nomes[l.acao] || l.acao)}</td><td>${esc(l.detalhe)}</td></tr>`).join('') || '<tr><td colspan="4" class="dica">Nada registrado ainda.</td></tr>'}</tbody></table></div>`;
  }
}

/* ---------------- importar do sistema anterior (arquivo criptografado no GitHub) ---------------- */
const deb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function importarAntigo(usuario, senha) {
  const pegar = async arq => { const r = await fetch(arq + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('Arquivo do sistema anterior não encontrado.'); return r.json(); };
  const acesso = await pegar('dados/acesso.json'), pkg = await pegar('dados/estado.json');
  const ent = (acesso.usuarios || []).find(u => normU(u.usuario) === normU(usuario));
  if (!ent) throw new Error('Usuário não encontrado no sistema anterior.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  const kSenha = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deb64(ent.sal), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let raw;
  try { raw = deb64(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(ent.iv) }, kSenha, deb64(ent.chave)))); }
  catch (e) { throw new Error('Senha do sistema anterior incorreta.'); }
  const kDados = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const est = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(pkg.iv) }, kDados, deb64(pkg.dados))));
  const d = est.datasets || {}; let n = 0;
  for (const ds of LISTAS) {
    const atual = lerJ(DS[ds], []) || [], mapa = new Map(atual.map(r => [r.id, r]));
    (d[ds] || []).forEach(r => { if (!r || !r.id) return; const x = mapa.get(r.id); if (!x || (r.atualizadoEm || '') > (x.atualizadoEm || '')) { mapa.set(r.id, r); n++; } });
    localStorage.setItem(DS[ds], JSON.stringify([...mapa.values()])); // passa pelo registro de pendentes
  }
  for (const v of ['quadro', 'supervisores', 'meta']) if (d[v] !== null && d[v] !== undefined) localStorage.setItem(DS[v], JSON.stringify(d[v]));
  if (d.bairros) { const b = lerJ(DS.bairros, {}) || {}; Object.entries(d.bairros).forEach(([c, l]) => b[c] = [...new Set([...(b[c] || []), ...l])]); localStorage.setItem(DS.bairros, JSON.stringify(b)); }
  const usuarios = ((est.config || {}).usuarios || []).filter(u => normU(u.usuario) !== 'EMERSON');
  window.dispatchEvent(new CustomEvent('dados-atualizados'));
  return { n, usuarios };
}

/* ---------------- API para os outros módulos ---------------- */
window.NUVEM = {
  usuario: () => sessao && { ...sessao.usuario }, ehAdmin, pode, permissoes,
  publicarAgora: () => enviar(), status: () => statusSinc, ativo: () => !modoLocal(), abrirAdmin
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#admAbas button').forEach(b => b.onclick = () => renderAdmin(b.dataset.t));
  ligarTrocaSenha();
  retomarSessao().then(ok => { if (!ok) telaLogin(); }).catch(e => { console.error(e); telaLogin(); });
});
})();
