/* =========================================================
   Inovação Casa · Treinamento — Buscar: ficha do consultor
   Junta o BD da operação, a formação, os treinamentos de ativos e as
   ocorrências lançadas (atestado com CID, falta, atraso, feedback,
   advertência e suspensão) para analisar o perfil de cada consultor.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, fmt, esc, uid, hoje, dataBR, cmpTxt, toast, ler, gravar, baixar, csvCel } = A;
const KEY = 'inovacao_treinamento_ocorrencias_v1';
const KEY_QUADRO = 'inovacao_treinamento_quadro_v1', KEY_ATIVOS = 'inovacao_treinamento_ativos_v1', KEY_AN = 'inovacao_treinamento_analises_v1';
let ocorr = ler(KEY, []);
const salvar = () => gravar(KEY, ocorr);

const TIPOS = {
  'Atestado': { cor: '#2a78d6', ic: 'medical', classe: 'oc-atestado' },
  'Falta': { cor: '#d03b3b', ic: 'alert', classe: 'oc-falta' },
  'Atraso': { cor: '#eda100', ic: 'clock', classe: 'oc-atraso' },
  'Feedback': { cor: '#1baf7a', ic: 'edit', classe: 'oc-feedback' },
  'Advertência': { cor: '#ec835a', ic: 'flag', classe: 'oc-advertencia' },
  'Suspensão': { cor: '#8b1e1e', ic: 'scale', classe: 'oc-suspensao' }
};
const FEEDBACKS = ['Positivo', 'Construtivo', 'Orientação'];
const FORMAS_ADV = ['Verbal', 'Escrita'];
const PERIODOS = [['tudo', 'Todo o período'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['180', 'Últimos 6 meses'], ['365', 'Últimos 12 meses']];
const estado = { pessoa: null, periodo: 'tudo', sup: '', q: '', ord: { k: 'total', asc: false }, soCom: true };
const pode = x => !window.NUVEM || !NUVEM.pode || NUVEM.pode(x);

/* ---------------- quem é quem ---------------- */
function pessoas() {
  const lista = [], porMat = new Map(), porNome = new Map();
  const achar = (mat, nome) => (mat && porMat.get(String(mat))) || porNome.get(norm(nome));
  const add = (o, origem) => {
    if (!o.nome) return null;
    let p = achar(o.matricula, o.nome);
    if (!p) { p = { origens: [] }; lista.push(p); }
    Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && (p[k] === undefined || p[k] === '')) p[k] = v; });
    if (origem && !p.origens.includes(origem)) p.origens.push(origem);
    if (p.matricula) porMat.set(String(p.matricula), p);
    porNome.set(norm(p.nome), p);
    return p;
  };
  const q = ler(KEY_QUADRO, { itens: [] });
  (q.itens || []).forEach(c => add({ nome: c.nome, matricula: c.mat, login: c.login, idOlos: c.idOlos, hubspot: c.hubspot, supervisor: c.supervisor, gerente: c.gerente, ies: c.ies, operacao: c.operacao, grupo: c.grupo, status: c.status, escala: c.escala, turno: c.turno, bairro: c.bairro, cidade: c.cidade, admissao: c.admissao, tempoCasa: c.tempoCasa, nascimento: c.nascimento, signo: c.signoBD, desligamento: c.desligamento }, 'BD da operação'));
  ler(KEY_ATIVOS, []).forEach(r => add({ nome: r.nome, matricula: r.matricula, login: r.login, idOlos: r.idOlos, hubspot: r.hubspot, supervisor: r.supervisor, ies: r.instituicao, operacao: r.operacao, escala: r.escala, turno: r.turno, bairro: r.bairro, cidade: r.cidade, admissao: r.admissao, nascimento: r.nascimento }, 'Treinamentos de ativos'));
  (A.vista ? A.vista() : A.formacao()).forEach(r => { const p = add({ nome: r.nome, ies: r.instituicao, operacao: r.operacao, bairro: r.bairro, cidade: r.cidade, nascimento: r.nascimento, statusFormacao: r.status }, 'Formação inicial'); if (p) p.formacaoId = r.id; });
  ocorr.forEach(o => add({ nome: o.nome, matricula: o.matricula }, ''));
  lista.forEach(p => { p.k = p.matricula ? 'm:' + p.matricula : 'n:' + norm(p.nome); });
  return { lista, achar };
}
const chaveOc = (o, achar) => { const p = achar(o.matricula, o.nome); return p ? p.k : (o.matricula ? 'm:' + o.matricula : 'n:' + norm(o.nome)); };

/* ---------------- período e resumo ---------------- */
function noPeriodo(data) {
  if (estado.periodo === 'tudo' || !data) return true;
  const ini = new Date(); ini.setDate(ini.getDate() - +estado.periodo);
  return data >= ini.toISOString().slice(0, 10);
}
function resumoDe(lista) {
  const r = { atestados: 0, diasAtestado: 0, faltas: 0, faltasInj: 0, atrasos: 0, minAtraso: 0, feedbacks: 0, fbPos: 0, fbCon: 0, fbOri: 0, advert: 0, advVerbal: 0, advEscrita: 0, susp: 0, diasSusp: 0, ultimo: '' };
  lista.forEach(o => {
    if (o.data > r.ultimo) r.ultimo = o.data;
    if (o.tipo === 'Atestado') { r.atestados++; r.diasAtestado += o.dias || 0; }
    else if (o.tipo === 'Falta') { r.faltas++; if (o.justificada !== 'Sim') r.faltasInj++; }
    else if (o.tipo === 'Atraso') { r.atrasos++; r.minAtraso += o.minutos || 0; }
    else if (o.tipo === 'Feedback') { r.feedbacks++; if (o.feedbackTipo === 'Positivo') r.fbPos++; else if (o.feedbackTipo === 'Construtivo') r.fbCon++; else r.fbOri++; }
    else if (o.tipo === 'Advertência') { r.advert++; if (o.forma === 'Escrita') r.advEscrita++; else r.advVerbal++; }
    else if (o.tipo === 'Suspensão') { r.susp++; r.diasSusp += o.dias || 0; }
  });
  r.total = r.atestados + r.faltas + r.atrasos + r.advert + r.susp;
  return r;
}
// atestados lançados no período de treinamento da formação (só leitura)
function doTreinamento(p) {
  if (!p.formacaoId) return [];
  const r = A.formacao().find(x => x.id === p.formacaoId); if (!r) return [];
  return (r.atestados || []).map((a, i) => ({ id: 'f' + i, tipo: 'Atestado', data: a.data, dias: a.dias, cid: a.cid, cidDesc: a.cidDesc, descricao: a.obs, origem: 'Período de treinamento', soLeitura: true }));
}

/* =========================================================
   TELA
   ========================================================= */
const raiz = document.getElementById('buscarRaiz');
raiz.innerHTML = `
  <div class="cab-pagina">
    <div><h1>Buscar consultor</h1><p class="sub">Perfil, atestados (com CID), faltas, atrasos, feedbacks e medidas disciplinares de cada consultor do BD importado.</p></div>
    <div class="cab-acoes">
      <label class="mini">Período <select id="bsPeriodo">${PERIODOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-sec" id="bsVoltar" hidden>${G.ic('users')}Todos os consultores</button>
    </div>
  </div>
  <div class="bs-busca">
    <div class="auto" id="bsAuto">${G.ic('search', '')}<input id="bsNome" placeholder="Digite o nome, matrícula ou login do consultor…" autocomplete="off" spellcheck="false"><ul class="auto-lista" hidden></ul></div>
  </div>
  <div id="bsAviso"></div>
  <div id="bsConteudo"></div>
  <dialog id="dlgOcorr" class="dlg dlg-oc">
    <form method="dialog" class="dlg-in" id="ocForm" novalidate autocomplete="off">
      <header class="cab-card"><span class="icb">${G.ic('flag')}</span><div><h2 id="ocTit">Lançar ocorrência</h2><p id="ocSub"></p></div></header>
      <input type="hidden" id="ocId">
      <div class="campo"><span>Tipo <i class="obr">*</i></span>
        <div class="seg oc-tipos" id="ocTipo" data-valor="">${Object.entries(TIPOS).map(([t, c]) => `<button type="button" data-v="${t}">${G.ic(c.ic, '')}${t}</button>`).join('')}</div></div>
      <div class="grade g3 oc-grade">
        <label class="campo"><span>Data <i class="obr">*</i></span><input type="date" id="ocData"></label>
        <label class="campo oc-c" data-t="Atestado Suspensão"><span>Dias <i class="obr">*</i></span><input type="number" id="ocDias" min="1" step="1"></label>
        <label class="campo oc-c" data-t="Atraso"><span>Minutos de atraso</span><input type="number" id="ocMin" min="1" step="1"></label>
        <label class="campo oc-c" data-t="Falta"><span>Justificada?</span><select id="ocJust"><option value="">Selecione</option><option>Sim</option><option>Não</option></select></label>
        <label class="campo oc-c" data-t="Feedback"><span>Tipo de feedback <i class="obr">*</i></span><select id="ocFb"><option value="">Selecione</option>${FEEDBACKS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="campo oc-c" data-t="Advertência"><span>Forma <i class="obr">*</i></span><select id="ocForma"><option value="">Selecione</option>${FORMAS_ADV.map(x => `<option>${x}</option>`).join('')}</select></label>
      </div>
      <div class="oc-c cid-linha oc-cid" data-t="Atestado" id="ocCidLinha">
        <div class="mini-campo"><small>CID</small><div class="cid-auto"><input class="a-cid" id="ocCid" placeholder="Ex.: J11 ou gripe" autocomplete="off" spellcheck="false"><ul class="auto-lista" hidden></ul></div></div>
        <div class="cid-desc"><small>Significado</small><span><i>Digite o código ou parte do nome da doença</i></span></div>
      </div>
      <label class="campo"><span id="ocDescRot">Descrição</span><textarea id="ocDesc" rows="3" placeholder="O que aconteceu, combinado, motivo da medida…"></textarea></label>
      <div class="dlg-rod"><small class="msg" id="ocMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="ocSalvar">${G.ic('check')}Salvar ocorrência</button></span></div>
    </form>
  </dialog>`;
const F = id => document.getElementById(id);
if (A.cid) A.cid.ligar(F('ocCidLinha'));

document.getElementById('btnBuscar').addEventListener('click', () => A.abrirAba('buscar'));
F('bsPeriodo').addEventListener('change', () => { estado.periodo = F('bsPeriodo').value; render(); });
F('bsVoltar').onclick = () => { estado.pessoa = null; F('bsNome').value = ''; render(); };

// busca por nome, matrícula ou login
(function () {
  const inp = F('bsNome'), ul = $('ul', F('bsAuto'));
  let itens = [], ativo = -1;
  function abrir() {
    const q = norm(inp.value); const { lista } = pessoas();
    itens = lista.filter(p => !q || norm([p.nome, p.matricula, p.login, p.supervisor].join(' ')).includes(q))
      .sort((a, b) => (norm(a.nome).startsWith(q) ? 0 : 1) - (norm(b.nome).startsWith(q) ? 0 : 1) || cmpTxt(a.nome, b.nome)).slice(0, 40);
    ul.innerHTML = itens.length ? itens.map((p, i) => `<li data-i="${i}"><span><b>${esc(p.nome)}</b><br><small>${esc([p.matricula && 'Mat. ' + p.matricula, p.supervisor, p.status || p.statusFormacao].filter(Boolean).join(' · '))}</small></span></li>`).join('')
      : `<li class="sem">${lista.length ? 'Nenhum consultor encontrado' : 'Importe o BD em Colaboradores ativos → Base de dados'}</li>`;
    ativo = itens.length && q ? 0 : -1; marcar(); ul.hidden = false;
  }
  const marcar = () => $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo));
  const escolher = i => { const p = itens[i]; if (!p) return; ul.hidden = true; inp.value = p.nome; inp.blur(); estado.pessoa = p.k; render(); };
  inp.addEventListener('input', abrir); inp.addEventListener('focus', abrir);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(Math.max(ativo, 0)); }
    else if (e.key === 'Escape') ul.hidden = true;
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(+li.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(() => ul.hidden = true, 150));
})();

function aviso() {
  const el = F('bsAviso');
  el.innerHTML = window.NUVEM && NUVEM.servidorDesatualizado && NUVEM.servidorDesatualizado()
    ? `<div class="aviso-fluxo aviso-erro">${G.ic('alert', '')}<div><b>O servidor ainda não guarda as ocorrências.</b><span>O código do servidor (Cloudflare) precisa ser atualizado. Até lá, o que for lançado aqui fica só neste navegador.</span></div></div>` : '';
}

function render() {
  aviso();
  F('bsPeriodo').value = estado.periodo;
  const { lista, achar } = pessoas();
  const porPessoa = new Map();
  ocorr.forEach(o => { if (!noPeriodo(o.data)) return; const k = chaveOc(o, achar); (porPessoa.get(k) || porPessoa.set(k, []).get(k)).push(o); });
  const p = estado.pessoa && lista.find(x => x.k === estado.pessoa);
  F('bsVoltar').hidden = !p;
  if (p) ficha(p, porPessoa.get(p.k) || []); else panorama(lista, porPessoa);
  G.icones(F('bsConteudo'));
}

/* ---------------- panorama de todos ---------------- */
const COLS = [['nome', 'Consultor'], ['supervisor', 'Supervisor'], ['status', 'Status'], ['atestados', 'Atestados', 1], ['diasAtestado', 'Dias de atestado', 1], ['faltas', 'Faltas', 1], ['atrasos', 'Atrasos', 1], ['feedbacks', 'Feedbacks', 1], ['advert', 'Advertências', 1], ['susp', 'Suspensões', 1], ['diasSusp', 'Dias de suspensão', 1], ['ultimo', 'Último registro']];
function panorama(lista, porPessoa) {
  const sups = [...new Set(lista.map(p => p.supervisor).filter(Boolean))].sort(cmpTxt);
  let linhas = lista.map(p => ({ p, ...resumoDe(porPessoa.get(p.k) || []), nome: p.nome, supervisor: p.supervisor || '', status: p.status || p.statusFormacao || '' }));
  const geral = resumoDe([].concat(...[...porPessoa.values()]));
  if (estado.sup) linhas = linhas.filter(l => l.supervisor === estado.sup);
  if (estado.soCom) linhas = linhas.filter(l => l.total || l.feedbacks);
  const o = estado.ord;
  linhas.sort((a, b) => { const x = a[o.k], y = b[o.k]; const r = typeof x === 'number' ? x - y : cmpTxt(x || '', y || ''); return (o.asc ? r : -r) || cmpTxt(a.nome, b.nome); });
  const kp = (t, v, s, cor, ic) => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const comOc = [...porPessoa.keys()].length;
  F('bsConteudo').innerHTML = `
    <div class="kpis bs-kpis">
      ${kp('Consultores', lista.length, `${comOc} com ocorrências no período`, '#0f3a6b', 'users')}
      ${kp('Atestados', geral.atestados, `${geral.diasAtestado} dias de afastamento`, TIPOS.Atestado.cor, 'medical')}
      ${kp('Faltas', geral.faltas, `${geral.faltasInj} sem justificativa`, TIPOS.Falta.cor, 'alert')}
      ${kp('Atrasos', geral.atrasos, `${geral.minAtraso} minutos no total`, TIPOS.Atraso.cor, 'clock')}
      ${kp('Feedbacks', geral.feedbacks, `${geral.fbPos} positivos · ${geral.fbCon} construtivos`, TIPOS.Feedback.cor, 'edit')}
      ${kp('Advertências', geral.advert, `${geral.advVerbal} verbais · ${geral.advEscrita} escritas`, TIPOS['Advertência'].cor, 'flag')}
      ${kp('Suspensões', geral.susp, `${geral.diasSusp} dias no total`, TIPOS['Suspensão'].cor, 'scale')}
    </div>
    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Consultores e ocorrências</h2><p>Clique no nome para abrir a ficha completa</p></div>
        <div class="bs-filtros">
          <label class="bs-sel">${G.ic('users', '')}<select id="bsSup"><option value="">Todos os supervisores</option>${sups.map(s => `<option${s === estado.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label class="bs-toggle" title="Mostrar só consultores com ocorrência no período"><input type="checkbox" id="bsSoCom"${estado.soCom ? ' checked' : ''}><i></i><span>Só com ocorrência</span></label>
          <button type="button" class="btn btn-sec" id="bsExp" data-perm="exportar">${G.ic('download')}Exportar</button>
        </div></header>
      <div class="tabela-wrap"><table class="tabela bs-tab"><thead><tr>${COLS.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'dir' : ''} ${o.k === k ? 'ord' + (o.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}</tr></thead><tbody>
      ${linhas.slice(0, 400).map(l => `<tr><td class="lk" data-k="${esc(l.p.k)}">${esc(l.nome)}</td><td>${esc(l.supervisor)}</td><td>${esc(l.status)}</td>
        <td class="dir">${n0(l.atestados)}</td><td class="dir">${n0(l.diasAtestado)}</td><td class="dir">${n0(l.faltas)}</td><td class="dir">${n0(l.atrasos)}</td><td class="dir">${n0(l.feedbacks)}</td>
        <td class="dir">${l.advert ? `<span class="tag alerta">${l.advert}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${l.susp ? `<span class="tag ruim">${l.susp}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${n0(l.diasSusp)}</td><td>${dataBR(l.ultimo)}</td></tr>`).join('')
      || `<tr><td colspan="${COLS.length}" class="dica" style="padding:18px">${lista.length ? 'Nenhuma ocorrência lançada no período. Busque um consultor acima para abrir a ficha e lançar.' : 'Nenhum consultor encontrado. Importe o BD em Colaboradores ativos → Base de dados.'}</td></tr>`}
      </tbody></table></div>
    </article>`;
  F('bsSup').onchange = e => { estado.sup = e.target.value; render(); };
  F('bsSoCom').onchange = e => { estado.soCom = e.target.checked; render(); };
  F('bsExp').onclick = () => {
    const cab = ['Consultor', 'Matrícula', 'Supervisor', 'Status', 'Atestados', 'Dias de atestado', 'Faltas', 'Faltas sem justificativa', 'Atrasos', 'Minutos de atraso', 'Feedbacks positivos', 'Feedbacks construtivos', 'Orientações', 'Advertências verbais', 'Advertências escritas', 'Suspensões', 'Dias de suspensão', 'Último registro'];
    const lin = linhas.map(l => [l.nome, l.p.matricula || '', l.supervisor, l.status, l.atestados, l.diasAtestado, l.faltas, l.faltasInj, l.atrasos, l.minAtraso, l.fbPos, l.fbCon, l.fbOri, l.advVerbal, l.advEscrita, l.susp, l.diasSusp, dataBR(l.ultimo)]);
    baixar(`ocorrencias-consultores-${hoje()}.csv`, '﻿' + [cab, ...lin].map(x => x.map(csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('thead', F('bsConteudo')).addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; estado.ord = { k, asc: estado.ord.k === k ? !estado.ord.asc : ['nome', 'supervisor', 'status'].includes(k) }; render(); });
  $('tbody', F('bsConteudo')).addEventListener('click', e => { const td = e.target.closest('td[data-k]'); if (td) { estado.pessoa = td.dataset.k; F('bsNome').value = td.textContent; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
}
const n0 = v => v ? v : '<span class="zero">0</span>';

/* ---------------- ficha de um consultor ---------------- */
function idade(d) { if (!d) return ''; const n = new Date(d + 'T12:00'), h = new Date(); let i = h.getFullYear() - n.getFullYear(); if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--; return i > 0 && i < 110 ? i + ' anos' : ''; }
function ficha(p, lista) {
  const extra = doTreinamento(p).filter(o => noPeriodo(o.data));
  const tudo = lista.concat(extra).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const r = resumoDe(tudo);
  const form = p.formacaoId ? (A.vista ? A.vista() : A.formacao()).find(x => x.id === p.formacaoId) : null;
  const sup = p.formacaoId ? ler(KEY_AN, []).find(a => a.tipo === 'supervisao' && a.treinandoId === p.formacaoId) : null;
  const trein = ler(KEY_ATIVOS, []).filter(x => (p.matricula && String(x.matricula) === String(p.matricula)) || norm(x.nome) === norm(p.nome)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const cids = new Map(); tudo.filter(o => o.tipo === 'Atestado' && o.cid).forEach(o => { const c = cids.get(o.cid) || { cid: o.cid, desc: o.cidDesc, n: 0, dias: 0 }; c.n++; c.dias += o.dias || 0; cids.set(o.cid, c); });
  const chip = (t, v) => v ? `<span><small>${t}</small><b>${esc(v)}</b></span>` : '';
  const signo = p.signo || (p.nascimento && A.signoDe ? A.signoDe(p.nascimento) : '');
  const kp = (t, v, s, tipo) => `<div class="kpi" style="--c:${TIPOS[tipo].cor}"><div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(TIPOS[tipo].ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const statusTag = s => `<span class="tag ${/deslig/i.test(s) ? 'ruim' : /f[ée]rias|afast/i.test(s) ? 'alerta' : 'bom'}">${esc(s)}</span>`;
  F('bsConteudo').innerHTML = `
    <article class="cartao bs-ficha">
      <div class="bs-topo">
        <div class="bs-avatar">${esc(p.nome.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join(''))}</div>
        <div class="bs-id"><h2>${esc(p.nome)}</h2><p>${[p.status && statusTag(p.status), p.statusFormacao && !p.status && `<span class="tag neutro">Formação: ${esc(p.statusFormacao)}</span>`, esc([p.grupo, p.ies, p.operacao].filter(Boolean).join(' · '))].filter(Boolean).join(' ')}</p>
          <small class="dica">Fontes: ${esc(p.origens.join(', ') || 'ocorrências lançadas')}</small></div>
        <button type="button" class="btn btn-pri" id="bsLancar" data-perm="ocorrencias">${G.ic('plus')}Lançar ocorrência</button>
      </div>
      <div class="an-chips bs-chips">${chip('Matrícula', p.matricula)}${chip('Login', p.login)}${chip('ID Olos', p.idOlos)}${chip('HubSpot', p.hubspot)}${chip('Supervisor', p.supervisor)}${chip('Gerente', p.gerente)}${chip('Turno', p.turno)}${chip('Escala', p.escala)}${chip('Admissão', dataBR(p.admissao))}${chip('Tempo de casa', p.tempoCasa)}${chip('Idade', idade(p.nascimento))}${chip('Signo', signo)}${chip('Bairro', [p.bairro, p.cidade].filter(Boolean).join(', '))}${chip('Desligamento', dataBR(p.desligamento))}</div>
    </article>

    <div class="kpis bs-kpis">
      ${kp('Atestados', r.atestados, `${r.diasAtestado} dia(s) de afastamento`, 'Atestado')}
      ${kp('Faltas', r.faltas, `${r.faltasInj} sem justificativa${form && form.faltas ? ` · ${form.faltas} no treinamento` : ''}`, 'Falta')}
      ${kp('Atrasos', r.atrasos, `${r.minAtraso} min${form && form.atrasos ? ` · ${form.atrasos} no treinamento` : ''}`, 'Atraso')}
      ${kp('Feedbacks', r.feedbacks, `${r.fbPos} positivo(s) · ${r.fbCon} construtivo(s) · ${r.fbOri} orientação(ões)`, 'Feedback')}
      ${kp('Advertências', r.advert, `${r.advVerbal} verbal(is) · ${r.advEscrita} escrita(s)`, 'Advertência')}
      ${kp('Suspensões', r.susp, `${r.diasSusp} dia(s) de suspensão`, 'Suspensão')}
    </div>

    <div class="bs-grade">
      <article class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('briefcase')}</span><div><h2>Perfil</h2><p>Formação inicial, análises e treinamentos</p></div></header>
        ${form ? `<div class="an-chips">${chip('Situação', form.status)}${chip('Perfil', form.perfil)}${chip('Indicado para', form.indicacao)}${chip('Potencial', form.potencial)}${chip('Nota final', fmt(form.notaFinal))}${chip('Turma', form.turma)}${sup && sup.resultadoFinal ? chip('Experiência', sup.resultadoFinal) : ''}</div>
          ${form.observacoes ? `<p class="bs-obs">${esc(form.observacoes)}</p>` : ''}` : '<p class="dica">Sem registro na formação inicial.</p>'}
        <h3 class="sub-titulo">Treinamentos e alinhamentos <small>${trein.length}</small></h3>
        ${trein.length ? `<ul class="bs-trein">${trein.slice(0, 8).map(t => `<li><small>${dataBR(t.data)}</small><b>${esc(t.tipo || t.categoria || 'Treinamento')}</b> ${esc(t.tema || t.conteudo || t.titulo || '')}</li>`).join('')}</ul>` : '<p class="dica">Nenhum treinamento registrado em Colaboradores ativos.</p>'}
      </article>
      <article class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('medical')}</span><div><h2>CIDs dos atestados</h2><p>Significado de cada CID apresentado</p></div></header>
        ${cids.size ? `<div class="tabela-wrap"><table class="tabela bs-cids"><thead><tr><th>CID</th><th>Significado</th><th class="dir">Vezes</th><th class="dir">Dias</th></tr></thead><tbody>${[...cids.values()].sort((a, b) => b.n - a.n).map(c => `<tr><td><b>${esc(c.cid)}</b></td><td>${esc(c.desc || '—')}</td><td class="dir">${c.n}</td><td class="dir">${c.dias}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum atestado com CID no período.</p>'}
      </article>
    </div>

    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('calendar')}</span><div><h2>Histórico de ocorrências</h2><p>${tudo.length} registro(s) no período</p></div>
        <div class="bs-filtros" id="bsTiposFiltro">${Object.keys(TIPOS).map(t => `<button type="button" class="chip-f" data-t="${t}">${t}</button>`).join('')}</div></header>
      <ul class="bs-linha" id="bsLinha">${tudo.map(o => itemOc(o)).join('') || '<li class="vazio-lote">Nenhuma ocorrência no período.</li>'}</ul>
    </article>`;
  F('bsLancar').onclick = () => abrirOc(p);
  F('bsTiposFiltro').addEventListener('click', e => {
    const b = e.target.closest('.chip-f'); if (!b) return; b.classList.toggle('on');
    const on = $$('.chip-f.on', F('bsTiposFiltro')).map(x => x.dataset.t);
    $$('#bsLinha > li[data-t]').forEach(li => li.hidden = on.length && !on.includes(li.dataset.t));
  });
  F('bsLinha').addEventListener('click', e => {
    const ed = e.target.closest('[data-oc-edit]'), del = e.target.closest('[data-oc-del]');
    if (ed) { const o = ocorr.find(x => x.id === ed.dataset.ocEdit); if (o) abrirOc(p, o); }
    if (del) { const o = ocorr.find(x => x.id === del.dataset.ocDel); if (o && confirm(`Excluir ${o.tipo.toLowerCase()} de ${dataBR(o.data)}?`)) { ocorr = ocorr.filter(x => x !== o); salvar(); render(); toast('Ocorrência excluída'); } }
  });
}
function itemOc(o) {
  const T = TIPOS[o.tipo] || TIPOS.Feedback;
  const det = o.tipo === 'Atestado' ? [o.dias && `${o.dias} dia(s)`, o.cid && `<b>CID ${esc(o.cid)}</b> — ${esc(o.cidDesc || 'CID não encontrado')}`]
    : o.tipo === 'Falta' ? [o.justificada === 'Sim' ? 'Justificada' : o.justificada === 'Não' ? 'Sem justificativa' : '']
    : o.tipo === 'Atraso' ? [o.minutos && `${o.minutos} min`]
    : o.tipo === 'Feedback' ? [o.feedbackTipo]
    : o.tipo === 'Advertência' ? [o.forma && `Advertência ${o.forma.toLowerCase()}`]
    : o.tipo === 'Suspensão' ? [o.dias && `<b>${o.dias} dia(s) de suspensão</b>`] : [];
  return `<li data-t="${esc(o.tipo)}" style="--c:${T.cor}"><span class="bs-ic">${G.ic(T.ic, '')}</span>
    <div class="bs-it"><div class="bs-it-top"><b>${esc(o.tipo)}</b><small>${dataBR(o.data)}</small>${o.origem ? `<span class="tag neutro">${esc(o.origem)}</span>` : ''}</div>
      ${det.filter(Boolean).length ? `<div class="bs-det">${det.filter(Boolean).join(' · ')}</div>` : ''}
      ${o.descricao ? `<p>${esc(o.descricao)}</p>` : ''}
      ${o.registradoPor ? `<small class="dica">Lançado por ${esc(o.registradoPor)}${o.criadoEm ? ' em ' + new Date(o.criadoEm).toLocaleDateString('pt-BR') : ''}</small>` : ''}</div>
    ${o.soLeitura ? '' : `<div class="acoes-linha"><button type="button" class="btn-icone" data-oc-edit="${o.id}" data-perm="ocorrencias editar" title="Editar">${G.ic('edit', '')}</button><button type="button" class="btn-icone" data-oc-del="${o.id}" data-perm="ocorrencias excluir" title="Excluir">${G.ic('trash', '')}</button></div>`}</li>`;
}

/* ---------------- lançar / editar ocorrência ---------------- */
let alvo = null;
function setTipo(t) {
  const s = F('ocTipo'); s.dataset.valor = t || ''; $$('button', s).forEach(b => b.classList.toggle('on', b.dataset.v === t)); s.classList.remove('invalido');
  $$('.oc-c', F('ocForm')).forEach(el => el.hidden = !t || !el.dataset.t.split(' ').includes(t));
  F('ocDescRot').innerHTML = ['Feedback', 'Advertência', 'Suspensão'].includes(t) ? 'Descrição / motivo <i class="obr">*</i>' : 'Descrição';
}
F('ocTipo').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTipo(b.dataset.v); });
function abrirOc(p, o) {
  alvo = p; const f = F('ocForm'); f.reset();
  $$('.invalido', f).forEach(x => x.classList.remove('invalido')); F('ocMsg').textContent = '';
  F('ocId').value = o ? o.id : '';
  F('ocTit').textContent = o ? 'Editar ocorrência' : 'Lançar ocorrência';
  F('ocSub').textContent = p.nome + (p.matricula ? ' · Mat. ' + p.matricula : '');
  setTipo(o ? o.tipo : '');
  F('ocData').value = o ? o.data : hoje();
  F('ocDias').value = o && o.dias ? o.dias : ''; F('ocMin').value = o && o.minutos ? o.minutos : '';
  F('ocJust').value = o && o.justificada || ''; F('ocFb').value = o && o.feedbackTipo || ''; F('ocForma').value = o && o.forma || '';
  F('ocCid').value = o && o.cid || ''; F('ocCidLinha').dataset.desc = o && o.cidDesc || '';
  const d = $('.cid-desc', F('ocCidLinha')); d.classList.remove('cid-erro'); $('span', d).innerHTML = o && o.cid ? esc(o.cidDesc || 'CID não encontrado') : '<i>Digite o código ou parte do nome da doença</i>';
  F('ocDesc').value = o && o.descricao || '';
  F('dlgOcorr').showModal();
}
F('ocForm').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
F('ocSalvar').onclick = () => {
  const t = F('ocTipo').dataset.valor, erros = [];
  const marca = (el, txt) => { el.classList.add('invalido'); erros.push(txt); };
  $$('.invalido', F('ocForm')).forEach(x => x.classList.remove('invalido'));
  if (!t) marca(F('ocTipo'), 'tipo');
  if (!F('ocData').value) marca(F('ocData'), 'data');
  const dias = num(F('ocDias').value);
  if ((t === 'Atestado' || t === 'Suspensão') && !(dias >= 1)) marca(F('ocDias'), 'dias');
  if (t === 'Feedback' && !F('ocFb').value) marca(F('ocFb'), 'tipo de feedback');
  if (t === 'Advertência' && !F('ocForma').value) marca(F('ocForma'), 'forma da advertência');
  if (['Feedback', 'Advertência', 'Suspensão'].includes(t) && !F('ocDesc').value.trim()) marca(F('ocDesc'), 'descrição');
  if (t === 'Atestado' && $('.cid-erro', F('ocCidLinha'))) erros.push('CID válido');
  if (erros.length) { F('ocMsg').textContent = 'Confira: ' + erros.join(', ') + '.'; F('ocMsg').className = 'msg erro'; return; }
  const id = F('ocId').value;
  let o = id ? ocorr.find(x => x.id === id) : null;
  if (!o) { o = { id: uid(), criadoEm: new Date().toISOString(), registradoPor: (window.NUVEM && NUVEM.usuario && (NUVEM.usuario() || {}).nome) || '' }; ocorr.push(o); }
  const cid = t === 'Atestado' && A.cid ? A.cid.fmt(F('ocCid').value) : '';
  const mapa = A.cid && A.cid.mapa();
  const x = cid && mapa ? mapa.get(A.cid.cod(cid)) : null;
  Object.keys(o).forEach(k => { if (!['id', 'criadoEm', 'registradoPor'].includes(k)) delete o[k]; });
  Object.assign(o, {
    nome: alvo.nome, matricula: alvo.matricula || '', supervisor: alvo.supervisor || '', tipo: t, data: F('ocData').value, descricao: F('ocDesc').value.trim(),
    atualizadoEm: new Date().toISOString(), editadoPor: id ? ((window.NUVEM && NUVEM.usuario && (NUVEM.usuario() || {}).nome) || '') : undefined
  });
  if (t === 'Atestado') Object.assign(o, { dias, cid, cidDesc: x ? x.d : (F('ocCidLinha').dataset.desc || '') });
  if (t === 'Suspensão') o.dias = dias;
  if (t === 'Atraso') o.minutos = num(F('ocMin').value) || null;
  if (t === 'Falta') o.justificada = F('ocJust').value;
  if (t === 'Feedback') o.feedbackTipo = F('ocFb').value;
  if (t === 'Advertência') o.forma = F('ocForma').value;
  if (o.editadoPor === undefined) delete o.editadoPor;
  salvar(); F('dlgOcorr').close(); render();
  toast(id ? 'Ocorrência atualizada' : `${t}: ocorrência lançada para ${alvo.nome.split(' ')[0]}`);
};

/* ---------------- ciclo ---------------- */
document.addEventListener('aba-aberta', e => { if (e.detail === 'buscar') render(); });
window.addEventListener('dados-atualizados', () => {
  ocorr = ler(KEY, []);
  if (document.getElementById('aba-buscar').classList.contains('ativo') && !F('dlgOcorr').open) render();
});
G.icones(raiz);
if (document.getElementById('aba-buscar').classList.contains('ativo')) render();
})();
