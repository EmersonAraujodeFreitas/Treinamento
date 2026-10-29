/* =========================================================
   Inovação Casa · Treinamento — formação inicial call center
   Tudo roda no navegador; os dados ficam no localStorage.
   ========================================================= */
(function () {
'use strict';

/* ---------------- utilitários ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const escala10 = v => v === null || v === undefined || !isFinite(v) ? null : v > 10 ? v / 10 : v; // aceita nota de 0 a 10 ou de 0 a 100
const qual10 = v => v === null || v === undefined || !isFinite(v) ? null : v / 10; // qualidade é lançada em % (0 a 100,00)
const pctQ = v10 => v10 === null || v10 === undefined || !isFinite(v10) ? '—' : fmt(v10 * 10, 2) + '%';
const media = arr => { const a = arr.filter(v => v !== null && v !== undefined && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const fmt = (n, d = 1) => n === null || n === undefined || !isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 0) => n === null || !isFinite(n) ? '—' : fmt(n * 100, d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBR = s => s ? s.split('-').reverse().join('/') : '';
const cmpTxt = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600);
}
function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- armazenamento ---------------- */
const KEY = 'inovacao_treinamento_registros_v1';
const KEY_B = 'inovacao_treinamento_bairros_v1';
const KEY_META = 'inovacao_treinamento_meta_v1';
const ler = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Não foi possível salvar no navegador.'); } };
let registros = ler(KEY, []);
registros.forEach(r => { if (r.exemplo && (r.qualidade || []).length && r.qualidade.every(q => q.nota === null || q.nota <= 10)) r.qualidade.forEach(q => { if (q.nota !== null) q.nota = +(q.nota * 10).toFixed(2); }); });
registros.forEach(r => { if (r.provas || r.qualidade) { const n = notaCalculada(r.provas || [], r.qualidade || [], r.comportamental || {}); if (n !== null) r.notaFinal = n; } });
registros.forEach(r => { if (r.operacao && !['Captação', 'Permanência'].includes(r.operacao)) r.operacao = r.operacao === 'Serviços' || r.operacao === 'Rematrícula' ? 'Permanência' : ''; });
registros.forEach((r, i) => { if (r.exemplo && !r.instituicao) r.instituicao = i % 3 ? 'UVA' : 'Unijorge'; });
registros.forEach(r => { if (r.indicacao === 'Operação de vendas') r.indicacao = 'Captação'; else if (r.indicacao === 'Operação de não vendas') r.indicacao = 'Permanência'; });
let bairrosAprendidos = ler(KEY_B, {});
const salvarRegistros = () => { gravar(KEY, registros); $('#contBase').textContent = registros.length; };

/* ---------------- geografia ---------------- */
const MUN = window.BA_MUNICIPIOS || [];
const RMS = new Set(window.BA_RMS || []);
const MUN_NORM = new Map(MUN.map(m => [norm(m), m]));
function regiaoDe(cidade) {
  if (!cidade) return '';
  if (cidade === 'Salvador') return 'Salvador';
  return RMS.has(cidade) ? 'Região Metropolitana' : 'Interior';
}
function bairrosDaCidade(cidade) {
  const base = (window.BA_BAIRROS || {})[cidade] || [];
  const aprend = bairrosAprendidos[cidade] || [];
  const usados = registros.filter(r => r.cidade === cidade).map(r => r.bairro);
  const set = new Map();
  [...base, ...aprend, ...usados].forEach(b => { if (b && !set.has(norm(b))) set.set(norm(b), b); });
  if (!set.size) { set.set('centro', 'Centro'); set.set('zona rural', 'Zona rural'); }
  return [...set.values()].sort(cmpTxt);
}
function aprenderBairro(cidade, bairro) {
  if (!cidade || !bairro) return;
  const lista = bairrosDaCidade(cidade);
  if (lista.some(b => norm(b) === norm(bairro))) return;
  (bairrosAprendidos[cidade] = bairrosAprendidos[cidade] || []).push(bairro);
  gravar(KEY_B, bairrosAprendidos);
}


/* ---------------- reconhecer bairro digitado em outra base (BD da operação) ---------------- */
const ROMANOS = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x', 11: 'xi' };
const ALIAS_BAIRRO = { 'tancredo neves': 'Beiru/Tancredo Neves', 'beiru': 'Beiru/Tancredo Neves', 'matatu de brotas': 'Matatu', 'sao goncalo do retiro': 'São Gonçalo',
  'mussurunga i': 'Mussurunga', 'mussurunga ii': 'Mussurunga', 'engenho velho brotas': 'Engenho Velho de Brotas', 'stiep': 'Stiep', 'costa azul': 'Costa Azul' };
function nomeProprio(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
    .map((p, i) => i && /^(de|da|do|dos|das|e)$/.test(p) ? p : /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi)$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function acharBairro(texto, cidadePreferida) {
  let t = norm(texto).replace(/\./g, '. ').replace(/\s+/g, ' ').trim();
  if (!t || /^[-–—0]+$/.test(t)) return { cidade: '', bairro: '' };
  t = t.split(/\s*[\/|,]\s*/)[0];
  t = t.replace(/^eng\.?\s/, 'engenho ').replace(/\bjd\.?\s/g, 'jardim ').replace(/\bsto\.?\s/g, 'santo ').replace(/\bsta\.?\s/g, 'santa ').replace(/\bvl\.?\s/g, 'vila ').replace(/\bcj\.?\s/g, 'conjunto ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(\d{1,2})\b/g, (m, n) => ROMANOS[+n] || m);
  const cidades = [cidadePreferida, 'Salvador', ...Object.keys(window.BA_BAIRROS || {})].filter((c, i, a) => c && a.indexOf(c) === i);
  if (ALIAS_BAIRRO[t]) return { cidade: 'Salvador', bairro: ALIAS_BAIRRO[t] };
  for (const c of cidades) { const b = bairrosDaCidade(c).find(x => norm(x) === t); if (b) return { cidade: c, bairro: b }; }
  for (const c of cidades) { const b = bairrosDaCidade(c).find(x => { const n = norm(x); return n.length >= 5 && (t.startsWith(n + ' ') || n.split('/').some(p => p === t)); }); if (b) return { cidade: c, bairro: b }; }
  if (t.length >= 6) for (const c of cidades) { const b = bairrosDaCidade(c).find(x => distancia(norm(x), t) <= (t.length > 9 ? 2 : 1)); if (b) return { cidade: c, bairro: b }; }
  return { cidade: cidadePreferida || 'Salvador', bairro: nomeProprio(texto.split(/\s*[\/|]\s*/)[0]) };
}

/* ---------------- signo e idade ---------------- */
const SIGNOS = [
  ['Capricórnio', 1, 19], ['Aquário', 2, 18], ['Peixes', 3, 20], ['Áries', 4, 19], ['Touro', 5, 20], ['Gêmeos', 6, 20],
  ['Câncer', 7, 22], ['Leão', 8, 22], ['Virgem', 9, 22], ['Libra', 10, 22], ['Escorpião', 11, 21], ['Sagitário', 12, 21], ['Capricórnio', 12, 31]
];
const LISTA_SIGNOS = ['Áries', 'Touro', 'Gêmeos', 'Câncer', 'Leão', 'Virgem', 'Libra', 'Escorpião', 'Sagitário', 'Capricórnio', 'Aquário', 'Peixes'];
function signoDe(data) {
  if (!data) return '';
  const [, m, d] = data.split('-').map(Number);
  for (const [nome, mm, dd] of SIGNOS) if (m < mm || (m === mm && d <= dd)) return nome;
  return 'Capricórnio';
}
function idadeDe(data, ref) {
  if (!data) return null;
  const n = new Date(data + 'T12:00'), r = ref ? new Date(ref + 'T12:00') : new Date();
  let i = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) i--;
  return i >= 0 && i < 120 ? i : null;
}
const FAIXAS = [['Até 20 anos', 0, 20], ['21 a 24 anos', 21, 24], ['25 a 29 anos', 25, 29], ['30 a 39 anos', 30, 39], ['40 anos ou mais', 40, 200]];
const faixaDe = i => i === null ? '' : (FAIXAS.find(f => i >= f[1] && i <= f[2]) || [''])[0];
function diasUteis(a, b) {
  if (!a || !b || b < a) return null;
  let d = new Date(a + 'T12:00'), fim = new Date(b + 'T12:00'), n = 0;
  while (d <= fim) { const w = d.getDay(); if (w && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
}

/* ---------------- abas ---------------- */
const ULTIMA = { formacao: 'cadastro', ativos: 'at-cadastro' };
function abrirAba(nome) {
  const area = nome.startsWith('at-') ? 'ativos' : 'formacao';
  ULTIMA[area] = nome;
  $$('.area').forEach(b => b.classList.toggle('ativa', b.dataset.area === area));
  $$('.subbarra .abas').forEach(n => n.hidden = n.dataset.area !== area);
  $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === 'aba-' + nome));
  F('marcaSub').textContent = area === 'ativos' ? 'Colaboradores ativos · reciclagem e alinhamento' : 'Formação inicial · call center';
  if (nome === 'dashboard') renderDashboard();
  if (nome === 'base') renderBase();
  document.dispatchEvent(new CustomEvent('aba-aberta', { detail: nome }));
  history.replaceState(null, '', '#' + nome);
  window.scrollTo({ top: 0 });
}
$$('.aba').forEach(b => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
$$('.area').forEach(b => b.addEventListener('click', () => abrirAba(ULTIMA[b.dataset.area])));

/* =========================================================
   AUTOCOMPLETE
   ========================================================= */
function autocomplete(wrap, { fonte, aoEscolher, permitirNovo, rotuloNovo }) {
  const inp = $('input', wrap), ul = $('ul', wrap);
  let itens = [], ativo = -1;
  const destacar = (txt, q) => {
    if (!q) return esc(txt);
    const i = norm(txt).indexOf(q);
    return i < 0 ? esc(txt) : esc(txt.slice(0, i)) + '<mark>' + esc(txt.slice(i, i + q.length)) + '</mark>' + esc(txt.slice(i + q.length));
  };
  function abrir() {
    const q = norm(inp.value);
    const todos = fonte();
    let lista = q ? todos.filter(t => norm(t).includes(q)) : todos.slice();
    lista.sort((a, b) => (norm(a).startsWith(q) ? 0 : 1) - (norm(b).startsWith(q) ? 0 : 1) || cmpTxt(a, b));
    lista = lista.slice(0, 60);
    itens = lista.map(t => ({ v: t }));
    const exato = todos.some(t => norm(t) === q);
    if (permitirNovo && q && !exato) itens.push({ v: inp.value.trim(), novo: true });
    ul.innerHTML = itens.length
      ? itens.map((it, i) => it.novo
          ? `<li class="novo" data-i="${i}">+ ${rotuloNovo || 'Adicionar'} “${esc(it.v)}”</li>`
          : `<li data-i="${i}">${destacar(it.v, q)}</li>`).join('')
      : '<li class="sem">Nenhum resultado</li>';
    ativo = itens.length && q ? 0 : -1;
    marcar(); ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  function fechar() { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function marcar() { $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); const a = ul.children[ativo]; if (a) a.scrollIntoView({ block: 'nearest' }); }
  function escolher(i) { const it = itens[i]; if (!it) return; inp.value = it.v; fechar(); aoEscolher(it.v, !!it.novo); }
  inp.addEventListener('input', abrir);
  inp.addEventListener('focus', abrir);
  inp.addEventListener('keydown', e => {
    if (ul.hidden && (e.key === 'ArrowDown')) { abrir(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter') { if (!ul.hidden && ativo >= 0) { e.preventDefault(); escolher(ativo); } }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Tab' && !ul.hidden && ativo >= 0 && inp.value) escolher(ativo); fechar(); }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(+li.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(() => { fechar(); aoEscolher(inp.value.trim(), false, true); }, 120));
  return { fechar };
}

/* =========================================================
   FORMULÁRIO
   ========================================================= */
const F = id => document.getElementById(id);
LISTA_SIGNOS.forEach(s => F('signo').insertAdjacentHTML('beforeend', `<option>${s}</option>`));

// cidade
autocomplete($('#autoCidade'), {
  fonte: () => MUN,
  aoEscolher: (v, novo, blur) => {
    const real = MUN_NORM.get(norm(v));
    const inp = F('cidade');
    if (real) {
      const mudou = inp.dataset.ok !== real;
      inp.value = real; inp.dataset.ok = real; inp.classList.remove('invalido');
      F('dicaCidade').textContent = 'Bahia · ' + regiaoDe(real);
      F('regiao').value = regiaoDe(real);
      F('bairro').disabled = false; F('bairro').placeholder = 'Digite para buscar o bairro…';
      F('dicaBairro').textContent = bairrosDaCidade(real).length + ' bairros sugeridos em ' + real;
      if (mudou) { F('bairro').value = ''; if (!blur) F('bairro').focus(); }
    } else {
      inp.dataset.ok = ''; F('regiao').value = '';
      F('bairro').disabled = true; F('bairro').value = ''; F('bairro').placeholder = 'Escolha a cidade primeiro';
      if (v) { inp.classList.add('invalido'); F('dicaCidade').textContent = 'Escolha uma cidade da lista (Bahia)'; }
      else F('dicaCidade').textContent = '417 municípios da Bahia';
    }
  }
});
// bairro
autocomplete($('#autoBairro'), {
  fonte: () => bairrosDaCidade(F('cidade').dataset.ok),
  permitirNovo: true, rotuloNovo: 'Usar novo bairro',
  aoEscolher: v => {
    const lista = bairrosDaCidade(F('cidade').dataset.ok);
    const real = lista.find(b => norm(b) === norm(v));
    F('bairro').value = real || v.replace(/\s+/g, ' ');
    if (v) F('bairro').classList.remove('invalido');
  }
});

// telefone
F('telefone').addEventListener('input', e => {
  let d = e.target.value.replace(/\D/g, '').slice(0, 11);
  let s = d;
  if (d.length > 2) s = `(${d.slice(0, 2)}) ` + d.slice(2);
  if (d.length > 7) s = `(${d.slice(0, 2)}) ${d.slice(2, d.length === 11 ? 7 : 6)}-${d.slice(d.length === 11 ? 7 : 6)}`;
  e.target.value = s;
});

// nascimento -> idade e signo
F('nascimento').addEventListener('change', atualizarNascimento);
function atualizarNascimento() {
  const d = F('nascimento').value, i = idadeDe(d);
  F('idade').value = i === null ? '' : i + ' anos';
  F('signo').options[0].textContent = d ? 'Automático (' + signoDe(d) + ')' : 'Automático pela data';
}

// segmentados
$$('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  setSeg(seg.id, b.dataset.v);
}));
function setSeg(id, v) {
  const seg = F(id); seg.dataset.valor = v || '';
  $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === v));
  seg.classList.remove('invalido');
  if (id === 'atestado') {
    F('blocoAtestados').hidden = v !== 'Sim';
    if (v === 'Sim' && !$('#listaAtestados .linha')) addAtestado();
  }
}

// linhas dinâmicas
function linhaVazia(lista, txt) { if (!$('.linha', lista)) lista.innerHTML = `<div class="vazio-linha">${txt}</div>`; }
function renumerar(lista) { $$('.linha', lista).forEach((l, i) => $('.idx', l).textContent = i + 1); }
const BTN_X = '<button type="button" class="btn-icone" title="Remover" aria-label="Remover">' + G.ic('trash', '') + '</button>';
function addProva(p = {}) {
  const l = F('listaProvas'); $('.vazio-linha', l)?.remove();
  const n = $$('.linha', l).length + 1;
  l.insertAdjacentHTML('beforeend', `<div class="linha linha-prova"><span class="idx">${n}</span>
    <input class="p-nome" placeholder="Tema da prova (ex.: Produto, Sistemas, Script)" value="${esc(p.nome || '')}">
    <input class="p-data" type="date" value="${esc(p.data || '')}" title="Data da prova">
    <input class="p-nota" type="number" min="0" max="100" step="0.1" placeholder="Nota (0–10 ou 0–100)" value="${p.nota ?? ''}">${BTN_X}</div>`);
}
function addQualidade(q = {}) {
  const l = F('listaQualidade'); $('.vazio-linha', l)?.remove();
  const n = $$('.linha', l).length + 1;
  l.insertAdjacentHTML('beforeend', `<div class="linha linha-qual"><span class="idx">${n}</span>
    <input class="q-data" type="date" value="${esc(q.data || '')}" title="Data da monitoria">
    <span class="campo-pct"><input class="q-nota" inputmode="decimal" placeholder="0,00" value="${q.nota === null || q.nota === undefined ? '' : fmt(q.nota, 2)}"><b>%</b></span>${BTN_X}</div>`);
}
function addAtestado(a = {}) {
  const l = F('listaAtestados'); $('.vazio-linha', l)?.remove();
  const n = $$('.linha', l).length + 1;
  l.insertAdjacentHTML('beforeend', `<div class="linha linha-at"><span class="idx">${n}</span>
    <input class="a-data" type="date" value="${esc(a.data || '')}" title="Qual dia foi">
    <input class="a-dias" type="number" min="1" step="1" placeholder="Dias" value="${a.dias ?? ''}" title="Dias de afastamento">
    <input class="a-obs" placeholder="Observação (opcional)" value="${esc(a.obs || '')}">${BTN_X}</div>`);
}
F('addProva').onclick = () => { addProva(); $('#listaProvas .linha:last-child .p-nome').focus(); };
F('addQualidade').onclick = () => { addQualidade(); $('#listaQualidade .linha:last-child .q-data').focus(); };
F('addAtestado').onclick = () => { addAtestado(); $('#listaAtestados .linha:last-child .a-data').focus(); };
['listaProvas', 'listaQualidade', 'listaAtestados'].forEach(id => F(id).addEventListener('click', e => {
  if (!e.target.closest('.btn-icone')) return;
  e.target.closest('.linha').remove(); renumerar(F(id));
  linhaVazia(F(id), id === 'listaAtestados' ? 'Nenhum atestado informado.' : id === 'listaProvas' ? 'Nenhuma prova lançada.' : 'Nenhuma monitoria lançada.');
  atualizarResumo();
}));

// comportamental
const COMPORT = [['comunicacao', 'Comunicação'], ['postura', 'Postura e ética'], ['pontualidade', 'Pontualidade'], ['engajamento', 'Engajamento'], ['aprendizado', 'Facilidade de aprendizado']];
F('comportamental').innerHTML = COMPORT.map(([k, t]) => `<div class="estrelas"><span>${t}</span><div class="escala" data-k="${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div>`).join('');
F('comportamental').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const esc_ = b.parentElement, atual = esc_.dataset.v;
  esc_.dataset.v = atual === b.dataset.n ? '' : b.dataset.n;
  $$('button', esc_).forEach(x => x.classList.toggle('on', x.dataset.n === esc_.dataset.v));
  atualizarResumo();
});

// resumo e nota final
function lerProvas() { return $$('#listaProvas .linha').map(l => ({ nome: $('.p-nome', l).value.trim(), data: $('.p-data', l).value, nota: num($('.p-nota', l).value) })).filter(p => p.nome || p.data || p.nota !== null); }
function lerQualidade() { return $$('#listaQualidade .linha').map(l => ({ data: $('.q-data', l).value, nota: num($('.q-nota', l).value) })).filter(q => q.data || q.nota !== null); }
function lerAtestados() { return $$('#listaAtestados .linha').map(l => ({ data: $('.a-data', l).value, dias: num($('.a-dias', l).value), obs: $('.a-obs', l).value.trim() })).filter(a => a.data || a.dias || a.obs); }
function lerComport() { const o = {}; $$('#comportamental .escala').forEach(e => { if (e.dataset.v) o[e.dataset.k] = +e.dataset.v; }); return o; }
function partesNota(provas, qual, comp) {
  const mp = media(provas.map(p => escala10(p.nota))), mq = media(qual.map(q => qual10(q.nota)));
  const mc = media(Object.values(comp || {}));
  return [['Provas', mp, .6], ['Qualidade', mq, .3], ['Comportamental', mc === null ? null : mc * 2, .1]];
}
function notaCalculada(provas, qual, comp) {
  const partes = partesNota(provas, qual, comp).filter(p => p[1] !== null);
  if (!partes.length) return null;
  const pesos = partes.reduce((s, p) => s + p[2], 0);
  return Math.round(partes.reduce((s, p) => s + p[1] * p[2], 0) / pesos * 10) / 10;
}
function atualizarResumo() {
  const pv = lerProvas(), q = lerQualidade(), c = lerComport();
  const partes = partesNota(pv, q, c);
  F('rMediaProvas').textContent = fmt(partes[0][1]);
  F('rMediaQual').textContent = pctQ(partes[1][1]);
  const mc = media(Object.values(c)); F('rComport').textContent = mc === null ? '—' : fmt(mc) + ' / 5';
  const n = notaCalculada(pv, q, c);
  F('notaFinal').value = n === null ? '' : fmt(n);
  F('notaFinal').dataset.valor = n ?? '';
  const usadas = partes.filter(p => p[1] !== null);
  const pesos = usadas.reduce((s, p) => s + p[2], 0);
  F('formulaNota').textContent = usadas.length
    ? usadas.map(p => `${p[0]} ${p[0] === 'Qualidade' ? pctQ(p[1]) + ' (' + fmt(p[1]) + ')' : fmt(p[1])} × ${fmt(p[2] / pesos * 100, 0)}%`).join(' + ') + (n === null ? '' : ` = ${fmt(n)}`)
    : 'Lance as notas das provas e da qualidade para calcular.';
  atualizarFrequencia();
}
function atualizarFrequencia() {
  const dias = diasUteis(F('dataInicio').value, F('dataFim').value || null);
  const faltas = num(F('faltas').value) || 0;
  F('frequencia').value = dias ? fmt(Math.max(0, (dias - faltas) / dias) * 100, 0) + '% de ' + dias + ' dias' : '';
}
['dataInicio', 'dataFim', 'faltas'].forEach(id => F(id).addEventListener('input', atualizarFrequencia));
F('form').addEventListener('input', e => { if (e.target.closest('#listaProvas,#listaQualidade')) atualizarResumo(); });
F('listaQualidade').addEventListener('input', e => { if (!e.target.classList.contains('q-nota')) return; const v = e.target.value; const limpo = v.replace(/[^\d,.]/g, ''); if (limpo !== v) e.target.value = limpo; const n = num(limpo); e.target.classList.toggle('invalido', n !== null && (n < 0 || n > 100)); });
F('listaQualidade').addEventListener('focusout', e => { if (!e.target.classList.contains('q-nota')) return; const n = num(e.target.value); if (n !== null && n >= 0 && n <= 100) e.target.value = fmt(n, 2); });

// datalists de turma / instrutor
function atualizarDatalists() {
  const uniq = k => [...new Set(registros.map(r => r[k]).filter(Boolean))].sort(cmpTxt);
  F('listaTurmas').innerHTML = uniq('turma').map(t => `<option value="${esc(t)}">`).join('');
  F('listaInstrutores').innerHTML = uniq('instrutor').map(t => `<option value="${esc(t)}">`).join('');
}
// ao escolher uma turma existente, puxa datas e instrutor
F('turma').addEventListener('change', () => {
  const r = registros.find(x => x.turma === F('turma').value.trim()); if (!r || F('id').value) return;
  ['dataInicio', 'dataFim', 'instrutor', 'instituicao', 'operacao', 'turnoTurma', 'modalidade'].forEach(k => { if (!F(k).value && r[k]) F(k).value = r[k]; });
  atualizarFrequencia();
});

function msg(t, tipo) { const m = F('msgForm'); m.textContent = t; m.className = 'msg ' + (tipo || ''); }

const CAMPOS = ['turma', 'dataInicio', 'dataFim', 'instrutor', 'instituicao', 'operacao', 'turnoTurma', 'modalidade', 'nome', 'email', 'telefone', 'nascimento', 'escolaridade',
  'deslocamento', 'transporte', 'experiencia', 'expVendas', 'origemVaga', 'equipamento', 'faltas', 'atrasos', 'status', 'dataHabilitacao', 'indicacao', 'potencial', 'observacoes'];

function limparForm() {
  F('form').reset(); F('id').value = '';
  F('cidade').dataset.ok = ''; F('bairro').disabled = true; F('bairro').placeholder = 'Escolha a cidade primeiro';
  F('dicaCidade').textContent = '417 municípios da Bahia'; F('dicaBairro').textContent = 'Vinculado à cidade escolhida';
  setSeg('perfil', ''); setSeg('atestado', '');
  ['listaProvas', 'listaQualidade', 'listaAtestados'].forEach(id => F(id).innerHTML = '');
  for (let i = 0; i < 3; i++) addProva(); for (let i = 0; i < 3; i++) addQualidade();
  $$('#comportamental .escala').forEach(e => { e.dataset.v = ''; $$('button', e).forEach(b => b.classList.remove('on')); });
  $$('.invalido').forEach(e => e.classList.remove('invalido'));
  F('modoEdicao').hidden = true; F('salvarTxt').textContent = 'Salvar cadastro'; F('btnNovo').lastChild.textContent = 'Novo cadastro';
  atualizarNascimento(); atualizarResumo(); msg('');
}
function preencherForm(r) {
  limparForm();
  F('id').value = r.id;
  CAMPOS.forEach(k => { if (F(k)) F(k).value = r[k] ?? ''; });
  F('signo').value = r.signoManual ? r.signo : '';
  F('cidade').value = r.cidade || ''; F('cidade').dataset.ok = MUN_NORM.get(norm(r.cidade)) || '';
  F('regiao').value = regiaoDe(r.cidade);
  F('bairro').disabled = !F('cidade').dataset.ok; F('bairro').value = r.bairro || '';
  setSeg('perfil', r.perfil); setSeg('atestado', r.atestado);
  ['listaProvas', 'listaQualidade', 'listaAtestados'].forEach(id => F(id).innerHTML = '');
  (r.provas || []).forEach(addProva); if (!(r.provas || []).length) addProva();
  (r.qualidade || []).forEach(addQualidade); if (!(r.qualidade || []).length) addQualidade();
  (r.atestados || []).forEach(addAtestado);
  if (r.atestado === 'Sim' && !(r.atestados || []).length) addAtestado();
  Object.entries(r.comportamental || {}).forEach(([k, v]) => { const e = $(`#comportamental .escala[data-k="${k}"]`); if (e) { e.dataset.v = String(v); $$('button', e).forEach(b => b.classList.toggle('on', b.dataset.n === String(v))); } });
  F('modoEdicao').hidden = false; F('modoTxt').textContent = 'Editando: ' + (r.nome || '').split(' ').slice(0, 2).join(' ');
  F('salvarTxt').textContent = 'Salvar alterações'; F('btnNovo').lastChild.textContent = 'Cancelar edição';
  atualizarNascimento(); atualizarResumo();
}

F('btnLimpar').onclick = () => limparForm();
F('btnNovo').onclick = () => { limparForm(); F('turma').focus(); };

F('form').addEventListener('submit', e => {
  e.preventDefault();
  $$('.invalido').forEach(x => x.classList.remove('invalido'));
  const erros = [];
  const exigir = (id, ok, txt) => { if (!ok) { F(id).classList.add('invalido'); erros.push([id, txt]); } };
  exigir('turma', F('turma').value.trim(), 'código da turma');
  exigir('instituicao', F('instituicao').value, 'instituição (UVA ou Unijorge)');
  exigir('operacao', F('operacao').value, 'operação (Captação ou Permanência)');
  exigir('dataInicio', F('dataInicio').value, 'início do treinamento');
  exigir('nome', F('nome').value.trim().split(/\s+/).length >= 2, 'nome completo');
  exigir('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(F('email').value.trim()), 'e-mail válido');
  exigir('telefone', F('telefone').value.replace(/\D/g, '').length >= 10, 'telefone com DDD');
  exigir('nascimento', idadeDe(F('nascimento').value) >= 14, 'data de nascimento');
  exigir('cidade', F('cidade').dataset.ok, 'cidade da Bahia');
  exigir('bairro', F('bairro').value.trim(), 'bairro');
  exigir('perfil', F('perfil').dataset.valor, 'perfil do consultor');
  exigir('atestado', F('atestado').dataset.valor, 'se apresentou atestado');
  atualizarResumo();
  const nf = num(F('notaFinal').dataset.valor);
  exigir('notaFinal', nf !== null, 'notas das provas ou da qualidade (para calcular a nota final)');
  exigir('status', F('status').value, 'situação final');
  const provas = lerProvas(), qual = lerQualidade(), atest = lerAtestados();
  if (provas.some(x => x.nota !== null && (x.nota < 0 || x.nota > 100))) erros.push(['listaProvas', 'notas das provas entre 0 e 10 (ou 0 e 100)']);
  if (qual.some(x => x.nota !== null && (x.nota < 0 || x.nota > 100))) erros.push(['listaQualidade', 'notas da qualidade entre 0,00% e 100,00%']);
  if (F('atestado').dataset.valor === 'Sim' && !atest.some(a => a.data)) erros.push(['listaAtestados', 'dia do atestado']);
  if (erros.length) {
    msg('Confira: ' + erros.map(x => x[1]).join(', ') + '.', 'erro');
    const alvo = F(erros[0][0]); alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (alvo.focus) alvo.focus({ preventScroll: true });
    return;
  }
  const email = F('email').value.trim().toLowerCase();
  const idAtual = F('id').value;
  const dup = registros.find(r => r.email === email && r.turma === F('turma').value.trim() && r.id !== idAtual);
  if (dup && !confirm(`Já existe um cadastro de ${dup.nome} com este e-mail nesta turma. Salvar mesmo assim?`)) return;

  const r = idAtual ? registros.find(x => x.id === idAtual) : { id: uid(), criadoEm: new Date().toISOString() };
  CAMPOS.forEach(k => r[k] = F(k).value.trim());
  r.email = email; r.faltas = num(r.faltas) || 0; r.atrasos = num(r.atrasos) || 0;
  r.estado = 'BA'; r.cidade = F('cidade').dataset.ok; r.bairro = F('bairro').value.trim(); r.regiao = regiaoDe(r.cidade);
  r.signoManual = !!F('signo').value; r.signo = F('signo').value || signoDe(r.nascimento);
  r.perfil = F('perfil').dataset.valor; r.atestado = F('atestado').dataset.valor;
  r.atestados = r.atestado === 'Sim' ? atest : [];
  r.provas = provas; r.qualidade = qual; r.comportamental = lerComport();
  r.notaFinal = nf; r.notaAuto = true;
  r.atualizadoEm = new Date().toISOString();
  delete r.exemplo;
  if (!idAtual) registros.push(r);
  aprenderBairro(r.cidade, r.bairro);
  salvarRegistros(); atualizarDatalists();
  const turma = r.turma, ini = r.dataInicio, fim = r.dataFim, instr = r.instrutor, inst = r.instituicao, op = r.operacao, tt = r.turnoTurma, mod = r.modalidade;
  if (idAtual) { preencherForm(r); msg('Alterações salvas. Você pode continuar editando ou buscar outro cadastro.', 'ok'); toast('Cadastro atualizado'); return; }
  limparForm();
  if (!idAtual) { F('turma').value = turma; F('dataInicio').value = ini; F('dataFim').value = fim; F('instrutor').value = instr; F('instituicao').value = inst; F('operacao').value = op; F('turnoTurma').value = tt; F('modalidade').value = mod; atualizarFrequencia(); }
  msg(idAtual ? 'Alterações salvas.' : `Cadastro de ${r.nome.split(' ')[0]} salvo. A turma foi mantida para o próximo.`, 'ok');
  toast(idAtual ? 'Cadastro atualizado' : 'Cadastro salvo');
  F('nome').focus();
});

/* =========================================================
   DASHBOARD
   ========================================================= */
const ESTADO = { filtros: {}, ordBairro: { k: 'nota', asc: false }, ordBase: { k: 'atualizadoEm', asc: false } };
F('meta').value = ler(KEY_META, 7);
F('meta').addEventListener('input', () => { gravar(KEY_META, num(F('meta').value) ?? 7); renderDashboard(); });
const meta = () => num(F('meta').value) ?? 7;
const CONCLUIDOS = new Set(['Aprovado', 'Reprovado', 'Desistente', 'Desligado']);
const ehSsa = r => r.cidade === 'Salvador';

function enriquecer(r) {
  const idade = idadeDe(r.nascimento, r.dataInicio || null);
  return { ...r, _idade: idade, _faixa: faixaDe(idade), _mProvas: media((r.provas || []).map(p => escala10(p.nota))), _mQual: media((r.qualidade || []).map(q => qual10(q.nota))), _regiao: regiaoDe(r.cidade) };
}
function aplicaFiltros(lista, ignorar) {
  const f = ESTADO.filtros;
  return lista.filter(r => {
    if (f.turma && r.turma !== f.turma) return false;
    if (f.de && (r.dataInicio || '') < f.de) return false;
    if (f.ate && (r.dataInicio || '') > f.ate) return false;
    if (f.abrangencia === 'ssa' && !ehSsa(r)) return false;
    if (f.abrangencia === 'fora' && ehSsa(r)) return false;
    if (f.abrangencia === 'rms' && r._regiao !== 'Região Metropolitana') return false;
    if (f.abrangencia === 'int' && r._regiao !== 'Interior') return false;
    if (ignorar !== 'cidade' && f.cidade && r.cidade !== f.cidade) return false;
    if (ignorar !== 'bairro' && ignorar !== 'cidade' && f.bairro && r.bairro !== f.bairro) return false;
    if (f.perfil && r.perfil !== f.perfil) return false;
    if (f.instituicao && r.instituicao !== f.instituicao) return false;
    if (f.operacao && r.operacao !== f.operacao) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.atestado && r.atestado !== f.atestado) return false;
    if (f.faixa && r._faixa !== f.faixa) return false;
    if (f.signo && r.signo !== f.signo) return false;
    return true;
  });
}
function opcoes(sel, valores, rotuloTodos) {
  const atual = ESTADO.filtros[sel.dataset.f] || '';
  sel.innerHTML = `<option value="">${rotuloTodos}</option>` + valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  sel.value = valores.includes(atual) ? atual : '';
}
function montarFiltros(base) {
  const fsel = k => $(`#filtros [data-f="${k}"]`);
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort(cmpTxt);
  opcoes(fsel('turma'), uniq(base.map(r => r.turma)), 'Todas');
  const semCidade = aplicaFiltros(base, 'cidade');
  opcoes(fsel('cidade'), uniq(semCidade.map(r => r.cidade)), 'Todas');
  ESTADO.filtros.cidade = fsel('cidade').value;
  const semBairro = aplicaFiltros(base, 'bairro');
  opcoes(fsel('bairro'), uniq(semBairro.map(r => r.bairro)), 'Todos');
  ESTADO.filtros.bairro = fsel('bairro').value;
  opcoes(fsel('status'), ['Em treinamento', 'Aprovado', 'Reprovado', 'Desistente', 'Desligado'], 'Todas');
  opcoes(fsel('faixa'), FAIXAS.map(f => f[0]), 'Todas');
  opcoes(fsel('signo'), LISTA_SIGNOS, 'Todos');
  $$('#filtros [data-f]').forEach(el => el.classList.toggle('ativo', !!el.value));
}
$('#filtros').addEventListener('change', e => {
  const el = e.target.closest('[data-f]'); if (!el) return;
  ESTADO.filtros[el.dataset.f] = el.value;
  if (el.dataset.f === 'cidade' || el.dataset.f === 'abrangencia') ESTADO.filtros.bairro = '';
  if (el.dataset.f === 'abrangencia') ESTADO.filtros.cidade = '';
  renderDashboard();
});
F('limparFiltros').onclick = () => { ESTADO.filtros = {}; $$('#filtros [data-f]').forEach(el => el.value = ''); renderDashboard(); };
F('btnExemploDash').hidden = false;

function resumo(lista) {
  const conc = lista.filter(r => CONCLUIDOS.has(r.status));
  return {
    n: lista.length,
    nota: media(lista.map(r => r.notaFinal)),
    provas: media(lista.map(r => r._mProvas)),
    qual: media(lista.map(r => r._mQual)),
    aprov: conc.length ? conc.filter(r => r.status === 'Aprovado').length / conc.length : null,
    nConc: conc.length,
    atest: lista.length ? lista.filter(r => r.atestado === 'Sim').length / lista.length : null,
    faltas: media(lista.map(r => r.faltas || 0)),
    naMeta: lista.length ? lista.filter(r => (r.notaFinal ?? -1) >= meta()).length / lista.length : null,
    vendas: lista.length ? lista.filter(r => r.perfil === 'Vendas').length / lista.length : null,
  };
}
function agrupar(lista, chave) {
  const m = new Map();
  lista.forEach(r => { const k = chave(r); if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(r); });
  return m;
}

const COR = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#6250d6' };
const COR_STATUS = { 'Em treinamento': ['#2a78d6', 'clock'], 'Aprovado': ['#0ca30c', 'check'], 'Reprovado': ['#d03b3b', 'alert'], 'Desistente': ['#eda100', 'down'], 'Desligado': ['#ec835a', 'trash'] };
const METRICAS_DUELO = [['Nota final', 'nota', 10, 'award'], ['Média das provas', 'provas', 10, 'exam'], ['Média da qualidade', 'qual', 10, 'headset', 'q'], ['Aprovação', 'aprov', 1, 'check', true]];
const tipH = (titulo, linhas) => `<b>${esc(titulo)}</b>` + linhas.map(l => `<br>${esc(l)}`).join('');
function animarNumeros(raiz) {
  $$('[data-conta]', raiz).forEach(el => {
    const alvo = +el.dataset.conta, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || '';
    if (!isFinite(alvo)) return;
    const t0 = performance.now(), dur = 900;
    const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(alvo * e, dec) + suf; if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

function renderDashboard() {
  const base = registros.map(enriquecer);
  montarFiltros(base);
  const lista = aplicaFiltros(base);
  const temFiltro = Object.values(ESTADO.filtros).some(Boolean);
  F('dashResumoFiltro').textContent = temFiltro ? `${lista.length} de ${base.length} treinandos com os filtros aplicados` : `${base.length} treinandos cadastrados`;
  F('dashVazio').hidden = lista.length > 0;
  F('dashConteudo').hidden = lista.length === 0;
  if (!lista.length) { $('#dashVazio b').textContent = base.length ? 'Nenhum treinando com esses filtros.' : 'Nenhum treinando cadastrado ainda.'; F('btnExemploDash').hidden = !!base.length; return; }
  const M = meta(), R = resumo(lista);

  // KPIs
  const bairrosUnicos = new Set(lista.map(r => r.cidade + '|' + r.bairro)).size;
  const turmas = new Set(lista.map(r => r.turma)).size;
  const kpi = (t, icone, cor, valor, dec, suf, sub, barra, destaque) => `<div class="kpi${destaque ? ' destaque' : ''}" style="--c:${cor}">
    <div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(icone)}</span></div>
    <b ${valor === null ? '' : `data-conta="${valor}" data-dec="${dec}" data-suf="${suf}"`}>${valor === null ? '—' : fmt(0, dec) + suf}</b>
    ${barra !== undefined ? `<div class="kpi-bar"><i style="--w:${Math.max(0, Math.min(100, (barra || 0) * 100))}%"></i></div>` : ''}<small>${sub}</small></div>`;
  F('kpis').innerHTML = [
    kpi('Treinandos', 'users', '#22c3a6', R.n, 0, '', `${turmas} turma${turmas > 1 ? 's' : ''} · ${bairrosUnicos} bairros`, undefined, true),
    kpi('Nota final média', 'award', COR.s1, R.nota, 1, '', `${pct(R.naMeta)} na meta (${fmt(M)})`, R.nota === null ? 0 : R.nota / 10),
    kpi('Taxa de aprovação', 'check', '#0ca30c', R.aprov === null ? null : R.aprov * 100, 0, '%', `${R.nConc} com resultado final`, R.aprov),
    kpi('Média das provas', 'exam', COR.s4, R.provas, 1, '', 'provas do treinamento', R.provas === null ? 0 : R.provas / 10),
    kpi('Média da qualidade', 'headset', COR.s3, R.qual === null ? null : R.qual * 10, 2, '%', 'últimas monitorias', R.qual === null ? 0 : R.qual / 10),
    kpi('Com atestado', 'medical', COR.s2, R.atest === null ? null : R.atest * 100, 0, '%', `faltas: ${fmt(R.faltas)} em média`, R.atest),
    kpi('Perfil de vendas', 'briefcase', '#e87ba4', R.vendas === null ? null : R.vendas * 100, 0, '%', `${pct(R.vendas === null ? null : 1 - R.vendas)} não vendas`, R.vendas),
  ].join('');
  animarNumeros(F('kpis'));

  // por bairro
  const porBairro = [...agrupar(lista, r => r.bairro ? r.cidade + '|' + r.bairro : '').entries()].map(([k, rs]) => {
    const [cidade, bairro] = k.split('|'); return { cidade, bairro, regiao: regiaoDe(cidade), ...resumo(rs) };
  });
  const minA = +F('minAmostra').value;
  const elegiveis = porBairro.filter(b => b.n >= minA && b.nota !== null);

  // insights
  const ins = [];
  const ord = elegiveis.slice().sort((a, b) => b.nota - a.nota);
  if (ord.length) {
    const m = ord[0], p = ord[ord.length - 1];
    ins.push(['bom', 'trophy', 'Melhor bairro', `${m.bairro} · ${m.cidade}`, `Nota final ${fmt(m.nota)} com ${m.n} treinandos · aprovação ${pct(m.aprov)}`]);
    if (ord.length > 1) ins.push(['ruim', 'down', 'Bairro com menor nota', `${p.bairro} · ${p.cidade}`, `Nota final ${fmt(p.nota)} com ${p.n} treinandos · aprovação ${pct(p.aprov)}`]);
  }
  const abaixo = elegiveis.filter(b => +b.nota.toFixed(1) < M);
  ins.push([abaixo.length ? 'alerta' : 'bom', abaixo.length ? 'alert' : 'target', 'Bairros abaixo da meta', `${abaixo.length} de ${elegiveis.length} bairros`, abaixo.length ? abaixo.sort((a, b) => a.nota - b.nota).slice(0, 4).map(b => b.bairro).join(', ') + (abaixo.length > 4 ? '…' : '') : `Todos com nota final ≥ ${fmt(M)} (mín. ${minA} treinandos)`]);
  const ssa = resumo(lista.filter(ehSsa)), fora = resumo(lista.filter(r => !ehSsa(r)));
  if (ssa.n && fora.n) { const d = ssa.nota - fora.nota; ins.push(['', 'scale', 'Salvador × fora', d >= 0 ? `Salvador ${fmt(Math.abs(d))} pt acima` : `Fora de Salvador ${fmt(Math.abs(d))} pt acima`, `Salvador ${fmt(ssa.nota)} (${ssa.n}) · fora ${fmt(fora.nota)} (${fora.n})`]); }
  const cA = resumo(lista.filter(r => r.atestado === 'Sim')), sA = resumo(lista.filter(r => r.atestado === 'Não'));
  if (cA.n && sA.n) ins.push([cA.nota < sA.nota ? 'alerta' : '', 'medical', 'Efeito do atestado', `${fmt(Math.abs(cA.nota - sA.nota))} pt ${cA.nota < sA.nota ? 'a menos' : 'a mais'} com atestado`, `Com atestado ${fmt(cA.nota)} (${cA.n}) · sem ${fmt(sA.nota)} (${sA.n})`]);
  F('insights').innerHTML = ins.map(([c, icone, t, b, p], i) => `<div class="insight ${c}" style="--d:${i * 70}ms"><span class="ins-ic">${G.ic(icone)}</span><div><span>${t}</span><b>${esc(b)}</b><p>${esc(p)}</p></div></div>`).join('');

  // comparativos
  G.duelo(F('comparativo'), [ssa, fora], ['Salvador', 'Fora de Salvador'], METRICAS_DUELO, [COR.s1, COR.s2]);
  G.duelo(F('compInst'), [resumo(lista.filter(r => r.instituicao === 'UVA')), resumo(lista.filter(r => r.instituicao === 'Unijorge'))], ['UVA', 'Unijorge'], METRICAS_DUELO, [COR.s1, COR.s4], ['building', 'building']);
  G.duelo(F('compOper'), [resumo(lista.filter(r => r.operacao === 'Captação')), resumo(lista.filter(r => r.operacao === 'Permanência'))], ['Captação', 'Permanência'], METRICAS_DUELO, [COR.s1, COR.s2], ['briefcase', 'headset']);
  G.duelo(F('compPerfil'), [resumo(lista.filter(r => r.perfil === 'Vendas')), resumo(lista.filter(r => r.perfil === 'Não vendas'))], ['Vendas', 'Não vendas'], METRICAS_DUELO, [COR.s1, COR.s2], ['briefcase', 'headset']);
  G.duelo(F('compAtestado'), [cA, sA], ['Com atestado', 'Sem atestado'], METRICAS_DUELO, [COR.s2, COR.s1], ['medical', 'check']);

  // ranking de bairros
  const rk = ord.slice(0, +F('topN').value);
  G.ranking(F('gRanking'), rk.map(b => ({
    rotulo: b.bairro, sub: `${b.cidade} · ${b.n} treinando${b.n > 1 ? 's' : ''}`, valor: b.nota, cor: +b.nota.toFixed(1) >= M ? COR.s1 : COR.s2,
    tip: tipH(`${b.bairro} · ${b.cidade}`, [`Nota final: ${fmt(b.nota)}`, `${b.n} treinandos · ${b.regiao}`, `Aprovação: ${pct(b.aprov)}`, `Provas ${fmt(b.provas)} · Qualidade ${pctQ(b.qual)}`])
  })), { max: 10, meta: M, posicao: true, legenda: [['Na meta', COR.s1], ['Abaixo da meta', COR.s2]], vazio: `Nenhum bairro com ${minA} ou mais treinandos` });

  // cidades
  const porCidade = [...agrupar(lista, r => r.cidade).entries()].map(([c, rs]) => ({ c, ...resumo(rs) })).filter(x => x.nota !== null).sort((a, b) => b.n - a.n).slice(0, 10).sort((a, b) => b.nota - a.nota);
  G.ranking(F('gCidades'), porCidade.map(x => ({
    rotulo: x.c, sub: `${x.n} treinandos · ${regiaoDe(x.c)}`, valor: x.nota, cor: x.c === 'Salvador' ? COR.s1 : COR.s2,
    tip: tipH(x.c, [`Nota final: ${fmt(x.nota)}`, `${x.n} treinandos`, `Aprovação: ${pct(x.aprov)}`])
  })), { max: 10, meta: M, legenda: [['Salvador', COR.s1], ['Fora de Salvador', COR.s2]] });

  // evolução nas provas
  const maxP = Math.min(10, Math.max(0, ...lista.map(r => (r.provas || []).length)));
  const serieProva = g => Array.from({ length: maxP }, (_, i) => { const v = media(g.map(r => escala10((r.provas || [])[i]?.nota ?? null))); return v === null ? null : +v.toFixed(2); });
  const grpS = lista.filter(ehSsa), grpF = lista.filter(r => !ehSsa(r));
  const series = [];
  if (grpS.length) series.push({ nome: 'Salvador', cor: COR.s1, valores: serieProva(grpS) });
  if (grpF.length) series.push({ nome: 'Fora de Salvador', cor: COR.s2, valores: serieProva(grpF) });
  G.linhas(F('gProvas'), Array.from({ length: maxP }, (_, i) => `Prova ${i + 1}`), series, { meta: M, titulo: 'Evolução nas provas' });

  // distribuição
  const faixasN = [['< 5', 0, 5], ['5 a 5,9', 5, 6], ['6 a 6,9', 6, 7], ['7 a 7,9', 7, 8], ['8 a 8,9', 8, 9], ['9 a 10', 9, 10.01]];
  G.colunas(F('gDistrib'), faixasN.map(([rot, a, b]) => {
    const n = lista.filter(r => r.notaFinal !== null && r.notaFinal >= a && r.notaFinal < b).length;
    return { rotulo: rot, valor: n, rotuloValor: String(n), cor: a >= M ? COR.s1 : COR.s2, tip: tipH(`Nota ${rot}`, [`${n} treinandos (${pct(n / lista.length)})`]) };
  }), { legenda: [['Na meta', COR.s1], ['Abaixo da meta', COR.s2]], titulo: 'Distribuição das notas finais' });

  // situação final
  G.rosca(F('gStatus'), Object.keys(COR_STATUS).map(s => ({ rotulo: s, valor: lista.filter(r => r.status === s).length, cor: COR_STATUS[s][0], icone: COR_STATUS[s][1] })), { rotuloTotal: 'treinandos', titulo: 'Situação final' });

  // idade e signo
  const porFaixa = FAIXAS.map(f => { const g = lista.filter(r => r._faixa === f[0]); return [f[0].replace(' anos', '').replace(' ou mais', '+'), media(g.map(r => r.notaFinal)), g.length]; }).filter(x => x[2]);
  G.colunas(F('gIdade'), porFaixa.map(x => ({ rotulo: x[0], valor: x[1], cor: +x[1].toFixed(1) >= M ? COR.s1 : COR.s2, tip: tipH(x[0] + ' anos', [`Nota final: ${fmt(x[1])}`, `${x[2]} treinandos`]) })), { max: 10, ticks: [0, 2, 4, 6, 8, 10], meta: M, legenda: [['Na meta', COR.s1], ['Abaixo da meta', COR.s2]] });
  const porSigno = LISTA_SIGNOS.map(s => { const g = lista.filter(r => r.signo === s); return [s, media(g.map(r => r.notaFinal)), g.length]; }).filter(x => x[2]);
  G.colunas(F('gSigno'), porSigno.map(x => ({ rotulo: x[0], valor: x[1], cor: +x[1].toFixed(1) >= M ? COR.s1 : COR.s2, tip: tipH(x[0], [`Nota final: ${fmt(x[1])}`, `${x[2]} treinandos`]) })), { max: 10, ticks: [0, 2, 4, 6, 8, 10], meta: M, legenda: [['Na meta', COR.s1], ['Abaixo da meta', COR.s2]] });

  // tabela de bairros
  ESTADO.bairros = porBairro;
  renderTabelaBairros();

  // cobertura Salvador
  const bSsa = (window.BA_BAIRROS || {}).Salvador || [];
  const comT = new Set(base.filter(r => aplicaFiltros([r], 'bairro').length && ehSsa(r)).map(r => norm(r.bairro)));
  const sem = bSsa.filter(b => !comT.has(norm(b)));
  const cob = bSsa.length ? (bSsa.length - sem.length) / bSsa.length : 0;
  F('barraCob').style.width = (cob * 100) + '%';
  F('coberturaTxt').textContent = `${bSsa.length - sem.length} de ${bSsa.length} bairros de Salvador têm treinandos nos registros filtrados (${pct(cob)}). Os ${sem.length} abaixo ainda não têm nenhum.`;
  F('semTreinandos').innerHTML = sem.map((b, i) => `<span class="chip" style="--d:${Math.min(i, 60) * 12}ms">${G.ic('pin', '')}${esc(b)}</span>`).join('') || '<span class="dica">Todos os bairros de Salvador têm ao menos um treinando.</span>';
}
['minAmostra', 'topN'].forEach(id => F(id).addEventListener('change', renderDashboard));

const COLS_BAIRRO = [
  ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['regiao', 'Região'], ['n', 'Treinandos', 1], ['nota', 'Nota final', 1], ['provas', 'Provas', 1], ['qual', 'Qualidade', 1],
  ['aprov', 'Aprovação', 1], ['naMeta', 'Na meta', 1], ['atest', 'Com atestado', 1], ['faltas', 'Faltas (média)', 1], ['vendas', 'Perfil vendas', 1], ['sit', 'Situação']
];
function renderTabelaBairros() {
  const M = meta(), q = norm(F('buscaBairro').value), o = ESTADO.ordBairro;
  let rows = (ESTADO.bairros || []).filter(b => !q || norm(b.bairro + ' ' + b.cidade).includes(q));
  rows.forEach(b => b.sit = b.nota === null ? 0 : b.nota >= M ? 2 : 1);
  rows.sort((a, b) => { const x = a[o.k], y = b[o.k]; const r = typeof x === 'string' ? cmpTxt(x, y) : (x ?? -1) - (y ?? -1); return o.asc ? r : -r; });
  const tag = b => b.nota === null ? '<span class="tag neutro">Sem nota</span>' : b.nota >= M ? `<span class="tag bom">${G.ic('check', '')}Na meta</span>` : `<span class="tag ruim">${G.ic('down', '')}Abaixo</span>`;
  F('tBairros').innerHTML = `<thead><tr>${COLS_BAIRRO.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'dir' : ''} ${o.k === k ? 'ord' + (o.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(b => `<tr><td class="lk" data-c="${esc(b.cidade)}" data-b="${esc(b.bairro)}">${esc(b.bairro)}</td><td>${esc(b.cidade)}</td><td>${esc(b.regiao)}</td>
    <td class="dir">${b.n}</td><td class="dir"><span class="mbar"><i style="width:${(b.nota || 0) * 10}%"></i></span>${fmt(b.nota)}</td><td class="dir">${fmt(b.provas)}</td><td class="dir">${pctQ(b.qual)}</td>
    <td class="dir">${pct(b.aprov)}</td><td class="dir">${pct(b.naMeta)}</td><td class="dir">${pct(b.atest)}</td><td class="dir">${fmt(b.faltas)}</td><td class="dir">${pct(b.vendas)}</td><td>${tag(b)}</td></tr>`).join('')
    || `<tr><td colspan="${COLS_BAIRRO.length}" class="dica">Nenhum bairro encontrado.</td></tr>`}</tbody>`;
}
F('tBairros').addEventListener('click', e => {
  const th = e.target.closest('th');
  if (th) { const k = th.dataset.k; ESTADO.ordBairro = { k, asc: ESTADO.ordBairro.k === k ? !ESTADO.ordBairro.asc : ['bairro', 'cidade', 'regiao'].includes(k) }; renderTabelaBairros(); return; }
  const td = e.target.closest('td.lk');
  if (td) { ESTADO.filtros.cidade = td.dataset.c; ESTADO.filtros.bairro = td.dataset.b; renderDashboard(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
F('buscaBairro').addEventListener('input', renderTabelaBairros);
F('expBairros').onclick = () => {
  const linhas = [COLS_BAIRRO.map(c => c[1])].concat((ESTADO.bairros || []).map(b => [b.bairro, b.cidade, b.regiao, b.n, fmt(b.nota, 2), fmt(b.provas, 2), pctQ(b.qual), pct(b.aprov, 1), pct(b.naMeta, 1), pct(b.atest, 1), fmt(b.faltas, 2), pct(b.vendas, 1), b.nota === null ? 'Sem nota' : b.nota >= meta() ? 'Na meta' : 'Abaixo da meta']));
  baixar(`panorama-bairros-${hoje()}.csv`, '﻿' + linhas.map(l => l.map(csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
};
F('btnImprimir').onclick = () => window.print();
F('btnExemploDash').onclick = () => carregarExemplo();

/* =========================================================
   BASE DE DADOS
   ========================================================= */
const COLS_BASE = [['nome', 'Nome'], ['turma', 'Turma'], ['instituicao', 'IES'], ['operacao', 'Operação'], ['dataInicio', 'Início'], ['cidade', 'Cidade'], ['bairro', 'Bairro'], ['perfil', 'Perfil'], ['atestado', 'Atestado'], ['notaFinal', 'Nota final', 1], ['status', 'Situação'], ['atualizadoEm', 'Atualizado']];
function renderBase() {
  const q = norm(F('buscaBase').value), o = ESTADO.ordBase;
  let rows = registros.filter(r => !q || norm([r.nome, r.email, r.turma, r.cidade, r.bairro, r.instrutor].join(' ')).includes(q));
  rows.sort((a, b) => { const x = a[o.k] ?? '', y = b[o.k] ?? ''; const r = typeof x === 'number' || typeof y === 'number' ? (num(x) ?? -1) - (num(y) ?? -1) : cmpTxt(x, y); return o.asc ? r : -r; });
  const M = meta();
  const st = s => ({ Aprovado: 'bom', Reprovado: 'ruim', Desistente: 'alerta', Desligado: 'ruim' }[s] || 'neutro');
  F('tBase').innerHTML = `<thead><tr>${COLS_BASE.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'dir' : ''} ${o.k === k ? 'ord' + (o.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}<th></th></tr></thead>
  <tbody>${rows.map(r => `<tr><td class="lk" data-edit="${r.id}">${esc(r.nome)}${r.exemplo ? ' <span class="tag neutro">exemplo</span>' : ''}</td><td>${esc(r.turma)}</td><td>${esc(r.instituicao || '—')}</td><td>${esc(r.operacao || '—')}</td><td>${dataBR(r.dataInicio)}</td><td>${esc(r.cidade)}</td><td>${esc(r.bairro)}</td>
    <td>${esc(r.perfil)}</td><td>${esc(r.atestado)}</td><td class="dir"><b style="color:${(r.notaFinal ?? 0) >= M ? 'var(--bom-txt)' : 'var(--ruim)'}">${fmt(r.notaFinal)}</b></td>
    <td><span class="tag ${st(r.status)}">${G.ic(({ Aprovado: 'check', Reprovado: 'alert', Desistente: 'down', Desligado: 'trash', 'Em treinamento': 'clock' })[r.status] || 'clock', '')}${esc(r.status)}</span></td><td>${r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleDateString('pt-BR') : ''}</td>
    <td><div class="acoes-linha"><button class="btn-icone" data-edit="${r.id}" title="Editar" aria-label="Editar">${G.ic('edit', '')}</button><button class="btn-icone" data-del="${r.id}" title="Excluir" aria-label="Excluir">${G.ic('trash', '')}</button></div></td></tr>`).join('')
    || `<tr><td colspan="${COLS_BASE.length + 1}" class="dica" style="padding:20px">${registros.length ? 'Nenhum registro encontrado.' : 'Nenhum cadastro ainda. Use a aba Cadastro de formação ou importe uma planilha.'}</td></tr>`}</tbody>`;
}
F('tBase').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (th) { const k = th.dataset.k; ESTADO.ordBase = { k, asc: ESTADO.ordBase.k === k ? !ESTADO.ordBase.asc : !['notaFinal', 'atualizadoEm', 'dataInicio'].includes(k) }; renderBase(); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) { const r = registros.find(x => x.id === ed.dataset.edit); if (r) { preencherForm(r); abrirAba('cadastro'); } return; }
  const del = e.target.closest('[data-del]');
  if (del) { const r = registros.find(x => x.id === del.dataset.del); if (r && confirm(`Excluir o cadastro de ${r.nome}?`)) { registros = registros.filter(x => x !== r); salvarRegistros(); renderBase(); toast('Cadastro excluído'); } }
});
F('buscaBase').addEventListener('input', renderBase);
F('btnApagarTudo').onclick = () => {
  if (!registros.length) return toast('A base já está vazia');
  const t = prompt(`Isso apaga os ${registros.length} cadastros deste navegador. Baixe o backup antes.\nDigite APAGAR para confirmar:`);
  if (t && t.trim().toUpperCase() === 'APAGAR') { registros = []; salvarRegistros(); renderBase(); atualizarDatalists(); toast('Base apagada'); }
};

/* ---------------- exportar / importar ---------------- */
function csvCel(v) { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
const MAPA_CSV = [
  ['Turma', 'turma'], ['Início', 'dataInicio'], ['Fim', 'dataFim'], ['Instrutor', 'instrutor'], ['Instituição', 'instituicao'], ['Operação', 'operacao'], ['Turno da turma', 'turnoTurma'], ['Modalidade', 'modalidade'],
  ['Nome', 'nome'], ['E-mail', 'email'], ['Telefone', 'telefone'], ['Nascimento', 'nascimento'], ['Signo', 'signo'], ['Escolaridade', 'escolaridade'],
  ['Estado', 'estado'], ['Cidade', 'cidade'], ['Bairro', 'bairro'], ['Região', 'regiao'], ['Deslocamento', 'deslocamento'], ['Transporte', 'transporte'],
  ['Perfil', 'perfil'], ['Experiência call center', 'experiencia'], ['Experiência vendas', 'expVendas'], ['Origem da vaga', 'origemVaga'], ['Equipamento', 'equipamento'],
  ['Atestado', 'atestado'], ['Faltas', 'faltas'], ['Atrasos', 'atrasos'], ['Nota final', 'notaFinal'], ['Situação', 'status'], ['Data de habilitação', 'dataHabilitacao'],
  ['Indicado para', 'indicacao'], ['Potencial de liderança', 'potencial'], ['Observações', 'observacoes']
];
function exportarCSV() {
  const maxP = Math.max(0, ...registros.map(r => (r.provas || []).length));
  const maxQ = Math.max(0, ...registros.map(r => (r.qualidade || []).length));
  const cab = MAPA_CSV.map(m => m[0]).concat(['Datas dos atestados', 'Dias de atestado'],
    Array.from({ length: maxP }, (_, i) => `Prova ${i + 1}`), Array.from({ length: maxP }, (_, i) => `Prova ${i + 1} tema`),
    Array.from({ length: maxQ }, (_, i) => `Qualidade ${i + 1} (%)`), COMPORT.map(c => 'Comportamental ' + c[1]));
  const linhas = registros.map(r => MAPA_CSV.map(([, k]) => {
    const v = r[k]; if (['dataInicio', 'dataFim', 'nascimento', 'dataHabilitacao'].includes(k)) return dataBR(v); if (k === 'notaFinal') return fmt(v); return v;
  }).concat([(r.atestados || []).map(a => dataBR(a.data)).join(', '), (r.atestados || []).reduce((s, a) => s + (a.dias || 0), 0) || '',
    ...Array.from({ length: maxP }, (_, i) => fmt(r.provas?.[i]?.nota ?? null).replace('—', '')), ...Array.from({ length: maxP }, (_, i) => r.provas?.[i]?.nome || ''),
    ...Array.from({ length: maxQ }, (_, i) => fmt(r.qualidade?.[i]?.nota ?? null, 2).replace('—', '')), ...COMPORT.map(c => r.comportamental?.[c[0]] ?? '')]));
  baixar(`treinamento-${hoje()}.csv`, '﻿' + [cab, ...linhas].map(l => l.map(csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
F('expCsv').onclick = () => registros.length ? exportarCSV() : toast('Nenhum cadastro para exportar');
F('expJson').onclick = () => baixar(`treinamento-backup-${hoje()}.json`, JSON.stringify({ versao: 1, geradoEm: new Date().toISOString(), registros, bairrosAprendidos }, null, 1), 'application/json');

function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let lin = [], cel = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; lin.push(cel); linhas.push(lin); lin = []; cel = ''; }
    else cel += c;
  }
  if (cel || lin.length) { lin.push(cel); linhas.push(lin); }
  return linhas.filter(l => l.some(c => c.trim()));
}
const dataISO = s => { s = String(s || '').trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = s.match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
function importarCSV(txt) {
  const [cab, ...dados] = parseCSV(txt);
  const idx = h => cab.findIndex(c => norm(c) === norm(h));
  const novos = dados.map(l => {
    const r = { id: uid(), criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
    MAPA_CSV.forEach(([h, k]) => { const i = idx(h); if (i >= 0) r[k] = (l[i] || '').trim(); });
    ['dataInicio', 'dataFim', 'nascimento', 'dataHabilitacao'].forEach(k => r[k] = dataISO(r[k]));
    r.notaFinal = num(r.notaFinal); r.faltas = num(r.faltas) || 0; r.atrasos = num(r.atrasos) || 0;
    r.cidade = MUN_NORM.get(norm(r.cidade)) || r.cidade || ''; r.estado = 'BA'; r.regiao = regiaoDe(r.cidade);
    r.signo = r.signo || signoDe(r.nascimento); r.email = (r.email || '').toLowerCase();
    r.provas = []; r.qualidade = []; r.comportamental = {};
    for (let i = 1; i <= 30; i++) { const a = idx(`Prova ${i}`); if (a < 0) break; const n = num(l[a]); const t = idx(`Prova ${i} tema`); if (n !== null || (t >= 0 && l[t])) r.provas.push({ nome: t >= 0 ? l[t] : '', data: '', nota: n }); }
    for (let i = 1; i <= 30; i++) { let a = idx(`Qualidade ${i} (%)`); if (a < 0) a = idx(`Qualidade ${i}`); if (a < 0) break; const n = num(l[a]); if (n !== null) r.qualidade.push({ data: '', nota: n }); }
    COMPORT.forEach(([k, t]) => { const a = idx('Comportamental ' + t); if (a >= 0 && num(l[a])) r.comportamental[k] = num(l[a]); });
    const da = idx('Datas dos atestados'); r.atestados = da >= 0 && l[da] ? l[da].split(',').map(s => ({ data: dataISO(s), dias: null, obs: '' })) : [];
    if (!r.atestado) r.atestado = r.atestados.length ? 'Sim' : 'Não';
    return r;
  }).filter(r => r.nome);
  return novos;
}
F('impArquivo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const txt = await f.text();
  try {
    let novos = [], aprend = {};
    if (/\.json$/i.test(f.name)) { const j = JSON.parse(txt); novos = Array.isArray(j) ? j : j.registros || []; aprend = j.bairrosAprendidos || {}; }
    else novos = importarCSV(txt);
    if (!novos.length) return toast('Nenhum registro encontrado no arquivo');
    const ids = new Set(registros.map(r => r.id));
    let add = 0, upd = 0;
    novos.forEach(n => { if (n.id && ids.has(n.id)) { Object.assign(registros.find(r => r.id === n.id), n); upd++; } else { registros.push({ ...n, id: n.id || uid() }); add++; } aprenderBairro(n.cidade, n.bairro); });
    Object.entries(aprend).forEach(([c, bs]) => bs.forEach(b => aprenderBairro(c, b)));
    salvarRegistros(); atualizarDatalists(); renderBase();
    toast(`${add} cadastros importados${upd ? `, ${upd} atualizados` : ''}`);
  } catch (err) { console.error(err); toast('Não foi possível ler o arquivo'); }
});

/* ---------------- dados de exemplo ---------------- */
function carregarExemplo() {
  if (registros.some(r => r.exemplo)) {
    if (confirm('Remover os dados de exemplo da base?')) { registros = registros.filter(r => !r.exemplo); salvarRegistros(); renderBase(); renderDashboard(); toast('Exemplos removidos'); }
    return;
  }
  let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const nomes = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elaine', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nilton', 'Patrícia', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'Wesley', 'Larissa', 'Caio', 'Jéssica', 'Marcos', 'Tainá', 'Igor', 'Débora', 'Renan'];
  const sobren = ['Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Nascimento', 'Carvalho', 'Ribeiro', 'Barbosa', 'Rocha', 'Conceição', 'Jesus'];
  const ssa = ['Cajazeiras X', 'Pituba', 'Liberdade', 'Itapuã', 'Brotas', 'Sussuarana', 'Pernambués', 'Cabula', 'Periperi', 'Paripe', 'São Marcos', 'Pau da Lima', 'Imbuí', 'Barra', 'Federação', 'Mussurunga', 'Boca do Rio', 'Lobato', 'Tancredo Neves', 'Engomadeira', 'Fazenda Grande II', 'Valéria', 'Stiep', 'Nordeste de Amaralina'].map(b => b === 'Tancredo Neves' ? 'Beiru/Tancredo Neves' : b);
  const efeito = {}; ssa.forEach(b => efeito[b] = (rnd() - .5) * 2.2);
  const fora = [['Lauro de Freitas', ['Itinga', 'Centro', 'Portão', 'Vida Nova']], ['Camaçari', ['Gleba A', 'Centro', 'Phoc II', 'Abrantes']], ['Simões Filho', ['Centro', 'Pitanguinha']], ['Candeias', ['Centro', 'Sarandi']], ['Feira de Santana', ['Centro', 'Tomba', 'Cidade Nova']], ['Dias d\'Ávila', ['Centro']], ['Santo Amaro', ['Centro']], ['Alagoinhas', ['Centro']]];
  const turmas = [['T-2026-08-A', '2026-08-03', '2026-08-21', 'Patrícia Moura'], ['T-2026-09-A', '2026-09-01', '2026-09-19', 'Rodrigo Sales'], ['T-2026-09-B', '2026-09-15', '2026-10-03', 'Patrícia Moura'], ['T-2026-10-A', '2026-10-06', '2026-10-24', 'Rodrigo Sales']];
  const temas = ['Produto e portfólio', 'Sistemas e CRM', 'Script e abordagem', 'Objeções e negociação', 'Avaliação final'];
  const novos = [];
  for (let i = 0; i < 140; i++) {
    const t = pick(turmas); const emSsa = rnd() < .72;
    let cidade, bairro, ef;
    if (emSsa) { cidade = 'Salvador'; bairro = pick(ssa); ef = efeito[bairro]; } else { const c = pick(fora); cidade = c[0]; bairro = pick(c[1]); ef = (rnd() - .6) * 1.6; }
    const perfil = rnd() < .55 ? 'Vendas' : 'Não vendas';
    const atest = rnd() < .22 ? 'Sim' : 'Não';
    const base = 6.9 + ef + (atest === 'Sim' ? -.7 : 0) + (rnd() - .5) * 2.2;
    const nota = v => Math.max(2, Math.min(10, Math.round((v + (rnd() - .5) * 1.4) * 10) / 10));
    const provas = temas.map((nm, k) => ({ nome: nm, data: '', nota: nota(base + k * .18 - .3) }));
    const qual = [0, 1, 2].map(() => ({ data: '', nota: Math.min(100, +(nota(base + .4) * 10 + rnd() * 0.99).toFixed(2)) }));
    const comp = {}; COMPORT.forEach(([k]) => comp[k] = Math.max(1, Math.min(5, Math.round(3 + (base - 6.5) * .7 + (rnd() - .5) * 2))));
    const nf = notaCalculada(provas, qual, comp);
    const ano = 1980 + Math.floor(rnd() * 27), mes = 1 + Math.floor(rnd() * 12), dia = 1 + Math.floor(rnd() * 28);
    const nasc = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const desist = rnd() < .07;
    const status = t[0] === 'T-2026-10-A' && rnd() < .5 ? 'Em treinamento' : desist ? 'Desistente' : nf >= 6.5 ? 'Aprovado' : 'Reprovado';
    const n1 = pick(nomes), n2 = pick(sobren);
    const atDia = new Date(t[1] + 'T12:00'); atDia.setDate(atDia.getDate() + Math.floor(rnd() * 14));
    novos.push({
      id: uid() + i, exemplo: true, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
      turma: t[0], dataInicio: t[1], dataFim: t[2], instrutor: t[3], instituicao: rnd() < .68 ? 'UVA' : 'Unijorge', operacao: perfil === 'Vendas' ? 'Captação' : 'Permanência', turnoTurma: pick(['Manhã', 'Tarde']), modalidade: 'Presencial',
      nome: `${n1} ${n2}`, email: `${norm(n1)}.${norm(n2)}${i}@exemplo.com`, telefone: `(71) 9${Math.floor(1000 + rnd() * 8999)}-${Math.floor(1000 + rnd() * 8999)}`,
      nascimento: nasc, signo: signoDe(nasc), escolaridade: pick(['Ensino médio completo', 'Ensino médio completo', 'Superior cursando', 'Superior completo']),
      estado: 'BA', cidade, bairro, regiao: regiaoDe(cidade), deslocamento: emSsa ? pick(['Até 30 min', '30 a 60 min', '1h a 1h30']) : pick(['1h a 1h30', 'Mais de 1h30']), transporte: pick(['Ônibus', 'Metrô', 'Ônibus + metrô']),
      perfil, experiencia: pick(['Nenhuma (1º emprego no setor)', 'Até 6 meses', '1 a 2 anos']), expVendas: perfil === 'Vendas' ? 'Sim' : pick(['Sim', 'Não']), origemVaga: pick(['Indicação', 'Redes sociais', 'Site de vagas']), equipamento: 'Sim, ambos',
      atestado: atest, atestados: atest === 'Sim' ? [{ data: atDia.toISOString().slice(0, 10), dias: 1 + Math.floor(rnd() * 2), obs: '' }] : [],
      faltas: Math.floor(rnd() * (atest === 'Sim' ? 3 : 1.6)), atrasos: Math.floor(rnd() * 3),
      provas, qualidade: qual, comportamental: comp, notaFinal: nf, notaAuto: true, status, dataHabilitacao: status === 'Aprovado' ? t[2] : '', indicacao: '', potencial: '', observacoes: ''
    });
  }
  registros = registros.concat(novos); salvarRegistros(); atualizarDatalists(); renderBase(); renderDashboard();
  toast('140 treinandos de exemplo carregados');
}
F('btnExemplo').onclick = carregarExemplo;


/* ---------------- buscar cadastro para editar ---------------- */
(function () {
  const wrap = F('buscaEdit'), inp = F('buscaEditar'), ul = $('ul', wrap);
  let itens = [], ativo = -1;
  function abrir() {
    const q = norm(inp.value);
    itens = registros.filter(r => !q || norm([r.nome, r.email, r.turma, r.bairro, r.cidade].join(' ')).includes(q))
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')).slice(0, 12);
    ul.innerHTML = itens.length ? itens.map((r, i) => `<li data-i="${i}"><span><b>${esc(r.nome)}</b><br><small>${esc(r.turma)} · ${esc(r.bairro)}, ${esc(r.cidade)}</small></span><small>${fmt(r.notaFinal)}</small></li>`).join('')
      : `<li class="sem">${registros.length ? 'Nenhum cadastro encontrado' : 'Nenhum cadastro salvo ainda'}</li>`;
    ativo = itens.length ? 0 : -1; marcar(); ul.hidden = false;
  }
  function marcar() { $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); }
  function escolher(i) { const r = itens[i]; if (!r) return; ul.hidden = true; inp.value = ''; inp.blur(); preencherForm(r); msg('Cadastro carregado para edição. Altere o que precisar e clique em Salvar alterações.', ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  inp.addEventListener('input', abrir); inp.addEventListener('focus', abrir);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(ativo); }
    else if (e.key === 'Escape') ul.hidden = true;
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(+li.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(() => ul.hidden = true, 120));
})();

/* ---------------- ícones, tooltip e redimensionamento ---------------- */
G.icones(); G.iniciarTooltip();
let _rz; let _larg = innerWidth;
window.addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(() => { if (Math.abs(innerWidth - _larg) > 40 && $('#aba-dashboard').classList.contains('ativo')) { _larg = innerWidth; renderDashboard(); } }, 250); });

/* ---------------- início ---------------- */
salvarRegistros(); atualizarDatalists(); limparForm();
F('btnExemplo').textContent = registros.some(r => r.exemplo) ? 'Remover exemplos' : 'Dados de exemplo';
window.addEventListener('storage', () => { registros = ler(KEY, []); bairrosAprendidos = ler(KEY_B, {}); });
const obs = () => F('btnExemplo').textContent = registros.some(r => r.exemplo) ? 'Remover exemplos' : 'Dados de exemplo';
document.addEventListener('click', () => setTimeout(obs, 0));
/* utilitários compartilhados com a área de colaboradores ativos */
window.APP = { $, $$, norm, num, media, fmt, pct, esc, uid, hoje, dataBR, cmpTxt, toast, baixar, ler, gravar, autocomplete, abrirAba,
  MUN, MUN_NORM, regiaoDe, bairrosDaCidade, aprenderBairro, acharBairro, nomeProprio, csvCel, parseCSV, dataISO, formacao: () => registros };
const inicial = (location.hash || '').slice(1);
window.addEventListener('load', () => { if (['cadastro', 'dashboard', 'base', 'at-cadastro', 'at-dashboard', 'at-base'].includes(inicial)) abrirAba(inicial); });
})();
