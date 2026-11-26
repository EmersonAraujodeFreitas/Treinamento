/* =========================================================
   Painel de Controle · Desempenho
   Importa qualquer relatório (Olos, HubSpot, ponto…) em planilha ou CSV,
   com um assistente que pergunta qual coluna identifica o consultor e o
   que somar/contar. Guarda só o total por consultor e mês (sem as linhas).
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, fmt, esc, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const KEY = 'inovacao_treinamento_desempenho_v1', KEY_Q = 'inovacao_treinamento_quadro_v1', KEY_OC = 'inovacao_treinamento_ocorrencias_v1', KEY_MON = 'inovacao_treinamento_monitorias_v1', KEY_AT = 'inovacao_treinamento_ativos_v1';
const vazio = () => ({ modelos: {}, dados: [], metas: {}, importacoes: [] });
let D = Object.assign(vazio(), ler(KEY, {}) || {});
const salvar = () => gravar(KEY, D);
const pode = x => !window.NUVEM || !NUVEM.pode || NUVEM.pode(x);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTxt = m => m ? `${MESES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}` : '';
const TIPOS = [['contar', 'Contar linhas'], ['contarSe', 'Contar linhas com valor…'], ['somar', 'Somar números'], ['media', 'Média dos números'], ['tempo', 'Somar tempo (hh:mm:ss)'], ['tempoMedio', 'Tempo médio (hh:mm:ss)'], ['pct', 'Percentual (linhas com valor ÷ total)']];

/* ---------------- consultores (BD) e identificação ---------------- */
function consultores() {
  const q = ler(KEY_Q, { itens: [] }) || { itens: [] };
  return (q.itens || []).concat(q.saidas || []);
}
function indice() {
  const m = new Map(), add = (k, c) => { if (k && !m.has(k)) m.set(k, c); };
  consultores().forEach(c => {
    add('m:' + String(c.mat || '').trim(), c); add('o:' + String(c.idOlos || '').trim(), c); add('h:' + String(c.hubspot || '').trim(), c);
    if (c.login) add('l:' + norm(c.login), c);
    if (c.email) { add('e:' + norm(c.email), c); add('l:' + norm(c.email.split('@')[0]), c); }
    add('n:' + norm(c.nome), c);
    const p = norm(c.nome).split(' ').filter(Boolean); if (p.length > 1) add('pu:' + p[0] + ' ' + p[p.length - 1], c);
  });
  m.delete('m:'); m.delete('o:'); m.delete('h:');
  return m;
}
function identificar(v, idx) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim(); if (!t) return null;
  const n = norm(t);
  if (/@/.test(t)) return idx.get('e:' + n) || idx.get('l:' + norm(t.split('@')[0])) || null;
  if (/^\d+$/.test(t)) return idx.get('m:' + t) || idx.get('o:' + t) || idx.get('h:' + t) || null;
  const p = n.split(' ').filter(Boolean);
  return idx.get('n:' + n) || idx.get('l:' + n) || idx.get('l:' + n.replace(/\s+/g, '.')) || (p.length > 1 ? idx.get('pu:' + p[0] + ' ' + p[p.length - 1]) : null) || null;
}
A.consultoresBD = consultores;
A.identificarConsultor = v => identificar(v, indice());

/* ---------------- leitura de arquivos ---------------- */
async function lerArquivo(f) {
  if (/\.csv$|\.txt$/i.test(f.name)) return [{ nome: f.name, linhas: A.parseCSV(await f.text()) }];
  return XLSXLeitor.lerPlanilha(await f.arrayBuffer());
}
function cabecalhoDe(linhas) {
  for (let i = 0; i < Math.min(30, linhas.length); i++) {
    const l = linhas[i] || []; const txt = l.filter(c => c !== null && c !== undefined && String(c).trim() !== '' && isNaN(+c));
    if (txt.length >= 2) return i;
  }
  return 0;
}
const segundos = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v < 1 ? Math.round(v * 86400) : v; // fração de dia do Excel ou segundos
  const m = String(v).trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); if (!m) return num(v);
  return m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
};
const hms = s => { if (s === null || s === undefined || !isFinite(s)) return '—'; s = Math.round(s); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const mesDe = v => { const d = XLSXLeitor.dataExcel(v) || (typeof v === 'string' && (v.match(/^(\d{4}-\d{2})/) || [])[1] ? v.slice(0, 10) : ''); return d ? d.slice(0, 7) : ''; };
const ehTempo = t => t === 'tempo' || t === 'tempoMedio';
const valorTxt = (met, v) => v === null || v === undefined ? '—' : ehTempo(met.tipo) ? hms(v) : met.tipo === 'pct' ? fmt(v * 100, 1) + '%' : met.tipo === 'media' ? fmt(v, 2) : fmt(v, 0);

/* agrega as linhas do relatório por consultor e mês */
function processar(linhas, iCab, modelo, mesPadrao) {
  const cab = (linhas[iCab] || []).map(c => String(c ?? '').trim());
  const ix = nome => cab.indexOf(nome);
  const iC = ix(modelo.colConsultor), iD = modelo.colData ? ix(modelo.colData) : -1;
  const idx = indice(), grupos = new Map(), naoAchados = new Map(); let total = 0;
  for (const l of linhas.slice(iCab + 1)) {
    if (!l || !l.some(c => c !== null && c !== undefined && String(c).trim() !== '')) continue;
    const bruto = l[iC]; if (bruto === null || bruto === undefined || String(bruto).trim() === '') continue;
    total++;
    const c = identificar(bruto, idx);
    if (!c) { naoAchados.set(String(bruto).trim(), (naoAchados.get(String(bruto).trim()) || 0) + 1); continue; }
    const mes = (iD >= 0 && mesDe(l[iD])) || mesPadrao;
    const k = (c.mat || norm(c.nome)) + '|' + mes;
    if (!grupos.has(k)) grupos.set(k, { c, mes, linhas: [] });
    grupos.get(k).linhas.push(l);
  }
  const dados = [...grupos.values()].map(({ c, mes, linhas: ls }) => {
    const m = {};
    modelo.metricas.forEach(met => {
      const i = ix(met.coluna), vals = met.valores || [];
      const bate = l => vals.map(norm).includes(norm(l[i]));
      if (met.tipo === 'contar') m[met.rotulo] = ls.length;
      else if (met.tipo === 'contarSe') m[met.rotulo] = i < 0 ? 0 : ls.filter(bate).length;
      else if (met.tipo === 'pct') m[met.rotulo] = i < 0 || !ls.length ? null : ls.filter(bate).length / ls.length;
      else if (ehTempo(met.tipo)) { const xs = ls.map(l => segundos(l[i])).filter(v => v !== null && isFinite(v)); m[met.rotulo] = !xs.length ? null : met.tipo === 'tempo' ? xs.reduce((a, b) => a + b, 0) : xs.reduce((a, b) => a + b, 0) / xs.length; }
      else { const xs = ls.map(l => num(l[i])).filter(v => v !== null && isFinite(v)); m[met.rotulo] = !xs.length ? null : met.tipo === 'somar' ? xs.reduce((a, b) => a + b, 0) : xs.reduce((a, b) => a + b, 0) / xs.length; }
    });
    return { mat: c.mat || '', nome: c.nome, supervisor: c.supervisor || '', mes, fonte: modelo.fonte, m };
  });
  return { dados, total, naoAchados: [...naoAchados.entries()].sort((a, b) => b[1] - a[1]) };
}

/* ---------------- tela ---------------- */
const raiz = document.getElementById('desRaiz');
const est = { mes: '', fonte: '', sup: '', ord: { k: 'nome', asc: true } };
const metricasDe = fonte => { const md = D.modelos[fonte]; return md ? md.metricas : []; };
function cruzamento(p, mes) {
  const ini = mes + '-01', fim = mes + '-31';
  const k = x => (x.matricula && p.mat && String(x.matricula) === String(p.mat)) || norm(x.nome) === norm(p.nome);
  const oc = (ler(KEY_OC, []) || []).filter(o => o.data >= ini && o.data <= fim && k(o));
  const mon = (ler(KEY_MON, []) || []).filter(o => o.data >= ini && o.data <= fim && k(o));
  const tr = (ler(KEY_AT, []) || []).filter(o => (o.data || '') >= ini && (o.data || '') <= fim && k(o) && o.presenca === 'Presente');
  const notas = mon.map(x => x.nota).filter(v => v !== null && v !== undefined);
  return { faltas: oc.filter(o => o.tipo === 'Falta').length, atest: oc.filter(o => o.tipo === 'Atestado').reduce((s, o) => s + (o.dias || 0), 0), medidas: oc.filter(o => o.tipo === 'Advertência' || o.tipo === 'Suspensão').length, mon: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null, trein: tr.length };
}
function atingimento(rot, v) {
  const mt = D.metas[rot]; if (!mt || mt.valor === null || mt.valor === undefined || v === null || v === undefined) return null;
  const alvo = mt.tipoTempo ? segundos(mt.valor) : +mt.valor; if (!alvo) return null;
  return mt.sentido === 'menor' ? alvo / (v || 1e-9) : v / alvo;
}
function render() {
  D = Object.assign(vazio(), ler(KEY, {}) || {});
  const fontes = Object.keys(D.modelos).sort(cmpTxt);
  if (!est.fonte || !fontes.includes(est.fonte)) est.fonte = fontes[0] || '';
  const meses = [...new Set(D.dados.filter(d => d.fonte === est.fonte).map(d => d.mes))].sort().reverse();
  if (!est.mes || !meses.includes(est.mes)) est.mes = meses[0] || '';
  const mets = metricasDe(est.fonte);
  let linhas = D.dados.filter(d => d.fonte === est.fonte && d.mes === est.mes);
  const sups = [...new Set(linhas.map(d => d.supervisor).filter(Boolean))].sort(cmpTxt);
  if (est.sup) linhas = linhas.filter(d => d.supervisor === est.sup);
  linhas = linhas.map(d => ({ ...d, x: cruzamento(d, d.mes) }));
  const o = est.ord, val = (d, k) => k === 'nome' || k === 'supervisor' ? d[k] : k.startsWith('x.') ? d.x[k.slice(2)] : d.m[k];
  linhas.sort((a, b) => { const x = val(a, o.k), y = val(b, o.k); const r = typeof x === 'number' || typeof y === 'number' ? (x ?? -Infinity) - (y ?? -Infinity) : cmpTxt(x || '', y || ''); return o.asc ? r : -r; });
  const tot = mets.map(mt => { const xs = linhas.map(d => d.m[mt.rotulo]).filter(v => v !== null && v !== undefined); const soma = xs.reduce((a, b) => a + b, 0); return { mt, v: !xs.length ? null : ['media', 'tempoMedio', 'pct'].includes(mt.tipo) ? soma / xs.length : soma }; });
  const ult = (D.importacoes || []).find(i => i.fonte === est.fonte);
  const kp = (t, v, s, cor) => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${esc(t)}</span><span class="kpi-ic">${G.ic('trophy')}</span></div><b>${v}</b><small>${s}</small></div>`;
  const cores = ['#2a78d6', '#1baf7a', '#6250d6', '#eb6834', '#eda100', '#d03b3b'];
  const celMeta = (rot, v) => { const a = atingimento(rot, v); return a === null ? '' : `<small class="des-meta ${a >= 1 ? 'ok' : a >= .8 ? 'quase' : 'longe'}">${fmt(a * 100, 0)}%</small>`; };
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Desempenho</h1><p class="sub">Resultado por consultor dos relatórios importados (Olos, HubSpot e outros), cruzado com faltas, monitorias e treinamentos</p></div>
    <div class="cab-acoes">
      <button type="button" class="btn btn-sec" id="desMetas" data-perm="importarDesempenho"${est.fonte ? '' : ' hidden'}>${G.ic('target')}Metas</button>
      <button type="button" class="btn btn-pri" id="desImportar" data-perm="importarDesempenho">${G.ic('upload')}Importar relatório</button>
    </div></div>
  ${!fontes.length ? `<div class="vazio"><b>Nenhum relatório importado ainda.</b><p>Clique em <b>Importar relatório</b> e escolha uma planilha ou CSV exportado do Olos, do HubSpot ou de outro sistema. O site pergunta qual coluna identifica o consultor e o que deve ser somado ou contado, e guarda esse modelo para os próximos meses.</p></div>` : `
  <div class="des-filtros cartao">
    <label class="mini">Relatório <select id="desFonte">${fontes.map(f => `<option${f === est.fonte ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    <label class="mini">Mês <select id="desMes">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${mesTxt(m)}</option>`).join('')}</select></label>
    <label class="mini">Supervisor <select id="desSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <span class="dica">${ult ? `Última importação: ${esc(ult.arquivo)} · ${new Date(ult.em).toLocaleDateString('pt-BR')} · ${ult.casados} consultor(es) identificados${ult.naoAchados ? ` · <b>${ult.naoAchados} não identificado(s)</b>` : ''}` : ''}</span>
  </div>
  <div class="kpis pn-kpis">${kp('Consultores', linhas.length, mesTxt(est.mes), '#0f3a6b')}${tot.slice(0, 5).map((t, i) => kp(t.mt.rotulo, valorTxt(t.mt, t.v), (['media', 'tempoMedio', 'pct'].includes(t.mt.tipo) ? 'média da equipe' : 'total') + (D.metas[t.mt.rotulo] ? ` · meta ${esc(D.metas[t.mt.rotulo].valor)}${t.mt.tipo === 'pct' ? '%' : ''}` : ''), cores[i])).join('')}</div>
  <article class="cartao">
    <header class="cab-card cab-tabela"><span class="icb">${G.ic('trophy')}</span><div><h2>${esc(est.fonte)} · ${mesTxt(est.mes)}</h2><p>Clique no título da coluna para ordenar. A porcentagem pequena é o atingimento da meta.</p></div>
      <div class="cab-acoes"><button type="button" class="btn btn-sec" id="desExp" data-perm="exportar">${G.ic('download')}Exportar</button></div></header>
    <div class="tabela-wrap"><table class="tabela des-tab"><thead><tr>
      <th data-k="nome">Consultor</th><th data-k="supervisor">Supervisor</th>${mets.map(mt => `<th class="dir" data-k="${esc(mt.rotulo)}">${esc(mt.rotulo)}</th>`).join('')}
      <th class="dir" data-k="x.faltas" title="Faltas lançadas no mês">Faltas</th><th class="dir" data-k="x.atest" title="Dias de atestado no mês">Atestado (dias)</th><th class="dir" data-k="x.medidas">Medidas</th><th class="dir" data-k="x.mon">Monitoria</th><th class="dir" data-k="x.trein">Treinamentos</th></tr></thead><tbody>
      ${linhas.map(d => `<tr><td><b class="lk" data-nome="${esc(d.nome)}">${esc(d.nome)}</b></td><td>${esc(d.supervisor)}</td>${mets.map(mt => `<td class="dir">${valorTxt(mt, d.m[mt.rotulo])} ${celMeta(mt.rotulo, d.m[mt.rotulo])}</td>`).join('')}
        <td class="dir">${d.x.faltas || '<span class="zero">0</span>'}</td><td class="dir">${d.x.atest || '<span class="zero">0</span>'}</td><td class="dir">${d.x.medidas ? `<span class="tag alerta">${d.x.medidas}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${d.x.mon === null ? '—' : `<span class="tag ${d.x.mon >= 85 ? 'bom' : d.x.mon >= 70 ? 'alerta' : 'ruim'}">${fmt(d.x.mon, 1)}%</span>`}</td><td class="dir">${d.x.trein || '<span class="zero">0</span>'}</td></tr>`).join('') || `<tr><td colspan="${mets.length + 7}" class="dica">Nenhum consultor neste filtro.</td></tr>`}
    </tbody></table></div>
  </article>`}`;
  G.icones(raiz);
  const b = id => document.getElementById(id);
  if (b('desImportar')) b('desImportar').onclick = abrirImportacao;
  if (b('desMetas')) b('desMetas').onclick = abrirMetas;
  if (!fontes.length) return;
  b('desFonte').onchange = e => { est.fonte = e.target.value; est.mes = ''; render(); };
  b('desMes').onchange = e => { est.mes = e.target.value; render(); };
  b('desSup').onchange = e => { est.sup = e.target.value; render(); };
  $('thead', raiz).addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; est.ord = { k: th.dataset.k, asc: est.ord.k === th.dataset.k ? !est.ord.asc : ['nome', 'supervisor'].includes(th.dataset.k) }; render(); });
  $('tbody', raiz).addEventListener('click', e => { const n = e.target.closest('[data-nome]'); if (n && A.abrirFicha) A.abrirFicha(n.dataset.nome); });
  b('desExp').onclick = () => {
    const cab = ['Consultor', 'Matrícula', 'Supervisor', 'Mês', ...mets.map(m => m.rotulo), 'Faltas', 'Atestado (dias)', 'Medidas', 'Monitoria (%)', 'Treinamentos'];
    const lin = linhas.map(d => [d.nome, d.mat, d.supervisor, mesTxt(d.mes), ...mets.map(mt => valorTxt(mt, d.m[mt.rotulo])), d.x.faltas, d.x.atest, d.x.medidas, d.x.mon === null ? '' : fmt(d.x.mon, 1), d.x.trein]);
    A.baixar(`desempenho-${norm(est.fonte).replace(/\s+/g, '-')}-${est.mes}.csv`, '﻿' + [cab, ...lin].map(x => x.map(A.csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
}

/* ---------------- assistente de importação ---------------- */
let dlg = null, arq = null;
function abrirImportacao() {
  if (!dlg) { document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-grande" id="dlgDes"><form method="dialog" class="dlg-in" id="desForm" novalidate></form></dialog>`); dlg = document.getElementById('dlgDes'); }
  arq = null; passo1(); dlg.showModal();
}
function passo1() {
  const f = document.getElementById('desForm');
  const fontes = Object.keys(D.modelos);
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('upload')}</span><div><h2>Importar relatório de desempenho</h2><p>Planilha (.xlsx) ou CSV exportado do Olos, HubSpot ou outro sistema</p></div></header>
    <div class="grade g3">
      <label class="campo c2"><span>Nome do relatório <i class="obr">*</i></span><input id="dsFonte" list="dsFontes" placeholder="Ex.: HubSpot negócios, Olos ligações"><datalist id="dsFontes">${fontes.map(x => `<option value="${esc(x)}">`).join('')}</datalist><small class="dica">Use sempre o mesmo nome para o mesmo tipo de relatório: o site lembra as colunas.</small></label>
      <label class="campo"><span>Mês de referência</span><input type="month" id="dsMes" value="${hoje().slice(0, 7)}"><small class="dica">Usado quando o relatório não tem coluna de data.</small></label>
      <label class="campo c3"><span>Arquivo <i class="obr">*</i></span><input type="file" id="dsArq" accept=".xlsx,.xlsm,.csv,.txt"></label>
    </div>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="dsLer">${G.ic('arrow-right')}Continuar</button></span></div>`;
  document.getElementById('dsLer').onclick = async () => {
    const fonte = document.getElementById('dsFonte').value.trim(), file = document.getElementById('dsArq').files[0], msg = document.getElementById('dsMsg');
    if (!fonte || !file) { msg.textContent = 'Informe o nome do relatório e escolha o arquivo.'; msg.className = 'msg erro'; return; }
    msg.textContent = 'Lendo o arquivo…'; msg.className = 'msg';
    try { const abas = await lerArquivo(file); arq = { fonte, mes: document.getElementById('dsMes').value || hoje().slice(0, 7), nome: file.name, abas: abas.filter(a => a.linhas && a.linhas.length > 1) }; if (!arq.abas.length) throw new Error('O arquivo não tem linhas.'); passo2(0); }
    catch (e) { msg.textContent = 'Não consegui ler: ' + e.message; msg.className = 'msg erro'; }
  };
}
const PALPITE_CONS = ['proprietario do negocio', 'proprietario', 'consultor', 'agente', 'atendente', 'operador', 'usuario', 'login', 'responsavel', 'owner', 'nome'];
const PALPITE_DATA = ['data', 'date', 'criado', 'criacao', 'dia'];
function passo2(iAba) {
  const f = document.getElementById('desForm'), aba = arq.abas[iAba];
  const iCab = cabecalhoDe(aba.linhas), cab = (aba.linhas[iCab] || []).map(c => String(c ?? '').trim()).filter(Boolean);
  const md = D.modelos[arq.fonte] && D.modelos[arq.fonte].colConsultor && cab.includes(D.modelos[arq.fonte].colConsultor) ? D.modelos[arq.fonte] : null;
  const palpite = lista => cab.find(c => lista.some(p => norm(c) === p)) || cab.find(c => lista.some(p => norm(c).includes(p))) || '';
  const opc = (sel, vazioTxt) => `${vazioTxt ? `<option value="">${vazioTxt}</option>` : ''}${cab.map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
  const amostra = aba.linhas.slice(iCab + 1, iCab + 4);
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('layers')}</span><div><h2>${esc(arq.fonte)} · ${esc(arq.nome)}</h2><p>${md ? 'Modelo salvo encontrado: confira e continue.' : 'Diga ao site como ler este relatório.'}</p></div></header>
    ${arq.abas.length > 1 ? `<label class="campo"><span>Aba</span><select id="dsAba">${arq.abas.map((a, i) => `<option value="${i}"${i === iAba ? ' selected' : ''}>${esc(a.nome)} (${a.linhas.length} linhas)</option>`).join('')}</select></label>` : ''}
    <div class="grade g3">
      <label class="campo"><span>Coluna que identifica o consultor <i class="obr">*</i></span><select id="dsCons">${opc(md ? md.colConsultor : palpite(PALPITE_CONS))}</select><small class="dica">Nome, login, e-mail, matrícula ou ID Olos.</small></label>
      <label class="campo"><span>Coluna de data (opcional)</span><select id="dsData">${opc(md ? md.colData : palpite(PALPITE_DATA), 'Sem data: usar o mês escolhido')}</select></label>
      <div class="campo"><span>Exemplo das primeiras linhas</span><div class="ds-amostra">${amostra.map(l => `<div>${esc((l || []).slice(0, 4).filter(x => x !== null && x !== undefined).map(x => String(x).slice(0, 18)).join(' · '))}</div>`).join('')}</div></div>
    </div>
    <div class="sub-bloco"><div class="sub-cab"><b class="com-ic">${G.ic('chart')}O que mostrar por consultor</b><button type="button" class="btn btn-link" id="dsAddMet">${G.ic('plus')}adicionar indicador</button></div><div class="linhas" id="dsMets"></div></div>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button type="button" class="btn btn-sec" id="dsVoltar">Voltar</button> <button type="button" class="btn btn-pri" id="dsProc">${G.ic('check')}Processar</button></span></div>`;
  G.icones(f);
  const lista = document.getElementById('dsMets');
  const distintos = col => { const i = (aba.linhas[iCab] || []).map(c => String(c ?? '').trim()).indexOf(col); const m = new Map(); aba.linhas.slice(iCab + 1).forEach(l => { const v = l && l[i]; if (v !== null && v !== undefined && String(v).trim() !== '') m.set(String(v).trim(), (m.get(String(v).trim()) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60); };
  const linhaMet = (mt = {}) => {
    lista.insertAdjacentHTML('beforeend', `<div class="linha ds-met"><input class="m-rot" placeholder="Nome do indicador (ex.: Ligações)" value="${esc(mt.rotulo || '')}"><select class="m-tipo">${TIPOS.map(([v, t]) => `<option value="${v}"${v === (mt.tipo || 'contar') ? ' selected' : ''}>${t}</option>`).join('')}</select><select class="m-col"><option value="">—</option>${cab.map(c => `<option${c === mt.coluna ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><select class="m-vals" multiple size="3" title="Segure Ctrl para marcar mais de um"></select><button type="button" class="btn-icone" title="Remover">${G.ic('trash', '')}</button></div>`);
    const el = lista.lastElementChild; ajustar(el, mt.valores || []);
  };
  const ajustar = (el, marcados) => {
    const tipo = $('.m-tipo', el).value, col = $('.m-col', el), vals = $('.m-vals', el);
    col.disabled = tipo === 'contar'; vals.hidden = !['contarSe', 'pct'].includes(tipo);
    if (!vals.hidden) { const atuais = marcados || [...vals.selectedOptions].map(o => o.value); vals.innerHTML = col.value ? distintos(col.value).map(([v, n]) => `<option value="${esc(v)}"${atuais.includes(v) ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('') : ''; }
  };
  lista.addEventListener('change', e => { const el = e.target.closest('.ds-met'); if (el && (e.target.classList.contains('m-tipo') || e.target.classList.contains('m-col'))) ajustar(el); });
  lista.addEventListener('click', e => { if (e.target.closest('.btn-icone')) e.target.closest('.ds-met').remove(); });
  (md ? md.metricas : [{ rotulo: 'Registros', tipo: 'contar' }]).forEach(linhaMet);
  document.getElementById('dsAddMet').onclick = () => linhaMet({ tipo: 'somar' });
  if (document.getElementById('dsAba')) document.getElementById('dsAba').onchange = e => passo2(+e.target.value);
  document.getElementById('dsVoltar').onclick = passo1;
  document.getElementById('dsProc').onclick = () => {
    const msg = document.getElementById('dsMsg');
    const metricas = $$('.ds-met', lista).map(el => ({ rotulo: $('.m-rot', el).value.trim(), tipo: $('.m-tipo', el).value, coluna: $('.m-col', el).value, valores: [...$('.m-vals', el).selectedOptions].map(o => o.value) })).filter(m => m.rotulo);
    const ruim = metricas.find(m => m.tipo !== 'contar' && !m.coluna) || metricas.find(m => ['contarSe', 'pct'].includes(m.tipo) && !m.valores.length);
    if (!metricas.length || ruim) { msg.textContent = ruim ? `Complete o indicador "${ruim.rotulo}" (coluna${['contarSe', 'pct'].includes(ruim.tipo) ? ' e valores' : ''}).` : 'Adicione ao menos um indicador.'; msg.className = 'msg erro'; return; }
    const modelo = { fonte: arq.fonte, colConsultor: document.getElementById('dsCons').value, colData: document.getElementById('dsData').value, metricas };
    const r = processar(aba.linhas, iCab, modelo, arq.mes);
    passo3(modelo, r);
  };
}
function passo3(modelo, r) {
  const f = document.getElementById('desForm');
  const meses = [...new Set(r.dados.map(d => d.mes))].sort();
  const casados = new Set(r.dados.map(d => d.mat || d.nome)).size;
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Conferir antes de salvar</h2><p>${esc(modelo.fonte)} · ${meses.map(mesTxt).join(', ') || '—'}</p></div></header>
    <div class="an-chips"><span><small>Linhas lidas</small><b>${r.total}</b></span><span><small>Consultores identificados</small><b>${casados}</b></span><span><small>Não identificados</small><b>${r.naoAchados.length}</b></span></div>
    ${r.naoAchados.length ? `<details class="do-trein"><summary>${G.ic('alert', '')}Quem não foi encontrado no BD (${r.naoAchados.length})</summary><p class="dica">Ficam de fora. Normalmente são pessoas que não estão no BD ou com nome diferente. Escolher outra coluna (login ou e-mail) costuma resolver.</p><ul class="aps-lidos">${r.naoAchados.slice(0, 80).map(([n, q]) => `<li>${esc(n)} <small>${q} linha(s)</small></li>`).join('')}</ul></details>` : ''}
    <p class="dica">Os dados de <b>${esc(modelo.fonte)}</b> dos meses acima serão substituídos por estes. O modelo de colunas fica salvo para a próxima vez.</p>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button type="button" class="btn btn-sec" id="dsVoltar2">Voltar</button> <button type="button" class="btn btn-pri" id="dsSalvar"${casados ? '' : ' disabled'}>${G.ic('check')}Salvar</button></span></div>`;
  G.icones(f);
  document.getElementById('dsVoltar2').onclick = () => passo2(0);
  document.getElementById('dsSalvar').onclick = () => {
    D = Object.assign(vazio(), ler(KEY, {}) || {});
    D.modelos[modelo.fonte] = modelo;
    D.dados = D.dados.filter(d => !(d.fonte === modelo.fonte && meses.includes(d.mes))).concat(r.dados);
    D.importacoes = [{ fonte: modelo.fonte, arquivo: arq.nome, em: new Date().toISOString(), meses, linhas: r.total, casados, naoAchados: r.naoAchados.length }, ...(D.importacoes || [])].slice(0, 60);
    salvar(); dlg.close(); est.fonte = modelo.fonte; est.mes = meses[meses.length - 1]; render();
    toast(`${modelo.fonte}: ${casados} consultor(es) em ${meses.map(mesTxt).join(', ')}`);
    if (window.NUVEM && NUVEM.ativo && NUVEM.ativo()) NUVEM.publicarAgora();
  };
}

/* ---------------- metas ---------------- */
function abrirMetas() {
  if (!dlg) { document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg dlg-grande" id="dlgDes"><form method="dialog" class="dlg-in" id="desForm" novalidate></form></dialog>`); dlg = document.getElementById('dlgDes'); }
  const f = document.getElementById('desForm'), mets = metricasDe(est.fonte);
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Metas · ${esc(est.fonte)}</h2><p>Meta mensal por consultor. Deixe em branco para não usar meta.</p></div></header>
    <div class="linhas">${mets.map(mt => { const m = D.metas[mt.rotulo] || {}; return `<div class="linha ds-meta" data-rot="${esc(mt.rotulo)}"><b>${esc(mt.rotulo)}</b><input class="mt-v" placeholder="${ehTempo(mt.tipo) ? 'hh:mm:ss' : mt.tipo === 'pct' ? '% (ex.: 30)' : 'valor'}" value="${esc(m.valor ?? '')}"><select class="mt-s"><option value="maior"${m.sentido !== 'menor' ? ' selected' : ''}>quanto maior, melhor</option><option value="menor"${m.sentido === 'menor' ? ' selected' : ''}>quanto menor, melhor</option></select></div>`; }).join('')}</div>
    <div class="dlg-rod"><small class="msg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="mtSalvar">${G.ic('check')}Salvar metas</button></span></div>`;
  G.icones(f); dlg.showModal();
  document.getElementById('mtSalvar').onclick = () => {
    $$('.ds-meta', f).forEach(el => {
      const rot = el.dataset.rot, v = $('.mt-v', el).value.trim(), mt = mets.find(x => x.rotulo === rot);
      if (!v) delete D.metas[rot]; else D.metas[rot] = { valor: mt && mt.tipo === 'pct' ? num(v) / 100 : ehTempo(mt && mt.tipo) ? v : num(v), sentido: $('.mt-s', el).value, tipoTempo: ehTempo(mt && mt.tipo) };
    });
    salvar(); dlg.close(); render(); toast('Metas salvas');
  };
}

/* bloco da ficha do consultor (Buscar) */
A.blocoDesempenho = p => {
  const d = (ler(KEY, {}) || {}).dados || [], mods = (ler(KEY, {}) || {}).modelos || {};
  const meus = d.filter(x => (p.matricula && x.mat && String(x.mat) === String(p.matricula)) || norm(x.nome) === norm(p.nome)).sort((a, b) => b.mes.localeCompare(a.mes));
  if (!meus.length) return '';
  const porFonte = {}; meus.forEach(x => (porFonte[x.fonte] = porFonte[x.fonte] || []).push(x));
  return `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('trophy')}</span><div><h2>Desempenho</h2><p>Relatórios importados (últimos meses)</p></div></header>
    ${Object.entries(porFonte).map(([f, xs]) => { const mets = (mods[f] || {}).metricas || []; return `<h3 class="sub-titulo">${esc(f)}</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th>${mets.map(m => `<th class="dir">${esc(m.rotulo)}</th>`).join('')}</tr></thead><tbody>${xs.slice(0, 6).map(x => `<tr><td>${mesTxt(x.mes)}</td>${mets.map(m => `<td class="dir">${valorTxt(m, x.m[m.rotulo])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }).join('')}</article>`;
};

document.addEventListener('aba-aberta', e => { if (e.detail === 'desempenho') render(); });
window.addEventListener('dados-atualizados', () => { if (document.getElementById('aba-desempenho').classList.contains('ativo') && !(dlg && dlg.open)) render(); });
if (document.getElementById('aba-desempenho').classList.contains('ativo')) render();
})();
