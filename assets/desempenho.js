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
// índice do BD em cache (refeito só quando o BD muda): importar milhares de linhas não trava
let idxCache = null, idxChave = '';
const indiceCache = () => { const t = localStorage.getItem(KEY_Q) || ''; const k = t.length + '|' + t.slice(0, 120) + t.slice(-120); if (!idxCache || k !== idxChave) { idxCache = indice(); idxChave = k; } return idxCache; };
A.identificarConsultor = v => identificar(v, indiceCache());
A.indiceConsultores = indiceCache; A.identificarCom = identificar;

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

/* ---------------- relatório consolidado de indicadores ----------------
   Uma linha por consultor, cabeçalho em dois níveis (grupo em cima, coluna
   embaixo): MATRÍCULA · ID · CONSULTOR · SUPERVISOR · IES · STATUS e depois os
   blocos (Chamadas, Shortcall, TMA, Pós-chamada, Carga horária, Ponto, C-SAT,
   Qualidade, Aceite, Matrícula, Pausa, HubSpot, Medicina, Aderência, Reingresso).
   Os valores já vêm calculados (Power Pivot): o site só guarda e cruza. */
const FONTE_PADRAO = 'Indicadores da operação';
const ID_COLS = ['matricula', 'id', 'consultor', 'supervisor', 'ies', 'status'];
const GRUPOS = [['view geral', 'Geral'], ['tabulacao', 'Pós-chamada'], ['pos chamada', 'Pós-chamada'], ['tempo medio de atendimento', 'TMA'], ['tma', 'TMA'], ['chamadas', 'Chamadas'], ['shortcall', 'Shortcall'], ['short call', 'Shortcall'], ['carga horaria', 'Carga horária'], ['forponto', 'Ponto'], ['ponto', 'Ponto'], ['pesquisa', 'C-SAT'], ['satisfacao', 'C-SAT'], ['qualidade', 'Qualidade'], ['aceite', 'Aceite'], ['matricula', 'Matrícula'], ['pausa', 'Pausa'], ['hubspot', 'HubSpot'], ['medicina', 'Medicina'], ['aderencia', 'Aderência'], ['reingresso', 'Reingresso']];
const ACR = new Set(['GP', 'EAD', 'GSP', 'PEAD', 'ABS', 'TMA', 'C-SAT', 'CSAT', 'NPS', 'ID', 'IES', 'UVA', 'UJ', 'EAD|GSP']);
const grupoNome = g => { const n = norm(g); if (!n) return ''; const a = GRUPOS.find(([k]) => n.includes(k)); return a ? a[1] : g.charAt(0).toUpperCase() + g.slice(1).toLowerCase(); };
const subNome = s => String(s).replace(/\s+/g, ' ').trim().split(' ').map((w, i) => { const u = w.toUpperCase(); const keep = ACR.has(u) || /^[A-Z]{2,4}(\|[A-Z]{2,4})+$/.test(w); const t = keep ? u : w.toLowerCase(); return i === 0 && !keep ? t.charAt(0).toUpperCase() + t.slice(1) : t; }).join(' ');
function acharConsolidado(abas) {
  for (let ia = 0; ia < abas.length; ia++) {
    const ls = abas[ia].linhas;
    for (let i = 0; i < Math.min(25, ls.length); i++) {
      const l = (ls[i] || []).map(c => chaveCab(c));
      if (l.includes('matricula') && l.includes('consultor') && l.filter(Boolean).length >= 8) return { ia, iCab: i };
    }
  }
  return null;
}
function tipoDe(g, sk, valores) {
  if (/^quartil/.test(sk)) return 'quartil';
  if (g === 'TMA' || g === 'Pós-chamada') return 'tempoMedio';
  if (g === 'Carga horária') return /dias/.test(sk) ? 'somar' : /media/.test(sk) ? 'tempoMedio' : 'tempo';
  if (g === 'Pausa') return /tempo em pausa|%/.test(sk) ? 'pct' : 'tempoMedio';
  if (['Shortcall', 'Ponto', 'C-SAT', 'Qualidade', 'Aderência', 'HubSpot'].includes(g)) return 'pct';
  if (/efetividade|%|taxa|conversao|percentual/.test(sk)) return 'pct';
  const xs = valores.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (xs.some(v => typeof v === 'string' && /%$/.test(v.trim()))) return 'pct';
  if (xs.some(v => typeof v === 'string' && /^\d+:\d{2}(:\d{2})?$/.test(v.trim()))) return 'tempoMedio';
  if (xs.length && xs.every(v => typeof v === 'string' && isNaN(num(v)))) return 'texto';
  return 'somar';
}
function converter(tipo, v) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  if (tipo === 'quartil' || tipo === 'texto') { const t = String(v).trim(); return /^(na|n\/a|-|—)$/i.test(t) ? null : tipo === 'quartil' ? t.toUpperCase() : t; }
  if (ehTempo(tipo)) {
    if (typeof v === 'number') return Math.round(v * 86400); // fração de dia do Excel
    const m = String(v).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})$/); if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    const n = num(v); return n === null || !isFinite(n) ? null : Math.round(n * 86400);
  }
  if (tipo === 'pct') {
    if (typeof v === 'number') return +(Math.abs(v) > 1.5 ? v / 100 : v).toFixed(5);
    const s = String(v).trim(), n = num(s.replace('%', '')); if (n === null || !isFinite(n)) return null;
    return +((/%/.test(s) || Math.abs(n) > 1.5) ? n / 100 : n).toFixed(5);
  }
  const n = typeof v === 'number' ? v : num(v); return n === null || !isFinite(n) ? null : +n.toFixed(4);
}
/* modelo conhecido da base de indicadores: [grupo, título na base, [coluna, tipo, sentido]]
   sentido: 1 = quanto maior melhor · -1 = quanto menor melhor · 0 = neutro */
const OF = ['inbound', 'ligacao manual', 'botmaker', 'outbound', 'outbound finalizadas', 'outbound n finalizadas'];
const MODELO_BASE = [
  ['Geral', 'VIEW GERAL', [['quartil geral', 'quartil', -1]]],
  ['Chamadas', 'CHAMADAS ATENDIDAS', [['total', 'somar', 1], ...OF.map(x => [x, 'somar', x === 'outbound n finalizadas' ? 0 : 1]), ['efetividade', 'pct', 1]]],
  ['Shortcall', 'SHORTCALL', [['outbound', 'pct', -1], ['inbound', 'pct', -1]]],
  ['TMA', 'TEMPO MÉDIO DE ATENDIMENTO - TMA', OF.map(x => [x, 'tempoMedio', 0])],
  ['Pós-chamada', 'TEMPO DE TABULAÇÃO - PÓS CHAMADA', [['total', 'tempoMedio', -1], ...OF.filter(x => x !== 'botmaker').map(x => [x, 'tempoMedio', -1])]],
  ['Carga horária', 'CARGA HORÁRIA', [['media', 'tempoMedio', 1], ['total', 'tempo', 1], ['esperado', 'tempo', 0], ['dias esperados', 'somar', 0]]],
  ['Ponto', 'FORPONTO', [['abs', 'pct', -1], ['quartil', 'quartil', -1]]],
  ['C-SAT', 'PESQUISA DE SATISFAÇÃO', [['c-sat envio', 'pct', 1], ['c-sat nota', 'pct', 1], ['c-sat final', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Qualidade', 'QUALIDADE', [['nota supervisor', 'pct', 1], ['nota monitor', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Aceite', 'ACEITE', [['total', 'somar', 1], ['quartil', 'quartil', -1], ['gp', 'somar', 1], ['ead', 'somar', 1], ['gsp', 'somar', 1]]],
  ['Matrícula', 'MATRÍCULA', [['total', 'somar', 1], ['quartil', 'quartil', -1], ['gp', 'somar', 1], ['ead', 'somar', 1], ['gsp', 'somar', 1], ['pead', 'somar', 1]]],
  ['Pausa', 'PAUSA', [['tempo em pausa', 'pct', -1], ['media almoco', 'tempoMedio', 0], ['media banheiro', 'tempoMedio', -1], ['media canais digitais', 'tempoMedio', 0], ['media falha sistemica', 'tempoMedio', -1], ['media feedback', 'tempoMedio', 0], ['ginastica laboral', 'tempoMedio', 0], ['media lanche', 'tempoMedio', -1], ['media particular', 'tempoMedio', -1], ['media descanso', 'tempoMedio', -1], ['media treinamento', 'tempoMedio', 0]]],
  ['HubSpot', 'HUBSPOT', [['criacao de lead', 'pct', 1]]],
  ['Medicina', 'MEDICINA', [['inscricao medicina', 'somar', 1], ['quartil', 'quartil', -1], ['matricula medicina', 'somar', 1], ['quartil', 'quartil', -1]]],
  ['Aderência', 'ADERÊNCIA', [['aderencia', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Reingresso', 'REINGRESSO', [['matricula gp', 'somar', 1], ['matricula ead|gsp', 'somar', 1]]]
];
const SEQ = []; MODELO_BASE.forEach(([g, t, cs]) => cs.forEach(([s, tipo, sentido]) => SEQ.push({ g, t, s, tipo, sentido })));
// nome da coluna sem o sufixo que o Excel/Power Pivot põe nas repetidas (BOTMAKER_5, QUARTIL_16, INBOUND2…)
const limparCab = t => String(t ?? '').replace(/\s+/g, ' ').trim().replace(/[_ ]\d+$/, '').replace(/(?<=[A-Za-zÀ-ú])\d+$/, '').trim();
const chaveCab = t => norm(limparCab(t)).replace(/ñ/g, 'n').replace(/\s*\|\s*/g, '|').replace(/[^a-z0-9|% -]/g, ' ').replace(/\s+/g, ' ').trim();
function lerConsolidado(aba, iCab) {
  const cab = aba.linhas[iCab] || [];
  // linha dos grupos: a de cima (ou até 3 acima) que mais cita os blocos conhecidos
  let grp = [], melhor = 0;
  for (let k = 1; k <= 3 && iCab - k >= 0; k++) {
    const l = aba.linhas[iCab - k] || [];
    const n = l.filter(c => c && GRUPOS.some(([x]) => norm(String(c)).includes(x))).length;
    if (n > melhor) { melhor = n; grp = l; }
  }
  const usarLinhaGrupo = melhor >= 3;
  const n = Math.max(cab.length, grp.length);
  const ixId = {}, mets = [], usadasSeq = new Set(); let g = '', ptr = 0;
  const fmtCol = j => { const c = {}; for (let r = iCab + 1; r < Math.min(aba.linhas.length, iCab + 400); r++) { const t = aba.formatos && aba.formatos[r] && aba.formatos[r][j]; if (t) c[t] = (c[t] || 0) + 1; } const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : ''; };
  for (let j = 0; j < n; j++) {
    const sRaw = String(cab[j] ?? '').trim(), gRaw = usarLinhaGrupo ? String(grp[j] ?? '').trim() : '';
    if (gRaw) g = gRaw;
    if (!sRaw) continue;
    const sOrig = limparCab(sRaw), sk = chaveCab(sRaw);
    if (!mets.length && ID_COLS.includes(sk) && ixId[sk] === undefined) { ixId[sk] = j; continue; }
    // acha a coluna no modelo conhecido (pelo grupo da planilha, se houver, ou pela ordem)
    let tpl = null;
    if (usarLinhaGrupo && g) { const gn = grupoNome(g); const i = SEQ.findIndex((x, i2) => i2 >= ptr && x.g === gn && x.s === sk); const i3 = i >= 0 ? i : SEQ.findIndex(x => x.g === gn && x.s === sk); if (i3 >= 0) { tpl = SEQ[i3]; ptr = i3 + 1; } }
    else {
      // pela ordem do modelo; se a coluna estiver fora de ordem, procura no modelo inteiro uma ainda não usada
      let i = SEQ.findIndex((x, k) => k >= ptr && !usadasSeq.has(k) && x.s === sk);
      if (i < 0) i = SEQ.findIndex((x, k) => !usadasSeq.has(k) && x.s === sk);
      if (i >= 0) { tpl = SEQ[i]; usadasSeq.add(i); ptr = i + 1; }
    }
    const grupo = tpl ? tpl.g : (usarLinhaGrupo && g ? grupoNome(g) : 'Outros');
    const fm = fmtCol(j);
    let tipo = tpl ? tpl.tipo : /^quartil/.test(sk) ? 'quartil' : fm === 'pct' ? 'pct' : fm === 'tempo' ? 'tempoMedio' : tipoDe(grupo, sk, aba.linhas.slice(iCab + 1, iCab + 400).map(l => l && l[j]));
    if (tpl && fm === 'pct' && tipo === 'somar') tipo = 'pct'; // o formato da célula manda
    if (tpl && fm === 'tempo' && tipo === 'somar') tipo = 'tempoMedio';
    const ant = mets.filter(m => m.grupo === grupo && m.tipo !== 'quartil').pop();
    mets.push({ coluna: j, grupo, sub: subNome(sOrig), gOrig: tpl ? tpl.t : (usarLinhaGrupo && g ? g : 'OUTROS'), sOrig: sOrig.toUpperCase(), ref: ant ? ant.sub : '', tipo, sentido: tpl ? tpl.sentido : (tipo === 'quartil' ? -1 : 0) });
  }
  const qPorGrupo = {}; mets.forEach(m => { if (m.tipo === 'quartil') qPorGrupo[m.grupo] = (qPorGrupo[m.grupo] || 0) + 1; });
  const usados = new Set();
  mets.forEach(m => {
    let r = m.grupo === 'Geral' ? m.sub : `${m.grupo} · ${m.tipo === 'quartil' && qPorGrupo[m.grupo] > 1 && m.ref ? 'Quartil ' + m.ref.toLowerCase() : m.sub}`;
    if (m.tipo === 'quartil' && qPorGrupo[m.grupo] > 1 && m.ref) m.sOrig = 'QUARTIL ' + m.ref.toUpperCase();
    if (usados.has(r)) { let k = 2; while (usados.has(r + ' ' + k)) k++; r = r + ' ' + k; }
    usados.add(r); m.rotulo = r;
  });
  return { ixId, mets, reconhecidas: mets.filter(m => m.grupo !== 'Outros').length };
}
function processarConsolidado(aba, iCab, info, mes) {
  const idx = indice(), dados = [], fora = [], vistos = new Set(); let total = 0;
  const cel = (l, k) => info.ixId[k] === undefined ? null : l[info.ixId[k]];
  for (const l of aba.linhas.slice(iCab + 1)) {
    if (!l) continue;
    const mat = String(cel(l, 'matricula') ?? '').trim(), id = String(cel(l, 'id') ?? '').trim(), nome = String(cel(l, 'consultor') ?? '').trim();
    if (!nome && !mat) continue;
    if (/^(total|geral)/i.test(nome || mat)) continue;
    total++;
    const c = (mat && identificar(mat, idx)) || (id && idx.get('o:' + id)) || (nome && identificar(nome, idx)) || null;
    const reg = { mat: (c && c.mat) || mat, nome: c ? c.nome : nome.toUpperCase(), supervisor: String(cel(l, 'supervisor') ?? '').trim().toUpperCase() || (c && c.supervisor) || '', ies: String(cel(l, 'ies') ?? '').trim(), status: String(cel(l, 'status') ?? '').trim(), mes, v: {} };
    if (!c) { reg.foraBD = true; fora.push(reg.nome); }
    const k = reg.mat || norm(reg.nome); if (vistos.has(k)) continue; vistos.add(k);
    info.mets.forEach(mt => { const v = converter(mt.tipo, l[mt.coluna]); if (v !== null) reg.v[mt.rotulo] = v; });
    dados.push(reg);
  }
  return { dados, total, fora };
}
/* modelo do consolidado: a lista de indicadores só cresce (índices estáveis para os meses antigos) */
/* modelo do consolidado: as colunas do arquivo novo, na ordem dele, mais as antigas que ainda têm dados em outros meses.
   Os meses já guardados são regravados na nova ordem. */
function remontarModelo(fonte, mets, mesNovo) {
  const velho = D.modelos[fonte] && D.modelos[fonte].consolidado ? comIndice(D.modelos[fonte]) : [];
  const outros = D.dados.filter(d => d.fonte === fonte && d.mes !== mesNovo);
  const obj = d => { const o = {}; velho.forEach(m => { const v = V(d, m); if (v !== null && v !== undefined) o[m.rotulo] = v; }); return o; };
  const antigos = outros.map(d => ({ d, o: obj(d) }));
  const novos = mets.map(m => ({ rotulo: m.rotulo, grupo: m.grupo, sub: m.sub, gOrig: m.gOrig, sOrig: m.sOrig, tipo: m.tipo, sentido: m.sentido }));
  velho.forEach(m => { if (!novos.some(x => x.rotulo === m.rotulo) && antigos.some(a => a.o[m.rotulo] !== undefined)) novos.push({ ...m }); });
  const md = { fonte, consolidado: true, metricas: novos }; comIndice(md);
  const cod = o => { const v = md.metricas.map(m => o[m.rotulo] ?? null); while (v.length && v[v.length - 1] === null) v.pop(); return v; };
  antigos.forEach(({ d, o }) => { d.v = cod(o); delete d.m; });
  return { md, cod };
}
function passoConsolidado(det) {
  const f = document.getElementById('desForm'), aba = arq.abas[det.ia] || arq.abas[0];
  const info = lerConsolidado(aba, det.iCab);
  const fonte = arq.fonte || FONTE_PADRAO;
  const porGrupo = {}; info.mets.forEach(m => (porGrupo[m.grupo] = porGrupo[m.grupo] || []).push(m));
  const TT = { tempo: 'tempo', tempoMedio: 'tempo', pct: '%', quartil: 'quartil', texto: 'texto', somar: 'nº' };
  const desenhar = () => {
    const mes = document.getElementById('dsMesC') ? document.getElementById('dsMesC').value : arq.mes;
    const r = processarConsolidado(aba, det.iCab, info, mes);
    const ja = D.dados.some(d => d.fonte === fonte && d.mes === mes);
    document.getElementById('dsResumo').innerHTML = `<div class="an-chips"><span><small>Consultores no arquivo</small><b>${r.dados.length}</b></span><span><small>Encontrados no BD</small><b>${r.dados.length - r.fora.length}</b></span><span><small>Fora do BD</small><b>${r.fora.length}</b></span><span><small>Indicadores</small><b>${info.mets.length}</b></span><span><small>Reconhecidos no modelo</small><b>${info.reconhecidas}</b></span></div>${info.reconhecidas < info.mets.length ? `<p class="aviso-fluxo">${info.mets.length - info.reconhecidas} coluna(s) não batem com o modelo da base e ficam no bloco OUTROS.</p>` : ''}
      ${r.fora.length ? `<details class="do-trein"><summary>${G.ic('alert', '')}Não estão no BD atual (${r.fora.length})</summary><p class="dica">Entram mesmo assim, com o nome e o supervisor do relatório (normalmente são desligados ou matrícula diferente).</p><ul class="aps-lidos">${r.fora.slice(0, 80).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <p class="dica">${ja ? `<b>${mesTxt(mes)} já foi importado:</b> os dados deste mês serão substituídos por estes.` : `Os dados ficam guardados como <b>${mesTxt(mes)}</b>.`}</p>`;
    G.icones(document.getElementById('dsResumo'));
    document.getElementById('dsSalvarC').disabled = !r.dados.length;
    return r;
  };
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Relatório de indicadores reconhecido</h2><p>${esc(arq.nome)} · aba ${esc(aba.nome)} · uma linha por consultor</p></div></header>
    <div class="grade g3">
      <label class="campo"><span>Nome do relatório</span><input id="dsFonteC" value="${esc(fonte)}"></label>
      <label class="campo"><span>Mês dos dados <i class="obr">*</i></span><input type="month" id="dsMesC" value="${arq.mes}"><small class="dica">${arq.mesDoNome ? 'Lido do nome do arquivo.' : 'O nome do arquivo não tem o mês: confira.'}</small></label>
    </div>
    <div id="dsResumo"></div>
    <div class="ds-grupos">${Object.entries(porGrupo).map(([g, ms]) => `<div><b>${esc(ms[0].gOrig || g)}</b><span>${ms.map(m => `<small title="${esc(m.rotulo)}">${esc(m.sOrig || m.sub)} <i>${TT[m.tipo] || ''}</i></small>`).join('')}</span></div>`).join('')}</div>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button type="button" class="btn btn-sec" id="dsVoltar">Voltar</button> <button type="button" class="btn btn-pri" id="dsSalvarC">${G.ic('check')}Salvar</button></span></div>`;
  G.icones(f);
  document.getElementById('dsMesC').onchange = desenhar;
  document.getElementById('dsVoltar').onclick = passo1;
  desenhar();
  document.getElementById('dsSalvarC').onclick = () => {
    const mes = document.getElementById('dsMesC').value, nomeF = document.getElementById('dsFonteC').value.trim() || FONTE_PADRAO, msg = document.getElementById('dsMsg');
    if (!mes) { msg.textContent = 'Informe o mês dos dados.'; msg.className = 'msg erro'; return; }
    const r = processarConsolidado(aba, det.iCab, info, mes);
    D = Object.assign(vazio(), ler(KEY, {}) || {});
    const { md, cod } = remontarModelo(nomeF, info.mets, mes);
    D.modelos[nomeF] = md;
    // valores guardados em lista na ordem dos indicadores do modelo (bem mais leve)
    const novos = r.dados.map(d => ({ ...d, fonte: nomeF, v: cod(d.v) }));
    D.dados = D.dados.filter(d => !(d.fonte === nomeF && d.mes === mes)).concat(novos);
    // guarda 12 meses de cada relatório consolidado (o arquivo fica leve para sincronizar)
    const mesesF = [...new Set(D.dados.filter(d => d.fonte === nomeF).map(d => d.mes))].sort().reverse();
    if (mesesF.length > 12) { const corte = mesesF[11]; D.dados = D.dados.filter(d => d.fonte !== nomeF || d.mes >= corte); }
    D.importacoes = [{ fonte: nomeF, arquivo: arq.nome, em: new Date().toISOString(), meses: [mes], linhas: r.total, casados: r.dados.length - r.fora.length, naoAchados: r.fora.length }, ...(D.importacoes || [])].slice(0, 60);
    salvar(); dlg.close(); est.fonte = nomeF; est.mes = mes; est.grupo = 'Dashboard'; render();
    toast(`${nomeF}: ${r.dados.length} consultor(es) em ${mesTxt(mes)}`);
    if (window.NUVEM && NUVEM.ativo && NUVEM.ativo()) NUVEM.publicarAgora();
  };
}
/* mês pelo nome do arquivo (ex.: INDICADORES_OUTUBRO_2026.xlsx) */
const MESES_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function mesDoArquivo(nome) {
  const t = ' ' + norm(nome).replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  let m = MESES_PT.findIndex(x => t.includes(' ' + x + ' ')); if (m < 0) m = MESES.findIndex(x => t.includes(' ' + x + ' '));
  const agora = hoje(); let ano = (t.match(/ (20\d\d) /) || [])[1];
  if (m < 0) { const x = t.match(/ (20\d\d) (\d{1,2}) | (\d{1,2}) (20\d\d) /); if (x) { ano = x[1] || x[4]; m = +(x[2] || x[3]) - 1; } }
  if (m < 0 || m > 11) return '';
  if (!ano) { ano = agora.slice(0, 4); if (`${ano}-${String(m + 1).padStart(2, '0')}` > agora.slice(0, 7)) ano = String(+ano - 1); }
  return `${ano}-${String(m + 1).padStart(2, '0')}`;
}

/* ---------------- leitura dos valores (formato novo e antigo) ---------------- */
const V = (d, mt) => !d.v ? (d.m ? d.m[mt.rotulo] ?? null : null) : Array.isArray(d.v) ? d.v[mt.i] ?? null : d.v[mt.rotulo] ?? null;
const comIndice = md => { const ms = (md && md.metricas) || []; ms.forEach((m, i) => { m.i = i; }); return ms; };
const RESUMO = [['Geral', 'quartil geral'], ['Chamadas', 'total'], ['Chamadas', 'efetividade'], ['TMA', 'outbound'], ['Pós-chamada', 'total'], ['Carga horária', 'total'], ['Ponto', 'abs'], ['C-SAT', 'c-sat final'], ['Qualidade', 'nota monitor'], ['Aceite', 'total'], ['Matrícula', 'total'], ['Pausa', 'tempo em pausa'], ['HubSpot', 'criacao de lead'], ['Aderência', 'aderencia']];
const achar = (mets, g, s) => mets.find(m => m.grupo === g && norm(m.sub).startsWith(s) && m.tipo !== 'quartil');
const resumoDe = mets => RESUMO.map(([g, s]) => g === 'Geral' ? mets.find(m => m.grupo === 'Geral' && norm(m.sub).startsWith(s)) : achar(mets, g, s)).filter(Boolean);
/* total da operação: soma para contagens; média ponderada para tempos médios e percentuais quando há base */
function pesoDe(mt, mets) {
  if (mt.grupo === 'TMA' || mt.grupo === 'Pós-chamada') return achar(mets, 'Chamadas', norm(mt.sub)) || null;
  if (mt.grupo === 'Ponto') return achar(mets, 'Carga horária', 'esperado') || null;
  if (mt.grupo === 'Chamadas' && /efetividade/.test(norm(mt.sub))) return achar(mets, 'Chamadas', 'outbound') || null;
  return null;
}
function agregar(mt, linhas, mets) {
  if (mt.tipo === 'quartil' || mt.tipo === 'texto') return null;
  const xs = linhas.map(d => [V(d, mt), d]).filter(([v]) => v !== null && v !== undefined && isFinite(v));
  if (!xs.length) return null;
  if (['somar', 'tempo', 'contar', 'contarSe'].includes(mt.tipo)) return xs.reduce((a, [v]) => a + v, 0);
  const p = pesoDe(mt, mets || []);
  if (p) { let sw = 0, s = 0; xs.forEach(([v, d]) => { const w = V(d, p); if (w > 0) { sw += w; s += v * w; } }); if (sw) return s / sw; }
  return xs.reduce((a, [v]) => a + v, 0) / xs.length;
}
const tagQ = v => !v ? '<span class="zero">NA</span>' : `<span class="qt q${(String(v).match(/[1-4]/) || ['0'])[0]}">${esc(v)}</span>`;
const celula = (mt, v) => mt.tipo === 'quartil' ? tagQ(v) : mt.tipo === 'texto' ? esc(v ?? '—') : valorTxt(mt, v);

/* ---------------- dashboard do desempenho ---------------- */
const fmtTipo = (mt, v) => v === null || v === undefined ? '—' : valorTxt(mt, v);
const curtoN = v => v >= 1e4 ? fmt(v / 1000, 0) + 'k' : v >= 1e3 ? fmt(v / 1000, 1) + 'k' : fmt(v, 0);
function dashboardDes(ctx) {
  const { todas, linhas, mesesAsc, mesAnt, base } = ctx;
  const M = (g, s) => achar(todas, g, s);
  const ag = (mt, ls) => mt ? agregar(mt, ls, todas) : null;
  const ant = mesAnt ? base(mesAnt) : [];
  const serie = mt => mesesAsc.map(m => ag(mt, base(m)));
  const qg = todas.find(m => m.tipo === 'quartil' && m.grupo === 'Geral');
  const conta = q => qg ? linhas.filter(d => String(V(d, qg) || '').includes(q)).length : 0;
  const q = [1, 2, 3, 4].map(n => conta(String(n))), qTot = q.reduce((a, b) => a + b, 0);
  const cTot = M('Chamadas', 'total'), aTot = M('Aceite', 'total'), mTot = M('Matrícula', 'total');
  const conv = ls => { const a = ag(aTot, ls), m = ag(mTot, ls); return a ? m / a : null; };
  const grande = (rot, mt, ic, cor, custom) => {
    const v = custom ? custom.v : ag(mt, linhas), va = custom ? custom.va : ag(mt, ant), sp = custom ? custom.sp : serie(mt);
    const tipo = custom ? custom.tipo : mt && mt.tipo;
    const txt = custom ? custom.txt(v) : fmtTipo(mt, v);
    return `<div class="db-big" style="--c:${cor}"><span class="db-big-ic">${G.ic(ic)}</span><small>${esc(rot)}</small><b>${txt}</b>
      <div class="db-big-rod">${DB.delta(v, va, 1, tipo === 'pct' ? 'pct' : ehTempo(tipo) ? 'tempo' : 'n')}${DB.spark(sp, cor)}</div>
      ${linhas.length && mt && !custom && ['somar'].includes(mt.tipo) ? `<em>${fmt(v / linhas.length, 1)} por consultor</em>` : custom && custom.em ? `<em>${custom.em}</em>` : '<em>&nbsp;</em>'}</div>`;
  };
  const GAUGES = [['Aderência', 'aderencia', 'Aderência'], ['C-SAT', 'c-sat final', 'C-SAT final'], ['Qualidade', 'nota monitor', 'Nota monitor'], ['Qualidade', 'nota supervisor', 'Nota supervisor'], ['Chamadas', 'efetividade', 'Efetividade'], ['HubSpot', 'criacao de lead', 'Criação de lead'], ['Ponto', 'abs', 'Absenteísmo (ABS)'], ['Pausa', 'tempo em pausa', 'Tempo em pausa'], ['Shortcall', 'outbound', 'Shortcall outbound']];
  const gauges = GAUGES.map(([g, s, rot]) => { const mt = M(g, s); if (!mt) return ''; const v = ag(mt, linhas); if (v === null) return ''; const meta = D.metas[mt.rotulo]; const mv = meta ? +meta.valor : null; const razao = mv ? (mt.sentido < 0 || (meta && meta.sentido === 'menor') ? mv / (v || 1e-9) : v / mv) : null; return DB.medidor({ valor: v, texto: fmtTipo(mt, v), rotulo: rot, meta: mv, razao, cor: razao === null ? (mt.sentido < 0 ? '#eb6834' : '#2a78d6') : null, sub: `${DB.delta(v, ag(mt, ant), mt.sentido, 'pct')}${mv ? ` <span class="db-meta-t">meta ${fmt(mv * 100, 1)}%</span>` : ''}` }); }).join('');
  const mix = (g, subs) => subs.map((s, i) => { const mt = M(g, s); return mt ? { rotulo: mt.sOrig || mt.sub, valor: ag(mt, linhas) || 0, cor: DB.PAL[i] } : null; }).filter(Boolean);
  // por supervisor
  const sups = {}; linhas.forEach(d => (sups[d.supervisor || '—'] = sups[d.supervisor || '—'] || []).push(d));
  const COLS = [['Chamadas', 'total', 'Chamadas', 1], ['Aceite', 'total', 'Aceite', 1], ['Matrícula', 'total', 'Matrícula', 1], ['Aderência', 'aderencia', 'Aderência'], ['Ponto', 'abs', 'ABS'], ['C-SAT', 'c-sat final', 'C-SAT'], ['Qualidade', 'nota monitor', 'Nota monitor'], ['TMA', 'outbound', 'TMA outbound']].map(([g, s, r, porCons]) => ({ mt: M(g, s), r, porCons })).filter(c => c.mt);
  const op = COLS.map(c => { const v = ag(c.mt, linhas); return c.porCons && linhas.length ? v / linhas.length : v; });
  const heat = (c, v, ref) => { if (v === null || ref === null || !ref || !c.mt.sentido) return ''; const r = (v - ref) / Math.abs(ref) * (c.mt.sentido < 0 ? -1 : 1); return r > .05 ? 'db-h-bom' : r < -.05 ? 'db-h-ruim' : ''; };
  const supRows = Object.entries(sups).sort((a, b) => cmpTxt(a[0], b[0])).map(([s, xs]) => {
    const qs = [1, 2, 3, 4].map(n => qg ? xs.filter(d => String(V(d, qg) || '').includes(String(n))).length : 0);
    return `<tr><td><b>${esc(s)}</b></td><td class="dir">${xs.length}</td><td>${qg ? `<div class="db-qbar">${qs.map((n, i) => n ? `<i class="q${i + 1}" style="flex:${n}" data-tip="Q${i + 1}: ${n}">${n}</i>` : '').join('')}</div>` : ''}</td>
      ${COLS.map((c, i) => { const v0 = ag(c.mt, xs), v = c.porCons && xs.length ? v0 / xs.length : v0; return `<td class="dir ${heat(c, v, op[i])}">${c.porCons ? fmt(v, 1) : fmtTipo(c.mt, v)}</td>`; }).join('')}</tr>`;
  }).join('');
  // alertas: 2+ quartis Q4
  const qCols = todas.filter(m => m.tipo === 'quartil' && m.grupo !== 'Geral');
  const alerta = linhas.map(d => ({ d, q4: qCols.filter(m => String(V(d, m) || '').includes('4')) })).filter(x => x.q4.length >= 2).sort((a, b) => b.q4.length - a.q4.length);
  const indOpc = todas.filter(m => m.tipo !== 'quartil' && m.tipo !== 'texto');
  if (!est.ind || !indOpc.some(m => m.rotulo === est.ind)) est.ind = (mTot || aTot || indOpc[0] || {}).rotulo;
  const ind = indOpc.find(m => m.rotulo === est.ind);
  const ord = ind ? linhas.filter(d => V(d, ind) !== null).sort((a, b) => (V(b, ind) - V(a, ind)) * (ind.sentido < 0 ? -1 : 1)) : [];
  const card = (d, i, ruim) => `<li class="${ruim ? 'ruim' : 'bom'}" data-nome="${esc(d.nome)}"><span>${i + 1}</span><div><b>${esc(d.nome)}</b><small>${esc(d.supervisor)}</small></div><em>${fmtTipo(ind, V(d, ind))}</em></li>`;
  const html = `
  <div class="db-hero">
    <div class="db-hero-q cartao">${DB.anel({ pct: qTot ? (q[0] + q[1]) / qTot : 0, titulo: 'Q1 + Q2', centro: qTot ? fmt((q[0] + q[1]) / qTot * 100, 0) + '%' : '—', sub: `${q[0] + q[1]} de ${qTot} consultores`, cor: '#1baf7a' })}
      <div class="db-qleg">${q.map((n, i) => `<div class="q${i + 1}"><span class="qt q${i + 1}">Q${i + 1}</span><b>${n}</b><small>${qTot ? fmt(n / qTot * 100, 0) + '%' : ''}</small></div>`).join('')}<p>Quartil geral do mês</p></div></div>
    <div class="db-bigs">
      ${cTot ? grande('Chamadas atendidas', cTot, 'headset', '#2a78d6') : ''}
      ${aTot ? grande('Aceites', aTot, 'check', '#1baf7a') : ''}
      ${mTot ? grande('Matrículas', mTot, 'award', '#8e44c9') : ''}
      ${aTot && mTot ? grande('Conversão aceite → matrícula', null, 'target', '#eb6834', { v: conv(linhas), va: conv(ant), sp: mesesAsc.map(m => conv(base(m))), tipo: 'pct', txt: v => v === null ? '—' : fmt(v * 100, 1) + '%', em: 'matrículas ÷ aceites' }) : ''}
    </div>
  </div>
  ${gauges ? `<article class="cartao db-gauges-c"><header class="cab-card"><span class="icb">${G.ic('activity')}</span><div><h2>Indicadores de qualidade e eficiência</h2><p>Operação no mês · ▲▼ comparado a ${mesAnt ? mesTxt(mesAnt) : 'mês anterior (ainda não importado)'}${Object.keys(D.metas).length ? ' · traço = meta' : ' · defina metas no botão Metas para colorir pelo atingimento'}</p></div></header><div class="db-gauges">${gauges}</div></article>` : ''}
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Funil de produção</h2><p>Do volume de chamadas até a matrícula</p></div></header>
      ${DB.funil([[cTot, 'Chamadas atendidas'], [M('Chamadas', 'outbound finalizadas'), 'Outbound finalizadas'], [aTot, 'Aceites'], [mTot, 'Matrículas']].filter(x => x[0]).map(([mt, r], i) => ({ rotulo: r, valor: ag(mt, linhas) || 0, cor: ['#1d4f91', '#2a78d6', '#1baf7a', '#8e44c9'][i] })))}</article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('layers')}</span><div><h2>Composição</h2><p>De onde vêm as chamadas, aceites e matrículas</p></div></header>
      <h3 class="db-h3">Chamadas por canal</h3>${DB.empilhada(mix('Chamadas', ['inbound', 'ligacao manual', 'botmaker', 'outbound']))}
      <h3 class="db-h3">Aceites por produto</h3>${DB.empilhada(mix('Aceite', ['gp', 'ead', 'gsp']))}
      <h3 class="db-h3">Matrículas por produto</h3>${DB.empilhada(mix('Matrícula', ['gp', 'ead', 'gsp', 'pead']))}</article>
  </div>
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('clock')}</span><div><h2>TMA × pós-chamada por canal</h2><p>Tempo médio ponderado pelas chamadas</p></div></header><div id="dbTma"></div></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('clock')}</span><div><h2>Pausas</h2><p>Média por consultor · tempo em pausa ${(() => { const mt = M('Pausa', 'tempo em pausa'); return mt ? '<b>' + fmtTipo(mt, ag(mt, linhas)) + '</b>' : '—'; })()}</p></div></header><div id="dbPausa"></div></article>
  </div>
  <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('sparkles')}</span><div><h2>Matriz produção × qualidade</h2><p>Cada bolinha é um consultor · linhas nas medianas da operação · clique para abrir a ficha</p></div>
    <div class="cab-acoes"><select id="dbMx" class="db-sel">${indOpc.map(m => `<option value="${esc(m.rotulo)}"${m.rotulo === (est.mx || (aTot || {}).rotulo) ? ' selected' : ''}>${esc(m.rotulo)}</option>`).join('')}</select><span class="dica">×</span><select id="dbMy" class="db-sel">${indOpc.map(m => `<option value="${esc(m.rotulo)}"${m.rotulo === (est.my || (M('Qualidade', 'nota monitor') || M('C-SAT', 'c-sat final') || M('Aderência', 'aderencia') || {}).rotulo) ? ' selected' : ''}>${esc(m.rotulo)}</option>`).join('')}</select></div></header><div id="dbMatriz"></div></article>
  <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Comparativo por supervisor</h2><p>Chamadas, aceites e matrículas por consultor · verde/vermelho = acima/abaixo da operação (mais de 5%)</p></div></header>
    <div class="tabela-wrap"><table class="tabela db-sup"><thead><tr><th>Supervisor</th><th class="dir">Equipe</th><th>Quartil geral</th>${COLS.map(c => `<th class="dir">${esc(c.r)}${c.porCons ? '<small>/consultor</small>' : ''}</th>`).join('')}</tr></thead><tbody>${supRows}
      <tr class="des-tot"><td><b>Operação</b></td><td class="dir">${linhas.length}</td><td></td>${COLS.map((c, i) => `<td class="dir">${c.porCons ? fmt(op[i], 1) : fmtTipo(c.mt, op[i])}</td>`).join('')}</tr></tbody></table></div></article>
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('trophy')}</span><div><h2>Destaques e atenção</h2><p>Por indicador</p></div><div class="cab-acoes"><select id="dbInd" class="db-sel">${indOpc.map(m => `<option value="${esc(m.rotulo)}"${m.rotulo === est.ind ? ' selected' : ''}>${esc(m.rotulo)}</option>`).join('')}</select></div></header>
      <div class="db-top"><div><h3 class="db-h3">Top 5</h3><ol>${ord.slice(0, 5).map((d, i) => card(d, i)).join('')}</ol></div><div><h3 class="db-h3">Atenção</h3><ol>${ord.slice(-5).reverse().map((d, i) => card(d, i, true)).join('')}</ol></div></div></article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('alert')}</span><div><h2>Consultores em alerta</h2><p>Q4 em 2 ou mais indicadores · ${alerta.length} consultor(es)</p></div></header>
      ${alerta.length ? `<ul class="db-alerta">${alerta.slice(0, 14).map(x => `<li data-nome="${esc(x.d.nome)}"><div><b>${esc(x.d.nome)}</b><small>${esc(x.d.supervisor)}</small></div><span>${x.q4.map(m => `<i class="qt q4" title="${esc(m.rotulo)}">${esc(m.grupo)}</i>`).join('')}</span></li>`).join('')}</ul>${alerta.length > 14 ? `<p class="dica">+ ${alerta.length - 14} consultor(es)</p>` : ''}` : '<p class="dica">Nenhum consultor com Q4 em 2 ou mais indicadores. 👏</p>'}</article>
  </div>
  ${mesesAsc.length > 1 ? `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('chart')}</span><div><h2>Evolução mês a mês</h2><p>${esc(est.ind || '')} · operação${est.sup ? ' (equipe filtrada)' : ''}</p></div></header><div id="dbEvo"></div></article>` : ''}`;
  const depois = () => {
    const tm = OF.map(s => [s, M('TMA', s), M('Pós-chamada', s)]).filter(x => x[1] || x[2]);
    const elT = document.getElementById('dbTma'); if (elT) DB.agrupadas(elT, tm.map(x => ({ 'inbound': 'Inbound', 'ligacao manual': 'Manual', 'botmaker': 'Botmaker', 'outbound': 'Outbound', 'outbound finalizadas': 'Out. finaliz.', 'outbound n finalizadas': 'Out. não fin.' })[x[0]] || x[0]), [{ nome: 'TMA', cor: '#2a78d6', valores: tm.map(x => ag(x[1], linhas)) }, { nome: 'Pós-chamada', cor: '#eda100', valores: tm.map(x => ag(x[2], linhas)) }], { fmt: v => DB.hms(v) });
    const elP = document.getElementById('dbPausa'); if (elP) { const ps = todas.filter(m => m.grupo === 'Pausa' && ehTempo(m.tipo)).map(m => ({ m, v: ag(m, linhas) })).filter(x => x.v).sort((a, b) => b.v - a.v); G.ranking(elP, ps.map((x, i) => ({ rotulo: (x.m.sOrig || x.m.sub).replace(/^M[ÉE]DIA /i, ''), valor: x.v, rotuloValor: DB.hms(x.v), cor: x.m.sentido < 0 ? '#eb6834' : '#2a78d6' }))); }
    const elM = document.getElementById('dbMatriz'); if (elM) { const mx = todas.find(m => m.rotulo === document.getElementById('dbMx').value), my = todas.find(m => m.rotulo === document.getElementById('dbMy').value); if (mx && my) DB.matriz(elM, linhas.map(d => ({ nome: d.nome, x: V(d, mx), y: V(d, my), extra: esc(d.supervisor) })).filter(p => p.x !== null && p.y !== null), { xRot: mx.rotulo, yRot: my.rotulo, fx: v => fmtTipo(mx, v), fy: v => fmtTipo(my, v), quadrantes: ['Destaques', `Bom em ${mx.sub.toLowerCase()}, abaixo em ${my.sub.toLowerCase()}`, `Bom em ${my.sub.toLowerCase()}, abaixo em ${mx.sub.toLowerCase()}`, 'Atenção'] }); }
    const elE = document.getElementById('dbEvo'); if (elE && ind) DB.linhasCat(elE, mesesAsc.map(mesTxt), [{ nome: ind.rotulo, cor: '#2a78d6', valores: mesesAsc.map(m => ag(ind, base(m))) }], { fmt: v => fmtTipo(ind, v), curto: v => ind.tipo === 'pct' ? fmt(v * 100, 0) : ehTempo(ind.tipo) ? DB.hms(v) : curtoN(v) });
    const b = id => document.getElementById(id);
    if (b('dbInd')) b('dbInd').onchange = e => { est.ind = e.target.value; render(); };
    if (b('dbMx')) b('dbMx').onchange = e => { est.mx = e.target.value; render(); };
    if (b('dbMy')) b('dbMy').onchange = e => { est.my = e.target.value; render(); };
    raiz.querySelectorAll('.db-top li[data-nome], .db-alerta li[data-nome], .db-bolha[data-nome]').forEach(x => x.onclick = () => A.abrirFicha && A.abrirFicha(x.dataset.nome));
  };
  return { html, depois };
}

/* ---------------- tela ---------------- */
const raiz = document.getElementById('desRaiz');
const est = { mes: '', fonte: '', sup: '', grupo: 'Dashboard', ind: '', mx: '', my: '', busca: '', ord: { k: 'nome', asc: true } };
const metricasDe = fonte => comIndice(D.modelos[fonte]);
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
  const mt = D.metas[rot]; if (!mt || mt.valor === null || mt.valor === undefined || v === null || v === undefined || typeof v !== 'number') return null;
  const alvo = mt.tipoTempo ? segundos(mt.valor) : +mt.valor; if (!alvo) return null;
  return mt.sentido === 'menor' ? alvo / (v || 1e-9) : v / alvo;
}
function render() {
  D = Object.assign(vazio(), ler(KEY, {}) || {});
  const fontes = Object.keys(D.modelos).sort(cmpTxt);
  if (!est.fonte || !fontes.includes(est.fonte)) est.fonte = fontes.find(f => D.modelos[f].consolidado) || fontes[0] || '';
  const md = D.modelos[est.fonte] || {}, cons = !!md.consolidado;
  const meses = [...new Set(D.dados.filter(d => d.fonte === est.fonte).map(d => d.mes))].sort().reverse();
  if (!est.mes || !meses.includes(est.mes)) est.mes = meses[0] || '';
  const todas = metricasDe(est.fonte);
  const grupos = cons ? ['Dashboard', 'Completo', 'Resumo', ...[...new Set(todas.map(m => m.grupo))]] : [];
  if (cons && !grupos.includes(est.grupo)) est.grupo = 'Dashboard';
  const mets = !cons || est.grupo === 'Completo' ? todas : est.grupo === 'Resumo' ? resumoDe(todas) : todas.filter(m => m.grupo === est.grupo);
  const cruzar = false; // faltas/monitorias do site ficam na ficha do consultor
  const gTit = g => { const m = todas.find(x => x.grupo === g); return m && m.gOrig ? m.gOrig : g; };
  let linhas = D.dados.filter(d => d.fonte === est.fonte && d.mes === est.mes);
  const doMes = linhas;
  const sups = [...new Set(linhas.map(d => d.supervisor).filter(Boolean))].sort(cmpTxt);
  if (est.sup) linhas = linhas.filter(d => d.supervisor === est.sup);
  if (est.busca) linhas = linhas.filter(d => norm(d.nome).includes(norm(est.busca)) || String(d.mat).includes(est.busca));
  linhas = linhas.map(d => ({ ...d, x: cruzar ? cruzamento(d, d.mes) : {} }));
  const o = est.ord, val = (d, k) => k === 'nome' || k === 'supervisor' || k === 'mat' ? d[k] : k.startsWith('x.') ? d.x[k.slice(2)] : V(d, todas.find(m => m.rotulo === k) || { rotulo: k });
  linhas.sort((a, b) => { const x = val(a, o.k), y = val(b, o.k); const r = typeof x === 'number' || typeof y === 'number' ? (x ?? -Infinity) - (y ?? -Infinity) : cmpTxt(x || 'zz', y || 'zz'); return o.asc ? r : -r; });
  const ult = (D.importacoes || []).find(i => i.fonte === est.fonte);
  const kp = (t, v, s, cor, ic = 'trophy') => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${esc(t)}</span><span class="kpi-ic">${G.ic(ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const cores = ['#2a78d6', '#1baf7a', '#6250d6', '#eb6834', '#eda100', '#d03b3b'];
  const celMeta = (rot, v) => { const a = atingimento(rot, v); return a === null ? '' : `<small class="des-meta ${a >= 1 ? 'ok' : a >= .8 ? 'quase' : 'longe'}">${fmt(a * 100, 0)}%</small>`; };
  const baseKpi = est.sup ? linhas : doMes;
  let kpis;
  if (cons) {
    const esc_ = [['Chamadas', 'total', 'headset'], ['Aceite', 'total', 'check'], ['Matrícula', 'total', 'award'], ['Ponto', 'abs', 'calendar'], ['C-SAT', 'c-sat final', 'star'], ['Aderência', 'aderencia', 'clock']].map(([g, s, ic]) => [achar(todas, g, s), ic]).filter(([m]) => m);
    kpis = kp('Consultores', baseKpi.length, mesTxt(est.mes) + (est.sup ? ' · ' + esc(est.sup.split(' ')[0]) : ''), '#0f3a6b', 'users') + esc_.map(([m, ic], i) => kp(m.gOrig ? (norm(m.gOrig) === norm(m.sOrig) ? m.gOrig : m.gOrig + (/^total$/i.test(m.sOrig) ? '' : ' · ' + m.sOrig)) : m.grupo === m.sub ? m.sub : m.grupo + (/^total$/i.test(m.sub) ? '' : ' · ' + m.sub), valorTxt(m, agregar(m, baseKpi, todas)), ['pct', 'tempoMedio'].includes(m.tipo) ? 'operação (média ponderada)' : 'total', cores[i], ic)).join('');
  } else {
    kpis = kp('Consultores', linhas.length, mesTxt(est.mes), '#0f3a6b') + mets.slice(0, 5).map((mt, i) => { const v = agregar(mt, linhas, mets); return kp(mt.rotulo, valorTxt(mt, v), (['media', 'tempoMedio', 'pct'].includes(mt.tipo) ? 'média da equipe' : 'total') + (D.metas[mt.rotulo] ? ` · meta ${esc(D.metas[mt.rotulo].valor)}${mt.tipo === 'pct' ? '%' : ''}` : ''), cores[i]); }).join('');
  }
  const qg = cons ? todas.find(m => m.tipo === 'quartil' && m.grupo === 'Geral') || todas.find(m => m.tipo === 'quartil') : null;
  const distQ = qg ? [1, 2, 3, 4].map(n => [n, baseKpi.filter(d => String(V(d, qg) || '').includes(String(n))).length]) : null;
  const rotCol = mt => cons && est.grupo !== 'Resumo' ? (mt.tipo === 'quartil' ? mt.rotulo.replace(mt.grupo + ' · ', '') : mt.sub) : mt.rotulo.replace(/^(.+?) · Total$/, '$1');
  const cabecalho = () => {
    const th = (k, t, cls = 'dir', tit = '') => `<th class="${cls}" data-k="${esc(k)}"${tit ? ` title="${esc(tit)}"` : ''}>${esc(t)}</th>`;
    const cruz = cruzar ? `${th('x.faltas', cons ? 'FALTAS' : 'Faltas', 'dir', 'Faltas lançadas no site no mês')}${th('x.atest', cons ? 'ATESTADO (DIAS)' : 'Atestado (dias)')}${th('x.medidas', cons ? 'MEDIDAS' : 'Medidas')}${th('x.mon', cons ? 'MONITORIA' : 'Monitoria', 'dir', 'Monitorias feitas no site')}${th('x.trein', cons ? 'TREINAMENTOS' : 'Treinamentos')}` : '';
    if (!cons) return `<tr>${th('nome', 'Consultor', '')}${th('supervisor', 'Supervisor', '')}${mets.map(mt => th(mt.rotulo, mt.rotulo, 'dir', mt.rotulo)).join('')}${cruz}</tr>`;
    const blocos = []; mets.forEach(mt => { const g = mt.gOrig || mt.grupo; const u = blocos[blocos.length - 1]; if (u && u.g === g) u.n++; else blocos.push({ g, n: 1 }); });
    const sub = mt => mt.sOrig || (mt.tipo === 'quartil' ? 'QUARTIL' : mt.sub.toUpperCase());
    return `<tr class="des-g"><th colspan="2" class="des-fixo des-gfix"></th><th></th>${blocos.map(b => `<th colspan="${b.n}">${esc(b.g === 'Geral' ? 'VIEW GERAL' : b.g)}</th>`).join('')}${cruzar ? '<th colspan="5" class="des-g-site">LANÇADOS NO SITE</th>' : ''}</tr>
      <tr>${th('mat', 'MATRÍCULA', 'des-fixo des-c1')}${th('nome', 'CONSULTOR', 'des-fixo des-c2')}${th('supervisor', 'SUPERVISOR', '')}${mets.map(mt => th(mt.rotulo, sub(mt), (mt.tipo === 'quartil' ? 'des-qcol ' : '') + 'dir', mt.rotulo)).join('')}${cruz}</tr>`;
  };
  const totLinha = cons && linhas.length > 1 ? `<tr class="des-tot"><td class="des-fixo des-c1"></td><td class="des-fixo des-c2"><b>OPERAÇÃO${est.sup ? ' · EQUIPE' : ''}</b></td><td>${linhas.length} consultor(es)</td>${mets.map(mt => `<td class="dir">${mt.tipo === 'quartil' ? '' : valorTxt(mt, agregar(mt, linhas, todas))}</td>`).join('')}${cruzar ? '<td colspan="5"></td>' : ''}</tr>` : '';
  const mesesAsc = [...meses].reverse().slice(-12);
  const baseMes = m => D.dados.filter(d => d.fonte === est.fonte && d.mes === m && (!est.sup || d.supervisor === est.sup) && (!est.busca || norm(d.nome).includes(norm(est.busca)) || String(d.mat).includes(est.busca)));
  const dash = cons && est.grupo === 'Dashboard' && linhas.length ? dashboardDes({ todas, linhas, mesesAsc, mesAnt: meses[meses.indexOf(est.mes) + 1] || '', base: baseMes }) : null;
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Desempenho</h1><p class="sub">Indicadores por consultor (relatório consolidado do Olos, HubSpot e ponto), cruzados com faltas, monitorias e treinamentos</p></div>
    <div class="cab-acoes">
      <button type="button" class="btn btn-sec" id="desMetas" data-perm="importarDesempenho"${est.fonte ? '' : ' hidden'}>${G.ic('target')}Metas</button>
      <button type="button" class="btn btn-pri" id="desImportar" data-perm="importarDesempenho">${G.ic('upload')}Importar relatório</button>
    </div></div>
  ${!fontes.length ? `<div class="vazio"><b>Nenhum relatório importado ainda.</b><p>Clique em <b>Importar relatório</b> e escolha a planilha de indicadores (uma linha por consultor, com MATRÍCULA, ID, CONSULTOR, SUPERVISOR e os blocos de Chamadas, TMA, Pós-chamada, Carga horária, Ponto, C-SAT, Qualidade, Aceite, Matrícula, Pausa, HubSpot, Medicina, Aderência e Reingresso). O site reconhece as colunas sozinho; o mês vem do nome do arquivo.</p></div>` : `
  <div class="des-filtros cartao">
    ${fontes.length > 1 ? `<label class="mini">Relatório <select id="desFonte">${fontes.map(f => `<option${f === est.fonte ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>` : ''}
    <label class="mini">Mês <select id="desMes">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${mesTxt(m)}</option>`).join('')}</select></label>
    <label class="mini">Supervisor <select id="desSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="mini">Consultor <input type="search" id="desBusca" placeholder="Nome ou matrícula" value="${esc(est.busca)}"></label>
    <span class="dica">${ult ? `Última importação: ${esc(ult.arquivo)} · ${new Date(ult.em).toLocaleDateString('pt-BR')} · ${ult.casados} no BD${ult.naoAchados ? ` · ${ult.naoAchados} fora do BD` : ''}` : ''}</span>
  </div>
  ${cons && todas.length && todas.filter(m => m.grupo === 'Outros').length / todas.length > .5 ? `<div class="aviso-fluxo db-aviso">${G.ic('alert', '')}<span><b>Este relatório foi lido pela versão anterior do site</b>, que não reconhecia as colunas da base (tudo caiu em OUTROS e os quartis se perderam). Clique em <b>Importar relatório</b> e envie o mesmo arquivo de novo: o mês é substituído e os blocos, tempos, percentuais e quartis aparecem certos.</span></div>` : ''}
  ${dash ? '' : `<div class="kpis pn-kpis">${kpis}</div>`}
  ${cons ? `<div class="des-grupos">${grupos.map(g => `<button type="button" data-g="${esc(g)}" class="${g === est.grupo ? 'on' : ''}">${g === 'Dashboard' ? G.ic('chart', '') + 'Dashboard' : esc(g === 'Completo' ? 'Tabela completa' : g === 'Resumo' ? 'Resumo' : gTit(g).toUpperCase())}</button>`).join('')}${distQ ? `<span class="des-q">Quartil geral: ${distQ.map(([n, q]) => `<span class="qt q${n}">Q${n}</span> ${q}`).join(' ')}</span>` : ''}</div>` : ''}
  ${dash ? dash.html : `  <article class="cartao">
    <header class="cab-card cab-tabela"><span class="icb">${G.ic('trophy')}</span><div><h2>${cons ? esc(est.grupo === 'Completo' ? est.fonte : est.grupo === 'Resumo' ? 'Resumo' : gTit(est.grupo).toUpperCase()) : esc(est.fonte)} · ${mesTxt(est.mes)}</h2><p>Clique no título da coluna para ordenar${cons ? ' · clique no nome para abrir a ficha' : '. A porcentagem pequena é o atingimento da meta.'}</p></div>
      <div class="cab-acoes"><button type="button" class="btn btn-sec" id="desExp" data-perm="exportar">${G.ic('download')}Exportar</button></div></header>
    <div class="tabela-wrap des-wrap"><table class="tabela des-tab${cons ? ' des-base' : ''}"><thead>${cabecalho()}</thead><tbody>
      ${totLinha}
      ${linhas.map(d => `<tr>${cons ? `<td class="des-fixo des-c1">${esc(d.mat || '')}</td>` : ''}<td${cons ? ' class="des-fixo des-c2"' : ''}><b class="lk" data-nome="${esc(d.nome)}">${esc(d.nome)}</b>${d.foraBD ? ' <small class="tag neutro" title="Não está no BD atual">fora do BD</small>' : ''}</td><td>${esc(d.supervisor)}</td>${mets.map(mt => { const v = V(d, mt); return `<td class="dir">${celula(mt, v)} ${celMeta(mt.rotulo, v)}</td>`; }).join('')}
        ${cruzar ? `<td class="dir">${d.x.faltas || '<span class="zero">0</span>'}</td><td class="dir">${d.x.atest || '<span class="zero">0</span>'}</td><td class="dir">${d.x.medidas ? `<span class="tag alerta">${d.x.medidas}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${d.x.mon === null ? '—' : `<span class="tag ${d.x.mon >= 85 ? 'bom' : d.x.mon >= 70 ? 'alerta' : 'ruim'}">${fmt(d.x.mon, 1)}%</span>`}</td><td class="dir">${d.x.trein || '<span class="zero">0</span>'}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${mets.length + 8}" class="dica">Nenhum consultor neste filtro.</td></tr>`}
    </tbody></table></div>
  </article>`}`}`;
  G.icones(raiz);
  if (dash) dash.depois();
  const b = id => document.getElementById(id);
  if (b('desImportar')) b('desImportar').onclick = abrirImportacao;
  if (b('desMetas')) b('desMetas').onclick = abrirMetas;
  if (!fontes.length) return;
  if (b('desFonte')) b('desFonte').onchange = e => { est.fonte = e.target.value; est.mes = ''; est.grupo = 'Dashboard'; render(); };
  b('desMes').onchange = e => { est.mes = e.target.value; render(); };
  b('desSup').onchange = e => { est.sup = e.target.value; render(); };
  b('desBusca').oninput = e => { est.busca = e.target.value; clearTimeout(render._t); render._t = setTimeout(() => { render(); const i = b('desBusca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $$('.des-grupos button', raiz).forEach(x => x.onclick = () => { est.grupo = x.dataset.g; render(); });
  if ($('thead', raiz) && !dash) $('thead', raiz).addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; est.ord = { k: th.dataset.k, asc: est.ord.k === th.dataset.k ? !est.ord.asc : ['nome', 'supervisor', 'mat'].includes(th.dataset.k) || todas.some(m => m.rotulo === th.dataset.k && m.tipo === 'quartil') }; render(); });
  if (!dash) $('tbody', raiz).addEventListener('click', e => { const n = e.target.closest('[data-nome]'); if (n && A.abrirFicha) A.abrirFicha(n.dataset.nome); });
  if (b('desExp')) b('desExp').onclick = () => {
    const ms = cons ? todas : mets;
    const cab = ['Consultor', 'Matrícula', 'Supervisor', 'Mês', ...ms.map(m => m.rotulo)];
    const lin = linhas.map(d => [d.nome, d.mat, d.supervisor, mesTxt(d.mes), ...ms.map(mt => { const v = V(d, mt); return mt.tipo === 'quartil' || mt.tipo === 'texto' ? (v || '') : valorTxt(mt, v).replace('—', ''); })]);
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
      <label class="campo c2"><span>Nome do relatório</span><input id="dsFonte" list="dsFontes" placeholder="Em branco para o relatório de indicadores"><datalist id="dsFontes">${fontes.map(x => `<option value="${esc(x)}">`).join('')}</datalist><small class="dica">O relatório de indicadores (uma linha por consultor) é reconhecido sozinho. Para outros relatórios, use sempre o mesmo nome: o site lembra as colunas.</small></label>
      <label class="campo"><span>Mês de referência</span><input type="month" id="dsMes" value="${hoje().slice(0, 7)}"><small class="dica">Se o nome do arquivo tiver o mês (ex.: OUTUBRO), ele é usado.</small></label>
      <label class="campo c3"><span>Arquivo <i class="obr">*</i></span><input type="file" id="dsArq" accept=".xlsx,.xlsm,.csv,.txt"></label>
    </div>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="dsLer">${G.ic('arrow-right')}Continuar</button></span></div>`;
  document.getElementById('dsLer').onclick = async () => {
    const fonte = document.getElementById('dsFonte').value.trim(), file = document.getElementById('dsArq').files[0], msg = document.getElementById('dsMsg');
    if (!file) { msg.textContent = 'Escolha o arquivo.'; msg.className = 'msg erro'; return; }
    msg.textContent = 'Lendo o arquivo…'; msg.className = 'msg';
    try {
      const abas = await lerArquivo(file), mesNome = mesDoArquivo(file.name);
      arq = { fonte, mes: mesNome || document.getElementById('dsMes').value || hoje().slice(0, 7), mesDoNome: !!mesNome, nome: file.name, abas: abas.filter(a => a.linhas && a.linhas.length > 1) };
      if (!arq.abas.length) throw new Error('O arquivo não tem linhas.');
      const det = acharConsolidado(arq.abas);
      if (det) { arq.abas = [arq.abas[det.ia]]; return passoConsolidado({ ia: 0, iCab: det.iCab }); }
      if (!fonte) { msg.textContent = 'Este arquivo não é o relatório de indicadores (uma linha por consultor). Dê um nome ao relatório para configurar as colunas.'; msg.className = 'msg erro'; return; }
      passo2(0);
    }
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
  const f = document.getElementById('desForm'), mets = metricasDe(est.fonte).filter(m => m.tipo !== 'quartil' && m.tipo !== 'texto');
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Metas · ${esc(est.fonte)}</h2><p>Meta mensal por consultor. Deixe em branco para não usar meta. Aparece como % de atingimento ao lado do valor.</p></div></header>
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
  const DD = ler(KEY, {}) || {}, d = DD.dados || [], mods = DD.modelos || {};
  const meus = d.filter(x => (p.matricula && x.mat && String(x.mat) === String(p.matricula)) || norm(x.nome) === norm(p.nome)).sort((a, b) => b.mes.localeCompare(a.mes));
  if (!meus.length) return '';
  const porFonte = {}; meus.forEach(x => (porFonte[x.fonte] = porFonte[x.fonte] || []).push(x));
  const rot = m => m.rotulo.replace(/^(.+?) · Total$/, '$1');
  return `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('trophy')}</span><div><h2>Desempenho</h2><p>Indicadores importados (últimos meses)</p></div></header>
    ${Object.entries(porFonte).map(([f, xs]) => { const md = mods[f] || {}, todasF = comIndice(md), mets = md.consolidado ? resumoDe(todasF) : todasF; return `<h3 class="sub-titulo">${esc(f)}</h3><div class="tabela-wrap"><table class="tabela des-tab"><thead><tr><th>Mês</th>${mets.map(m => `<th class="dir">${esc(rot(m))}</th>`).join('')}</tr></thead><tbody>${xs.slice(0, 6).map(x => `<tr><td>${mesTxt(x.mes)}</td>${mets.map(m => `<td class="dir">${celula(m, V(x, m))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }).join('')}</article>`;
};
/* resumo para a Minha área: último mês importado */
A.pulsoDesempenho = () => {
  const DD = ler(KEY, {}) || {};
  const f = Object.keys(DD.modelos || {}).find(k => DD.modelos[k].consolidado); if (!f) return null;
  const md = DD.modelos[f], ms = comIndice(md);
  const meses = [...new Set((DD.dados || []).filter(d => d.fonte === f).map(d => d.mes))].sort(); const mes = meses[meses.length - 1]; if (!mes) return null;
  const ls = DD.dados.filter(d => d.fonte === f && d.mes === mes), ant = DD.dados.filter(d => d.fonte === f && d.mes === meses[meses.length - 2]);
  const itens = [['Aceite', 'total', 'Aceites'], ['Matrícula', 'total', 'Matrículas'], ['Aderência', 'aderencia', 'Aderência'], ['Ponto', 'abs', 'ABS'], ['C-SAT', 'c-sat final', 'C-SAT'], ['Qualidade', 'nota monitor', 'Nota monitor']].map(([g, s_, r]) => { const mt = achar(ms, g, s_); if (!mt) return null; const v = agregar(mt, ls, ms); return v === null ? null : { r, txt: valorTxt(mt, v), delta: typeof DB !== 'undefined' ? DB.delta(v, agregar(mt, ant, ms), mt.sentido ?? 1, mt.tipo === 'pct' ? 'pct' : 'n') : '' }; }).filter(Boolean);
  const qg = ms.find(m => m.tipo === 'quartil' && m.grupo === 'Geral');
  const q = [1, 2, 3, 4].map(n => qg ? ls.filter(d => String(V(d, qg) || '').includes(String(n))).length : 0);
  const qCols = ms.filter(m => m.tipo === 'quartil' && m.grupo !== 'Geral');
  const alerta = ls.filter(d => qCols.filter(m => String(V(d, m) || '').includes('4')).length >= 2).map(d => ({ nome: d.nome, info: d.supervisor }));
  return { mes, n: ls.length, itens, q, alerta };
};
/* para o relatório mensal e o painel */
A.indicadorMes = (mes, grupo, sub) => {
  const DD = ler(KEY, {}) || {};
  for (const [f, md] of Object.entries(DD.modelos || {})) {
    if (!md.consolidado) continue;
    comIndice(md); const mt = achar(md.metricas, grupo, sub); if (!mt) continue;
    const ls = (DD.dados || []).filter(d => d.fonte === f && d.mes === mes); if (!ls.length) continue;
    const v = agregar(mt, ls, md.metricas); if (v !== null) return { v, mt, n: ls.length, fonte: f, txt: valorTxt(mt, v) };
  }
  return null;
};
A.relatorioDesempenho = mes => {
  const DD = ler(KEY, {}) || {}; let html = '';
  const rot = m => m.rotulo.replace(/^(.+?) · Total$/, '$1');
  for (const [f, md] of Object.entries(DD.modelos || {})) {
    const dd = (DD.dados || []).filter(d => d.fonte === f && d.mes === mes); if (!dd.length) continue;
    comIndice(md);
    if (md.consolidado) {
      const res = resumoDe(md.metricas).filter(m => m.tipo !== 'quartil');
      const qg = md.metricas.find(m => m.tipo === 'quartil' && m.grupo === 'Geral');
      const sups = {}; dd.forEach(d => (sups[d.supervisor || '—'] = sups[d.supervisor || '—'] || []).push(d));
      const col = res.filter(m => ['Chamadas', 'Ponto', 'C-SAT', 'Aceite', 'Matrícula', 'Aderência'].includes(m.grupo) && !/efetividade/.test(norm(m.sub)));
      html += `<h3>${esc(f)} · ${dd.length} consultor(es)</h3>
        <div class="rel-2"><div><table class="tabela">${res.map(m => `<tr><td>${esc(rot(m))}</td><td class="dir"><b>${valorTxt(m, agregar(m, dd, md.metricas))}</b></td></tr>`).join('')}</table></div>
        <div>${qg ? `<table class="tabela"><thead><tr><th>Quartil geral</th><th class="dir">Consultores</th></tr></thead><tbody>${[1, 2, 3, 4].map(n => `<tr><td>Q${n}</td><td class="dir">${dd.filter(d => String(V(d, qg) || '').includes(String(n))).length}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>
        <table class="tabela"><thead><tr><th>Supervisor</th><th class="dir">Consultores</th>${col.map(m => `<th class="dir">${esc(rot(m))}</th>`).join('')}</tr></thead><tbody>${Object.entries(sups).sort((a, b) => cmpTxt(a[0], b[0])).map(([s, xs]) => `<tr><td>${esc(s)}</td><td class="dir">${xs.length}</td>${col.map(m => `<td class="dir">${valorTxt(m, agregar(m, xs, md.metricas))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else {
      const m0 = md.metricas[0]; if (!m0) continue;
      const top = [...dd].sort((a, b) => (V(b, m0) || 0) - (V(a, m0) || 0)).slice(0, 5);
      html += `<h3>${esc(f)} · ${dd.length} consultor(es)</h3><table class="tabela"><thead><tr><th>Top 5 por ${esc(m0.rotulo)}</th><th>Supervisor</th>${md.metricas.slice(0, 4).map(m => `<th class="dir">${esc(m.rotulo)}</th>`).join('')}</tr></thead><tbody>${top.map(d => `<tr><td>${esc(d.nome)}</td><td>${esc(d.supervisor)}</td>${md.metricas.slice(0, 4).map(m => `<td class="dir">${valorTxt(m, V(d, m))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
  }
  return html ? `<section><h2>Desempenho</h2>${html}</section>` : '';
};

document.addEventListener('aba-aberta', e => { if (e.detail === 'desempenho') render(); });
window.addEventListener('dados-atualizados', () => { if (document.getElementById('aba-desempenho').classList.contains('ativo') && !(dlg && dlg.open)) render(); });
if (document.getElementById('aba-desempenho').classList.contains('ativo')) render();
})();
