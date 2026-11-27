/* =========================================================
   Painel de Controle · Monitorias de qualidade
   Checklist por critério com peso, falha crítica que zera a nota,
   feedback ao consultor e visão dos critérios mais fracos da equipe.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, fmt, esc, uid, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const KEY = 'inovacao_treinamento_monitorias_v1';
let lista = ler(KEY, []) || [];
const salvar = () => gravar(KEY, lista);
const META = 85;
const CRITERIOS = [
  ['abertura', 'Abertura e identificação', 10, 'Cumprimenta, se apresenta, confirma o nome e o motivo do contato'],
  ['sondagem', 'Sondagem da necessidade', 20, 'Faz perguntas para entender curso, objetivo, momento e condição do aluno'],
  ['oferta', 'Apresentação da oferta', 20, 'Liga benefícios, condições e diferenciais ao que o aluno precisa'],
  ['objecoes', 'Contorno de objeções', 15, 'Acolhe a objeção e responde com argumento, sem desistir na primeira'],
  ['fechamento', 'Fechamento e próximo passo', 15, 'Conduz para inscrição/matrícula ou combina retorno com data'],
  ['registro', 'Registro no HubSpot', 10, 'Tabulação, etapa e observações corretas no negócio'],
  ['postura', 'Postura e linguagem', 10, 'Cordialidade, clareza, sem gírias, escuta ativa']
];
const CRITICAS = ['Informação incorreta ao aluno', 'Falta de respeito ou atendimento grosseiro', 'Exposição de dados pessoais (LGPD)', 'Promessa que não pode ser cumprida'];
const RESP = [['A', 'Atende', 1], ['P', 'Parcial', .5], ['N', 'Não atende', 0], ['NA', 'N/A', null]];
const FATOR = Object.fromEntries(RESP.map(r => [r[0], r[2]]));
const pode = x => !window.NUVEM || !NUVEM.pode || NUVEM.pode(x);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTxt = m => m ? `${MESES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}` : '';
function notaDe(resp, criticas) {
  if ((criticas || []).length) return 0;
  let s = 0, p = 0; CRITERIOS.forEach(([k, , peso]) => { const f = FATOR[resp[k]]; if (f === null || f === undefined) return; s += peso * f; p += peso; });
  return p ? Math.round(s / p * 1000) / 10 : null;
}
const tagNota = n => n === null || n === undefined ? '—' : `<span class="tag ${n >= META ? 'bom' : n >= 70 ? 'alerta' : 'ruim'}">${fmt(n, 1)}%</span>`;
const vigentes = () => { const q = ler('inovacao_treinamento_quadro_v1', { itens: [] }) || { itens: [] }; return (q.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro); };

const raiz = document.getElementById('monRaiz');
const est = { mes: hoje().slice(0, 7), sup: '', q: '', editando: null, form: false };

/* ---------- leitura do que veio da planilha ---------- */
const KEY_DES = 'inovacao_treinamento_desempenho_v1';
const metasMon = () => ((ler(KEY_DES, {}) || {}).metasMon) || {};
function perfilBase(xs) {
  // colunas extras: tipo de avaliador, produto/fila, feedback e PEC
  const chaves = {}; xs.forEach(m => Object.keys(m.campos || {}).forEach(k => { chaves[k] = chaves[k] || new Map(); const v = String(m.campos[k]); chaves[k].set(v, (chaves[k].get(v) || 0) + 1); }));
  const ks = Object.keys(chaves);
  const tipoK = ks.find(k => { const vs = [...chaves[k].keys()].map(norm); return vs.length <= 8 && vs.some(v => v.includes('supervis')) && vs.some(v => v.includes('monitor') || v.includes('qualidade') || v.includes('analista')); });
  const prodK = ks.find(k => k !== tipoK && /produto|fila|campanha|operac|segmento|servic|tipo de liga|ies|unidade/.test(norm(k)) && chaves[k].size >= 2 && chaves[k].size <= 14);
  const fbK = ks.find(k => /feedback|devolutiva/.test(norm(k)));
  const pecK = ks.filter(k => /^pec\b|^pec /i.test(norm(k)) || /^pec/.test(norm(k)));
  const crit = new Set(); xs.forEach(m => Object.keys(m.crit || {}).forEach(k => crit.add(k)));
  // sem coluna de tipo: avaliador que é supervisor no BD conta como supervisor
  const q = ler('inovacao_treinamento_quadro_v1', {}) || {};
  const sups = new Set((q.itens || []).map(c => norm(c.supervisor)).concat((q.gestao || []).map(g => norm(g.nome))).filter(Boolean));
  const tipoDe = m => {
    if (tipoK) { const v = norm(m.campos[tipoK] || ''); return v.includes('supervis') ? 'Supervisor' : v ? 'Monitor' : ''; }
    const a = norm(m.avaliador); if (!a) return '';
    const p = a.split(' '); return [...sups].some(s => s === a || (p.length > 1 && s.startsWith(p[0] + ' ') && s.includes(p[p.length - 1]))) ? 'Supervisor' : 'Monitor';
  };
  const fbDe = m => { if (!fbK) return null; const v = m.campos[fbK]; if (v === undefined || v === null || v === '') return false; const c = confDe(v); return c === undefined ? true : c === null ? null : c > 0; };
  return { tipoK, prodK, fbK, pecK, crit: [...crit], tipoDe, fbDe };
}
const media_ = xs => { const v = xs.filter(x => x !== null && x !== undefined && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const curto = n => { const p = String(n || '—').split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };

function dashboardMon(filtro, ant, mesesAsc, porMes) {
  const P = perfilBase(filtro), mt = metasMon();
  const notas = filtro.map(m => m.nota), md = media_(notas), mdAnt = media_(ant.map(m => m.nota));
  filtro.forEach(m => { m._t = P.tipoDe(m); m._fb = P.fbDe(m); });
  const sup = filtro.filter(m => m._t === 'Supervisor'), mon = filtro.filter(m => m._t === 'Monitor');
  const fbs = filtro.filter(m => m._fb !== null), fbOk = fbs.filter(m => m._fb).length;
  const metaN = mt.nota || META;
  const nam = notas.filter(n => n !== null && n >= metaN).length, nn = notas.filter(n => n !== null).length;
  const anelAt = (tit, real, meta, cor) => meta ? DB.anel({ pct: real / meta, titulo: tit, centro: fmt(real / meta * 100, 0) + '%', sub: `${real} de ${meta}`, cor }) : DB.anel({ pct: 0, titulo: tit, centro: real.toLocaleString('pt-BR'), sub: 'monitorias · sem meta', cor });
  // crítérios: site + planilha
  const critSite = CRITERIOS.map(([k, t, peso]) => { const xs = filtro.map(m => FATOR[(m.respostas || {})[k]]).filter(v => v !== null && v !== undefined); return { t, pct: xs.length ? media_(xs) : null, n: xs.length }; });
  const critPl = P.crit.map(k => { const xs = filtro.map(m => (m.crit || {})[k]).filter(v => v !== null && v !== undefined); return { t: k, pct: xs.length ? media_(xs) : null, n: xs.length }; });
  const crits = critSite.concat(critPl).filter(c => c.pct !== null).sort((a, b) => a.pct - b.pct);
  const pecs = P.pecK.map(k => { const xs = filtro.map(m => m.campos[k]).map(v => typeof v === 'number' ? v : A.num(String(v ?? '').replace('%', ''))).filter(v => v !== null && isFinite(v)); const v = media_(xs); return v === null ? null : { k, v: v > 1.5 ? v / 100 : v }; }).filter(Boolean);
  const html = `
  <div class="db-hero db-hero-mon">
    <div class="db-hero-q cartao db-aneis">${anelAt('Geral', filtro.length, mt.geral || ((mt.supervisor || 0) + (mt.monitor || 0)) || 0, '#f5c542')}${P.tipoK || sup.length ? anelAt('Supervisor', sup.length, mt.supervisor || 0, '#1baf7a') + anelAt('Monitor', mon.length, mt.monitor || 0, '#c77dff') : ''}</div>
    <div class="db-bigs">
      <div class="db-big" style="--c:#2a78d6"><span class="db-big-ic">${G.ic('headset')}</span><small>Monitorias lançadas</small><b>${filtro.length.toLocaleString('pt-BR')}</b><div class="db-big-rod">${DB.delta(filtro.length, ant.length, 1, 'n')}${DB.spark(mesesAsc.map(m => (porMes[m] || []).length), '#2a78d6')}</div><em>${new Set(filtro.map(m => m.matricula || m.nome)).size} consultores avaliados</em></div>
      <div class="db-big" style="--c:#1baf7a"><span class="db-big-ic">${G.ic('star')}</span><small>Nota média</small><b>${md === null ? '—' : fmt(md, 1) + '%'}</b><div class="db-big-rod">${DB.delta(md === null ? null : md / 100, mdAnt === null ? null : mdAnt / 100, 1, 'pct')}${DB.spark(mesesAsc.map(m => media_((porMes[m] || []).map(x => x.nota))), '#1baf7a')}</div><em>${nn ? fmt(nam / nn * 100, 0) + '% na meta de ' + metaN + '%' : '&nbsp;'}</em></div>
      ${sup.length || mon.length ? `<div class="db-big" style="--c:#8e44c9"><span class="db-big-ic">${G.ic('users')}</span><small>Nota supervisor × monitor</small><b>${sup.length ? fmt(media_(sup.map(m => m.nota)), 1) : '—'}<span class="db-x">×</span>${mon.length ? fmt(media_(mon.map(m => m.nota)), 1) : '—'}</b><div class="db-big-rod"><span class="db-delta neutro">${sup.length} sup. · ${mon.length} mon.</span></div><em>${P.tipoK ? 'coluna ' + esc(P.tipoK) : 'supervisor = avaliador que é supervisor no BD'}</em></div>` : ''}
      ${P.fbK ? `<div class="db-big" style="--c:#eb6834"><span class="db-big-ic">${G.ic('send')}</span><small>Feedback aplicado</small><b>${fbs.length ? fmt(fbOk / fbs.length * 100, 0) + '%' : '—'}</b><div class="db-big-rod"><span class="db-delta neutro">${fbOk} de ${fbs.length}</span></div><em>coluna ${esc(P.fbK)}</em></div>` : ''}
    </div>
  </div>
  ${pecs.length || crits.length ? `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('activity')}</span><div><h2>${pecs.length ? 'PEC e critérios' : 'Critérios'}</h2><p>Conformidade no mês · do mais fraco para o mais forte</p></div>${!pecs.length && crits[0] && crits[0].pct < .85 && A.planejarReciclagem && pode('agenda') ? `<div class="cab-acoes"><button type="button" class="btn btn-sec" id="monRecicla">${G.ic('rocket')}Reciclagem: ${esc(crits[0].t)}</button></div>` : ''}</header>
    <div class="db-gauges">${pecs.map(p => DB.medidor({ valor: p.v, texto: fmt(p.v * 100, 1) + '%', rotulo: p.k, razao: p.v / .9 })).join('')}${crits.slice(0, pecs.length ? 6 : 12).map(c => DB.medidor({ valor: c.pct, texto: fmt(c.pct * 100, 0) + '%', rotulo: c.t, razao: c.pct / .9, sub: `<span class="db-meta-t">${c.n} avaliações</span>` })).join('')}</div></article>` : ''}
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('chart')}</span><div><h2>${P.prodK ? 'Nota por ' + esc(P.prodK.toLowerCase()) : 'Nota por canal'}</h2><p>${sup.length && mon.length ? 'Supervisor × monitor' : 'Média do mês'}</p></div></header><div id="dmProd"></div></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Média por equipe</h2><p>Supervisor do consultor · linha = meta ${metaN}%</p></div></header><div id="dmEquipe"></div></article>
  </div>
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('send')}</span><div><h2>Supervisor × ${P.fbK ? 'feedback' : 'monitorias'}</h2><p>Monitorias lançadas${P.fbK ? ' e feedbacks aplicados' : ''} por equipe</p></div></header><div id="dmSupFb"></div></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Por avaliador</h2><p>Quantidade e nota média dada</p></div></header><div id="dmAval"></div></article>
  </div>
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('histogram')}</span><div><h2>Distribuição das notas</h2><p>Quantas monitorias em cada faixa</p></div></header><div id="dmHist"></div></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('alert')}</span><div><h2>Consultores abaixo da meta</h2><p>Média do mês abaixo de ${metaN}% · clique para abrir a ficha</p></div></header><div id="dmAbaixo"></div></article>
  </div>
  ${mesesAsc.length > 1 ? `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('chart')}</span><div><h2>Evolução</h2><p>Monitorias e nota média por mês</p></div></header><div id="dmEvo"></div></article>` : ''}`;
  const depois = () => {
    const el = id => document.getElementById(id);
    const grp = (xs, f) => { const o = {}; xs.forEach(m => { const k = f(m) || '—'; (o[k] = o[k] || []).push(m); }); return o; };
    const ord = o => Object.keys(o).sort(cmpTxt);
    const pk = grp(filtro, m => P.prodK ? m.campos[P.prodK] : m.canal);
    const cats = ord(pk).slice(0, 12);
    DB.agrupadas(el('dmProd'), cats, sup.length && mon.length ? [{ nome: 'Monitor', cor: '#8e44c9', valores: cats.map(c => media_(pk[c].filter(m => m._t === 'Monitor').map(m => m.nota))) }, { nome: 'Supervisor', cor: '#1baf7a', valores: cats.map(c => media_(pk[c].filter(m => m._t === 'Supervisor').map(m => m.nota))) }] : [{ nome: 'Nota', cor: '#2a78d6', valores: cats.map(c => media_(pk[c].map(m => m.nota))) }], { fmt: v => fmt(v, 1) + '%', meta: metaN, max: 105 });
    const eq = grp(filtro, m => m.supervisor); const eqs = ord(eq).filter(k => k !== '—');
    DB.agrupadas(el('dmEquipe'), eqs.map(curto), [{ nome: 'Nota média', cor: '#1baf7a', valores: eqs.map(k => media_(eq[k].map(m => m.nota))) }], { fmt: v => fmt(v, 1) + '%', meta: metaN, max: 105 });
    DB.linhasCat(el('dmSupFb'), eqs.map(curto), [{ nome: 'Monitorias lançadas', cor: '#1d4f91', valores: eqs.map(k => eq[k].length) }].concat(P.fbK ? [{ nome: 'Feedbacks aplicados', cor: '#1baf7a', valores: eqs.map(k => eq[k].filter(m => m._fb).length) }] : []), { curto: v => fmt(v, 0) });
    const av = grp(filtro, m => m.avaliador); const avs = ord(av).filter(k => k !== '—').sort((a, b) => av[b].length - av[a].length).slice(0, 14);
    G.ranking(el('dmAval'), avs.map(k => ({ rotulo: k, sub: `nota média ${fmt(media_(av[k].map(m => m.nota)), 1)}%${P.tipoK || sup.length ? ' · ' + (av[k][0]._t || '') : ''}`, valor: av[k].length, rotuloValor: av[k].length + (P.fbK ? ` · ${av[k].filter(m => m._fb).length} fb` : ''), cor: av[k][0]._t === 'Supervisor' ? '#1baf7a' : '#8e44c9' })), { vazio: 'Sem avaliador na base' });
    const faixas = [['< 50%', 0, 50, '#d03b3b'], ['50–70%', 50, 70, '#eb6834'], ['70–85%', 70, 85, '#eda100'], ['85–95%', 85, 95, '#8bc34a'], ['≥ 95%', 95, 1e9, '#0f9d58']];
    G.colunas(el('dmHist'), faixas.map(([r, a, b, cor]) => { const n = filtro.filter(m => m.nota !== null && m.nota >= a && m.nota < b).length; return { rotulo: r, valor: n, cor, tip: `<b>${r}</b><br>${n} monitoria(s)` }; }), { altura: 230 });
    const pc = grp(filtro, m => m.nome); const ab = Object.entries(pc).map(([n, xs]) => ({ n, sup: xs[0].supervisor, v: media_(xs.map(m => m.nota)), q: xs.length })).filter(x => x.v !== null && x.v < metaN).sort((a, b) => a.v - b.v);
    el('dmAbaixo').innerHTML = ab.length ? `<ul class="db-alerta">${ab.slice(0, 12).map(x => `<li data-nome="${esc(x.n)}"><div><b>${esc(x.n)}</b><small>${esc(x.sup || '')} · ${x.q} monitoria(s)</small></div><span>${tagNota(x.v)}</span></li>`).join('')}</ul>${ab.length > 12 ? `<p class="dica">+ ${ab.length - 12} consultor(es)</p>` : ''}` : '<p class="dica">Todos os consultores avaliados estão na meta. 👏</p>';
    el('dmAbaixo').querySelectorAll('[data-nome]').forEach(x => x.onclick = () => A.abrirFicha && A.abrirFicha(x.dataset.nome));
    if (el('dmEvo')) DB.linhasCat(el('dmEvo'), mesesAsc.map(mesTxt), [{ nome: 'Nota média (%)', cor: '#1baf7a', valores: mesesAsc.map(m => media_((porMes[m] || []).map(x => x.nota))) }], { curto: v => fmt(v, 0), fmt: v => fmt(v, 1) + '%' });
    if (el('monRecicla')) el('monRecicla').onclick = () => A.planejarReciclagem(`Reciclagem: ${crits[0].t}`, filtro.filter(m => { const v = (m.crit || {})[crits[0].t] ?? FATOR[(m.respostas || {})[crits[0].t]]; return v !== undefined && v !== 1; }).map(m => m.nome));
  };
  return { html, depois };
}
function abrirMetasMon() {
  const D = ler(KEY_DES, {}) || {}, mt = D.metasMon || {};
  if (!document.getElementById('dlgMetaMon')) document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg" id="dlgMetaMon"><form method="dialog" class="dlg-in" id="mmForm"></form></dialog>`);
  const f = document.getElementById('mmForm');
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Metas de monitoria</h2><p>Quantidade por mês e nota mínima</p></div></header>
    <div class="grade g2"><label class="campo"><span>Monitorias dos supervisores</span><input type="number" id="mmSup" min="0" value="${mt.supervisor || ''}"></label><label class="campo"><span>Monitorias dos monitores</span><input type="number" id="mmMon" min="0" value="${mt.monitor || ''}"></label>
    <label class="campo"><span>Meta geral (em branco = soma)</span><input type="number" id="mmGer" min="0" value="${mt.geral || ''}"></label><label class="campo"><span>Nota meta (%)</span><input type="number" id="mmNota" min="0" max="100" value="${mt.nota || META}"></label></div>
    <div class="dlg-rod"><small class="msg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="mmOk">${G.ic('check')}Salvar</button></span></div>`;
  G.icones(f); document.getElementById('dlgMetaMon').showModal();
  document.getElementById('mmOk').onclick = () => {
    const v = id => +document.getElementById(id).value || 0;
    const D2 = ler(KEY_DES, {}) || {}; D2.metasMon = { supervisor: v('mmSup'), monitor: v('mmMon'), geral: v('mmGer'), nota: v('mmNota') || META };
    gravar(KEY_DES, D2); document.getElementById('dlgMetaMon').close(); render(); toast('Metas de monitoria salvas');
  };
}

function render() {
  lista = ler(KEY, []) || [];
  const tudo = todas();
  const porMes = {}; tudo.forEach(m => { const k = (m.data || '').slice(0, 7); (porMes[k] = porMes[k] || []).push(m); });
  const meses = [...new Set(Object.keys(porMes).concat(hoje().slice(0, 7)))].filter(Boolean).sort().reverse();
  if (!meses.includes(est.mes)) est.mes = meses[0];
  const doMes = porMes[est.mes] || [];
  const sups = [...new Set(doMes.map(m => m.supervisor).filter(Boolean))].sort(cmpTxt);
  const f_ = m => (!est.sup || m.supervisor === est.sup) && (!est.q || norm(m.nome + ' ' + m.avaliador).includes(norm(est.q)));
  const filtro = doMes.filter(f_).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const mesAnt = meses[meses.indexOf(est.mes) + 1];
  const ant = (porMes[mesAnt] || []).filter(f_);
  const mesesAsc = meses.filter(m => porMes[m]).reverse().slice(-12);
  const pm = {}; mesesAsc.forEach(m => { pm[m] = porMes[m].filter(f_); });
  const dash = filtro.length ? dashboardMon(filtro, ant, mesesAsc, pm) : null;
  const POR_PAG = 100; est.pag = est.pag || 1;
  const vis = filtro.slice(0, POR_PAG * est.pag);
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Monitorias de qualidade</h1><p class="sub">Dashboard da qualidade · monitorias do site e da planilha importada</p></div>
    <div class="cab-acoes"><button type="button" class="btn btn-sec" id="monMetas" data-perm="importarDesempenho">${G.ic('target')}Metas</button><button type="button" class="btn btn-sec" id="monImp" data-perm="monitorar">${G.ic('upload')}Importar monitorias</button><button type="button" class="btn btn-pri" id="monNova" data-perm="monitorar">${G.ic('plus')}Nova monitoria</button></div></div>
  <div id="monFormWrap"></div>
  <div class="des-filtros cartao">
    <label class="mini">Mês <select id="monMes">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${mesTxt(m)}${porMes[m] ? ` (${porMes[m].length})` : ''}</option>`).join('')}</select></label>
    <label class="mini">Supervisor <select id="monSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="mini">Consultor ou avaliador <input type="search" id="monBusca" placeholder="Buscar" value="${esc(est.q)}"></label>
  </div>
  ${dash ? dash.html : `<div class="vazio"><b>Nenhuma monitoria em ${mesTxt(est.mes)}.</b><p>Lance uma monitoria ou importe a planilha da qualidade.</p></div>`}
  <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('clipboard')}</span><div><h2>Monitorias do mês</h2><p>${filtro.length.toLocaleString('pt-BR')} registro(s)${filtro.length > vis.length ? ` · mostrando ${vis.length}` : ''}</p></div></header>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Consultor</th><th>Supervisor</th><th>Canal</th><th>Atendimento</th><th class="dir">Nota</th><th>Avaliador</th><th></th></tr></thead><tbody>
    ${vis.map(m => `<tr><td>${dataBR(m.data)}</td><td><b>${esc(m.nome)}</b></td><td>${esc(m.supervisor)}</td><td>${esc(m.canal)}</td><td>${esc(m.atendimento || '—')}</td><td class="dir">${tagNota(m.nota)}${(m.criticas || []).length ? ' <span class="tag ruim" title="' + esc(m.criticas.join(', ')) + '">crítica</span>' : ''}</td><td>${esc(m.avaliador)}${m.origem === 'importada' ? ' <small class="tag neutro" title="' + esc(m.arquivo || '') + '">planilha</small>' : ''}</td>
      <td class="acoes-linha"><button type="button" class="btn-icone" data-ver="${m.id}" title="Ver">${G.ic('edit', '')}</button><button type="button" class="btn-icone" data-del="${m.id}" data-perm="monitorar excluir" title="Excluir">${G.ic('trash', '')}</button></td></tr>`).join('') || '<tr><td colspan="8" class="dica">Nenhuma monitoria.</td></tr>'}
    </tbody></table></div>
    ${filtro.length > vis.length ? `<div class="barra-acoes"><button type="button" class="btn btn-sec" id="monMais">Mostrar mais ${Math.min(POR_PAG, filtro.length - vis.length)}</button></div>` : ''}</article>`;
  G.icones(raiz);
  if (dash) dash.depois();
  const b = id => document.getElementById(id);
  b('monNova').onclick = () => { est.editando = null; est.form = true; formulario(); };
  b('monImp').onclick = abrirImportMon;
  b('monMetas').onclick = abrirMetasMon;
  if (b('monMais')) b('monMais').onclick = () => { est.pag++; render(); };
  b('monMes').onchange = e => { est.mes = e.target.value; est.pag = 1; render(); };
  b('monSup').onchange = e => { est.sup = e.target.value; est.pag = 1; render(); };
  b('monBusca').oninput = e => { est.q = e.target.value; est.pag = 1; clearTimeout(render._t); render._t = setTimeout(() => { render(); const x = b('monBusca'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300); };
  raiz.querySelectorAll('[data-ver]').forEach(x => x.onclick = () => { est.editando = x.dataset.ver; est.form = true; formulario(); });
  raiz.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { const m = todas().find(y => y.id === x.dataset.del); if (!m || !confirm(`Excluir a monitoria de ${m.nome} (${dataBR(m.data)})?`)) return; if (m.loteId) excluirImportada(m); else { lista = (ler(KEY, []) || []).filter(y => y.id !== m.id); salvar(); } render(); toast('Monitoria excluída'); });
  if (est.form) formulario();
}

function formulario() {
  const w = document.getElementById('monFormWrap'); if (!w) return;
  const m = est.editando ? (lista.find(x => x.id === est.editando) || todas().find(x => x.id === est.editando)) : null;
  if (m && m.origem === 'importada') return verImportada(m);
  const so = m && !pode('monitorar');
  const usuario = (window.NUVEM && NUVEM.usuario && NUVEM.usuario()) || {};
  w.innerHTML = `<article class="cartao mon-form"><form id="monForm" novalidate autocomplete="off">
    <header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>${m ? 'Monitoria de ' + esc(m.nome) : 'Nova monitoria'}</h2><p>Marque cada critério. N/A não entra no cálculo.</p></div><button type="button" class="btn btn-sec" id="monFechar">Fechar</button></header>
    <div class="grade g4">
      <div class="campo c2"><span>Consultor <i class="obr">*</i></span><div class="auto" id="monAuto"><input id="monNome" placeholder="Digite o nome" value="${esc(m ? m.nome : '')}"${so ? ' disabled' : ''}><ul class="auto-lista" hidden></ul></div></div>
      <label class="campo"><span>Data <i class="obr">*</i></span><input type="date" id="monData" value="${m ? m.data : hoje()}"></label>
      <label class="campo"><span>Canal</span><select id="monCanal">${['Ligação', 'WhatsApp', 'E-mail', 'Chat'].map(c => `<option${m && m.canal === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="campo c2"><span>Atendimento (ID da ligação, negócio ou link)</span><input id="monAt" value="${esc(m ? m.atendimento || '' : '')}"></label>
      <label class="campo c2"><span>Avaliador(a)</span><input id="monAval" value="${esc(m ? m.avaliador : usuario.nome || '')}"></label>
    </div>
    <div class="mon-checklist">${CRITERIOS.map(([k, t, peso, d]) => `<div class="mon-item"><div><b>${esc(t)}</b> <small class="tag neutro">peso ${peso}</small><small class="dica">${esc(d)}</small></div><div class="seg mon-seg" data-k="${k}" data-valor="${m ? (m.respostas || {})[k] || '' : ''}">${RESP.map(([v, txt]) => `<button type="button" data-v="${v}" class="${m && (m.respostas || {})[k] === v ? 'on' : ''}">${txt}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="mon-criticas"><b>${G.ic('alert', '')}Falha crítica (zera a nota)</b>${CRITICAS.map(c => `<label class="ck"><input type="checkbox" value="${esc(c)}"${m && (m.criticas || []).includes(c) ? ' checked' : ''}> ${esc(c)}</label>`).join('')}</div>
    <div class="grade g4">
      <label class="campo c2"><span>Pontos positivos</span><textarea id="monPos" rows="2">${esc(m ? m.positivos || '' : '')}</textarea></label>
      <label class="campo c2"><span>Pontos de melhoria</span><textarea id="monMel" rows="2">${esc(m ? m.melhorias || '' : '')}</textarea></label>
    </div>
    ${m ? '' : `<label class="ck mon-gerar"><input type="checkbox" id="monGerar" checked> Registrar o feedback desta monitoria no histórico do consultor (Buscar), com prazo de reavaliação em <input type="number" id="monPrazo" value="15" min="1" max="90" style="width:64px"> dias</label>`}
    <div class="barra-acoes mon-barra"><div class="msg" id="monMsg"></div><div class="mon-nota">Nota: <b id="monNotaV">—</b></div>${so ? '' : `<button type="submit" class="btn btn-pri">${G.ic('check')}Salvar monitoria</button>`}</div>
  </form></article>`;
  G.icones(w);
  const f = document.getElementById('monForm');
  let alvo = m ? { nome: m.nome, mat: m.matricula, supervisor: m.supervisor } : null;
  A.autocomplete(document.getElementById('monAuto'), {
    fonte: () => vigentes().map(c => c.nome).sort(cmpTxt),
    aoEscolher: v => { const c = vigentes().find(x => norm(x.nome) === norm(v)); alvo = c ? { nome: c.nome, mat: c.mat, supervisor: c.supervisor } : null; }
  });
  const ler_ = () => { const r = {}; $$('.mon-seg', f).forEach(s => { if (s.dataset.valor) r[s.dataset.k] = s.dataset.valor; }); return r; };
  const crits = () => $$('.mon-criticas input:checked', f).map(i => i.value);
  const atual = () => { const n = notaDe(ler_(), crits()); document.getElementById('monNotaV').innerHTML = tagNota(n); };
  f.addEventListener('click', e => { const bt = e.target.closest('.mon-seg button'); if (!bt || so) return; const s = bt.parentElement; s.dataset.valor = bt.dataset.v; $$('button', s).forEach(x => x.classList.toggle('on', x === bt)); atual(); });
  f.addEventListener('change', atual); atual();
  f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
  document.getElementById('monFechar').onclick = () => { est.form = false; est.editando = null; w.innerHTML = ''; };
  f.addEventListener('submit', e => {
    e.preventDefault();
    const msg = document.getElementById('monMsg'), resp = ler_();
    const falta = CRITERIOS.filter(([k]) => !resp[k]).map(c => c[1]);
    if (!alvo) { msg.textContent = 'Escolha o consultor na lista.'; msg.className = 'msg erro'; return; }
    if (falta.length) { msg.textContent = 'Marque todos os critérios (ou N/A): ' + falta.join(', ') + '.'; msg.className = 'msg erro'; return; }
    const reg = m || { id: uid(), criadoEm: new Date().toISOString() };
    Object.assign(reg, { nome: alvo.nome, matricula: alvo.mat || '', supervisor: alvo.supervisor || '', data: document.getElementById('monData').value || hoje(), canal: document.getElementById('monCanal').value, atendimento: document.getElementById('monAt').value.trim(), avaliador: document.getElementById('monAval').value.trim(), respostas: resp, criticas: crits(), positivos: document.getElementById('monPos').value.trim(), melhorias: document.getElementById('monMel').value.trim(), atualizadoEm: new Date().toISOString() });
    reg.nota = notaDe(resp, reg.criticas);
    if (!m) lista.push(reg);
    salvar();
    const g = document.getElementById('monGerar');
    if (g && g.checked && A.registrarFeedback) A.registrarFeedback({ nome: reg.nome, matricula: reg.matricula, supervisor: reg.supervisor, data: reg.data, feedbackTipo: reg.nota >= META ? 'Positivo' : 'Construtivo', descricao: `Monitoria ${reg.canal.toLowerCase()} ${dataBR(reg.data)} · nota ${fmt(reg.nota, 1)}%.${reg.positivos ? ' Positivo: ' + reg.positivos + '.' : ''}${reg.melhorias ? ' Melhorar: ' + reg.melhorias + '.' : ''}${reg.criticas.length ? ' Falha crítica: ' + reg.criticas.join(', ') + '.' : ''}`, combinado: reg.melhorias, prazoDias: +(document.getElementById('monPrazo').value || 15), origem: 'Monitoria' });
    est.form = false; est.editando = null; est.mes = reg.data.slice(0, 7); render();
    toast(`Monitoria de ${reg.nome.split(' ')[0]} salva: ${fmt(reg.nota, 1)}%`);
  });
  w.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ---------------- importação de monitorias (planilha da qualidade) ----------------
   Lê .xlsx/.csv, reconhece as colunas principais e guarda as demais como estão,
   para a análise por critério. Reimportar o mesmo arquivo atualiza (não duplica). */
const KEY_MODIMP = 'inovacao_mon_importacao_v1';
const P_CONS = ['consultor', 'agente', 'atendente', 'operador', 'colaborador', 'nome do consultor', 'nome'];
const P_MAT = ['matricula', 'mat', 'id olos', 'login'];
const P_DATA = ['data da monitoria', 'data monitoria', 'data', 'dia', 'date', 'data da ligacao', 'data do atendimento'];
const P_NOTA = ['nota final', 'nota', 'score', 'pontuacao', 'resultado', 'nota monitoria', '%'];
const P_AVAL = ['avaliador', 'monitor', 'monitora', 'auditor', 'analista', 'responsavel'];
const P_CANAL = ['canal', 'tipo de atendimento', 'midia'];
const P_AT = ['protocolo', 'id da ligacao', 'id ligacao', 'ligacao', 'id atendimento', 'atendimento', 'negocio', 'link', 'telefone'];
const P_SUP = ['supervisor', 'supervisora', 'lider'];
const P_POS = ['pontos positivos', 'positivo', 'pontos fortes'];
const P_MEL = ['pontos de melhoria', 'melhoria', 'oportunidade', 'observacao', 'observacoes', 'comentario', 'comentarios', 'feedback'];
const hashTxt = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const dataISO = v => { if (v === null || v === undefined || v === '') return ''; const d = XLSXLeitor.dataExcel(typeof v === 'number' ? Math.floor(v) : v); return d || ''; };
const txtCel = v => v === null || v === undefined ? '' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : String(v).trim();
let dlgImp = null;
function abrirImportMon() {
  if (!dlgImp) { document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-grande" id="dlgMonImp"><form method="dialog" class="dlg-in" id="monImpForm" novalidate></form></dialog>`); dlgImp = document.getElementById('dlgMonImp'); }
  const f = document.getElementById('monImpForm');
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('upload')}</span><div><h2>Importar monitorias</h2><p>Planilha (.xlsx) ou CSV da qualidade · uma linha por monitoria</p></div></header>
    <div class="grade g3">
      <label class="campo c2"><span>Arquivo <i class="obr">*</i></span><input type="file" id="miArq" accept=".xlsx,.xlsm,.csv,.txt"></label>
      <label class="campo"><span>Mês (se não houver coluna de data)</span><input type="month" id="miMes" value="${hoje().slice(0, 7)}"></label>
    </div>
    <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="miLer">${G.ic('arrow-right')}Continuar</button></span></div>`;
  G.icones(f); dlgImp.showModal();
  document.getElementById('miLer').onclick = async () => {
    const file = document.getElementById('miArq').files[0], msg = document.getElementById('miMsg');
    if (!file) { msg.textContent = 'Escolha o arquivo.'; msg.className = 'msg erro'; return; }
    msg.textContent = 'Lendo o arquivo… (bases grandes levam alguns segundos)'; msg.className = 'msg';
    await new Promise(r => setTimeout(r, 40));
    try {
      const abas = (/\.csv$|\.txt$/i.test(file.name) ? [{ nome: file.name, linhas: A.parseCSV(await file.text()) }] : await XLSXLeitor.lerPlanilha(await file.arrayBuffer())).filter(a => a.linhas && a.linhas.filter(Boolean).length > 1);
      if (!abas.length) throw new Error('O arquivo não tem linhas.');
      // aba mais provável: a que tem coluna de consultor/nota
      const pont = a => { const i = cabDe(a.linhas); const c = (a.linhas[i] || []).map(x => norm(String(x ?? ''))); return [P_CONS, P_NOTA, P_DATA, P_AVAL].filter(p => c.some(x => p.some(q => x === q || x.includes(q)))).length * 1000 + a.linhas.length; };
      abas.sort((a, b) => pont(b) - pont(a));
      mapear({ nome: file.name, abas, mes: document.getElementById('miMes').value || hoje().slice(0, 7) }, 0);
    } catch (e) { msg.textContent = 'Não consegui ler: ' + e.message; msg.className = 'msg erro'; }
  };
}
function cabDe(linhas) {
  for (let i = 0; i < Math.min(30, linhas.length); i++) { const l = linhas[i] || []; if (l.filter(c => c !== null && c !== undefined && String(c).trim() !== '' && isNaN(+c)).length >= 3) return i; }
  return 0;
}
function mapear(arq, iAba) {
  const f = document.getElementById('monImpForm'), aba = arq.abas[iAba], iCab = cabDe(aba.linhas);
  const cab = (aba.linhas[iCab] || []).map(c => String(c ?? '').replace(/\s+/g, ' ').trim());
  const salvo = (ler(KEY_MODIMP, {}) || {})[hashTxt(cab.join('|'))] || {};
  const palpite = lista_ => { const i = cab.findIndex(c => c && lista_.some(p => norm(c) === p)); if (i >= 0) return i; return cab.findIndex(c => c && lista_.some(p => norm(c).includes(p))); };
  const g = { cons: palpite(P_CONS), mat: palpite(P_MAT), data: palpite(P_DATA), nota: palpite(P_NOTA), aval: palpite(P_AVAL), canal: palpite(P_CANAL), at: palpite(P_AT), sup: palpite(P_SUP), pos: palpite(P_POS), mel: palpite(P_MEL), ...salvo };
  const sel = (id, rot, v, obr) => `<label class="campo"><span>${rot}${obr ? ' <i class="obr">*</i>' : ''}</span><select id="${id}"><option value="-1">—</option>${cab.map((c, i) => c ? `<option value="${i}"${i === v ? ' selected' : ''}>${esc(c)}</option>` : '').join('')}</select></label>`;
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('layers')}</span><div><h2>${esc(arq.nome)}</h2><p>Confira as colunas. As que não forem escolhidas aqui ficam guardadas como estão (critérios, comentários…).</p></div></header>
    ${arq.abas.length > 1 ? `<label class="campo"><span>Aba</span><select id="miAba">${arq.abas.map((a, i) => `<option value="${i}"${i === iAba ? ' selected' : ''}>${esc(a.nome)} (${a.linhas.filter(Boolean).length} linhas)</option>`).join('')}</select></label>` : ''}
    <div class="grade g4">
      ${sel('miCons', 'Consultor (nome)', g.cons, true)}${sel('miMat', 'Matrícula / login', g.mat)}${sel('miData', 'Data da monitoria', g.data)}${sel('miNota', 'Nota final', g.nota)}
      ${sel('miAval', 'Avaliador(a)', g.aval)}${sel('miCanal', 'Canal', g.canal)}${sel('miAt', 'Atendimento (ID/protocolo)', g.at)}${sel('miSup', 'Supervisor', g.sup)}
      ${sel('miPos', 'Pontos positivos', g.pos)}${sel('miMel', 'Pontos de melhoria / obs.', g.mel)}
    </div>
    <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button type="button" class="btn btn-sec" id="miVoltar">Voltar</button> <button type="button" class="btn btn-pri" id="miProc">${G.ic('check')}Conferir</button></span></div>`;
  G.icones(f);
  if (document.getElementById('miAba')) document.getElementById('miAba').onchange = e => mapear(arq, +e.target.value);
  document.getElementById('miVoltar').onclick = abrirImportMon;
  document.getElementById('miProc').onclick = () => {
    const v = id => +document.getElementById(id).value;
    const m = { cons: v('miCons'), mat: v('miMat'), data: v('miData'), nota: v('miNota'), aval: v('miAval'), canal: v('miCanal'), at: v('miAt'), sup: v('miSup'), pos: v('miPos'), mel: v('miMel') };
    if (m.cons < 0 && m.mat < 0) { const x = document.getElementById('miMsg'); x.textContent = 'Escolha a coluna do consultor (nome ou matrícula).'; x.className = 'msg erro'; return; }
    const mods = ler(KEY_MODIMP, {}) || {}; mods[hashTxt(cab.join('|'))] = m; gravar(KEY_MODIMP, mods);
    conferir(arq, aba, iCab, cab, m);
  };
}
/* respostas de critério (Sim/Não/NA…) → 1 / 0,5 / 0 / vazio */
const CONF = { sim: 1, s: 1, ok: 1, conforme: 1, atende: 1, atendeu: 1, '1': 1, x: 1, yes: 1, nao: 0, n: 0, nok: 0, 'nao conforme': 0, 'nao atende': 0, 'nao atendeu': 0, '0': 0, no: 0, parcial: .5, 'atende parcialmente': .5, 'parcialmente': .5, na: null, 'n/a': null, 'nao se aplica': null, '-': null };
const confDe = v => { const k = norm(String(v ?? '')).replace(/\s+/g, ' '); return Object.prototype.hasOwnProperty.call(CONF, k) ? CONF[k] : undefined; };
/* classifica as colunas extras: critério (Sim/Não), número, categoria (poucos valores) ou texto livre (descartado) */
function classificar(linhas, extras) {
  const crit = [], num_ = [], cat = [], fora = [];
  extras.forEach(([h, i]) => {
    const vs = []; for (const { l } of linhas) { const v = l[i]; if (v !== null && v !== undefined && String(v).trim() !== '') vs.push(v); }
    if (!vs.length) return;
    const conf = vs.filter(v => confDe(v) !== undefined).length;
    if (conf / vs.length >= .8 && new Set(vs.map(v => norm(String(v)))).size <= 6) crit.push([h, i]);
    else if (vs.every(v => typeof v === 'number' || (A.num(String(v).replace('%', '')) !== null && /^[\d.,%\s-]+$/.test(String(v))))) num_.push([h, i]);
    else if (new Set(vs.map(v => String(v).trim())).size <= 40) cat.push([h, i]);
    else fora.push(h);
  });
  return { crit, num: num_, cat, fora };
}
const FIXAS = 10; // data, nome, mat, sup, aval, canal, atendimento, nota, positivos, melhorias
function processarMon(arq, aba, iCab, cab, m) {
  const linhas = []; for (let i = iCab + 1; i < aba.linhas.length; i++) { const l = aba.linhas[i]; if (l && l.some(c => c !== null && c !== undefined && String(c).trim() !== '')) linhas.push({ l, r: i }); }
  const notasBrutas = m.nota < 0 ? [] : linhas.map(x => x.l[m.nota]).map(v => typeof v === 'number' ? v : A.num(String(v ?? '').replace('%', ''))).filter(v => v !== null && isFinite(v));
  let mx = 0; notasBrutas.forEach(v => { if (v > mx) mx = v; });
  const fmtNota = m.nota < 0 ? '' : ((aba.formatos || [])[linhas[0] && linhas[0].r] || [])[m.nota];
  const escala = fmtNota === 'pct' || mx <= 1.0001 ? 100 : mx <= 10 ? 10 : 1;
  const usadas = new Set(Object.values(m).filter(i => i >= 0));
  const extras = cab.map((c, i) => [c, i]).filter(([c, i]) => c && !usadas.has(i));
  const cls = classificar(linhas, extras);
  const idx = A.indiceConsultores ? A.indiceConsultores() : null;
  const achar_ = v => idx && A.identificarCom ? A.identificarCom(v, idx) : null;
  const regs = [], fora = new Set(); let semData = 0;
  const cel = (l, i) => i >= 0 ? txtCel(l[i]) : '';
  for (const { l } of linhas) {
    const nomeTxt = cel(l, m.cons), matTxt = cel(l, m.mat);
    if (!nomeTxt && !matTxt) continue;
    const c = (matTxt && achar_(matTxt)) || (nomeTxt && achar_(nomeTxt)) || null;
    let data = m.data >= 0 ? dataISO(l[m.data]) : '';
    if (!data) { semData++; data = arq.mes + '-01'; }
    let nota = null;
    if (m.nota >= 0) { const raw = l[m.nota]; const n = typeof raw === 'number' ? raw : A.num(String(raw ?? '').replace('%', '')); if (n !== null && isFinite(n)) nota = Math.round(n * escala * 10) / 10; }
    const nome = c ? c.nome : nomeTxt.toUpperCase();
    if (!c) fora.add(nome || matTxt);
    regs.push([data, nome, (c && c.mat) || matTxt, (m.sup >= 0 && cel(l, m.sup).toUpperCase()) || (c && c.supervisor) || '', cel(l, m.aval), cel(l, m.canal), cel(l, m.at).slice(0, 60), nota, cel(l, m.pos).slice(0, 200), cel(l, m.mel).slice(0, 200),
      ...cls.crit.map(([, i]) => { const v = confDe(l[i]); return v === undefined ? null : v; }),
      ...cls.num.map(([, i]) => { const v = typeof l[i] === 'number' ? l[i] : A.num(String(l[i] ?? '').replace('%', '')); return v === null || !isFinite(v) ? null : Math.round(v * 10000) / 10000; }),
      ...cls.cat.map(([, i]) => cel(l, i).slice(0, 60) || null)]);
  }
  return { regs, fora: [...fora], semData, escala, cls };
}
/* grava em lotes por mês (um registro por mês, com as linhas compactadas) */
function montarLotes(arq, r) {
  const chaveArq = hashTxt(norm(arq.nome.replace(/\.[a-z0-9]+$/i, '')));
  const porMes = {}; r.regs.forEach(x => (porMes[x[0].slice(0, 7)] = porMes[x[0].slice(0, 7)] || []).push(x));
  const lotes = [], agora = new Date().toISOString();
  // pacotes de até ~150 KB (o servidor recusa registros acima de 200 KB)
  Object.entries(porMes).forEach(([mes, xs]) => {
    let parte = 1, atual = [], tam = 0;
    const fecha = () => { if (!atual.length) return; lotes.push({ id: `monlote-${chaveArq}-${mes}-${parte}`, tipo: 'lote', arquivo: arq.nome, chaveArq, mes, parte, importadoEm: agora, atualizadoEm: agora, crit: r.cls.crit.map(c => c[0]), num: r.cls.num.map(c => c[0]), cat: r.cls.cat.map(c => c[0]), linhas: atual }); parte++; atual = []; tam = 0; };
    xs.forEach(x => { const t = JSON.stringify(x).length + 1; if (tam + t > 150000) fecha(); atual.push(x); tam += t; });
    fecha();
  });
  return { lotes, chaveArq, meses: Object.keys(porMes).sort() };
}
function conferir(arq, aba, iCab, cab, m) {
  const f = document.getElementById('monImpForm');
  f.querySelector('.dlg-rod .msg').textContent = 'Processando…';
  setTimeout(() => {
    const r = processarMon(arq, aba, iCab, cab, m), { lotes, chaveArq, meses } = montarLotes(arq, r);
    const notas = r.regs.map(x => x[7]).filter(v => v !== null);
    const tam = JSON.stringify(lotes).length;
    f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Conferir antes de salvar</h2><p>${esc(arq.nome)} · ${meses.map(mesTxt).join(', ') || '—'}</p></div></header>
      <div class="an-chips"><span><small>Monitorias</small><b>${r.regs.length.toLocaleString('pt-BR')}</b></span><span><small>Nota média</small><b>${notas.length ? fmt(notas.reduce((a, b) => a + b, 0) / notas.length, 1) + '%' : '—'}</b></span><span><small>Critérios (Sim/Não)</small><b>${r.cls.crit.length}</b></span><span><small>Outros campos</small><b>${r.cls.num.length + r.cls.cat.length}</b></span><span><small>Fora do BD</small><b>${r.fora.length}</b></span></div>
      ${r.semData ? `<p class="aviso-fluxo">${r.semData} linha(s) sem data: ficam em ${mesTxt(arq.mes)}.</p>` : ''}
      ${r.cls.crit.length ? `<p class="dica"><b>Critérios:</b> ${r.cls.crit.map(c => esc(c[0])).join(' · ')}</p>` : ''}
      ${r.cls.num.length + r.cls.cat.length ? `<p class="dica"><b>Também guardados:</b> ${r.cls.num.concat(r.cls.cat).map(c => esc(c[0])).join(' · ')}</p>` : ''}
      ${r.cls.fora.length ? `<p class="dica">Texto livre não guardado (deixa o site leve): ${r.cls.fora.slice(0, 10).map(esc).join(', ')}${r.cls.fora.length > 10 ? '…' : ''}</p>` : ''}
      ${r.fora.length ? `<details class="do-trein"><summary>${G.ic('alert', '')}Não estão no BD atual (${r.fora.length})</summary><ul class="aps-lidos">${r.fora.slice(0, 80).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <p class="dica">Nota na escala ${r.escala === 100 ? '0 a 1 (convertida para %)' : r.escala === 10 ? '0 a 10 (convertida para %)' : '0 a 100'} · ${lotes.length} pacote(s) · ${fmt(tam / 1024, 0)} KB. Importar de novo um arquivo com o mesmo nome substitui os meses dele.</p>
      <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button type="button" class="btn btn-sec" id="miVoltar2">Voltar</button> <button type="button" class="btn btn-pri" id="miSalvar"${r.regs.length ? '' : ' disabled'}>${G.ic('check')}Salvar ${r.regs.length.toLocaleString('pt-BR')} monitoria(s)</button></span></div>`;
    G.icones(f);
    document.getElementById('miVoltar2').onclick = () => mapear(arq, arq.abas.indexOf(aba));
    document.getElementById('miSalvar').onclick = () => {
      lista = ler(KEY, []) || [];
      lista = lista.filter(x => !(x.tipo === 'lote' && x.chaveArq === chaveArq && meses.includes(x.mes)) && !(x.origem === 'importada' && x.arquivo === arq.nome)).concat(lotes);
      try { salvar(); } catch (e) { const x = document.getElementById('miMsg'); x.textContent = 'O navegador ficou sem espaço para guardar esta base. Importe menos meses por arquivo.'; x.className = 'msg erro'; return; }
      dlgImp.close(); est.mes = meses[meses.length - 1] || est.mes; est.pag = 1; render();
      toast(`${r.regs.length.toLocaleString('pt-BR')} monitoria(s) importada(s)`);
      if (window.NUVEM && NUVEM.ativo && NUVEM.ativo()) NUVEM.publicarAgora();
    };
  }, 30);
}
/* lotes viram registros na tela (sem gravar de novo) */
let cacheTxt = null, cacheTodas = [];
function todas() {
  const t = localStorage.getItem(KEY) || '[]';
  if (t === cacheTxt) return cacheTodas;
  const raw = JSON.parse(t) || [], out = [];
  raw.forEach(r => {
    if (r.tipo !== 'lote') { if (r && r.data) out.push(r); return; }
    const nc = (r.crit || []).length, nn = (r.num || []).length;
    (r.linhas || []).forEach((l, i) => {
      const crit = {}, campos = {};
      (r.crit || []).forEach((h, k) => { const v = l[FIXAS + k]; if (v !== null && v !== undefined) { crit[h] = v; campos[h] = v === 1 ? 'Sim' : v === 0 ? 'Não' : 'Parcial'; } });
      (r.num || []).forEach((h, k) => { const v = l[FIXAS + nc + k]; if (v !== null && v !== undefined) campos[h] = v; });
      (r.cat || []).forEach((h, k) => { const v = l[FIXAS + nc + nn + k]; if (v) campos[h] = v; });
      out.push({ id: r.id + ':' + i, loteId: r.id, idx: i, origem: 'importada', arquivo: r.arquivo, data: l[0], nome: l[1], matricula: l[2], supervisor: l[3], avaliador: l[4], canal: l[5], atendimento: l[6], nota: l[7], positivos: l[8], melhorias: l[9], crit, campos, respostas: {}, criticas: [] });
    });
  });
  cacheTxt = t; cacheTodas = out; return out;
}
A.monitorias = todas;
function excluirImportada(m) {
  lista = ler(KEY, []) || [];
  const lt = lista.find(x => x.id === m.loteId); if (!lt) return;
  lt.linhas.splice(m.idx, 1); lt.atualizadoEm = new Date().toISOString();
  if (!lt.linhas.length) lista = lista.filter(x => x !== lt);
  salvar();
}
function verImportada(m) {
  const w = document.getElementById('monFormWrap'); if (!w) return;
  w.innerHTML = `<article class="cartao mon-form"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Monitoria de ${esc(m.nome)}</h2><p>${dataBR(m.data)} · importada de ${esc(m.arquivo || 'planilha')}${m.avaliador ? ' · avaliador(a) ' + esc(m.avaliador) : ''}</p></div><button type="button" class="btn btn-sec" id="monFechar">Fechar</button></header>
    <div class="an-chips"><span><small>Nota</small><b>${tagNota(m.nota)}</b></span><span><small>Supervisor</small><b>${esc(m.supervisor || '—')}</b></span><span><small>Canal</small><b>${esc(m.canal || '—')}</b></span><span><small>Atendimento</small><b>${esc(m.atendimento || '—')}</b></span></div>
    ${m.positivos ? `<p><b>Pontos positivos:</b> ${esc(m.positivos)}</p>` : ''}${m.melhorias ? `<p><b>Pontos de melhoria:</b> ${esc(m.melhorias)}</p>` : ''}
    ${Object.keys(m.campos || {}).length ? `<div class="tabela-wrap"><table class="tabela mon-campos"><tbody>${Object.entries(m.campos).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${typeof v === 'number' ? fmt(v, v % 1 ? 2 : 0) : esc(v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </article>`;
  G.icones(w);
  document.getElementById('monFechar').onclick = () => { est.form = false; est.editando = null; w.innerHTML = ''; };
  w.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* bloco da ficha (Buscar) */
A.blocoMonitorias = p => {
  const xs = todas().filter(m => (p.matricula && m.matricula && String(m.matricula) === String(p.matricula)) || norm(m.nome) === norm(p.nome)).sort((a, b) => b.data.localeCompare(a.data));
  if (!xs.length) return '';
  const md = xs.slice(0, 5).map(x => x.nota).filter(v => v !== null);
  const pior = CRITERIOS.map(([k, t]) => { const v = xs.map(m => FATOR[(m.respostas || {})[k]]).filter(x => x !== null && x !== undefined); return { t, pct: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }; }).filter(c => c.pct !== null).sort((a, b) => a.pct - b.pct)[0];
  return `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Monitorias</h2><p>${xs.length} avaliação(ões) · média das últimas ${md.length}: ${md.length ? fmt(md.reduce((a, b) => a + b, 0) / md.length, 1) + '%' : '—'}${pior ? ` · ponto mais fraco: <b>${esc(pior.t)}</b>` : ''}</p></div></header>
    <div class="mon-evol">${xs.slice(0, 12).reverse().map(x => `<div title="${dataBR(x.data)} · ${fmt(x.nota, 1)}%"><i style="height:${Math.max(4, x.nota || 0)}%;--c:${x.nota >= META ? '#1baf7a' : x.nota >= 70 ? '#eda100' : '#d03b3b'}"></i><small>${dataBR(x.data).slice(0, 5)}</small></div>`).join('')}</div></article>`;
};
A.mediaMonitoria = (p, desdeISO) => { const xs = todas().filter(m => (!desdeISO || m.data >= desdeISO) && ((p.matricula && String(m.matricula) === String(p.matricula)) || norm(m.nome) === norm(p.nome))).map(m => m.nota).filter(v => v !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };

document.addEventListener('aba-aberta', e => { if (e.detail === 'monitorias') render(); });
window.addEventListener('dados-atualizados', () => { if (document.getElementById('aba-monitorias').classList.contains('ativo') && !est.form) render(); });
if (document.getElementById('aba-monitorias').classList.contains('ativo')) render();
})();
