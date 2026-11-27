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
const vazio = () => ({ modelos: {}, dados: [], metas: {}, importacoes: [], grupos: {} });
// hora de importação de cada relatório · mês · operação (a sincronização usa para não perder nada)
const grupoDe = d => d.fonte + '|' + d.mes + '|' + (d.op || '');
function marcarGrupos(removidos, novos) { const t = new Date().toISOString(); D.grupos = D.grupos || {}; removidos.concat(novos).forEach(d => { D.grupos[grupoDe(d)] = t; }); }
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
/* operação (Admissão = Captação · Serviços = Permanência): do relatório importado ou do BD */
const opNorm = t => { const x = norm(t || ''); return /capta|admiss/.test(x) ? 'Admissão' : /perman|servic/.test(x) ? 'Serviços' : ''; };
// sem operação no relatório nem no BD: os relatórios antigos eram os de Admissão
const opDaLinha = d => d.op || (() => { const c = identificar(d.mat, indiceCache()) || identificar(d.nome, indiceCache()); return c ? opNorm(c.operacao || c.grupo) : ''; })() || 'Admissão';
const opCurta = o => o === 'Admissão' ? 'Adm.' : o === 'Serviços' ? 'Serv.' : '';
A.opDesempenho = opDaLinha;

/* ---------------- leitura de arquivos ---------------- */
async function lerArquivo(f, progresso) {
  if (/\.csv$|\.txt$/i.test(f.name)) return [{ nome: f.name, linhas: A.parseCSV(await f.text()) }];
  // se uma aba for o relatório de indicadores, lê só ela
  return XLSXLeitor.lerPlanilha(await f.arrayBuffer(), { progresso, escolher: previas => { const ds = acharConsolidados(previas); if (ds.length) return ds.map(d => previas[d.ia].nome); const d = null; return d ? [previas[d.ia].nome] : previas.map(a => a.nome); } });
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
function acharConsolidados(abas) { const out = []; abas.forEach((a, ia) => { const d = acharConsolidado([a]); if (d) out.push({ ia, iCab: d.iCab }); }); return out; }
// aba "Performance Agentes - ADM OUT" → Admissão / outubro; "… SERV OUT" → Serviços
const opDaAba = t => { const x = ' ' + norm(t).replace(/[^a-z0-9]+/g, ' ') + ' '; return / adm |admiss|capta/.test(x) ? 'Admissão' : / serv |servic|perman/.test(x) ? 'Serviços' : ''; };
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
  ['C-SAT', 'PESQUISA DE SATISFAÇÃO', [['c-sat envio', 'pct', 1], ['c-sat nota', 'pct', 1], ['c-sat bot', 'pct', 1], ['c-sat final', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Qualidade', 'QUALIDADE', [['nota supervisor', 'pct', 1], ['nota monitor', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Aceite', 'ACEITE', [['total', 'somar', 1], ['quartil', 'quartil', -1], ['gp', 'somar', 1], ['ead', 'somar', 1], ['gsp', 'somar', 1]]],
  ['Matrícula', 'MATRÍCULA', [['total', 'somar', 1], ['quartil', 'quartil', -1], ['gp', 'somar', 1], ['ead', 'somar', 1], ['gsp', 'somar', 1], ['pead', 'somar', 1]]],
  ['Pausa', 'PAUSA', [['tempo em pausa', 'pct', -1], ['media almoco', 'tempoMedio', 0], ['media banheiro', 'tempoMedio', -1], ['media canais digitais', 'tempoMedio', 0], ['media falha sistemica', 'tempoMedio', -1], ['media feedback', 'tempoMedio', 0], ['ginastica laboral', 'tempoMedio', 0], ['media lanche', 'tempoMedio', -1], ['media particular', 'tempoMedio', -1], ['media descanso', 'tempoMedio', -1], ['media treinamento', 'tempoMedio', 0]]],
  ['HubSpot', 'HUBSPOT', [['criacao de lead', 'pct', 1]]],
  ['Medicina', 'MEDICINA', [['inscricao medicina', 'somar', 1], ['quartil', 'quartil', -1], ['matricula medicina', 'somar', 1], ['quartil', 'quartil', -1]]],
  ['Aderência', 'ADERÊNCIA', [['aderencia', 'pct', 1], ['quartil', 'quartil', -1]]],
  ['Reingresso', 'REINGRESSO', [['matricula gp', 'somar', 1], ['matricula ead|gsp', 'somar', 1]]],
  // relatório de Serviços (Permanência)
  ['Aceite reingresso', 'ACEITES REINGRESSO', [['aceites reingresso - gp', 'somar', 1], ['aceites reingresso - ead', 'somar', 1], ['aceites reingresso - gsp', 'somar', 1], ['aceites reingresso - total', 'somar', 1], ['quartil', 'quartil', -1]]],
  ['Matrícula reingresso', 'MATRÍCULA REINGRESSO', [['matricula reingresso - gp', 'somar', 1], ['matricula reingresso - ead', 'somar', 1], ['matricula reingresso - gsp', 'somar', 1], ['matricula reingresso - total', 'somar', 1], ['quartil', 'quartil', -1]]],
  ['Retenção', 'RETENÇÃO', [['revertidos', 'somar', 1], ['quartil', 'quartil', -1], ['cancelados', 'somar', -1], ['quartil', 'quartil', -1]]]
];
const SEQ = []; MODELO_BASE.forEach(([g, t, cs]) => cs.forEach(([s, tipo, sentido]) => SEQ.push({ g, t, s, tipo, sentido })));
// nome da coluna sem o sufixo que o Excel/Power Pivot põe nas repetidas (BOTMAKER_5, QUARTIL_16, INBOUND2…)
const limparCab = t => String(t ?? '').replace(/\s+/g, ' ').trim().replace(/[_ .]\d+$/, '').replace(/(?<=[A-Za-zÀ-ú])\d+$/, '').trim();
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
    // colunas sem nenhum valor (blocos repetidos vazios, "Column65"…) não viram indicador
    if (mets.length && !aba.linhas.slice(iCab + 1).some(l => l && l[j] !== null && l[j] !== undefined && String(l[j]).trim() !== '')) continue;
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
    const reg = { mat: (c && c.mat) || mat, nome: c ? c.nome : nome.toUpperCase(), supervisor: String(cel(l, 'supervisor') ?? '').trim().toUpperCase() || (c && c.supervisor) || '', ies: String(cel(l, 'ies') ?? '').trim(), status: String(cel(l, 'status') ?? '').trim(), mes, op: info.op || (c ? opNorm(c.operacao || c.grupo) : ''), v: {} };
    if (!c) { reg.foraBD = true; fora.push(reg.nome); }
    const k = reg.mat || norm(reg.nome); if (vistos.has(k)) continue; vistos.add(k);
    info.mets.forEach(mt => { let v = converter(mt.tipo, l[mt.coluna]); if (typeof v === 'number' && isFinite(v)) v = +v.toPrecision(7); /* menos dígitos: o histórico ocupa menos espaço */ if (v !== null) reg.v[mt.rotulo] = v; });
    dados.push(reg);
  }
  return { dados, total, fora };
}
/* modelo do consolidado: a lista de indicadores só cresce (índices estáveis para os meses antigos) */
/* modelo do consolidado: as colunas do arquivo novo, na ordem dele, mais as antigas que ainda têm dados em outros meses.
   Os meses já guardados são regravados na nova ordem. */
function remontarModelo(fonte, mets, substitui) {
  if (typeof substitui === 'string') { const m0 = substitui; substitui = d => d.mes === m0; }
  const velho = D.modelos[fonte] && D.modelos[fonte].consolidado ? comIndice(D.modelos[fonte]) : [];
  const outros = D.dados.filter(d => d.fonte === fonte && !substitui(d));
  const obj = d => { const o = {}; velho.forEach(m => { const v = V(d, m); if (v !== null && v !== undefined) o[m.rotulo] = v; }); return o; };
  const antigos = outros.map(d => ({ d, o: obj(d) }));
  const novos = mets.map(m => ({ rotulo: m.rotulo, grupo: m.grupo, sub: m.sub, gOrig: m.gOrig, sOrig: m.sOrig, tipo: m.tipo, sentido: m.sentido }));
  velho.forEach(m => { if (!novos.some(x => x.rotulo === m.rotulo) && antigos.some(a => a.o[m.rotulo] !== undefined)) novos.push({ ...m }); });
  const md = { fonte, consolidado: true, metricas: novos }; comIndice(md);
  const cod = o => { const v = md.metricas.map(m => o[m.rotulo] ?? null); while (v.length && v[v.length - 1] === null) v.pop(); return v; };
  antigos.forEach(({ d, o }) => { d.v = cod(o); delete d.m; });
  return { md, cod };
}
function passoConsolidado(partes, op, avisos) {
  // importação por operação: tudo o que entra aqui é da operação escolhida (Admissão OU Serviços) e só ela é substituída
  const f = document.getElementById('desForm'), fonte = (partes[0] && partes[0].arq.fonte) || FONTE_PADRAO;
  const TT = { tempo: 'tempo', tempoMedio: 'tempo', pct: '%', quartil: 'quartil', texto: 'texto', somar: 'nº' };
  const lerUI = () => partes.forEach((p, i) => { const m = document.getElementById('dsMes' + i); if (m) p.mes = m.value; });
  const processar = () => partes.map(p => { p.info.op = op; const r = p.mes ? processarConsolidado(p.aba, p.det.iCab, p.info, p.mes) : { dados: [], fora: [], total: 0 }; return { ...p, r }; });
  const desenhar = () => {
    lerUI(); const rs = processar();
    rs.forEach((x, i) => { const el = document.getElementById('dsN' + i); if (el) el.textContent = x.mes ? x.r.dados.length : '—'; });
    const ok = rs.filter(x => x.mes && x.r.dados.length), tot = ok.reduce((a, x) => a + x.r.dados.length, 0), fora = ok.reduce((a, x) => a + x.r.fora.length, 0);
    const meses = [...new Set(ok.map(x => x.mes))].sort(), ja = meses.filter(m => D.dados.some(d => d.fonte === fonte && d.mes === m && opDaLinha(d) === op));
    document.getElementById('dsResumo').innerHTML = `<div class="an-chips"><span><small>Arquivos</small><b>${ok.length}</b></span><span><small>Meses</small><b>${meses.map(mesTxt).join(', ') || '—'}</b></span><span><small>Consultores</small><b>${tot}</b></span><span><small>Fora do BD</small><b>${fora}</b></span></div>
      ${ja.length ? `<p class="dica"><b>${op} já tem:</b> ${ja.map(mesTxt).join(', ')} — estes meses de ${op} serão substituídos. ${op === 'Admissão' ? 'Serviços' : 'Admissão'} não é alterado.</p>` : `<p class="dica">Entra só em ${op}. ${op === 'Admissão' ? 'Serviços' : 'Admissão'} não é alterado.</p>`}
      ${partes.some(p => !p.mes) ? '<p class="aviso-fluxo">Informe o mês dos arquivos sem mês no nome.</p>' : ''}`;
    document.getElementById('dsSalvarC').disabled = !tot || partes.some(p => !p.mes);
    return ok;
  };
  const porGrupo = {}; partes.forEach(p => p.info.mets.forEach(m => { const g = porGrupo[m.grupo] = porGrupo[m.grupo] || new Map(); if (!g.has(m.rotulo)) g.set(m.rotulo, m); }));
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Importar ${esc(op)}</h2><p>${partes.length} arquivo(s) reconhecido(s) · o mês vem do nome de cada arquivo</p></div></header>
    ${avisos.length ? `<div class="aviso-fluxo">${avisos.map(esc).join('<br>')}</div>` : ''}
    <div class="tabela-wrap"><table class="tabela ds-abas"><thead><tr><th>Arquivo</th><th>Aba usada</th><th>Mês dos dados</th><th class="dir">Consultores</th></tr></thead><tbody>
      ${partes.map((p, i) => `<tr><td><b>${esc(p.arq.nome)}</b></td><td>${esc(p.aba.nome.trim())}</td><td><input type="month" id="dsMes${i}" value="${p.mes}"></td><td class="dir" id="dsN${i}"></td></tr>`).join('')}
    </tbody></table></div>
    <input type="hidden" id="dsFonteC" value="${esc(fonte)}">
    <div id="dsResumo"></div>
    <details class="ds-cols"><summary>Indicadores reconhecidos</summary><div class="ds-grupos">${Object.entries(porGrupo).map(([g, ms]) => { const l = [...ms.values()]; return `<div><b>${esc(l[0].gOrig || g)}</b><span>${l.map(m => `<small title="${esc(m.rotulo)}">${esc(m.sOrig || m.sub)} <i>${TT[m.tipo] || ''}</i></small>`).join('')}</span></div>`; }).join('')}</div></details>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button type="button" class="btn btn-sec" id="dsVoltar">Voltar</button> <button type="button" class="btn btn-pri" id="dsSalvarC">${G.ic('check')}Salvar em ${esc(op)}</button></span></div>`;
  G.icones(f);
  partes.forEach((_, i) => { document.getElementById('dsMes' + i).onchange = desenhar; });
  document.getElementById('dsVoltar').onclick = passo1;
  desenhar();
  document.getElementById('dsSalvarC').onclick = () => {
    const nomeF = fonte, msg = document.getElementById('dsMsg');
    const rs = desenhar(); if (!rs.length) { msg.textContent = 'Nenhum arquivo com consultores para importar.'; msg.className = 'msg erro'; return; }
    D = Object.assign(vazio(), ler(KEY, {}) || {});
    const uniao = [], vistos = new Set(); rs.forEach(x => x.info.mets.forEach(m => { if (!vistos.has(m.rotulo)) { vistos.add(m.rotulo); uniao.push(m); } }));
    const meses = [...new Set(rs.map(x => x.mes))].sort();
    // só esta operação, só estes meses
    const substitui = d => meses.includes(d.mes) && opDaLinha(d) === op;
    const { md, cod } = remontarModelo(nomeF, uniao, substitui);
    D.modelos[nomeF] = md;
    const pk = d => d.mes + '|' + (d.mat || norm(d.nome)), ja = new Set(), novos = [];
    rs.slice().reverse().forEach(x => x.r.dados.forEach(d => { const k = pk(d); if (ja.has(k)) return; ja.add(k); novos.push({ ...d, op, fonte: nomeF, v: cod(d.v) }); })); // o último arquivo do mesmo mês vale
    marcarGrupos(D.dados.filter(d => d.fonte === nomeF && substitui(d)), novos);
    D.dados = D.dados.filter(d => !(d.fonte === nomeF && substitui(d))).concat(novos);
    D.importacoes = [{ fonte: nomeF, op, arquivo: rs.map(x => x.arq.nome).join(', '), em: new Date().toISOString(), meses, linhas: rs.reduce((a, x) => a + x.r.total, 0), casados: novos.filter(d => !d.foraBD).length, naoAchados: novos.filter(d => d.foraBD).length }, ...(D.importacoes || [])].slice(0, 80);
    const tamD = JSON.stringify(D).length;
    if (tamD > 30000000) { msg.textContent = `O histórico ficaria grande demais (${fmt(tamD / 1048576, 1)} MB). Nada foi apagado.`; msg.className = 'msg erro'; D = Object.assign(vazio(), ler(KEY, {}) || {}); return; }
    salvar(); dlg.close(); est.fonte = nomeF; est.opF = op; est.mes = meses[meses.length - 1]; est.grupo = 'Dashboard'; render();
    toast(`${op}: ${novos.length} consultor(es) · ${meses.map(mesTxt).join(', ')}`);
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
const RESUMO = [['Geral', 'quartil geral'], ['Chamadas', 'total'], ['Chamadas', 'efetividade'], ['TMA', 'outbound'], ['Pós-chamada', 'total'], ['Carga horária', 'total'], ['Ponto', 'abs'], ['C-SAT', 'c-sat final'], ['Qualidade', 'nota monitor'], ['Aceite', 'total'], ['Matrícula', 'total'], ['Aceite reingresso', 'aceites reingresso - total'], ['Matrícula reingresso', 'matricula reingresso - total'], ['Retenção', 'revertidos'], ['Retenção', 'cancelados'], ['Pausa', 'tempo em pausa'], ['HubSpot', 'criacao de lead'], ['Aderência', 'aderencia']];
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

/* ---------------- dashboard do desempenho (guias de análise) ---------------- */
const fmtTipo = (mt, v) => v === null || v === undefined ? '—' : valorTxt(mt, v);
const curtoN = v => v >= 1e4 ? fmt(v / 1000, 0) + 'k' : v >= 1e3 ? fmt(v / 1000, 1) + 'k' : fmt(v, 0);
const GUIAS = [['geral', 'Visão geral', 'chart'], ['consultores', 'Consultores', 'users'], ['quartis', 'Quartis · Pit Stop', 'trophy'], ['supervisores', 'Supervisores', 'award'], ['organizacao', 'Organização', 'layers'], ['tempos', 'Tempos e pausas', 'clock'], ['evolucao', 'Evolução', 'activity'], ['tabela', 'Tabela', 'clipboard']];
const mediaA = xs => { const v = xs.filter(x => x !== null && x !== undefined && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const cardA = (ic, tit, sub, corpo, acoes = '') => `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic(ic)}</span><div><h2>${tit}</h2><p>${sub}</p></div>${acoes ? `<div class="cab-acoes">${acoes}</div>` : ''}</header>${corpo}</article>`;
const tituloN = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase());
const curtoNome = n => { const p = tituloN(n).split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };
const mesesEntre = (a, b) => { if (!a) return null; const d1 = new Date(a), d2 = new Date(b); if (isNaN(d1)) return null; return Math.max(0, (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth()); };

const iesDe = t => { const x = norm(t || ''); return x.includes('uva') ? 'UVA' : x.includes('unijorge') || /\buj\b/.test(x) ? 'UJ' : (String(t || '').trim().toUpperCase() || '—'); };
const ativoDes = d => !d.status || (/ativ/i.test(d.status) && !/inativ|deslig/i.test(d.status));
const quartilPos = (r, n) => r <= n / 4 ? 1 : r <= n / 2 ? 2 : r <= 3 * n / 4 ? 3 : 4;
const QMAP = new Map(); // quartis calculados (só em memória; não vão para o armazenamento)
const qChave = d => (d.mes || '') + '|' + (d.mat || norm(d.nome));
const GERAL_KS = ['abs', 'csat', 'qual', 'aceite', 'mat'];
function quartisDef(M) {
  return [['geral', 'Geral', null, 0, 'Geral'], ['qual', 'Qualidade', M('Qualidade', 'nota monitor'), 1, 'Qualidade'], ['abs', 'ABS', M('Ponto', 'abs'), -1, 'Ponto'], ['aceite', 'Aceite', M('Aceite', 'total') || M('Aceite reingresso', 'aceites reingresso - total'), 1, 'Aceite', false, M('Aceite reingresso', 'aceites reingresso - total')],
    ['csat', 'Pesquisa de satisfação', M('C-SAT', 'c-sat final'), 1, 'C-SAT', true], ['mat', 'Matrícula', M('Matrícula', 'total') || M('Matrícula reingresso', 'matricula reingresso - total'), 1, 'Matrícula', false, M('Matrícula reingresso', 'matricula reingresso - total')],
    ['insMed', 'Inscrição medicina', M('Medicina', 'inscricao medicina'), 1, 'Medicina', true], ['matMed', 'Matrícula medicina', M('Medicina', 'matricula medicina'), 1, 'Medicina', true],
    ['rev', 'Revertidos', M('Retenção', 'revertidos'), 1, 'Retenção'], ['canc', 'Cancelados', M('Retenção', 'cancelados'), -1, 'Retenção']]
    .filter(x => x[0] === 'geral' || x[2]).map(([k, rot, mt, dir, grupo, semZero, alt]) => ({ k, rot: mt && /reingresso/i.test(mt.grupo) ? rot + ' reingresso' : rot, mt, dir, grupo, semZero: !!semZero, alt: alt || null }))
    .filter((q, _, a) => q.k !== 'geral' || a.some(x => GERAL_KS.includes(x.k)));
}
const qkDe = m => { if (!m) return ''; if (m.qk) return m.qk; const g = m.grupo; if (g === 'Geral') return 'geral'; if (g === 'Ponto') return 'abs'; if (g === 'C-SAT') return 'csat'; if (g === 'Qualidade') return 'qual'; if (g === 'Aceite' || g === 'Aceite reingresso') return 'aceite'; if (g === 'Matrícula' || g === 'Matrícula reingresso') return 'mat'; if (g === 'Medicina') return /inscri/.test(norm(m.ref || m.rotulo)) ? 'insMed' : 'matMed'; if (g === 'Retenção') return /cancel/.test(norm(m.ref || m.rotulo)) ? 'canc' : 'rev'; return ''; };
function calcQuartis(dados, QDEF, iesTxt) {
  QMAP.clear(); dados.forEach(d => QMAP.set(qChave(d), { q: {}, r: {}, ies: iesDe(iesTxt(d)), op: opDaLinha(d) }));
  const porIes = {}; dados.filter(ativoDes).forEach(d => { const o = QMAP.get(qChave(d)), k = o.op + '|' + o.ies; // cada operação tem o seu ranking (como no relatório de cada uma)
 (porIes[k] = porIes[k] || []).push(d); });
  Object.entries(porIes).forEach(([gk, ls]) => { const serv = gk.startsWith('Serviços|');
    const posDe = (xs, asc) => { const ord = xs.map(x => x.v).sort((a, b) => asc ? a - b : b - a), pos = new Map(); ord.forEach((v, i) => { if (!pos.has(v)) pos.set(v, i + 1); }); return pos; };
    QDEF.filter(q => q.mt).forEach(q => {
      const mt = serv && q.alt ? q.alt : q.mt; // em Serviços, aceite e matrícula são os de reingresso
      const xs = ls.map(d => ({ d, v: V(d, mt) })).filter(x => x.v !== null && x.v !== undefined && isFinite(x.v) && (!q.semZero || x.v > 0));
      const pos = posDe(xs, q.dir < 0);
      xs.forEach(x => { const r = pos.get(x.v), o = QMAP.get(qChave(x.d)); o.r[q.k] = r; o.q[q.k] = quartilPos(r, xs.length); });
    });
    const ks = GERAL_KS.filter(k => QDEF.some(q => q.k === k)); if (!ks.length) return;
    const n = ls.length, xs = ls.map(d => ({ d, v: ks.reduce((a, k) => a + (QMAP.get(qChave(d)).r[k] || n), 0) })), pos = posDe(xs, true);
    xs.forEach(x => { QMAP.get(qChave(x.d)).q.geral = quartilPos(pos.get(x.v), n); });
  });
}
function dashboardDes(ctx) {
  const { todas, linhas, mesesAsc, mesAnt, base } = ctx;
  const opsN = (ctx.opsMes || []).length, separar = !est.opF && opsN > 1;
  // supervisor separado por operação (a mesma pessoa pode ter equipe em Admissão e em Serviços)
  const supK = d => (d.supervisor || '—') + (separar && opDaLinha(d) ? ' · ' + opDaLinha(d) : '');
  const supNome = (k, curto) => { const [n, o] = String(k).split(' · '); return (curto ? curtoNome(n) : tituloN(n)) + (o ? ' · ' + (curto ? opCurta(o) : o) : ''); };
  const M = (g, s) => achar(todas, g, s);
  const ag = (mt, ls) => mt ? agregar(mt, ls, todas) : null;
  const ant = mesAnt ? base(mesAnt) : [];
  const serie = mt => mesesAsc.map(m => ag(mt, base(m)));
  let qg = todas.find(m => m.tipo === 'quartil' && m.grupo === 'Geral');
  let qCols = todas.filter(m => m.tipo === 'quartil' && m.grupo !== 'Geral');
  // quartil da base; se a base não trouxer, o calculado pela regra do Relatório Ranking
  const qBase = todas.filter(m => m.tipo === 'quartil');
  const qn = (d, m) => { const k = String(V(d, m) || '').match(/[1-4]/); if (k) return +k[0]; const qk = qkDe(m);
    // Admissão e Serviços guardam o quartil de aceite/matrícula em colunas diferentes
    if (qk) for (const m2 of qBase) if (m2 !== m && qkDe(m2) === qk) { const k2 = String(V(d, m2) || '').match(/[1-4]/); if (k2) return +k2[0]; } const o = qk && QMAP.get(qChave(d)); return o ? o.q[qk] || 0 : 0; };
  const reA = M('Aceite reingresso', 'aceites reingresso - total'), reM = M('Matrícula reingresso', 'matricula reingresso - total');
  const soServ = est.opF === 'Serviços' || (!M('Aceite', 'total') && reA);
  const cTot = M('Chamadas', 'total'), aTot = (soServ && reA) || M('Aceite', 'total'), mTot = (soServ && reM) || M('Matrícula', 'total');
  const ader = M('Aderência', 'aderencia'), abs = M('Ponto', 'abs'), csat = M('C-SAT', 'c-sat final'), nmon = M('Qualidade', 'nota monitor'), efet = M('Chamadas', 'efetividade'), pausa = M('Pausa', 'tempo em pausa');
  const conv = ls => { const a = ag(aTot, ls), m = ag(mTot, ls); return a ? m / a : null; };
  const mes = (linhas[0] || {}).mes || '';
  // cruzamento com as outras bases do site
  const q = ler(KEY_Q, {}) || {}, bd = new Map(); (q.itens || []).concat(q.saidas || []).forEach(c => { if (c.mat) bd.set('m:' + c.mat, c); bd.set('n:' + norm(c.nome), c); });
  const bdDe = d => bd.get('m:' + d.mat) || bd.get('n:' + norm(d.nome)) || {};
  const mons = (A.monitorias ? A.monitorias() : []).filter(m => (m.data || '').startsWith(mes));
  const monPor = {}; mons.forEach(m => { const k = norm(m.nome); (monPor[k] = monPor[k] || []).push(m.nota); });
  const ocs = ler(KEY_OC, []) || [], ini12 = (() => { const d = new Date(mes + '-01'); d.setMonth(d.getMonth() - 11); return d.toISOString().slice(0, 10); })();
  const ocPor = {}; ocs.forEach(o => { const k = norm(o.nome); const x = ocPor[k] = ocPor[k] || { faltas: 0, atest: 0, medidas: 0 }; if ((o.data || '').startsWith(mes)) { if (o.tipo === 'Falta') x.faltas++; if (o.tipo === 'Atestado') x.atest += o.dias || 1; } if (o.data >= ini12 && (o.tipo === 'Advertência' || o.tipo === 'Suspensão')) x.medidas++; });
  const fimMes = mes + '-28';
  /* Quartis (regra do Relatório Ranking - Gerencial): por IES, só ativos, RANK.EQ de cada indicador
     (ABS crescente; NPS/C-SAT, nota do monitor, aceite e matrícula decrescentes) e Q1 ≤ n/4, Q2 ≤ n/2, Q3 ≤ 3n/4, Q4.
     Quartil geral = posição da soma dos 5 ranks. */
  const QDEF = quartisDef(M);
  calcQuartis(D.dados.filter(d => d.fonte === est.fonte && d.mes === mes), QDEF, d => d.ies || (bdDe(d) || {}).ies || '');
  if (QDEF.length) {
    if (!qg) qg = { grupo: 'Geral', tipo: 'quartil', rotulo: 'Quartil geral', sub: 'Quartil geral', sOrig: 'QUARTIL GERAL', qk: 'geral', virtual: true };
    QDEF.forEach(q => { if (!qCols.some(m => qkDe(m) === q.k)) qCols.push({ grupo: q.grupo, tipo: 'quartil', rotulo: q.rot + ' · Quartil', sub: 'Quartil', sOrig: 'QUARTIL', gOrig: q.rot.toUpperCase(), qk: q.k, virtual: true }); });
  }
  const perfil = linhas.map(d => {
    const c = bdDe(d), o = ocPor[norm(d.nome)] || { faltas: 0, atest: 0, medidas: 0 }, nq = mediaA(monPor[norm(d.nome)] || []);
    const qs = qCols.map(m => qn(d, m)), q4 = qs.filter(x => x === 4).length, q1 = qs.filter(x => x === 1).length, qgv = qg ? qn(d, qg) : 0;
    const casa = mesesEntre(c.admissao, fimMes);
    const absV = abs ? V(d, abs) : null;
    let risco = 0; if (qgv === 4) risco += 30; else if (qgv === 3) risco += 15; risco += q4 * 6; risco += Math.min(20, (o.faltas + o.atest) * 5); risco += o.medidas * 10; if (nq !== null && nq < 85) risco += 10; if (absV !== null && absV > .1) risco += 10; if (casa !== null && casa < 3) risco += 5;
    return { d, c, o, nq, q4, q1, qgv, casa, turno: c.turno || '', ies: c.ies || d.ies || '', op: opDaLinha(d) || c.operacao || '', risco: Math.min(100, risco) };
  });
  const nivel = r => r >= 50 ? ['Alto', 'ruim'] : r >= 25 ? ['Médio', 'alerta'] : ['Baixo', 'bom'];
  if (!est.guia || !GUIAS.some(g => g[0] === est.guia)) est.guia = 'geral';
  const g = est.guia;
  let corpo = '', depois = () => {};
  const qDist = ls => [1, 2, 3, 4].map(n => qg ? ls.filter(d => qn(d, qg) === n).length : 0);
  const qBar = qs => `<div class="db-qbar">${qs.map((n, i) => n ? `<i class="q${i + 1}" style="flex:${n}" data-tip="Q${i + 1}: ${n}">${n}</i>` : '').join('')}</div>`;

  if (g === 'geral') {
    const q_ = qDist(linhas), qTot = q_.reduce((a, b) => a + b, 0);
    const grande = (rot, mt, ic, cor, custom) => {
      const v = custom ? custom.v : ag(mt, linhas), va = custom ? custom.va : ag(mt, ant), sp = custom ? custom.sp : serie(mt), tipo = custom ? custom.tipo : mt && mt.tipo;
      return `<div class="db-big" style="--c:${cor}"><span class="db-big-ic">${G.ic(ic)}</span><small>${esc(rot)}</small><b>${custom ? custom.txt(v) : fmtTipo(mt, v)}</b><div class="db-big-rod">${DB.delta(v, va, 1, tipo === 'pct' ? 'pct' : ehTempo(tipo) ? 'tempo' : 'n')}${DB.spark(sp, cor)}</div><em>${custom && custom.em ? custom.em : linhas.length && mt && mt.tipo === 'somar' ? fmt(v / linhas.length, 1) + ' por consultor' : '&nbsp;'}</em></div>`;
    };
    const GAUGES = [[ader, 'Aderência'], [csat, 'C-SAT final'], [nmon, 'Nota monitor'], [M('Qualidade', 'nota supervisor'), 'Nota supervisor'], [efet, 'Efetividade'], [M('HubSpot', 'criacao de lead'), 'Criação de lead'], [abs, 'Absenteísmo (ABS)'], [pausa, 'Tempo em pausa'], [M('Shortcall', 'outbound'), 'Shortcall outbound']];
    const gauges = GAUGES.filter(([mt]) => mt).map(([mt, rot]) => { const v = ag(mt, linhas); if (v === null) return ''; const meta = D.metas[mt.rotulo]; const mv = meta ? +meta.valor : null; const razao = mv ? (mt.sentido < 0 ? mv / (v || 1e-9) : v / mv) : null; return DB.medidor({ valor: v, texto: fmtTipo(mt, v), rotulo: rot, meta: mv, razao, cor: razao === null ? (mt.sentido < 0 ? '#eb6834' : '#2a78d6') : null, sub: `${DB.delta(v, ag(mt, ant), mt.sentido, 'pct')}${mv ? ` <span class="db-meta-t">meta ${fmt(mv * 100, 1)}%</span>` : ''}` }); }).join('');
    // destaques automáticos: maiores variações do mês
    const vari = todas.filter(m => m.tipo !== 'quartil' && m.tipo !== 'texto' && m.sentido).map(m => { const v = ag(m, linhas), va = ag(m, ant); if (v === null || va === null || !va) return null; const r = m.tipo === 'pct' ? (v - va) : (v - va) / Math.abs(va); return { m, v, va, r: r * m.sentido }; }).filter(Boolean).sort((a, b) => b.r - a.r);
    const insight = (x, bom) => `<li class="${bom ? 'bom' : 'ruim'}"><span>${bom ? '▲' : '▼'}</span><div><b>${esc(x.m.rotulo.replace(/ · Total$/, ''))}</b><small>${fmtTipo(x.m, x.va)} → <b>${fmtTipo(x.m, x.v)}</b></small></div></li>`;
    const mix = (gr, subs) => subs.map((s, i) => { const mt = M(gr, s); return mt ? { rotulo: String(mt.sOrig || mt.sub).replace(/^.*REINGRESSO\s*-\s*/i, ''), valor: ag(mt, linhas) || 0, cor: DB.PAL[i] } : null; }).filter(Boolean);
    const riscoAlto = perfil.filter(p => p.risco >= 50).length;
    corpo = `
    <div class="db-hero">
      <div class="db-hero-q cartao">${DB.anel({ pct: qTot ? (q_[0] + q_[1]) / qTot : 0, titulo: 'Q1 + Q2', centro: qTot ? fmt((q_[0] + q_[1]) / qTot * 100, 0) + '%' : '—', sub: `${q_[0] + q_[1]} de ${qTot} consultores`, cor: '#1baf7a' })}
        <div class="db-qleg">${q_.map((n, i) => `<div><span class="qt q${i + 1}">Q${i + 1}</span><b>${n}</b><small>${qTot ? fmt(n / qTot * 100, 0) + '%' : ''}</small></div>`).join('')}<p>Quartil geral · ${riscoAlto} consultor(es) com risco alto</p></div></div>
      <div class="db-bigs">${cTot ? grande('Chamadas atendidas', cTot, 'headset', '#2a78d6') : ''}${M('Retenção', 'revertidos') ? grande('Revertidos', M('Retenção', 'revertidos'), 'check', '#0f9d58') : ''}${M('Retenção', 'cancelados') ? grande('Cancelados', M('Retenção', 'cancelados'), 'alert', '#d03b3b') : ''}${aTot ? grande(soServ ? 'Aceites reingresso' : 'Aceites', aTot, 'check', '#1baf7a') : ''}${mTot ? grande(soServ ? 'Matrículas reingresso' : 'Matrículas', mTot, 'award', '#8e44c9') : ''}${aTot && mTot ? grande('Conversão aceite → matrícula', null, 'target', '#eb6834', { v: conv(linhas), va: conv(ant), sp: mesesAsc.map(m => conv(base(m))), tipo: 'pct', txt: v => v === null ? '—' : fmt(v * 100, 1) + '%', em: 'matrículas ÷ aceites' }) : ''}</div>
    </div>
    ${gauges ? cardA('activity', 'Indicadores de qualidade e eficiência', `Operação no mês · ▲▼ contra ${mesAnt ? mesTxt(mesAnt) : 'o mês anterior (não importado)'}${Object.keys(D.metas).length ? ' · traço = meta' : ' · defina metas no botão Metas para colorir pelo atingimento'}`, `<div class="db-gauges">${gauges}</div>`) : ''}
    ${vari.length ? cardA('sparkles', 'O que mudou no mês', `Maiores melhoras e pioras contra ${mesTxt(mesAnt)}`, `<div class="db-ins"><div><h3 class="db-h3">Melhorou</h3><ul>${vari.filter(x => x.r > 0).slice(0, 6).map(x => insight(x, true)).join('') || '<li class="dica">—</li>'}</ul></div><div><h3 class="db-h3">Piorou</h3><ul>${vari.filter(x => x.r < 0).reverse().slice(0, 6).map(x => insight(x, false)).join('') || '<li class="dica">—</li>'}</ul></div></div>`) : ''}
    <div class="pn-grade">
      ${cardA('target', 'Funil de produção', 'Do volume de chamadas até a matrícula', DB.funil([[cTot, 'Chamadas atendidas'], [M('Chamadas', 'outbound finalizadas'), 'Outbound finalizadas'], [aTot, soServ ? 'Aceites reingresso' : 'Aceites'], [mTot, soServ ? 'Matrículas reingresso' : 'Matrículas']].filter(x => x[0]).map(([mt, r], i) => ({ rotulo: r, valor: ag(mt, linhas) || 0, cor: ['#1d4f91', '#2a78d6', '#1baf7a', '#8e44c9'][i] }))))}
      ${cardA('layers', 'Composição', 'De onde vêm as chamadas, aceites e matrículas', `<h3 class="db-h3">Chamadas por canal</h3>${DB.empilhada(mix('Chamadas', ['inbound', 'ligacao manual', 'botmaker', 'outbound']))}<h3 class="db-h3">Aceites por produto</h3>${DB.empilhada((soServ ? mix('Aceite reingresso', ['aceites reingresso - gp', 'aceites reingresso - ead', 'aceites reingresso - gsp']) : mix('Aceite', ['gp', 'ead', 'gsp'])))}<h3 class="db-h3">Matrículas por produto</h3>${DB.empilhada((soServ ? mix('Matrícula reingresso', ['matricula reingresso - gp', 'matricula reingresso - ead', 'matricula reingresso - gsp']) : mix('Matrícula', ['gp', 'ead', 'gsp', 'pead'])))}`)}
    </div>`;
  }

  if (g === 'consultores') {
    const ordK = est.rxOrd || 'risco', dir = est.rxDir ?? -1;
    const valR = (p, k) => k === 'nome' ? p.d.nome : k === 'risco' ? p.risco : k === 'qg' ? (p.qgv || 9) : k === 'q4' ? p.q4 : k === 'nq' ? p.nq : k === 'falt' ? p.o.faltas + p.o.atest : k === 'med' ? p.o.medidas : k === 'casa' ? p.casa : k === 'conv' ? (V(p.d, aTot) ? V(p.d, mTot) / V(p.d, aTot) : null) : V(p.d, todas.find(m => m.rotulo === k) || {});
    const lista = [...perfil].sort((a, b) => { const x = valR(a, ordK), y = valR(b, ordK); return (typeof x === 'string' ? cmpTxt(x, y) : (x ?? -1e9) - (y ?? -1e9)) * dir; });
    const cols = [aTot, mTot, ader, abs, csat].filter(Boolean);
    const th = (k, t, tit = '') => `<th class="dir${ordK === k ? ' ord' : ''}" data-rx="${esc(k)}"${tit ? ` title="${esc(tit)}"` : ''}>${t}${ordK === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    // perfil Q1 x Q4
    const grp = n => perfil.filter(p => p.qgv === n);
    const cmp = (rot, f, fmtF) => { const a = mediaA(grp(1).map(f)), b = mediaA(grp(4).map(f)); return `<tr><td>${rot}</td><td class="dir"><b>${a === null ? '—' : fmtF(a)}</b></td><td class="dir"><b>${b === null ? '—' : fmtF(b)}</b></td></tr>`; };
    const turnos = [...new Set(perfil.map(p => p.turno).filter(Boolean))];
    corpo = `
    ${cardA('alert', 'Raio-X dos consultores', 'Cruza o relatório de indicadores com o BD, as monitorias e as ocorrências do site · risco = quartil, Q4, faltas, medidas, qualidade, ABS e tempo de casa · clique no nome para abrir a ficha', `<div class="tabela-wrap db-rx"><table class="tabela"><thead><tr>${th('nome', 'Consultor').replace('class="dir', 'class="')}${th('risco', 'Risco')}${th('qg', 'Quartil geral')}${th('q4', 'Qtd. Q4', 'em quantos indicadores está no Q4')}${cols.map(m => th(m.rotulo, esc(m.sOrig && !/^total$/i.test(m.sOrig) ? m.sOrig : (m.gOrig || m.grupo)), m.rotulo)).join('')}${aTot && mTot ? th('conv', 'Conversão') : ''}${th('nq', 'Nota qualidade', 'média das monitorias do mês (base de qualidade e site)')}${th('falt', 'Faltas/atest.', 'lançados no site no mês')}${th('med', 'Medidas 12m')}${th('casa', 'Tempo de casa')}</tr></thead>
      <tbody>${lista.map(p => { const [nv, cl] = nivel(p.risco); const cv = aTot && mTot && V(p.d, aTot) ? V(p.d, mTot) / V(p.d, aTot) : null; return `<tr><td data-nome="${esc(p.d.nome)}"><b>${esc(p.d.nome)}</b><small>${esc(p.d.supervisor)}${p.turno ? ' · ' + esc(p.turno) : ''}</small></td><td class="dir"><span class="tag ${cl}">${nv} · ${p.risco}</span></td><td class="dir">${p.qgv ? `<span class="qt q${p.qgv}">Q${p.qgv}</span>` : '—'}</td><td class="dir">${p.q4 ? `<b style="color:#d32f2f">${p.q4}</b>` : '<span class="zero">0</span>'}</td>${cols.map(m => `<td class="dir">${fmtTipo(m, V(p.d, m))}</td>`).join('')}${aTot && mTot ? `<td class="dir">${cv === null ? '—' : fmt(cv * 100, 1) + '%'}</td>` : ''}<td class="dir">${p.nq === null ? '—' : tagNotaD(p.nq)}</td><td class="dir">${p.o.faltas + p.o.atest || '<span class="zero">0</span>'}</td><td class="dir">${p.o.medidas ? `<span class="tag alerta">${p.o.medidas}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${p.casa === null ? '—' : p.casa < 12 ? p.casa + ' m' : fmt(p.casa / 12, 1) + ' a'}</td></tr>`; }).join('')}</tbody></table></div>`)}
    <div class="pn-grade">
      ${cardA('users', 'Perfil do Q1 × Q4', 'Média dos consultores no melhor e no pior quarto do quartil geral', `<table class="tabela db-pq"><thead><tr><th></th><th class="dir"><span class="qt q1">Q1</span> ${grp(1).length}</th><th class="dir"><span class="qt q4">Q4</span> ${grp(4).length}</th></tr></thead><tbody>
        ${aTot ? cmp('Aceites', p => V(p.d, aTot), v => fmt(v, 1)) : ''}${mTot ? cmp('Matrículas', p => V(p.d, mTot), v => fmt(v, 1)) : ''}${ader ? cmp('Aderência', p => V(p.d, ader), v => fmt(v * 100, 1) + '%') : ''}${abs ? cmp('ABS', p => V(p.d, abs), v => fmt(v * 100, 1) + '%') : ''}
        ${cmp('Nota qualidade', p => p.nq, v => fmt(v, 1) + '%')}${cmp('Faltas/atestados no mês', p => p.o.faltas + p.o.atest, v => fmt(v, 1))}${cmp('Medidas (12 meses)', p => p.o.medidas, v => fmt(v, 1))}${cmp('Tempo de casa', p => p.casa, v => v < 12 ? fmt(v, 0) + ' meses' : fmt(v / 12, 1) + ' anos')}
        ${turnos.map(t => cmp('Turno ' + t, p => p.turno === t ? 1 : 0, v => fmt(v * 100, 0) + '%')).join('')}</tbody></table>`)}
      ${cardA('trophy', 'Destaques e atenção', 'Por indicador', `<div class="db-top" id="dbTop"></div>`, `<select id="dbInd" class="db-sel"></select>`)}
    </div>
    ${qCols.length ? cardA('layers', 'Mapa de quartis', 'Cada linha é um consultor e cada coluna um indicador · Q1 é o melhor quarto da operação, Q4 o pior', '<div id="dbQmapa"></div>', `<select id="dbQord" class="db-sel"><option value="geral">Ordenar pelo quartil geral</option><option value="q4"${est.qord === 'q4' ? ' selected' : ''}>Mais Q4 primeiro</option><option value="q1"${est.qord === 'q1' ? ' selected' : ''}>Mais Q1 primeiro</option></select>`) : ''}`;
    depois = () => {
      raiz.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => { const k = x.dataset.rx; if (est.rxOrd === k) est.rxDir = -(est.rxDir ?? -1); else { est.rxOrd = k; est.rxDir = k === 'nome' || k === 'qg' ? 1 : -1; } render(); });
      // destaques
      const indOpc = todas.filter(m => m.tipo !== 'quartil' && m.tipo !== 'texto');
      if (!est.ind || !indOpc.some(m => m.rotulo === est.ind)) est.ind = (mTot || aTot || indOpc[0] || {}).rotulo;
      const sel = document.getElementById('dbInd'); sel.innerHTML = indOpc.map(m => `<option value="${esc(m.rotulo)}"${m.rotulo === est.ind ? ' selected' : ''}>${esc(m.rotulo)}</option>`).join('');
      sel.onchange = e => { est.ind = e.target.value; render(); };
      const ind = indOpc.find(m => m.rotulo === est.ind);
      const ord = ind ? linhas.filter(d => V(d, ind) !== null).sort((a, b) => (V(b, ind) - V(a, ind)) * (ind.sentido < 0 ? -1 : 1)) : [];
      const card = (d, i, ruim) => `<li class="${ruim ? 'ruim' : 'bom'}" data-nome="${esc(d.nome)}"><span>${i + 1}</span><div><b>${esc(d.nome)}</b><small>${esc(d.supervisor)}</small></div><em>${fmtTipo(ind, V(d, ind))}</em></li>`;
      document.getElementById('dbTop').innerHTML = `<div><h3 class="db-h3">Top 5</h3><ol>${ord.slice(0, 5).map((d, i) => card(d, i)).join('')}</ol></div><div><h3 class="db-h3">Atenção</h3><ol>${ord.slice(-5).reverse().map((d, i) => card(d, i, true)).join('')}</ol></div>`;
      // mapa de quartis
      const elQ = document.getElementById('dbQmapa');
      if (elQ) {
        const qTodas = (qg ? [qg] : []).concat(qCols).filter(m => linhas.some(d => qn(d, m)));
        const rotQ = m => m.grupo === 'Geral' ? 'GERAL' : m.grupo === 'Outros' ? String(m.sOrig || m.sub).toUpperCase() : (m.gOrig || m.grupo).replace(/TEMPO MÉDIO DE ATENDIMENTO - /, '').replace(/PESQUISA DE SATISFAÇÃO/, 'C-SAT').toUpperCase() + (/quartil /i.test(m.sOrig || '') ? ' · ' + (m.sOrig || '').replace(/^QUARTIL /i, '').toLowerCase() : '');
        const qOrd = linhas.map(d => ({ d, qs: qTodas.map(m => qn(d, m)) })).sort((a, b) => est.qord === 'q4' ? b.qs.filter(x => x === 4).length - a.qs.filter(x => x === 4).length : est.qord === 'q1' ? b.qs.filter(x => x === 1).length - a.qs.filter(x => x === 1).length : ((a.qs[0] || 9) - (b.qs[0] || 9)) || cmpTxt(a.d.nome, b.d.nome));
        elQ.innerHTML = `<div class="tabela-wrap db-qmapa"><table><thead><tr><th>Consultor</th>${qTodas.map(m => `<th title="${esc(m.rotulo)}"><span>${esc(rotQ(m))}</span></th>`).join('')}<th>Q1</th><th>Q4</th></tr><tr class="db-qres"><td>% em Q4</td>${qTodas.map(m => { const v = linhas.filter(d => qn(d, m)).length, q4 = linhas.filter(d => qn(d, m) === 4).length; return `<td>${v ? fmt(q4 / v * 100, 0) + '%' : '—'}</td>`; }).join('')}<td></td><td></td></tr></thead>
          <tbody>${qOrd.map(({ d, qs }) => `<tr><td data-nome="${esc(d.nome)}"><b>${esc(d.nome)}</b><small>${esc(d.supervisor)}</small></td>${qs.map(x => `<td><i class="qc q${x}">${x ? 'Q' + x : '–'}</i></td>`).join('')}<td class="db-qn">${qs.filter(x => x === 1).length}</td><td class="db-qn r">${qs.filter(x => x === 4).length}</td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('dbQord').onchange = e => { est.qord = e.target.value; render(); };
      }
    };
  }

  if (g === 'quartis') {
    if (!est.qind || !QDEF.some(q => q.k === est.qind)) est.qind = 'geral';
    const qi = QDEF.find(q => q.k === est.qind) || QDEF[0];
    const colDe = k => k === 'geral' ? qg : qCols.find(m => qkDe(m) === k);
    const qOf = (d, k = qi.k) => qn(d, colDe(k));
    const vInd = d => qi.mt ? V(d, qi.mt) : null, fv = v => qi.mt ? fmtTipo(qi.mt, v) : '—';
    const iesD = d => { const o = QMAP.get(qChave(d)) || {}, i = o.ies || iesDe(d.ies), op = o.op || opDaLinha(d); return separar && op ? op + ' · ' + i : i; };
    const iesL = [...new Set(linhas.map(iesD))].sort(cmpTxt);
    const calcUsado = QDEF.some(q => { const m = colDe(q.k); return m && m.virtual; }) || linhas.some(d => QDEF.some(q => { const m = colDe(q.k); return m && !m.virtual && !String(V(d, m) || '').match(/[1-4]/) && qn(d, m); }));
    const cnt = ls => [1, 2, 3, 4].map(n => ls.filter(d => qOf(d) === n).length);
    const barra = qs => `<div class="db-qbar">${qs.map((n, i) => n ? `<i class="q${i + 1}" style="flex:${n}" data-tip="Q${i + 1}: ${n}">${n}</i>` : '').join('')}</div>`;
    const blocos = iesL.map(i => {
      const ls = linhas.filter(d => iesD(d) === i), sups = [...new Set(ls.map(d => d.supervisor || '—'))].sort(cmpTxt); // o bloco já é da operação + IES
      const tot = cnt(ls), med = [1, 2, 3, 4].map(n => mediaA(ls.filter(d => qOf(d) === n).map(vInd)));
      return `<tbody class="db-qies"><tr class="db-qies-cab"><th colspan="8">${esc(i)} · ${ls.length} consultores</th></tr>
        ${sups.map(sp => { const xs = ls.filter(d => (d.supervisor || '—') === sp), c = cnt(xs), t = c.reduce((a, b) => a + b, 0); return `<tr><td><b>${esc(tituloN(sp))}</b></td>${c.map((n, k) => `<td class="dir"><span class="db-qn${k === 3 && n ? ' r' : ''}">${n || ''}</span></td>`).join('')}<td class="dir">${t}</td><td class="dir"><b>${t ? fmt((c[0] + c[1]) / t * 100, 0) + '%' : '—'}</b></td><td style="min-width:120px">${barra(c)}</td></tr>`; }).join('')}
        <tr class="des-tot"><td><b>Total ${esc(i)}</b></td>${tot.map(n => `<td class="dir"><b>${n}</b></td>`).join('')}<td class="dir"><b>${tot.reduce((a, b) => a + b, 0)}</b></td><td class="dir"><b>${tot.reduce((a, b) => a + b, 0) ? fmt((tot[0] + tot[1]) / tot.reduce((a, b) => a + b, 0) * 100, 0) + '%' : '—'}</b></td><td>${barra(tot)}</td></tr>
        ${qi.mt ? `<tr class="db-qmed"><td>Média ${esc(qi.rot.toLowerCase())}</td>${med.map(v => `<td class="dir">${v === null ? '—' : fv(v)}</td>`).join('')}<td colspan="3"></td></tr>` : ''}</tbody>`;
    }).join('');
    const lista_ = (n, tit, cls) => { const xs = linhas.filter(d => qOf(d) === n).sort((a, b) => qi.mt ? ((vInd(a) ?? 0) - (vInd(b) ?? 0)) * (qi.dir < 0 ? -1 : 1) * (n === 4 ? 1 : -1) : cmpTxt(a.nome, b.nome));
      return cardA(n === 4 ? 'alert' : 'trophy', `${tit} · ${esc(qi.rot)}`, `${xs.length} consultor(es) em Q${n}${n === 4 ? ' · prioridade de acompanhamento' : ' · referência para a operação'}`, xs.length ? `<div class="tabela-wrap db-pit ${cls}"><table class="tabela"><thead><tr><th>ID</th><th>Consultor</th><th>Supervisor</th><th>IES</th><th class="dir">Resultado</th></tr></thead><tbody>${xs.map(d => `<tr><td>${esc(d.mat || '—')}</td><td data-nome="${esc(d.nome)}"><b>${esc(tituloN(d.nome))}</b></td><td>${esc(tituloN(d.supervisor))}</td><td>${esc(iesD(d))}</td><td class="dir"><b>${qi.mt ? fv(vInd(d)) : '<span class="qt q' + n + '">Q' + n + '</span>'}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Ninguém neste quartil.</p>'); };
    const resumoInd = QDEF.map(q => { const cc = [1, 2, 3, 4].map(n => linhas.filter(d => qOf(d, q.k) === n).length); return `<button type="button" class="db-qind${q.k === qi.k ? ' on' : ''}" data-qind="${q.k}"><b>${esc(q.rot)}</b>${barra(cc)}<small><span class="qt q1">Q1</span> ${cc[0]} · <span class="qt q4">Q4</span> ${cc[3]}</small></button>`; }).join('');
    const COLI = [[aTot, 'Aceite', 1], [mTot, 'Matrícula', 1], [cTot, 'Chamadas', 1], [efet, 'Efetividade'], [abs, 'ABS'], [csat, 'C-SAT'], [nmon, 'Nota monitor'], [ader, 'Aderência']].filter(c => c[0]);
    corpo = `
    <div class="db-qinds">${resumoInd}</div>
    ${calcUsado ? `<p class="dica">Onde a base veio sem quartil, o site calcula pela regra do Relatório Ranking: por IES, só ativos, posição (RANK) do indicador · Q1 até 25% · Q2 até 50% · Q3 até 75% · Q4 o resto. Quartil geral = posição da soma dos ranks de ABS, pesquisa de satisfação, nota do monitor, aceite e matrícula.</p>` : ''}
    ${cardA('layers', `Quartil por supervisor · ${esc(qi.rot)}`, 'Quantidade de consultores em cada quartil, por IES · Q1+Q2 = metade de cima da IES' + (qi.mt ? ' · última linha = média do indicador em cada quartil' : ''), `<div class="tabela-wrap"><table class="tabela db-qsup"><thead><tr><th>Supervisor</th><th class="dir"><span class="qt q1">Q1</span></th><th class="dir"><span class="qt q2">Q2</span></th><th class="dir"><span class="qt q3">Q3</span></th><th class="dir"><span class="qt q4">Q4</span></th><th class="dir">Total</th><th class="dir">Q1+Q2</th><th>Distribuição</th></tr></thead>${blocos}</table></div>`)}
    <div class="pn-grade">${lista_(4, 'Pit Stop', 'r')}${lista_(1, 'Success', 'b')}</div>
    ${cardA('award', 'Performance por IES', 'Totais por consultor (aceite, matrícula, chamadas) e médias da IES', `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>IES</th><th class="dir">Consultores</th>${COLI.map(c => `<th class="dir">${c[1]}${c[2] ? ' /cons.' : ''}</th>`).join('')}<th>Quartil geral</th></tr></thead><tbody>${iesL.concat(iesL.length > 1 ? ['__op'] : []).map(i => { const ls = i === '__op' ? linhas : linhas.filter(d => iesD(d) === i); return `<tr${i === '__op' ? ' class="des-tot"' : ''}><td><b>${i === '__op' ? 'Operação' : esc(i)}</b></td><td class="dir">${ls.length}</td>${COLI.map(([mt, , pc]) => { const v = ag(mt, ls); return `<td class="dir">${v === null ? '—' : pc ? fmt(v / (ls.length || 1), 1) : fmtTipo(mt, v)}</td>`; }).join('')}<td style="min-width:100px">${barra([1, 2, 3, 4].map(n => ls.filter(d => qOf(d, 'geral') === n).length))}</td></tr>`; }).join('')}</tbody></table></div>`)}`;
    depois = () => { raiz.querySelectorAll('[data-qind]').forEach(x => x.onclick = () => { est.qind = x.dataset.qind; render(); }); raiz.querySelectorAll('.db-pit [data-nome]').forEach(x => x.onclick = () => A.abrirFicha && A.abrirFicha(x.dataset.nome)); };
  }

  if (g === 'supervisores') {
    const sups = {}; perfil.forEach(p => (sups[supK(p.d)] = sups[supK(p.d)] || []).push(p));
    const COLS = [[cTot, 'Chamadas', 1], [aTot, 'Aceite', 1], [mTot, 'Matrícula', 1], [ader, 'Aderência'], [abs, 'ABS'], [csat, 'C-SAT'], [nmon, 'Nota monitor'], [M('TMA', 'outbound'), 'TMA outbound']].filter(c => c[0]).map(([mt, r, pc]) => ({ mt, r, pc }));
    const valS = (c, ps) => { const v = ag(c.mt, ps.map(p => p.d)); return c.pc && ps.length ? v / ps.length : v; };
    const op = COLS.map(c => valS(c, perfil));
    const heat = (c, v, ref) => { if (v === null || ref === null || !ref || !c.mt.sentido) return ''; const r = (v - ref) / Math.abs(ref) * (c.mt.sentido < 0 ? -1 : 1); return r > .05 ? 'db-h-bom' : r < -.05 ? 'db-h-ruim' : ''; };
    const linhasS = Object.entries(sups).map(([s, ps]) => ({ s, ps, idx: ps.filter(p => p.qgv === 1 || p.qgv === 2).length / (ps.filter(p => p.qgv).length || 1), nq: mediaA(ps.map(p => p.nq)), falt: ps.reduce((a, p) => a + p.o.faltas + p.o.atest, 0), med: ps.reduce((a, p) => a + p.o.medidas, 0), alto: ps.filter(p => p.risco >= 50).length })).sort((a, b) => b.idx - a.idx);
    corpo = `
    ${cardA('award', 'Ranking das equipes', 'Ordenado pelo % da equipe em Q1+Q2 no quartil geral', `<div class="db-rank-eq">${linhasS.map((x, i) => `<div class="db-eq"><span class="db-eq-pos">${i + 1}º</span><div class="db-eq-nome"><b>${esc(supNome(x.s))}</b><small>${x.ps.length} consultores · ${x.alto} com risco alto</small></div><div class="db-eq-q">${qBar(qDist(x.ps.map(p => p.d)))}</div><b class="db-eq-idx" style="color:${x.idx >= .5 ? '#1baf7a' : x.idx >= .35 ? '#eda100' : '#d03b3b'}">${fmt(x.idx * 100, 0)}%</b></div>`).join('')}</div>`)}
    ${cardA('users', 'Comparativo por supervisor', 'Chamadas, aceites e matrículas por consultor · verde/vermelho = acima/abaixo da operação (mais de 5%) · qualidade, faltas e medidas vêm das outras bases do site', `<div class="tabela-wrap"><table class="tabela db-sup"><thead><tr><th>Supervisor</th><th class="dir">Equipe</th>${COLS.map(c => `<th class="dir">${esc(c.r)}${c.pc ? '<small>/consultor</small>' : ''}</th>`).join('')}<th class="dir">Nota qualidade<small>monitorias</small></th><th class="dir">Faltas/atest.<small>no mês</small></th><th class="dir">Medidas<small>12 meses</small></th></tr></thead><tbody>
      ${linhasS.map(x => `<tr><td><b>${esc(supNome(x.s))}</b></td><td class="dir">${x.ps.length}</td>${COLS.map((c, i) => { const v = valS(c, x.ps); return `<td class="dir ${heat(c, v, op[i])}">${c.pc ? fmt(v, 1) : fmtTipo(c.mt, v)}</td>`; }).join('')}<td class="dir">${x.nq === null ? '—' : tagNotaD(x.nq)}</td><td class="dir">${x.falt}</td><td class="dir">${x.med}</td></tr>`).join('')}
      <tr class="des-tot"><td><b>Operação</b></td><td class="dir">${perfil.length}</td>${COLS.map((c, i) => `<td class="dir">${c.pc ? fmt(op[i], 1) : fmtTipo(c.mt, op[i])}</td>`).join('')}<td class="dir">${tagNotaD(mediaA(perfil.map(p => p.nq)))}</td><td class="dir">${linhasS.reduce((a, x) => a + x.falt, 0)}</td><td class="dir">${linhasS.reduce((a, x) => a + x.med, 0)}</td></tr></tbody></table></div>`)}
    <div class="pn-grade">${cardA('chart', 'Produção por consultor', 'Média de aceites e matrículas por consultor de cada equipe', '<div id="dbSupProd"></div>')}${cardA('activity', 'Qualidade e presença', 'Aderência, ABS e C-SAT de cada equipe', '<div id="dbSupQual"></div>')}</div>`;
    depois = () => {
      const ss = linhasS.map(x => x.s);
      if (aTot || mTot) DB.agrupadas(document.getElementById('dbSupProd'), ss.map(x_ => supNome(x_, true)), [aTot && { nome: 'Aceites', cor: '#1baf7a', valores: linhasS.map(x => ag(aTot, x.ps.map(p => p.d)) / x.ps.length) }, mTot && { nome: 'Matrículas', cor: '#8e44c9', valores: linhasS.map(x => ag(mTot, x.ps.map(p => p.d)) / x.ps.length) }].filter(Boolean), { fmt: v => fmt(v, 1) });
      const sq = [[ader, 'Aderência', '#2a78d6'], [abs, 'ABS', '#d03b3b'], [csat, 'C-SAT', '#1baf7a']].filter(x => x[0]);
      if (sq.length) DB.agrupadas(document.getElementById('dbSupQual'), ss.map(x_ => supNome(x_, true)), sq.map(([mt, n, cor]) => ({ nome: n, cor, valores: linhasS.map(x => ag(mt, x.ps.map(p => p.d)) * 100) })), { fmt: v => fmt(v, 1) + '%' });
    };
  }

  if (g === 'organizacao') {
    const por = est.orgPor || 'ies';
    const chave = p => por === 'ies' ? (p.ies || '—') : por === 'op' ? (p.op || '—') : por === 'turno' ? (p.turno || '—') : por === 'casa' ? (p.casa === null ? 'Sem data' : p.casa < 3 ? '0–3 meses' : p.casa < 6 ? '3–6 meses' : p.casa < 12 ? '6–12 meses' : 'Mais de 1 ano') : '—';
    const grupos = {}; perfil.forEach(p => (grupos[chave(p)] = grupos[chave(p)] || []).push(p));
    const ks = Object.keys(grupos).sort(cmpTxt);
    const COLS = [[aTot, 'Aceites', 1], [mTot, 'Matrículas', 1], [cTot, 'Chamadas', 1], [ader, 'Aderência'], [abs, 'ABS'], [csat, 'C-SAT'], [nmon, 'Nota monitor'], [pausa, 'Tempo em pausa']].filter(c => c[0]);
    const val = (mt, ps, pc) => { const v = ag(mt, ps.map(p => p.d)); return pc && ps.length ? v / ps.length : v; };
    corpo = `
    <div class="db-org-sel">${[['ies', 'Instituição (IES)'], ['op', 'Operação'], ['turno', 'Turno'], ['casa', 'Tempo de casa']].map(([k, t]) => `<button type="button" data-org="${k}" class="${k === por ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="db-org-cards">${ks.map(k => { const ps = grupos[k], qs = qDist(ps.map(p => p.d)); return `<div class="db-org"><h3>${esc(k)}</h3><small>${ps.length} consultores</small>${qBar(qs)}<ul>${COLS.slice(0, 6).map(([mt, r, pc]) => `<li><span>${r}${pc ? ' /cons.' : ''}</span><b>${pc ? fmt(val(mt, ps, pc), 1) : fmtTipo(mt, val(mt, ps))}</b></li>`).join('')}<li><span>Nota qualidade</span><b>${tagNotaD(mediaA(ps.map(p => p.nq)))}</b></li><li><span>Risco alto</span><b>${ps.filter(p => p.risco >= 50).length}</b></li></ul></div>`; }).join('')}</div>
    <div class="pn-grade">${cardA('chart', 'Produção por consultor', 'Aceites e matrículas por consultor em cada grupo', '<div id="dbOrgProd"></div>')}${cardA('activity', 'Qualidade e presença', 'Aderência, ABS, C-SAT e nota do monitor', '<div id="dbOrgQual"></div>')}</div>`;
    depois = () => {
      raiz.querySelectorAll('[data-org]').forEach(x => x.onclick = () => { est.orgPor = x.dataset.org; render(); });
      DB.agrupadas(document.getElementById('dbOrgProd'), ks, [aTot && { nome: 'Aceites', cor: '#1baf7a', valores: ks.map(k => val(aTot, grupos[k], 1)) }, mTot && { nome: 'Matrículas', cor: '#8e44c9', valores: ks.map(k => val(mTot, grupos[k], 1)) }].filter(Boolean), { fmt: v => fmt(v, 1) });
      const sq = [[ader, 'Aderência', '#2a78d6'], [abs, 'ABS', '#d03b3b'], [csat, 'C-SAT', '#1baf7a'], [nmon, 'Nota monitor', '#8e44c9']].filter(x => x[0]);
      DB.agrupadas(document.getElementById('dbOrgQual'), ks, sq.map(([mt, n, cor]) => ({ nome: n, cor, valores: ks.map(k => val(mt, grupos[k]) * 100) })), { fmt: v => fmt(v, 1) + '%' });
    };
  }

  if (g === 'tempos') {
    const cm = M('Carga horária', 'total'), ce = M('Carga horária', 'esperado');
    const cumpr = d => { const a = V(d, cm), b = V(d, ce); return a !== null && b ? a / b : null; };
    const cumprOp = cm && ce ? ag(cm, linhas) / (ag(ce, linhas) || 1) : null;
    const pv = pausa ? linhas.map(d => V(d, pausa)).filter(v => v !== null) : [];
    const pm = mediaA(pv), pdp = pv.length ? Math.sqrt(mediaA(pv.map(v => (v - pm) ** 2))) : 0;
    const altos = pausa ? linhas.filter(d => V(d, pausa) !== null && V(d, pausa) > pm + pdp).sort((a, b) => V(b, pausa) - V(a, pausa)) : [];
    const absAlto = abs ? linhas.filter(d => V(d, abs) !== null && V(d, abs) > .1).sort((a, b) => V(b, abs) - V(a, abs)) : [];
    corpo = `
    <div class="q-kpis">${[[M('TMA', 'outbound'), 'TMA outbound'], [M('TMA', 'inbound'), 'TMA inbound'], [M('Pós-chamada', 'total'), 'Pós-chamada'], [pausa, 'Tempo em pausa'], [ader, 'Aderência']].filter(x => x[0]).map(([mt, r]) => `<div><small>${r}</small><b>${fmtTipo(mt, ag(mt, linhas))}</b>${DB.delta(ag(mt, linhas), ag(mt, ant), mt.sentido, mt.tipo === 'pct' ? 'pct' : 'tempo')}</div>`).join('')}${cumprOp !== null ? `<div><small>Carga cumprida</small><b>${fmt(cumprOp * 100, 1)}%</b><span class="db-delta neutro">total ÷ esperado</span></div>` : ''}</div>
    <div class="pn-grade">${cardA('clock', 'TMA × pós-chamada por canal', 'Tempo médio ponderado pelas chamadas', '<div id="dbTma"></div>')}${cardA('clock', 'Pausas', 'Média por consultor', '<div id="dbPausa"></div>')}</div>
    <div class="pn-grade">
      ${cardA('alert', 'Pausa acima do normal', `Tempo em pausa maior que a média + 1 desvio (${pm === null ? '—' : fmt((pm + pdp) * 100, 1) + '%'})`, altos.length ? `<ul class="db-alerta">${altos.slice(0, 12).map(d => `<li data-nome="${esc(d.nome)}"><div><b>${esc(d.nome)}</b><small>${esc(d.supervisor)}</small></div><span><b style="color:#d03b3b">${fmtTipo(pausa, V(d, pausa))}</b></span></li>`).join('')}</ul>` : '<p class="dica">Ninguém fora da curva.</p>')}
      ${cardA('calendar', 'Absenteísmo acima de 10%', 'ABS do ponto no mês', absAlto.length ? `<ul class="db-alerta">${absAlto.slice(0, 12).map(d => `<li data-nome="${esc(d.nome)}"><div><b>${esc(d.nome)}</b><small>${esc(d.supervisor)}${cm && ce ? ' · carga cumprida ' + (cumpr(d) === null ? '—' : fmt(cumpr(d) * 100, 0) + '%') : ''}</small></div><span><b style="color:#d03b3b">${fmtTipo(abs, V(d, abs))}</b></span></li>`).join('')}</ul>` : '<p class="dica">Nenhum consultor acima de 10%.</p>')}
    </div>`;
    depois = () => {
      const tm = OF.map(s => [s, M('TMA', s), M('Pós-chamada', s)]).filter(x => x[1] || x[2]);
      DB.agrupadas(document.getElementById('dbTma'), tm.map(x => ({ 'inbound': 'Inbound', 'ligacao manual': 'Manual', 'botmaker': 'Botmaker', 'outbound': 'Outbound', 'outbound finalizadas': 'Out. finaliz.', 'outbound n finalizadas': 'Out. não fin.' })[x[0]] || x[0]), [{ nome: 'TMA', cor: '#2a78d6', valores: tm.map(x => ag(x[1], linhas)) }, { nome: 'Pós-chamada', cor: '#eda100', valores: tm.map(x => ag(x[2], linhas)) }], { fmt: v => DB.hms(v) });
      const ps = todas.filter(m => m.grupo === 'Pausa' && ehTempo(m.tipo)).map(m => ({ m, v: ag(m, linhas) })).filter(x => x.v).sort((a, b) => b.v - a.v);
      G.ranking(document.getElementById('dbPausa'), ps.map(x => ({ rotulo: (x.m.sOrig || x.m.sub).replace(/^M[ÉE]DIA /i, ''), valor: x.v, rotuloValor: DB.hms(x.v), cor: x.m.sentido < 0 ? '#eb6834' : '#2a78d6' })));
    };
  }

  if (g === 'evolucao') {
    const indOpc = todas.filter(m => m.tipo !== 'quartil' && m.tipo !== 'texto');
    if (!est.evo || !indOpc.some(m => m.rotulo === est.evo)) est.evo = (mTot || aTot || indOpc[0] || {}).rotulo;
    const ind = indOpc.find(m => m.rotulo === est.evo);
    const KEYS = [cTot, aTot, mTot, ader, abs, csat, nmon, efet, pausa].filter(Boolean);
    corpo = mesesAsc.length < 2 ? `<div class="vazio"><b>Importe mais de um mês</b><p>A evolução aparece quando houver pelo menos dois meses do relatório de indicadores.</p></div>` : `
    ${cardA('activity', 'Evolução do indicador', 'Operação e cada supervisor, mês a mês', '<div id="dbEvoOp"></div><h3 class="db-h3">Por supervisor</h3><div id="dbEvoSup"></div>', `<select id="dbEvoSel" class="db-sel">${indOpc.map(m => `<option value="${esc(m.rotulo)}"${m.rotulo === est.evo ? ' selected' : ''}>${esc(m.rotulo)}</option>`).join('')}</select>`)}
    ${cardA('clipboard', 'Mês a mês', 'Principais indicadores da operação · cor = melhor/pior que o mês anterior', `<div class="tabela-wrap"><table class="tabela db-mm"><thead><tr><th>Indicador</th>${mesesAsc.map(m => `<th class="dir">${mesTxt(m)}</th>`).join('')}</tr></thead><tbody>${KEYS.map(mt => { const vs = mesesAsc.map(m => ag(mt, base(m))); return `<tr><td>${esc(mt.rotulo.replace(/ · Total$/, ''))}</td>${vs.map((v, i) => { const p = i ? vs[i - 1] : null; const c = p === null || v === null || !mt.sentido ? '' : (v - p) * mt.sentido > 0 ? 'db-h-bom' : (v - p) * mt.sentido < 0 ? 'db-h-ruim' : ''; return `<td class="dir ${c}">${fmtTipo(mt, v)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`)}`;
    depois = () => {
      if (mesesAsc.length < 2 || !ind) return;
      document.getElementById('dbEvoSel').onchange = e => { est.evo = e.target.value; render(); };
      const fx = v => fmtTipo(ind, v), cx = v => ind.tipo === 'pct' ? fmt(v * 100, 0) : ehTempo(ind.tipo) ? DB.hms(v) : curtoN(v);
      DB.linhasCat(document.getElementById('dbEvoOp'), mesesAsc.map(mesTxt), [{ nome: 'Operação', cor: '#1d4f91', valores: mesesAsc.map(m => ag(ind, base(m))) }], { fmt: fx, curto: cx });
      const sups = [...new Set(mesesAsc.flatMap(m => base(m).filter(d => d.supervisor).map(supK)))].sort(cmpTxt).slice(0, 10);
      const porCons = ['somar', 'tempo'].includes(ind.tipo);
      DB.linhasCat(document.getElementById('dbEvoSup'), mesesAsc.map(mesTxt), sups.map((s, i) => ({ nome: supNome(s, true), cor: DB.PAL[i % DB.PAL.length], valores: mesesAsc.map(m => { const ls = base(m).filter(d => supK(d) === s); const v = ag(ind, ls); return v === null ? null : porCons && ls.length ? v / ls.length : v; }) })), { fmt: v => porCons ? fmt(v, 1) + ' por consultor' : fx(v), curto: v => porCons ? fmt(v, 0) : cx(v), altura: 260 });
    };
  }

  const html = `<div class="db-ops">${[['Admissão', 'Admissão'], ['Serviços', 'Serviços']].map(([k, t]) => `<button type="button" data-opf="${k}" class="${k === (est.opF || '') ? 'on' : ''}">${t}${!(ctx.opsTodas || []).includes(k) ? ' <small>sem relatório</small>' : ''}</button>`).join('')}</div><div class="db-guias">${GUIAS.map(([k, t, ic]) => `<button type="button" data-guia="${k}" class="${k === g ? 'on' : ''}">${G.ic(ic, '')}${t}</button>`).join('')}</div>${corpo}`;
  const dep = () => {
    raiz.querySelectorAll('[data-guia]').forEach(x => x.onclick = () => { est.guia = x.dataset.guia; render(); window.scrollTo({ top: raiz.querySelector('.db-guias').offsetTop - 80, behavior: 'smooth' }); });
    raiz.querySelectorAll('[data-opf]').forEach(x => x.onclick = () => { est.opF = x.dataset.opf; est.sup = ''; render(); });
    depois();
    raiz.querySelectorAll('.db-rx [data-nome], .db-top li[data-nome], .db-alerta li[data-nome], .db-qmapa [data-nome]').forEach(x => x.onclick = () => A.abrirFicha && A.abrirFicha(x.dataset.nome));
  };
  return { html, depois: dep, tabela: g === 'tabela' };
}
const tagNotaD = n => n === null || n === undefined ? '—' : `<span class="tag ${n >= 85 ? 'bom' : n >= 70 ? 'alerta' : 'ruim'}">${fmt(n, 1)}%</span>`;

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
  // Admissão e Serviços têm critérios diferentes: cada uma tem o seu painel (não há consolidado)
  const opsTodas = [...new Set(D.dados.filter(d => d.fonte === est.fonte).map(opDaLinha))];
  if (!['Admissão', 'Serviços'].includes(est.opF)) est.opF = opsTodas.includes('Admissão') || !opsTodas.length ? 'Admissão' : opsTodas[0];
  const meses = [...new Set(D.dados.filter(d => d.fonte === est.fonte && opDaLinha(d) === est.opF).map(d => d.mes))].sort().reverse();
  if (!est.mes || !meses.includes(est.mes)) est.mes = meses[0] || '';
  // só os indicadores que existem no relatório desta operação (Serviços: reingresso e retenção; Admissão: aceite, matrícula, medicina…)
  const linhasOp = D.dados.filter(d => d.fonte === est.fonte && opDaLinha(d) === est.opF);
  const todas = metricasDe(est.fonte).filter(m => !cons || linhasOp.some(d => { const v = V(d, m); return v !== null && v !== undefined && v !== '' && !(m.tipo === 'quartil' && /^na$/i.test(String(v))); }));
  const blocos = cons ? [...new Set(todas.map(m => m.grupo))].filter(g => g !== 'Geral') : [];
  if (cons && est.bloco && est.bloco !== 'Resumo' && est.bloco !== 'Tudo' && !blocos.includes(est.bloco)) est.bloco = 'Resumo';
  est.grupo = est.bloco || 'Resumo';
  const mets = !cons || est.grupo === 'Tudo' ? todas : est.grupo === 'Resumo' ? resumoDe(todas) : todas.filter(m => m.grupo === est.grupo);
  const cruzar = false; // faltas/monitorias do site ficam na ficha do consultor
  const gTit = g => { const m = todas.find(x => x.grupo === g); return m && m.gOrig ? m.gOrig : g; };
  let linhas = D.dados.filter(d => d.fonte === est.fonte && d.mes === est.mes);
  const opsMes = [...new Set(linhas.map(opDaLinha))].sort(cmpTxt);
  linhas = linhas.filter(d => opDaLinha(d) === est.opF);
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
  const rotCol = mt => cons && est.grupo !== 'Resumo' && est.grupo !== 'Tudo' ? (mt.tipo === 'quartil' ? mt.rotulo.replace(mt.grupo + ' · ', '') : mt.sub) : mt.rotulo.replace(/^(.+?) · Total$/, '$1');
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
  const baseMes = m => D.dados.filter(d => d.fonte === est.fonte && d.mes === m && (!est.opF || opDaLinha(d) === est.opF) && (!est.sup || d.supervisor === est.sup) && (!est.busca || norm(d.nome).includes(norm(est.busca)) || String(d.mat).includes(est.busca)));
  const dash = cons && linhas.length ? dashboardDes({ todas, linhas, mesesAsc, opsMes, opsTodas, mesAnt: meses[meses.indexOf(est.mes) + 1] || '', base: baseMes }) : null;
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
    ${cons ? `<label class="mini">Operação <select id="desOp">${['Admissão', 'Serviços'].map(o => `<option${o === est.opF ? ' selected' : ''}>${o}</option>`).join('')}</select></label>` : ''}
    <label class="mini">Supervisor <select id="desSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="mini">Consultor <input type="search" id="desBusca" placeholder="Nome ou matrícula" value="${esc(est.busca)}"></label>
    <span class="dica">${ult ? `Última importação: ${esc(ult.arquivo)} · ${new Date(ult.em).toLocaleDateString('pt-BR')} · ${ult.casados} no BD${ult.naoAchados ? ` · ${ult.naoAchados} fora do BD` : ''}` : ''}</span>
  </div>
  ${cons && todas.length && todas.filter(m => m.grupo === 'Outros').length / todas.length > .5 ? `<div class="aviso-fluxo db-aviso">${G.ic('alert', '')}<span><b>Este relatório foi lido pela versão anterior do site</b>, que não reconhecia as colunas da base (tudo caiu em OUTROS e os quartis se perderam). Clique em <b>Importar relatório</b> e envie o mesmo arquivo de novo: o mês é substituído e os blocos, tempos, percentuais e quartis aparecem certos.</span></div>` : ''}
  ${dash ? '' : `<div class="kpis pn-kpis">${kpis}</div>`}
  ${!dash && cons && est.opF ? `<div class="db-ops">${[['Admissão', 'Admissão'], ['Serviços', 'Serviços']].map(([k, t]) => `<button type="button" data-opf="${k}" class="${k === est.opF ? 'on' : ''}">${t}</button>`).join('')}</div><div class="vazio"><b>${est.mes ? `Sem relatório de ${esc(est.opF)} em ${mesTxt(est.mes)}` : `Nenhum relatório de ${esc(est.opF)} importado`}</b><p>Importe o relatório de ${esc(est.opF)} em <b>Importar relatório</b> e escolha a operação <b>${esc(est.opF)}</b>. Cada operação tem o seu painel; importar uma não apaga a outra.</p></div>` : ''}
  ${dash ? dash.html : ''}${(!dash && !(cons && !linhas.length)) || (dash && dash.tabela) ? `  <article class="cartao" id="desDetalhe">
    <header class="cab-card cab-tabela"><span class="icb">${G.ic('clipboard')}</span><div><h2>${cons ? 'Detalhe por consultor' : esc(est.fonte)} · ${mesTxt(est.mes)}</h2><p>${cons ? 'Escolha o bloco · clique no título da coluna para ordenar · clique no nome para abrir a ficha' : 'Clique no título da coluna para ordenar. A porcentagem pequena é o atingimento da meta.'}</p></div>
      <div class="cab-acoes">${cons ? `<select id="desBloco" class="db-sel"><option value="Resumo"${est.grupo === 'Resumo' ? ' selected' : ''}>Resumo (principais)</option>${blocos.map(g => `<option value="${esc(g)}"${g === est.grupo ? ' selected' : ''}>${esc(gTit(g).toUpperCase())}</option>`).join('')}<option value="Tudo"${est.grupo === 'Tudo' ? ' selected' : ''}>Todas as colunas</option></select>` : ''}<button type="button" class="btn btn-sec" id="desExp" data-perm="exportar">${G.ic('download')}Exportar</button></div></header>
    <div class="tabela-wrap des-wrap"><table class="tabela des-tab${cons ? ' des-base' : ''}" id="desTab"><thead>${cabecalho()}</thead><tbody>
      ${totLinha}
      ${linhas.map(d => `<tr>${cons ? `<td class="des-fixo des-c1">${esc(d.mat || '')}</td>` : ''}<td${cons ? ' class="des-fixo des-c2"' : ''}><b class="lk" data-nome="${esc(d.nome)}">${esc(d.nome)}</b>${d.foraBD ? ' <small class="tag neutro" title="Não está no BD atual">fora do BD</small>' : ''}</td><td>${esc(d.supervisor)}</td>${mets.map(mt => { const v = V(d, mt); return `<td class="dir">${celula(mt, v)} ${celMeta(mt.rotulo, v)}</td>`; }).join('')}
        ${cruzar ? `<td class="dir">${d.x.faltas || '<span class="zero">0</span>'}</td><td class="dir">${d.x.atest || '<span class="zero">0</span>'}</td><td class="dir">${d.x.medidas ? `<span class="tag alerta">${d.x.medidas}</span>` : '<span class="zero">0</span>'}</td><td class="dir">${d.x.mon === null ? '—' : `<span class="tag ${d.x.mon >= 85 ? 'bom' : d.x.mon >= 70 ? 'alerta' : 'ruim'}">${fmt(d.x.mon, 1)}%</span>`}</td><td class="dir">${d.x.trein || '<span class="zero">0</span>'}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${mets.length + 8}" class="dica">Nenhum consultor neste filtro.</td></tr>`}
    </tbody></table></div>
  </article>` : ''}`}`;
  G.icones(raiz);
  if (dash) dash.depois();
  const b = id => document.getElementById(id);
  if (b('desImportar')) b('desImportar').onclick = abrirImportacao;
  if (b('desMetas')) b('desMetas').onclick = abrirMetas;
  if (!fontes.length) return;
  if (b('desFonte')) b('desFonte').onchange = e => { est.fonte = e.target.value; est.mes = ''; est.grupo = 'Dashboard'; render(); };
  b('desMes').onchange = e => { est.mes = e.target.value; render(); };
  b('desSup').onchange = e => { est.sup = e.target.value; render(); };
  if (b('desOp')) b('desOp').onchange = e => { est.opF = e.target.value; est.sup = ''; render(); };
  raiz.querySelectorAll('[data-opf]').forEach(x => x.onclick = () => { est.opF = x.dataset.opf; est.sup = ''; render(); });
  b('desBusca').oninput = e => { est.busca = e.target.value; clearTimeout(render._t); render._t = setTimeout(() => { render(); const i = b('desBusca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  const tabD = document.getElementById('desTab');
  if (b('desBloco')) b('desBloco').onchange = e => { est.bloco = e.target.value; render(); document.getElementById('desDetalhe').scrollIntoView({ block: 'start' }); };
  if (tabD) $('thead', tabD).addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; est.ord = { k: th.dataset.k, asc: est.ord.k === th.dataset.k ? !est.ord.asc : ['nome', 'supervisor', 'mat'].includes(th.dataset.k) || todas.some(m => m.rotulo === th.dataset.k && m.tipo === 'quartil') }; render(); });
  if (tabD) $('tbody', tabD).addEventListener('click', e => { const n = e.target.closest('[data-nome]'); if (n && A.abrirFicha) A.abrirFicha(n.dataset.nome); });
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
  const op0 = ['Admissão', 'Serviços'].includes(est.opF) ? est.opF : 'Admissão';
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('upload')}</span><div><h2>Importar relatório de desempenho</h2><p>Escolha a operação e um ou mais arquivos (um por mês). Cada operação é importada separada: uma nunca apaga a outra.</p></div></header>
    <div class="ds-op-esc">${['Admissão', 'Serviços'].map(o => `<label class="${o === op0 ? 'on' : ''}"><input type="radio" name="dsOpImp" value="${o}"${o === op0 ? ' checked' : ''}><b>${o}</b><small>${o === 'Admissão' ? 'Captação · usa a aba ADM do arquivo' : 'Permanência · usa a aba SERV do arquivo'}</small></label>`).join('')}</div>
    <div class="grade g3">
      <label class="campo c3"><span>Arquivos <i class="obr">*</i></span><input type="file" id="dsArq" accept=".xlsx,.xlsm,.csv,.txt" multiple><small class="dica">Pode escolher vários de uma vez (segure Ctrl). O mês vem do nome de cada arquivo (ex.: Fonte_Novembro).</small></label>
      <label class="campo c2"><span>Nome do relatório</span><input id="dsFonte" placeholder="Em branco para o relatório de indicadores"><small class="dica">Só para outros relatórios (não o de indicadores).</small></label>
      <label class="campo"><span>Mês (se o nome não tiver)</span><input type="month" id="dsMes" value=""></label>
    </div>
    <div class="dlg-rod"><small class="msg" id="dsMsg"></small><span><button class="btn btn-sec" value="cancelar" formnovalidate>Cancelar</button> <button type="button" class="btn btn-pri" id="dsLer">${G.ic('arrow-right')}Continuar</button></span></div>`;
  f.querySelectorAll('input[name="dsOpImp"]').forEach(r => r.onchange = () => f.querySelectorAll('.ds-op-esc label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  document.getElementById('dsLer').onclick = async () => {
    const fonte = document.getElementById('dsFonte').value.trim(), files = [...document.getElementById('dsArq').files], msg = document.getElementById('dsMsg');
    const op = (f.querySelector('input[name="dsOpImp"]:checked') || {}).value || 'Admissão';
    if (!files.length) { msg.textContent = 'Escolha o(s) arquivo(s).'; msg.className = 'msg erro'; return; }
    const partes = [], avisos = []; let unico = null;
    try {
      for (let k = 0; k < files.length; k++) {
        const file = files[k]; msg.textContent = `Lendo ${k + 1} de ${files.length}: ${file.name}…`; msg.className = 'msg';
        const abas = (await lerArquivo(file, XLSXLeitor.barra(msg))).filter(a => a.linhas && a.linhas.length > 1), mesNome = mesDoArquivo(file.name);
        const a0 = { fonte, mes: mesNome || document.getElementById('dsMes').value || '', mesDoNome: !!mesNome, nome: file.name, abas };
        const dets = acharConsolidados(abas);
        if (!dets.length) { if (files.length === 1) unico = a0; else avisos.push(`${file.name}: não é o relatório de indicadores (ignorado).`); continue; }
        // a aba da operação escolhida (ADM / SERV); sem nome de operação, a(s) aba(s) sem identificação
        let usar = dets.filter(d => opDaAba(abas[d.ia].nome) === op);
        if (!usar.length) usar = dets.filter(d => !opDaAba(abas[d.ia].nome));
        if (!usar.length) { avisos.push(`${file.name}: não tem aba de ${op} (só ${[...new Set(dets.map(d => opDaAba(abas[d.ia].nome)))].join(', ')}). Ignorado.`); continue; }
        usar.forEach(d => { const aba = abas[d.ia]; partes.push({ arq: a0, aba, det: d, info: { ...lerConsolidado(aba, d.iCab) }, mes: a0.mes }); });
      }
    } catch (e) { msg.textContent = 'Não consegui ler: ' + e.message; msg.className = 'msg erro'; return; }
    if (partes.length) return passoConsolidado(partes, op, avisos);
    if (unico) { arq = { ...unico, mes: unico.mes || hoje().slice(0, 7) }; if (!fonte) { msg.textContent = 'Este arquivo não é o relatório de indicadores (uma linha por consultor). Dê um nome ao relatório para configurar as colunas.'; msg.className = 'msg erro'; return; } return passo2(0); }
    msg.innerHTML = avisos.map(esc).join('<br>') || 'Nenhum arquivo reconhecido.'; msg.className = 'msg erro';
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
    marcarGrupos(D.dados.filter(d => d.fonte === modelo.fonte && meses.includes(d.mes)), r.dados.map(d => ({ fonte: modelo.fonte, ...d })));
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
  // Admissão e Serviços têm critérios diferentes: o pulso usa Admissão (ou Serviços, se só houver ela)
  const opP = DD.dados.some(d => d.fonte === f && d.mes === mes && opDaLinha(d) === 'Admissão') ? 'Admissão' : 'Serviços';
  const ls = DD.dados.filter(d => d.fonte === f && d.mes === mes && opDaLinha(d) === opP), ant = DD.dados.filter(d => d.fonte === f && d.mes === meses[meses.length - 2] && opDaLinha(d) === opP);
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
