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
function perfilBase(xs) {
  // colunas extras: tipo de avaliador, operação/organização, monitor responsável, feedback e PEC
  const chaves = {}; xs.forEach(m => Object.keys(m.campos || {}).forEach(k => { chaves[k] = chaves[k] || new Map(); const v = String(m.campos[k]); chaves[k].set(v, (chaves[k].get(v) || 0) + 1); }));
  const ks = Object.keys(chaves);
  const tipoK = ks.find(k => { const vs = [...chaves[k].keys()].map(norm); return vs.length <= 8 && vs.some(v => v.includes('supervis')) && vs.some(v => v.includes('monitor') || v.includes('qualidade') || v.includes('analista')); });
  const prodK = ks.find(k => k !== tipoK && /organiza|celula|operac|produto|fila|campanha|segmento|unidade/.test(norm(k)) && chaves[k].size >= 2 && chaves[k].size <= 14)
    || ks.find(k => k !== tipoK && /servic|ies/.test(norm(k)) && chaves[k].size >= 2 && chaves[k].size <= 14);
  const respK = ks.find(k => k !== tipoK && /monitor respons|responsavel|monitor$/.test(norm(k)) && chaves[k].size <= 20);
  const fbK = ks.find(k => /feedback|devolutiva/.test(norm(k)));
  const pecK = ks.filter(k => /^pec/.test(norm(k)) && [...chaves[k].keys()].some(v => !isNaN(A.num(String(v).replace('%', '')))));
  // critérios: os que quase sempre valem 0 são marcas de falha (1 = aconteceu); os demais são conformidade (1 = atendeu)
  const critT = {}; xs.forEach(m => Object.entries(m.crit || {}).forEach(([k, v]) => { if (v === null || v === undefined) return; const c = critT[k] = critT[k] || { s: 0, n: 0 }; c.s += v; c.n++; }));
  if (fbK) delete critT[fbK];
  const falha = Object.keys(critT).filter(k => critT[k].s / critT[k].n < .5 || /^(nao|não|atraso|erro|falta|faltou|deixou|tranferiu|transferiu|protocolo prenchido|protocolo preenchido inc|utilizou|interrompeu)/.test(norm(k)));
  const conf = Object.keys(critT).filter(k => !falha.includes(k));
  const q = ler('inovacao_treinamento_quadro_v1', {}) || {};
  const supsBD = [...new Set((q.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro).map(c => c.supervisor).filter(Boolean))];
  const tipoDe = m => {
    if (tipoK) { const v = norm(m.campos[tipoK] || ''); return v.includes('supervis') ? 'Supervisor' : v ? 'Monitor' : ''; }
    const a = norm(m.avaliador); if (!a) return '';
    return supsBD.some(s => mesmoNome(a, s)) ? 'Supervisor' : 'Monitor';
  };
  const fbDe = m => { if (!fbK) return null; const v = m.campos[fbK]; if (v === undefined || v === null || v === '') return false; const c = confDe(v); return c === undefined ? true : c === null ? null : c > 0; };
  const opDe = m => (prodK && m.campos[prodK]) || '';
  return { tipoK, prodK, respK, fbK, pecK, falha, conf, tipoDe, fbDe, opDe, supsBD, quadro: q };
}
// "Kelly" / "KELLY DOS SANTOS" / "Kelly Santos" são a mesma pessoa
function mesmoNome(a, b) {
  const x = norm(a).split(' ').filter(t => t.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(t)), y = norm(b).split(' ').filter(t => t.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(t));
  if (!x.length || !y.length || x[0] !== y[0]) return false;
  if (x.length === 1 || y.length === 1) return true;
  return x[x.length - 1] === y[y.length - 1] || y.includes(x[x.length - 1]) || x.includes(y[y.length - 1]);
}
const media_ = xs => { const v = xs.filter(x => x !== null && x !== undefined && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const curto = n => { const p = String(n || '—').split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };
const tituloNome = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase()).replace(/\b(Uj|Uva|Ead|Gp|Gsp)\b/g, x => x.toUpperCase());
const iniciais = n => String(n || '?').split(' ').filter(Boolean).map(p => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
const corNota = n => n === null || n === undefined ? '#8a96a8' : n >= 95 ? '#0f9d58' : n >= 85 ? '#1baf7a' : n >= 70 ? '#eda100' : '#d03b3b';

/* ---------- metas (quantidade de monitorias por consultor no mês) ---------- */
const DEF_METAS = { padraoSup: 2, padraoMon: 2, fator: {}, qtd: {}, red: {}, meta: {}, op: {}, extra: [], nota: META };
const metasMon = () => Object.assign({}, DEF_METAS, ((ler(KEY_DES, {}) || {}).metasMon) || {});
function operacaoBD(c) {
  // operação do consultor no BD: Captação → Admissão, Permanência → Serviços; IES UVA/Unijorge
  const o = norm(c.operacao || ''), i = norm(c.ies || '');
  const a = o.includes('capta') ? 'Admissão' : o.includes('perman') ? 'Serviços' : '';
  const b = i.includes('uva') ? 'UVA' : i.includes('unijorge') || i === 'uj' ? 'UJ' : '';
  return a && b ? `${a} ${b}` : '';
}
const chaveOp = s => norm(s).replace(/[^a-z0-9]+/g, ' ').replace(/\bunijorge\b/g, 'uj').trim();
function montarMetas(P, doMes, todasMon) {
  const mt = metasMon(), q = P.quadro;
  const vig = (q.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro);
  // operação de cada consultor: a mais frequente nas monitorias; sem monitoria, a do BD
  const opCons = {}; todasMon.forEach(m => { const o = P.opDe(m); if (!o) return; const k = norm(m.nome); const c = opCons[k] = opCons[k] || {}; c[o] = (c[o] || 0) + 1; });
  const opDeCons = c => { const x = opCons[norm(c.nome)]; if (x) return Object.entries(x).sort((a, b) => b[1] - a[1])[0][0]; return operacaoBD(c); };
  const ops = {}; const opsNome = {};
  todasMon.forEach(m => { const o = P.opDe(m); if (o) opsNome[chaveOp(o)] = opsNome[chaveOp(o)] || o; });
  vig.forEach(c => { const o = opDeCons(c); if (o) { const k = chaveOp(o); opsNome[k] = opsNome[k] || o; (ops[k] = ops[k] || []).push(c); } });
  const fator = (op, t) => { const f = (mt.fator || {})[chaveOp(op)] || {}; return f[t] ?? (t === 'sup' ? mt.padraoSup : mt.padraoMon); };
  // supervisores (equipe do BD)
  const sups = {}; vig.forEach(c => { if (c.supervisor) (sups[c.supervisor] = sups[c.supervisor] || []).push(c); });
  const avalSup = doMes.filter(m => m._t === 'Supervisor');
  const linhasSup = Object.entries(sups).map(([s, eq]) => {
    const opsEq = {}; eq.forEach(c => { const o = opDeCons(c); if (o) opsEq[o] = (opsEq[o] || 0) + 1; });
    const k = 'sup:' + norm(s);
    const opAuto = Object.entries(opsEq).sort((a, b) => b[1] - a[1])[0]?.[0] || '', op = (mt.op || {})[k] || opAuto;
    const qtd = mt.qtd[k] ?? eq.length, red = mt.red[k] || 0, fixa = (mt.meta || {})[k];
    const calc = Math.round(qtd * fator(op, 'sup')), meta = Math.max(0, (fixa ?? calc) - red);
    const minhas = avalSup.filter(m => mesmoNome(m.avaliador || '', s));
    const daEquipe = doMes.filter(m => norm(m.supervisor) === norm(s) || eq.some(c => norm(c.nome) === norm(m.nome)));
    return { tipo: 'sup', chave: k, nome: s, op, opAuto, qtd, qtdAuto: eq.length, red, fator: fator(op, 'sup'), calc, fixa, meta, feitas: minhas.length, fb: minhas.filter(m => m._fb).length, notaDada: media_(minhas.map(m => m.nota)), mediaEquipe: media_(daEquipe.map(m => m.nota)), equipe: daEquipe };
  }).sort((a, b) => cmpTxt(a.nome, b.nome));
  // monitores: cada par monitor × operação que aparece na base
  const pares = {}; todasMon.filter(m => m._t === 'Monitor' && m.avaliador).forEach(m => { const o = P.opDe(m) || '—'; const k = norm(m.avaliador) + '|' + chaveOp(o); pares[k] = pares[k] || { nome: m.avaliador, op: o }; });
  (mt.extra || []).forEach(x => { const k = norm(x.nome) + '|' + chaveOp(x.op); pares[k] = pares[k] || { nome: x.nome, op: x.op, manual: true }; });
  const linhasMon = Object.entries(pares).map(([k0, p]) => {
    const k = 'mon:' + k0, auto = (ops[chaveOp(p.op)] || []).length, qtd = mt.qtd[k] ?? auto, red = mt.red[k] || 0, fixa = (mt.meta || {})[k];
    const calc = Math.round(qtd * fator(p.op, 'mon')), meta = Math.max(0, (fixa ?? calc) - red);
    const minhas = doMes.filter(m => m._t === 'Monitor' && norm(m.avaliador) === norm(p.nome) && chaveOp(P.opDe(m) || '—') === chaveOp(p.op));
    return { tipo: 'mon', chave: k, nome: p.nome, op: p.op, manual: !!p.manual, qtd, qtdAuto: auto, red, fator: fator(p.op, 'mon'), calc, fixa, meta, feitas: minhas.length, fb: minhas.filter(m => m._fb).length, notaDada: media_(minhas.map(m => m.nota)), minhas };
  }).sort((a, b) => cmpTxt(a.nome, b.nome) || cmpTxt(a.op, b.op));
  return { mt, linhasSup, linhasMon, opsNome, fator };
}

/* ---------- desenho ---------- */
function trilha(rot, feitas, meta, cor, ritmo) {
  const p = meta ? feitas / meta : 0;
  return `<div class="q-trilha" style="--c:${cor}"><div class="q-tr-cab"><span>${esc(rot)}</span><b>${feitas.toLocaleString('pt-BR')}<small> / ${meta ? meta.toLocaleString('pt-BR') : 'sem meta'}</small></b><em>${meta ? fmt(p * 100, 1) + '%' : '—'}</em></div>
    <div class="q-tr-barra"><i style="--w:${Math.min(100, p * 100)}%"></i>${meta && ritmo ? `<u style="left:${Math.min(100, ritmo * 100)}%" data-tip="Ritmo esperado para hoje: ${fmt(ritmo * 100, 0)}% da meta"></u>` : ''}</div>
    ${meta ? `<small class="q-tr-rod">${feitas >= meta ? '✓ meta batida' : `faltam ${(meta - feitas).toLocaleString('pt-BR')}`}${ritmo ? ` · ${p >= ritmo ? 'no ritmo' : 'abaixo do ritmo do mês'}` : ''}</small>` : '<small class="q-tr-rod">defina a quantidade de monitorias por consultor em ⚙ Metas</small>'}</div>`;
}
function halter(cats, a, b, nomes, cores) {
  // gráfico de halteres: duas notas por operação na mesma régua
  const vals = cats.flatMap((_, i) => [a[i], b[i]]).filter(v => v !== null);
  if (!vals.length) return '<p class="dica">Sem notas.</p>';
  const mn = Math.max(0, Math.floor(Math.min(...vals) / 5) * 5 - 5), mx = 100;
  const x = v => (v - mn) / (mx - mn) * 100;
  return `<div class="q-halter"><div class="q-h-esc"><span style="left:0">${mn}%</span><span style="left:50%">${(mn + mx) / 2}%</span><span style="left:100%">100%</span></div>
    ${cats.map((c, i) => { const va = a[i], vb = b[i]; const l = Math.min(x(va ?? vb), x(vb ?? va)), r = Math.max(x(va ?? vb), x(vb ?? va)); return `<div class="q-h-l"><span class="q-h-rot">${esc(c)}</span><div class="q-h-trilho"><i class="q-h-ligacao" style="left:${l}%;width:${r - l}%"></i>
      ${va !== null ? `<b class="q-h-pt" style="left:${x(va)}%;--c:${cores[0]}" data-tip="${esc(nomes[0])}: ${fmt(va, 2)}%"><em>${fmt(va, 1)}</em></b>` : ''}${vb !== null ? `<b class="q-h-pt" style="left:${x(vb)}%;--c:${cores[1]}" data-tip="${esc(nomes[1])}: ${fmt(vb, 2)}%"><em>${fmt(vb, 1)}</em></b>` : ''}</div></div>`; }).join('')}
    <div class="g-leg"><span><i style="background:${cores[0]}"></i>${esc(nomes[0])}</span><span><i style="background:${cores[1]}"></i>${esc(nomes[1])}</span></div></div>`;
}
function porOrganizacao(linhas, tit) {
  const o = {}; linhas.forEach(l => { const k = l.op || '—'; const x = o[k] = o[k] || { meta: 0, feitas: 0 }; x.meta += l.meta; x.feitas += l.feitas; });
  const tm = Object.values(o).reduce((a, x) => a + x.meta, 0), tf = Object.values(o).reduce((a, x) => a + x.feitas, 0);
  if (!Object.keys(o).length) return '';
  return `<div class="q-org"><table class="tabela"><thead><tr><th>${esc(tit)}</th><th class="dir">Meta</th><th class="dir">Feitas</th><th class="dir">Ating.</th></tr></thead><tbody>${Object.entries(o).sort((a, b) => cmpTxt(a[0], b[0])).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="dir">${x.meta}</td><td class="dir">${x.feitas}</td><td class="dir"><b style="color:${x.meta ? (x.feitas >= x.meta ? '#1baf7a' : '#d03b3b') : 'inherit'}">${x.meta ? fmt(x.feitas / x.meta * 100, 2) + '%' : '—'}</b></td></tr>`).join('')}<tr class="des-tot"><td><b>Total</b></td><td class="dir"><b>${tm}</b></td><td class="dir"><b>${tf}</b></td><td class="dir"><b>${tm ? fmt(tf / tm * 100, 2) + '%' : '—'}</b></td></tr></tbody></table></div>`;
}
function linhaMeta(l, ehSup) {
  const p = l.meta ? l.feitas / l.meta : null;
  return `<tr><td><b>${esc(tituloNome(l.nome))}</b><small>${esc(l.op || '—')}</small></td><td class="dir">${l.qtd}${l.qtd !== l.qtdAuto ? '<sup title="ajustado">*</sup>' : ''}</td><td class="dir">${l.meta}${l.red ? `<small> (−${l.red})</small>` : ''}</td><td class="dir">${l.feitas}</td>
    <td class="q-ent"><div class="q-ent-b"><i style="width:${Math.min(100, (p || 0) * 100)}%;background:${p === null ? '#8a96a8' : p >= 1 ? '#1baf7a' : p >= .7 ? '#eda100' : '#d03b3b'}"></i></div><b>${p === null ? '—' : fmt(p * 100, 1) + '%'}</b></td>
    <td><span class="tag ${p === null ? 'neutro' : p >= 1 ? 'bom' : 'ruim'}">${p === null ? 'sem meta' : p >= 1 ? 'Entregou' : 'Não entregou'}</span></td>
    <td class="dir">${l.fb}<small> de ${l.feitas}</small></td><td class="dir">${ehSup ? tagNota(l.mediaEquipe) : tagNota(l.notaDada)}</td></tr>`;
}

function dashboardMon(filtro, ant, mesesAsc, porMes) {
  const tudo = todas();
  const P = perfilBase(tudo);
  const marcar = xs => xs.forEach(m => { if (m._t === undefined) { m._t = P.tipoDe(m); m._fb = P.fbDe(m); } });
  marcar(tudo); marcar(filtro); marcar(ant);
  const M = montarMetas(P, filtro, tudo), mt = M.mt, metaN = mt.nota || META;
  const sup = filtro.filter(m => m._t === 'Supervisor'), mon = filtro.filter(m => m._t === 'Monitor');
  const notas = filtro.map(m => m.nota), md = media_(notas), mdAnt = media_(ant.map(m => m.nota));
  const metaSup = M.linhasSup.reduce((a, l) => a + l.meta, 0), metaMon = M.linhasMon.reduce((a, l) => a + l.meta, 0);
  const hojeISO = hoje(), mesSel = (filtro[0] || {}).data ? filtro[0].data.slice(0, 7) : hojeISO.slice(0, 7);
  const diasMes = new Date(+mesSel.slice(0, 4), +mesSel.slice(5, 7), 0).getDate();
  const ritmo = mesSel === hojeISO.slice(0, 7) ? +hojeISO.slice(8, 10) / diasMes : mesSel < hojeISO.slice(0, 7) ? 1 : 0;
  const ultima = filtro.reduce((a, m) => m.data > a ? m.data : a, '');
  const lotes = (ler(KEY, []) || []).filter(x => x.tipo === 'lote'); const impEm = lotes.reduce((a, x) => (x.importadoEm || '') > a ? x.importadoEm : a, '');
  const fbs = filtro.filter(m => m._fb !== null), fbOk = fbs.filter(m => m._fb).length;
  const consAval = new Set(filtro.map(m => norm(m.nome))).size;
  // operações
  const ops = [...new Set(tudo.map(m => P.opDe(m)).filter(Boolean))].sort(cmpTxt);
  const ano = mesSel.slice(0, 4);
  const opCard = o => {
    const xs = filtro.filter(m => P.opDe(m) === o);
    const ns = media_(xs.filter(m => m._t === 'Supervisor').map(m => m.nota)), nm = media_(xs.filter(m => m._t === 'Monitor').map(m => m.nota));
    const serie = mesesAsc.map(k => media_((porMes[k] || []).filter(m => P.opDe(m) === o).map(m => m.nota)));
    const notaAno = media_(tudo.filter(m => P.opDe(m) === o && (m.data || '').startsWith(ano)).map(m => m.nota));
    const tri = mesesAsc.slice(-3);
    return `<div class="q-op"><div class="q-op-cab"><b>${esc(o)}</b><span class="q-op-ano" style="--c:${corNota(notaAno)}">${notaAno === null ? '—' : fmt(notaAno, 1) + '%'}<small>nota ${ano}</small></span></div>
      <div class="q-op-num"><div><small>Mês</small><b style="color:${corNota(media_(xs.map(m => m.nota)))}">${xs.length ? fmt(media_(xs.map(m => m.nota)), 1) + '%' : '—'}</b><em>${xs.length} monitoria(s)</em></div><div>${DB.spark(serie, '#2a78d6')}<em>últimos ${serie.filter(v => v !== null).length} meses</em></div></div>
      <table class="q-tri"><thead><tr><th></th>${tri.map(k => `<th>${mesTxt(k)}</th>`).join('')}</tr></thead><tbody>${[['Supervisor', 'Supervisor'], ['Monitor', 'Monitor']].map(([t, r]) => `<tr><td>${r}</td>${tri.map(k => { const v = media_((porMes[k] || []).filter(m => P.opDe(m) === o && m._t === t).map(m => m.nota)); return `<td><span style="background:${v === null ? 'transparent' : corNota(v)}" class="q-cel${v === null ? ' vazio' : ''}">${v === null ? '–' : fmt(v, 1)}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  // falhas (ofensores)
  const falhas = P.falha.map(k => { const xs = filtro.filter(m => (m.crit || {})[k] !== undefined); const oc = xs.filter(m => m.crit[k] >= .5); return { k, n: xs.length, oc }; }).filter(f => f.oc.length).sort((a, b) => b.oc.length - a.oc.length);
  const totOc = falhas.reduce((a, f) => a + f.oc.length, 0);
  if (!est.falha || !falhas.some(f => f.k === est.falha)) est.falha = falhas[0] ? falhas[0].k : '';
  const fSel = falhas.find(f => f.k === est.falha);
  const confs = P.conf.map(k => { const xs = filtro.map(m => (m.crit || {})[k]).filter(v => v !== null && v !== undefined); return { k, v: media_(xs), n: xs.length }; }).filter(c => c.v !== null).sort((a, b) => a.v - b.v);
  const pecs = P.pecK.map(k => { const xs = filtro.map(m => m.campos[k]).map(v => typeof v === 'number' ? v : A.num(String(v ?? '').replace('%', ''))).filter(v => v !== null && isFinite(v)); const v = media_(xs); return v === null ? null : { k, v: v > 1.5 ? v / 100 : v }; }).filter(Boolean);
  // ranking de consultores
  const pc = {}; filtro.forEach(m => { const k = norm(m.nome); (pc[k] = pc[k] || []).push(m); });
  const rk = Object.values(pc).map(xs => ({ nome: xs[0].nome, sup: xs[0].supervisor, op: P.opDe(xs[0]), resp: P.respK ? xs[0].campos[P.respK] : (xs.find(m => m._t === 'Monitor') || {}).avaliador || '', v: media_(xs.map(m => m.nota)), q: xs.length })).filter(x => x.v !== null);
  const top = [...rk].sort((a, b) => b.v - a.v || b.q - a.q).slice(0, 15), ofe = [...rk].sort((a, b) => a.v - b.v || b.q - a.q).slice(0, 15);
  const pessoa = (x, i, ruim) => `<li data-nome="${esc(x.nome)}"><span class="q-pos ${ruim ? 'r' : ''}">${i + 1}</span><span class="q-av" style="--c:${corNota(x.v)}">${esc(iniciais(x.nome))}</span><div><b>${esc(tituloNome(x.nome))}</b><small>${esc(tituloNome(x.sup))}${x.op ? ' · ' + esc(x.op) : ''}${x.resp ? ' · ' + esc(tituloNome(x.resp)) : ''}</small></div><em style="--c:${corNota(x.v)}">${fmt(x.v, 1)}%</em></li>`;
  const html = `
  <div class="q-topo"><span>${G.ic('clock', '')} Último lançamento: <b>${ultima ? dataBR(ultima) : '—'}</b>${impEm ? ` · base importada em ${new Date(impEm).toLocaleDateString('pt-BR')} ${new Date(impEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
    </div>
  <section class="q-placar">
    ${trilha('Geral', filtro.length, metaSup + metaMon, '#f5c542', ritmo)}
    ${trilha('Supervisores', sup.length, metaSup, '#1baf7a', ritmo)}
    ${trilha('Monitores', mon.length, metaMon, '#b06ad9', ritmo)}
  </section>
  <div class="q-kpis">
    <div><small>Nota média</small><b style="color:${corNota(md)}">${md === null ? '—' : fmt(md, 2) + '%'}</b>${DB.delta(md === null ? null : md / 100, mdAnt === null ? null : mdAnt / 100, 1, 'pct')}</div>
    <div><small>Nota supervisores</small><b style="color:${corNota(media_(sup.map(m => m.nota)))}">${sup.length ? fmt(media_(sup.map(m => m.nota)), 2) + '%' : '—'}</b><span class="db-delta neutro">${sup.length} monitorias</span></div>
    <div><small>Nota monitores</small><b style="color:${corNota(media_(mon.map(m => m.nota)))}">${mon.length ? fmt(media_(mon.map(m => m.nota)), 2) + '%' : '—'}</b><span class="db-delta neutro">${mon.length} monitorias</span></div>
    <div><small>Feedback realizado</small><b>${fbs.length ? fmt(fbOk / fbs.length * 100, 0) + '%' : '—'}</b><span class="db-delta neutro">${fbOk} de ${fbs.length}</span></div>
    <div><small>Consultores avaliados</small><b>${consAval}</b><span class="db-delta neutro">${notas.filter(n => n !== null && n >= metaN).length} monitorias ≥ ${metaN}%</span></div>
  </div>
  ${ops.length ? `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('layers')}</span><div><h2>Operações</h2><p>Nota do mês, nota do ano, tendência e os últimos 3 meses de supervisor e monitor</p></div></header>
    <div class="q-ops">${ops.map(opCard).join('')}</div>
    <h3 class="db-h3">Supervisor × monitor no mês</h3>${halter(ops, ops.map(o => media_(sup.filter(m => P.opDe(m) === o).map(m => m.nota))), ops.map(o => media_(mon.filter(m => P.opDe(m) === o).map(m => m.nota))), ['Supervisor', 'Monitor'], ['#1baf7a', '#b06ad9'])}</article>` : ''}
  <article class="cartao q-sec q-sec-sup"><header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Supervisores</h2><p>Monitorias feitas pelo supervisor · meta = consultores da equipe × monitorias por consultor${M.linhasSup.length ? '' : ' · sem equipes no BD'}</p></div></header>
    <div class="pn-grade"><div><h3 class="db-h3">Monitorias lançadas × feedback realizado</h3><div id="qSupFb"></div></div><div><h3 class="db-h3">Média da equipe (todas as monitorias dos consultores)</h3><div id="qSupEq"></div></div></div>
    ${porOrganizacao(M.linhasSup, 'Organização')}
    <div class="tabela-wrap"><table class="tabela q-meta"><thead><tr><th>Supervisor</th><th class="dir">Consultores</th><th class="dir">Meta</th><th class="dir">Feitas</th><th>Entrega</th><th>Status</th><th class="dir">Feedback</th><th class="dir">Média equipe</th></tr></thead><tbody>${M.linhasSup.map(l => linhaMeta(l, true)).join('') || '<tr><td colspan="8" class="dica">Importe o BD para montar as equipes.</td></tr>'}</tbody></table></div></article>
  <article class="cartao q-sec q-sec-mon"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Monitores</h2><p>Monitorias feitas pela qualidade · meta = consultores da operação × monitorias por consultor</p></div></header>
    <div class="pn-grade"><div><h3 class="db-h3">Monitorias lançadas × feedback realizado</h3><div id="qMonFb"></div></div><div><h3 class="db-h3">Nota dada pelos monitores a cada equipe</h3><div id="qMonEq"></div></div></div>
    ${porOrganizacao(M.linhasMon, 'Organização')}
    <div class="tabela-wrap"><table class="tabela q-meta"><thead><tr><th>Monitor · operação</th><th class="dir">Consultores</th><th class="dir">Meta</th><th class="dir">Feitas</th><th>Entrega</th><th>Status</th><th class="dir">Feedback</th><th class="dir">Nota média</th></tr></thead><tbody>${M.linhasMon.map(l => linhaMeta(l, false)).join('') || '<tr><td colspan="8" class="dica">Nenhuma monitoria de monitor na base.</td></tr>'}</tbody></table></div></article>
  ${pecs.length || falhas.length || confs.length ? `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('alert')}</span><div><h2>PEC e ofensores</h2><p>${pecs.length ? 'Conformidade de cada PEC · ' : ''}falhas mais frequentes no mês · clique numa falha para ver quem errou</p></div></header>
    ${pecs.length ? `<div class="q-pecs">${pecs.sort((a, b) => b.v - a.v).map(p => `<div class="q-pec" style="--c:${corNota(p.v * 100)}"><span>${esc(p.k)}</span><div><i style="width:${Math.min(100, p.v * 100)}%"></i></div><b>${fmt(p.v * 100, 2)}%</b></div>`).join('')}</div>` : ''}
    ${falhas.length ? `<div class="q-of"><div class="q-of-l"><h3 class="db-h3">Falhas no mês · ${totOc} ocorrência(s)</h3>${falhas.map(f => `<button type="button" class="q-of-it${f.k === est.falha ? ' on' : ''}" data-falha="${esc(f.k)}"><span>${esc(f.k)}</span><i><b style="width:${f.oc.length / falhas[0].oc.length * 100}%"></b></i><em>${f.oc.length}</em><small>${fmt(f.oc.length / (f.n || 1) * 100, 1)}%</small></button>`).join('')}</div>
      <div class="q-of-d">${fSel ? `<h3 class="db-h3">${esc(fSel.k)} · ${fSel.oc.length} vez(es)</h3><div class="q-of-pessoas">${Object.values(fSel.oc.reduce((o, m) => { const k = norm(m.nome); (o[k] = o[k] || { m, n: 0 }).n++; return o; }, {})).sort((a, b) => b.n - a.n).map(({ m, n }) => `<div data-nome="${esc(m.nome)}"><span class="q-av" style="--c:#d03b3b">${esc(iniciais(m.nome))}</span><div><b>${esc(tituloNome(m.nome))}</b><small>${esc(tituloNome(m.supervisor))}${P.opDe(m) ? ' · ' + esc(P.opDe(m)) : ''}</small></div>${n > 1 ? `<em>${n}×</em>` : ''}</div>`).join('')}</div>
        ${A.planejarReciclagem && pode('agenda') ? `<button type="button" class="btn btn-sec btn-mini" id="qRecicla">${G.ic('rocket', '')}Planejar reciclagem sobre esta falha</button>` : ''}` : ''}</div></div>` : confs.length ? `<div class="db-gauges">${confs.slice(0, 12).map(c => DB.medidor({ valor: c.v, texto: fmt(c.v * 100, 0) + '%', rotulo: c.k, razao: c.v / .9, sub: `<span class="db-meta-t">${c.n} avaliações</span>` })).join('')}</div>` : ''}
  </article>` : ''}
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('trophy')}</span><div><h2>Top monitorias</h2><p>Maiores médias de nota final no mês</p></div></header><ol class="q-rank">${top.map((x, i) => pessoa(x, i)).join('')}</ol></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('alert')}</span><div><h2>Top ofensores</h2><p>Menores médias de nota final no mês</p></div></header><ol class="q-rank">${ofe.map((x, i) => pessoa(x, i, true)).join('')}</ol></article>
  </div>`;
  const depois = () => {
    const el = id => document.getElementById(id);
    const sl = M.linhasSup.filter(l => l.feitas || l.meta);
    if (el('qSupFb')) DB.agrupadas(el('qSupFb'), sl.map(l => curto(tituloNome(l.nome))), [{ nome: 'Lançadas', cor: '#1d4f91', valores: sl.map(l => l.feitas) }, { nome: 'Feedback realizado', cor: '#1baf7a', valores: sl.map(l => l.fb) }, { nome: 'Meta', cor: '#c9d3df', valores: sl.map(l => l.meta || null) }], { fmt: v => fmt(v, 0) });
    if (el('qSupEq')) DB.agrupadas(el('qSupEq'), M.linhasSup.map(l => curto(tituloNome(l.nome))), [{ nome: 'Média da equipe', cor: '#1baf7a', valores: M.linhasSup.map(l => l.mediaEquipe) }], { fmt: v => fmt(v, 1) + '%', meta: metaN, max: 105 });
    const ml = M.linhasMon;
    if (el('qMonFb')) DB.agrupadas(el('qMonFb'), ml.map(l => tituloNome(l.nome).split(' ')[0] + ' · ' + String(l.op).replace(/Admiss[ãa]o/i, 'Adm.').replace(/Servi[çc]os/i, 'Serv.')), [{ nome: 'Lançadas', cor: '#6a2c91', valores: ml.map(l => l.feitas) }, { nome: 'Feedback realizado', cor: '#d58ae8', valores: ml.map(l => l.fb) }, { nome: 'Meta', cor: '#c9d3df', valores: ml.map(l => l.meta || null) }], { fmt: v => fmt(v, 0) });
    if (el('qMonEq')) { const eqs = [...new Set(mon.map(m => m.supervisor).filter(Boolean))].sort(cmpTxt); DB.agrupadas(el('qMonEq'), eqs.map(s => curto(tituloNome(s))), [{ nome: 'Nota dos monitores', cor: '#b06ad9', valores: eqs.map(s => media_(mon.filter(m => m.supervisor === s).map(m => m.nota))) }], { fmt: v => fmt(v, 1) + '%', meta: metaN, max: 105 }); }
    raiz.querySelectorAll('[data-falha]').forEach(x => x.onclick = () => { est.falha = x.dataset.falha; render(); });
    raiz.querySelectorAll('.q-rank [data-nome], .q-of-pessoas [data-nome]').forEach(x => x.onclick = () => A.abrirFicha && A.abrirFicha(x.dataset.nome));
    if (el('qRecicla') && fSel) el('qRecicla').onclick = () => A.planejarReciclagem(`Reciclagem: ${fSel.k}`, fSel.oc.map(m => m.nome));
    if (el('monMetas2')) el('monMetas2').onclick = () => abrirMetasMon(M);
  };
  return { html, depois, M };
}
function abrirMetasMon(M) {
  if (!M) { toast('Importe a base de qualidade para montar as metas'); return; }
  const D0 = ler(KEY_DES, {}) || {}, mt = Object.assign({}, DEF_METAS, D0.metasMon || {});
  if (!document.getElementById('dlgMetaMon')) document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-grande" id="dlgMetaMon"><form method="dialog" class="dlg-in" id="mmForm"></form></dialog>`);
  const f = document.getElementById('mmForm'), opsK = Object.keys(M.opsNome).sort();
  const listaOps = `<datalist id="mmOps">${opsK.map(k => `<option value="${esc(M.opsNome[k])}">`).join('')}</datalist>`;
  const linha = (l, sup) => `<tr data-k="${esc(l.chave)}"${l.manual ? ' data-manual="1"' : ''}><td><b>${esc(tituloNome(l.nome))}</b>${l.manual ? ' <button type="button" class="btn-icone mm-del" title="Remover">×</button>' : ''}</td>
    <td>${sup ? `<input class="mm-op" list="mmOps" value="${esc((mt.op || {})[l.chave] || '')}" placeholder="${esc(l.opAuto || '—')}">` : esc(l.op)}</td>
    <td><input type="number" min="0" class="mm-q" value="${mt.qtd[l.chave] ?? ''}" placeholder="${l.qtdAuto}"></td>
    <td><input type="number" min="0" class="mm-m" value="${(mt.meta || {})[l.chave] ?? ''}" placeholder="${l.calc}"></td>
    <td><input type="number" min="0" class="mm-r" value="${mt.red[l.chave] || ''}" placeholder="0"></td>
    <td class="dir"><b class="mm-final">${l.meta}</b></td><td class="dir">${l.feitas}</td></tr>`;
  const cab = t => `<thead><tr><th>${t}</th><th>Operação</th><th>Consultores</th><th>Meta do mês</th><th>Redução</th><th class="dir">Meta final</th><th class="dir">Feitas</th></tr></thead>`;
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Metas de monitoria</h2><p>Digite a <b>meta do mês</b> de cada pessoa. Em branco, o site calcula: consultores × monitorias por consultor (valor em cinza). A redução desconta férias, afastamento ou folga.</p></div></header>
    ${listaOps}
    <h3 class="q-mm-t q-mm-mon">Meta monitores</h3>
    <div class="tabela-wrap"><table class="tabela mm-tab" id="mmMon">${cab('Monitor')}<tbody>${M.linhasMon.map(l => linha(l, false)).join('')}</tbody></table></div>
    <div class="mm-add"><input id="mmNovoNome" placeholder="Nome do monitor"><input id="mmNovoOp" list="mmOps" placeholder="Operação"><button type="button" class="btn btn-sec btn-mini" id="mmAdd">${G.ic('plus', '')}Adicionar monitor</button></div>
    <h3 class="q-mm-t q-mm-sup">Meta supervisores</h3>
    <div class="tabela-wrap"><table class="tabela mm-tab" id="mmSup">${cab('Supervisor')}<tbody>${M.linhasSup.map(l => linha(l, true)).join('')}</tbody></table></div>
    <details class="mm-aj"><summary>Cálculo automático (monitorias por consultor) e nota meta</summary>
      <div class="grade g4"><label class="campo"><span>Supervisor: por consultor</span><input type="number" min="0" step="0.5" id="mmPs" value="${mt.padraoSup}"></label><label class="campo"><span>Monitor: por consultor</span><input type="number" min="0" step="0.5" id="mmPm" value="${mt.padraoMon}"></label><label class="campo"><span>Nota meta (%)</span><input type="number" min="0" max="100" id="mmNota" value="${mt.nota || META}"></label></div>
      ${opsK.length ? `<div class="tabela-wrap"><table class="tabela mm-tab"><thead><tr><th>Operação</th><th>Supervisor por consultor</th><th>Monitor por consultor</th></tr></thead><tbody>${opsK.map(k => { const fz = (mt.fator || {})[k] || {}; return `<tr data-op="${esc(k)}"><td>${esc(M.opsNome[k])}</td><td><input type="number" min="0" step="0.5" class="mm-fs" value="${fz.sup ?? ''}" placeholder="${mt.padraoSup}"></td><td><input type="number" min="0" step="0.5" class="mm-fm" value="${fz.mon ?? ''}" placeholder="${mt.padraoMon}"></td></tr>`; }).join('')}</tbody></table></div>` : ''}</details>
    <div class="dlg-rod"><small class="msg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="mmOk">${G.ic('check')}Salvar metas</button></span></div>`;
  G.icones(f); document.getElementById('dlgMetaMon').showModal();
  // meta final ao vivo
  f.querySelectorAll('tr[data-k]').forEach(tr => { const at = () => { const q = tr.querySelector('.mm-m'), r = tr.querySelector('.mm-r'); const base = q.value.trim() === '' ? +q.placeholder || 0 : +q.value; tr.querySelector('.mm-final').textContent = Math.max(0, base - (+r.value || 0)); }; tr.querySelectorAll('input').forEach(i => i.oninput = at); });
  const extras = [...(mt.extra || [])];
  f.querySelectorAll('.mm-del').forEach(bt => bt.onclick = () => { const tr = bt.closest('tr'); const k = tr.dataset.k.slice(4); const i = extras.findIndex(x => norm(x.nome) + '|' + chaveOp(x.op) === k); if (i >= 0) extras.splice(i, 1); tr.remove(); });
  document.getElementById('mmAdd').onclick = () => {
    const nome = document.getElementById('mmNovoNome').value.trim(), op = document.getElementById('mmNovoOp').value.trim();
    if (!nome || !op) { f.querySelector('.msg').textContent = 'Informe o nome do monitor e a operação.'; f.querySelector('.msg').className = 'msg erro'; return; }
    extras.push({ nome, op }); const k = 'mon:' + norm(nome) + '|' + chaveOp(op);
    document.querySelector('#mmMon tbody').insertAdjacentHTML('beforeend', `<tr data-k="${esc(k)}" data-manual="1"><td><b>${esc(tituloNome(nome))}</b></td><td>${esc(op)}</td><td><input type="number" min="0" class="mm-q" placeholder="0"></td><td><input type="number" min="0" class="mm-m" placeholder="0"></td><td><input type="number" min="0" class="mm-r" placeholder="0"></td><td class="dir"><b class="mm-final">0</b></td><td class="dir">0</td></tr>`);
    document.getElementById('mmNovoNome').value = ''; document.getElementById('mmNovoOp').value = '';
  };
  document.getElementById('mmOk').onclick = () => {
    const n = (el, d) => { if (!el) return d; const v = el.value.trim(); return v === '' ? d : +v; };
    const novo = { padraoSup: n(document.getElementById('mmPs'), 2), padraoMon: n(document.getElementById('mmPm'), 2), nota: n(document.getElementById('mmNota'), META), fator: {}, qtd: {}, red: {}, meta: {}, op: {}, extra: extras };
    f.querySelectorAll('tr[data-op]').forEach(tr => { const s_ = n(tr.querySelector('.mm-fs'), null), m = n(tr.querySelector('.mm-fm'), null); if (s_ !== null || m !== null) novo.fator[tr.dataset.op] = { ...(s_ !== null ? { sup: s_ } : {}), ...(m !== null ? { mon: m } : {}) }; });
    f.querySelectorAll('tr[data-k]').forEach(tr => { const k = tr.dataset.k, q = n(tr.querySelector('.mm-q'), null), mm = n(tr.querySelector('.mm-m'), null), r = n(tr.querySelector('.mm-r'), 0), op = tr.querySelector('.mm-op'); if (q !== null) novo.qtd[k] = q; if (mm !== null) novo.meta[k] = mm; if (r) novo.red[k] = r; if (op && op.value.trim()) novo.op[k] = op.value.trim(); });
    const D2 = ler(KEY_DES, {}) || {}; D2.metasMon = novo; gravar(KEY_DES, D2);
    document.getElementById('dlgMetaMon').close(); render(); toast('Metas de monitoria salvas');
    if (window.NUVEM && NUVEM.ativo && NUVEM.ativo()) NUVEM.publicarAgora();
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
  // busca: nome, matrícula, supervisor, avaliador e campos da planilha; cruza com o BD (matrícula, login, nome completo)
  const qn = norm(est.q || '').trim();
  let alvoBD = null;
  if (qn && A.identificarConsultor) { const c = A.identificarConsultor(est.q.trim()); if (c) alvoBD = c; }
  const casa = m => { if (!qn) return true; const t = norm([m.nome, m.matricula, m.supervisor, m.avaliador, m.canal, m.atendimento, ...Object.values(m.campos || {})].join(' ')); if (qn.split(' ').every(p => t.includes(p))) return true; return !!alvoBD && (norm(m.nome) === norm(alvoBD.nome) || (alvoBD.mat && String(m.matricula) === String(alvoBD.mat)) || mesmoNome(m.nome, alvoBD.nome)); };
  const f_ = m => (!est.sup || m.supervisor === est.sup) && casa(m);
  const filtro = doMes.filter(f_).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const mesAnt = meses[meses.indexOf(est.mes) + 1];
  const ant = (porMes[mesAnt] || []).filter(f_);
  const mesesAsc = meses.filter(m => porMes[m]).reverse().slice(-12);
  const pm = {}; mesesAsc.forEach(m => { pm[m] = porMes[m].filter(f_); });
  const dash = filtro.length ? dashboardMon(filtro, ant, mesesAsc, pm) : null;
  if (dash) est._M = dash.M;
  const POR_PAG = 100; est.pag = est.pag || 1;
  const vis = filtro.slice(0, POR_PAG * est.pag);
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Monitorias de qualidade</h1><p class="sub">Dashboard da qualidade · monitorias do site e da planilha importada</p></div>
    <div class="cab-acoes"><button type="button" class="btn btn-sec" id="monMetas" data-perm="importarDesempenho">${G.ic('target')}Metas de monitoria</button><button type="button" class="btn btn-sec" id="monImp" data-perm="monitorar">${G.ic('upload')}Importar monitorias</button><button type="button" class="btn btn-pri" id="monNova" data-perm="monitorar">${G.ic('plus')}Nova monitoria</button></div></div>
  <div id="monFormWrap"></div>
  <div class="des-filtros cartao">
    <label class="mini">Mês <select id="monMes">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${mesTxt(m)}${porMes[m] ? ` (${porMes[m].length})` : ''}</option>`).join('')}</select></label>
    <label class="mini">Supervisor <select id="monSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="mini">Consultor ou avaliador <input type="search" id="monBusca" list="monSug" placeholder="Nome, matrícula, supervisor…" value="${esc(est.q)}"></label>
    <datalist id="monSug">${[...new Set(tudo.map(m => m.nome).concat(tudo.map(m => m.avaliador)).concat(((ler('inovacao_treinamento_quadro_v1', {}) || {}).itens || []).map(c => c.nome)).filter(Boolean).map(n => tituloNome(n)))].sort(cmpTxt).slice(0, 800).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  </div>
  ${dash ? dash.html : (() => { if (!qn) return `<div class="vazio"><b>Nenhuma monitoria em ${mesTxt(est.mes)}.</b><p>Lance uma monitoria ou importe a planilha da qualidade.</p></div>`; const outros = meses.filter(k => k !== est.mes && (porMes[k] || []).some(f_)).map(k => [k, porMes[k].filter(f_).length]); return `<div class="vazio"><b>Nada encontrado para “${esc(est.q)}” em ${mesTxt(est.mes)}.</b>${alvoBD ? `<p>No BD: <b>${esc(alvoBD.nome)}</b>${alvoBD.supervisor ? ' · ' + esc(alvoBD.supervisor) : ''}${alvoBD.status ? ' · ' + esc(alvoBD.status) : ''}</p>` : ''}${outros.length ? `<p>Encontrado em: ${outros.map(([k, n]) => `<button type="button" class="chip-f mon-ir-mes" data-mes="${k}">${mesTxt(k)} · ${n}</button>`).join(' ')}</p>` : '<p>Sem monitorias com esse nome em nenhum mês.</p>'}</div>`; })()}
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
  b('monMetas').onclick = () => abrirMetasMon(est._M);
  raiz.querySelectorAll('.mon-ir-mes').forEach(x => x.onclick = () => { est.mes = x.dataset.mes; est.pag = 1; render(); });
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
const P_MEL = ['pontos de melhoria', 'ponto de melhoria', 'melhorias', 'oportunidade de melhoria']; // comentários longos não entram por padrão (pesam muito)
const hashTxt = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const dataISO = v => { if (v === null || v === undefined || v === '') return ''; const t = String(v).trim(), m = t.match(/^(\d{4})[\/-](\d{1,2})$/) || t.match(/^(\d{1,2})[\/-](\d{4})$/); if (m) { const [ano, mes] = m[1].length === 4 ? [m[1], m[2]] : [m[2], m[1]]; return `${ano}-${String(mes).padStart(2, '0')}-01`; } const d = XLSXLeitor.dataExcel(typeof v === 'number' ? Math.floor(v) : v); return d || ''; };
const txtCel = v => v === null || v === undefined ? '' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : String(v).trim();
let dlgImp = null;
function abrirImportMon() {
  if (!dlgImp) { document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-grande" id="dlgMonImp"><form method="dialog" class="dlg-in" id="monImpForm" novalidate></form></dialog>`); dlgImp = document.getElementById('dlgMonImp'); }
  const f = document.getElementById('monImpForm');
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('upload')}</span><div><h2>Importar monitorias</h2><p>Planilha (.xlsx) ou CSV da qualidade · uma linha por monitoria</p></div></header>
    <div class="grade g3">
      <label class="campo c2"><span>Arquivo <i class="obr">*</i></span><input type="file" id="miArq" accept=".xlsx,.xlsm,.csv,.txt"></label>
      <div class="campo"><span>O que ler</span><div class="seg mi-modo" id="miModo"><button type="button" data-v="tudo" class="on">Base toda</button><button type="button" data-v="mes">Só um mês</button></div></div>
      <label class="campo"><span id="miMesRot">Mês (para linhas sem data)</span><input type="month" id="miMes" value="${hoje().slice(0, 7)}"></label>
    </div>
    <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="miLer">${G.ic('arrow-right')}Continuar</button></span></div>`;
  G.icones(f); dlgImp.showModal();
  let modo = 'tudo';
  f.querySelectorAll('#miModo button').forEach(bt => bt.onclick = () => { modo = bt.dataset.v; f.querySelectorAll('#miModo button').forEach(x => x.classList.toggle('on', x === bt)); document.getElementById('miMesRot').textContent = modo === 'mes' ? 'Mês que quero ver' : 'Mês (para linhas sem data)'; });
  document.getElementById('miLer').onclick = async () => {
    const file = document.getElementById('miArq').files[0], msg = document.getElementById('miMsg');
    if (!file) { msg.textContent = 'Escolha o arquivo.'; msg.className = 'msg erro'; return; }
    msg.textContent = 'Lendo o arquivo… (bases grandes levam alguns segundos)'; msg.className = 'msg';
    await new Promise(r => setTimeout(r, 40));
    try {
      // aba mais provável: a que tem coluna de consultor/nota (só ela é lida inteira)
      const pont = a => { const i = cabDe(a.linhas); const c = (a.linhas[i] || []).map(x => norm(String(x ?? ''))); return [P_CONS, P_NOTA, P_DATA, P_AVAL].filter(p => c.some(x => p.some(q => x === q || x.includes(q)))).length * 1000 + a.linhas.filter(Boolean).length; };
      const prog = XLSXLeitor.barra(msg);
      const abas = (/\.csv$|\.txt$/i.test(file.name) ? [{ nome: file.name, linhas: A.parseCSV(await file.text()) }] : await XLSXLeitor.lerPlanilha(await file.arrayBuffer(), { progresso: prog, escolher: previas => { const boas = previas.filter(a => a.linhas.filter(Boolean).length > 1).sort((a, b) => pont(b) - pont(a)); return boas.length ? [boas[0].nome] : previas.map(a => a.nome); } })).filter(a => a.linhas && a.linhas.filter(Boolean).length > 1);
      if (!abas.length) throw new Error('O arquivo não tem linhas.');
      abas.sort((a, b) => pont(b) - pont(a));
      mapear({ nome: file.name, abas, mes: document.getElementById('miMes').value || hoje().slice(0, 7), soMes: modo === 'mes' }, 0);
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
  const exato = l_ => cab.findIndex(c => c && l_.some(p => norm(c) === p));
  const g = { cons: palpite(P_CONS), mat: exato(P_MAT), data: palpite(P_DATA), nota: palpite(P_NOTA), aval: palpite(P_AVAL), canal: palpite(P_CANAL), at: exato(P_AT), sup: palpite(P_SUP), pos: palpite(P_POS), mel: palpite(P_MEL), ...salvo };
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
    if (arq.soMes && data.slice(0, 7) !== arq.mes) continue;
    let nota = null;
    if (m.nota >= 0) { const raw = l[m.nota]; const n = typeof raw === 'number' ? raw : A.num(String(raw ?? '').replace('%', '')); if (n !== null && isFinite(n)) nota = Math.round(n * escala * 10) / 10; }
    const nome = c ? c.nome : nomeTxt.toUpperCase();
    if (!c) fora.add(nome || matTxt);
    regs.push([data, nome, (c && c.mat) || matTxt, (m.sup >= 0 && cel(l, m.sup).toUpperCase()) || (c && c.supervisor) || '', cel(l, m.aval), cel(l, m.canal), cel(l, m.at).slice(0, 60), nota, cel(l, m.pos).slice(0, 150), cel(l, m.mel).slice(0, 150),
      ...cls.crit.map(([, i]) => { const v = confDe(l[i]); return v === undefined ? null : v; }),
      ...cls.num.map(([, i]) => { const v = typeof l[i] === 'number' ? l[i] : A.num(String(l[i] ?? '').replace('%', '')); return v === null || !isFinite(v) ? null : Math.round(v * 10000) / 10000; }),
      ...cls.cat.map(([, i]) => cel(l, i).slice(0, 60) || null)]);
  }
  return { regs, fora: [...fora], semData, escala, cls };
}
/* grava em lotes por mês (um registro por mês, com as linhas compactadas) */
function montarLotes(arq, r, mesesSel) {
  const chaveArq = hashTxt(norm(arq.nome.replace(/\.[a-z0-9]+$/i, '')));
  const porMes = {}; r.regs.forEach(x => { const m = x[0].slice(0, 7); if (!mesesSel || mesesSel.includes(m)) (porMes[m] = porMes[m] || []).push(x); });
  const lotes = [], agora = new Date().toISOString(), nc = r.cls.crit.length, nn = r.cls.num.length;
  // compacto: dia do mês e textos repetidos (nome, matrícula, supervisor, avaliador, canal, categorias) viram índice num dicionário
  const ehDic = k => (k >= 1 && k <= 5) || k >= FIXAS + nc + nn;
  Object.entries(porMes).forEach(([mes, xs]) => {
    let parte = 1, atual = [], tam = 0, dic = [], idx = new Map();
    const cod = v => { if (v === null || v === undefined || v === '') return null; let i = idx.get(v); if (i === undefined) { i = dic.length; dic.push(v); idx.set(v, i); tam += String(v).length + 3; } return i; };
    const fecha = () => { if (!atual.length) return; lotes.push({ id: `monlote-${chaveArq}-${mes}-${parte}`, tipo: 'lote', v: 2, arquivo: arq.nome, chaveArq, mes, parte, importadoEm: agora, atualizadoEm: agora, crit: r.cls.crit.map(c => c[0]), num: r.cls.num.map(c => c[0]), cat: r.cls.cat.map(c => c[0]), dic, linhas: atual }); parte++; atual = []; tam = 0; dic = []; idx = new Map(); };
    xs.forEach(x => {
      const l = x.map((v, k) => k === 0 ? +v.slice(8, 10) : ehDic(k) ? cod(v) : v === '' ? null : v);
      while (l.length && l[l.length - 1] === null) l.pop();
      const t = JSON.stringify(l).length + 1; if (tam + t > 140000) fecha();
      atual.push(l); tam += t;
    });
    fecha();
  });
  return { lotes, chaveArq, meses: Object.keys(porMes).sort() };
}
function conferir(arq, aba, iCab, cab, m) {
  const f = document.getElementById('monImpForm');
  f.querySelector('.dlg-rod .msg').textContent = 'Processando…';
  setTimeout(() => {
    const r = processarMon(arq, aba, iCab, cab, m);
    const contaMes = {}; r.regs.forEach(x => { const k = x[0].slice(0, 7); contaMes[k] = (contaMes[k] || 0) + 1; });
    const todosMeses = Object.keys(contaMes).sort();
    // base muito grande: sugere os 6 meses mais recentes (o navegador tem espaço limitado)
    const padrao = r.regs.length > 25000 ? todosMeses.slice(-6) : todosMeses;
    let { lotes, chaveArq, meses } = montarLotes(arq, r, padrao);
    const notas = r.regs.map(x => x[7]).filter(v => v !== null);
    const tam = JSON.stringify(lotes).length;
    f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Conferir antes de salvar</h2><p>${esc(arq.nome)} · ${meses.map(mesTxt).join(', ') || '—'}</p></div></header>
      <div class="an-chips"><span><small>Monitorias</small><b>${r.regs.length.toLocaleString('pt-BR')}</b></span><span><small>Nota média</small><b>${notas.length ? fmt(notas.reduce((a, b) => a + b, 0) / notas.length, 1) + '%' : '—'}</b></span><span><small>Critérios (Sim/Não)</small><b>${r.cls.crit.length}</b></span><span><small>Outros campos</small><b>${r.cls.num.length + r.cls.cat.length}</b></span><span><small>Fora do BD</small><b>${r.fora.length}</b></span></div>
      ${r.semData ? `<p class="aviso-fluxo">${r.semData} linha(s) sem data: ficam em ${mesTxt(arq.mes)}.</p>` : ''}
      ${todosMeses.length > 1 ? `<div class="mi-meses"><b>Meses a importar</b>${todosMeses.map(k => `<label class="ck"><input type="checkbox" value="${k}"${padrao.includes(k) ? ' checked' : ''}> ${mesTxt(k)} <small>${contaMes[k].toLocaleString('pt-BR')}</small></label>`).join('')}${r.regs.length > 25000 ? '<small class="dica">Base grande: marcamos os 6 meses mais recentes para o site continuar leve.</small>' : ''}</div>` : ''}
      ${r.cls.crit.length ? `<p class="dica"><b>Critérios:</b> ${r.cls.crit.map(c => esc(c[0])).join(' · ')}</p>` : ''}
      ${r.cls.num.length + r.cls.cat.length ? `<p class="dica"><b>Também guardados:</b> ${r.cls.num.concat(r.cls.cat).map(c => esc(c[0])).join(' · ')}</p>` : ''}
      ${r.cls.fora.length ? `<p class="dica">Texto livre não guardado (deixa o site leve): ${r.cls.fora.slice(0, 10).map(esc).join(', ')}${r.cls.fora.length > 10 ? '…' : ''}</p>` : ''}
      ${r.fora.length ? `<details class="do-trein"><summary>${G.ic('alert', '')}Não estão no BD atual (${r.fora.length})</summary><ul class="aps-lidos">${r.fora.slice(0, 80).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <p class="dica">Nota na escala ${r.escala === 100 ? '0 a 1 (convertida para %)' : r.escala === 10 ? '0 a 10 (convertida para %)' : '0 a 100'} · <span id="miTam">${lotes.length} pacote(s) · ${fmt(tam / 1024, 0)} KB</span>. Importar de novo um arquivo com o mesmo nome substitui os meses dele.</p>
      <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button type="button" class="btn btn-sec" id="miVoltar2">Voltar</button> <button type="button" class="btn btn-pri" id="miSalvar"${r.regs.length ? '' : ' disabled'}>${G.ic('check')}Salvar ${r.regs.length.toLocaleString('pt-BR')} monitoria(s)</button></span></div>`;
    G.icones(f);
    document.getElementById('miVoltar2').onclick = () => mapear(arq, arq.abas.indexOf(aba));
    const atualizarSel = () => { const sel = [...f.querySelectorAll('.mi-meses input:checked')].map(i => i.value); ({ lotes, chaveArq, meses } = montarLotes(arq, r, sel)); const n = meses.reduce((a, k) => a + contaMes[k], 0); document.getElementById('miTam').textContent = `${lotes.length} pacote(s) · ${fmt(JSON.stringify(lotes).length / 1024, 0)} KB`; document.getElementById('miSalvar').innerHTML = `${G.ic('check', '')}Salvar ${n.toLocaleString('pt-BR')} monitoria(s)`; document.getElementById('miSalvar').disabled = !n; };
    f.querySelectorAll('.mi-meses input').forEach(i => i.onchange = atualizarSel);
    if (todosMeses.length > 1) atualizarSel();
    document.getElementById('miSalvar').onclick = () => {
      lista = ler(KEY, []) || [];
      lista = lista.filter(x => !(x.tipo === 'lote' && x.chaveArq === chaveArq && meses.includes(x.mes)) && !(x.origem === 'importada' && x.arquivo === arq.nome)).concat(lotes);
      const novo = JSON.stringify(lista); let ok = true; try { localStorage.setItem(KEY, novo); } catch (e) { ok = false; }
      if (!ok || (localStorage.getItem(KEY) || '').length !== novo.length) { const x = document.getElementById('miMsg'); x.textContent = 'O navegador ficou sem espaço para guardar tantas monitorias. Desmarque alguns meses e salve de novo.'; x.className = 'msg erro'; return; }
      dlgImp.close(); est.mes = meses[meses.length - 1] || est.mes; est.pag = 1; render();
      toast(`${meses.reduce((a, k) => a + contaMes[k], 0).toLocaleString('pt-BR')} monitoria(s) importada(s)`);
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
    const dz = r.v === 2 ? (v => typeof v === 'number' ? r.dic[v] : v) : (v => v);
    (r.linhas || []).forEach((l0, i) => {
      const l = r.v === 2 ? l0.map((v, k) => k === 0 ? `${r.mes}-${String(v).padStart(2, '0')}` : (k >= 1 && k <= 5) || k >= FIXAS + nc + nn ? dz(v) : v) : l0;
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
/* monitorias de uma pessoa num período (para as análises de treinamento e supervisão) */
A.analiseMonitorias = (nome, mat, ini, fim) => {
  const tudo = todas(); if (!tudo.length) return null;
  const c = A.identificarConsultor ? (mat && A.identificarConsultor(String(mat))) || A.identificarConsultor(nome) : null;
  const nomes = [nome, c && c.nome].filter(Boolean);
  const xs = tudo.filter(m => (m.data || '') >= (ini || '0') && (m.data || '') <= (fim || '9') && ((mat && String(m.matricula) === String(mat)) || nomes.some(n => norm(m.nome) === norm(n) || mesmoNome(m.nome, n)))).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const P = perfilBase(tudo);
  xs.forEach(m => { if (m._t === undefined) { m._t = P.tipoDe(m); m._fb = P.fbDe(m); } });
  const falhas = {}; xs.forEach(m => P.falha.forEach(k => { if ((m.crit || {})[k] >= .5) falhas[k] = (falhas[k] || 0) + 1; }));
  return { lista: xs, media: media_(xs.map(m => m.nota)), sup: media_(xs.filter(m => m._t === 'Supervisor').map(m => m.nota)), mon: media_(xs.filter(m => m._t === 'Monitor').map(m => m.nota)), nSup: xs.filter(m => m._t === 'Supervisor').length, nMon: xs.filter(m => m._t === 'Monitor').length, fb: xs.filter(m => m._fb).length, falhas: Object.entries(falhas).sort((a, b) => b[1] - a[1]), bd: c };
};
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
