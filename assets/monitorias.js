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

function render() {
  lista = ler(KEY, []) || [];
  const meses = [...new Set(lista.map(m => m.data.slice(0, 7)).concat(hoje().slice(0, 7)))].sort().reverse();
  const doMes = lista.filter(m => m.data.slice(0, 7) === est.mes);
  const sups = [...new Set(doMes.map(m => m.supervisor).filter(Boolean))].sort(cmpTxt);
  const filtro = doMes.filter(m => (!est.sup || m.supervisor === est.sup) && (!est.q || norm(m.nome + ' ' + m.avaliador).includes(norm(est.q)))).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const notas = filtro.map(m => m.nota).filter(v => v !== null && v !== undefined);
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
  // critérios mais fracos: % de "atende" (parcial conta metade)
  const crit = CRITERIOS.map(([k, t, peso]) => { const xs = filtro.map(m => FATOR[(m.respostas || {})[k]]).filter(v => v !== null && v !== undefined); return { k, t, peso, n: xs.length, pct: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; }).sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2));
  const porSup = {}; filtro.forEach(m => { const s = m.supervisor || 'Sem supervisor'; (porSup[s] = porSup[s] || []).push(m.nota); });
  const kp = (t, v, s, cor, ic) => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const fraco = crit.find(c => c.pct !== null && c.pct < .75);
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Monitorias de qualidade</h1><p class="sub">Checklist por critério com peso · falha crítica zera a nota · meta ${META}%</p></div>
    <div class="cab-acoes"><button type="button" class="btn btn-sec" id="monImp" data-perm="monitorar">${G.ic('upload')}Importar monitorias</button><button type="button" class="btn btn-pri" id="monNova" data-perm="monitorar">${G.ic('plus')}Nova monitoria</button></div></div>
  <div id="monFormWrap"></div>
  <div class="des-filtros cartao">
    <label class="mini">Mês <select id="monMes">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${mesTxt(m)}</option>`).join('')}</select></label>
    <label class="mini">Supervisor <select id="monSup"><option value="">Todos</option>${sups.map(s => `<option${s === est.sup ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <input type="search" id="monBusca" placeholder="Buscar consultor ou avaliador" value="${esc(est.q)}">
  </div>
  <div class="kpis pn-kpis">
    ${kp('Monitorias', filtro.length, mesTxt(est.mes), '#2a78d6', 'headset')}
    ${kp('Nota média', media === null ? '—' : fmt(media, 1) + '%', `meta ${META}%`, media !== null && media >= META ? '#1baf7a' : '#eda100', 'star')}
    ${kp('Na meta', notas.length ? fmt(notas.filter(n => n >= META).length / notas.length * 100, 0) + '%' : '—', `${notas.filter(n => n >= META).length} de ${notas.length}`, '#1baf7a', 'check')}
    ${kp('Falhas críticas', filtro.filter(m => (m.criticas || []).length).length, 'zeraram a nota', '#d03b3b', 'alert')}
    ${kp('Consultores avaliados', new Set(filtro.map(m => m.matricula || m.nome)).size, 'no mês', '#6250d6', 'users')}
  </div>
  <div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('chart')}</span><div><h2>Critérios mais fracos</h2><p>Quanto cada critério foi atendido no mês</p></div></header>
      ${filtro.length && !filtro.some(m => Object.keys(m.respostas || {}).length) ? '<p class="dica">As monitorias deste mês vieram de planilha: os critérios aparecem aqui depois que o modelo da planilha for ajustado.</p>' : filtro.length ? `<div class="mon-crit">${crit.map(c => `<div class="mon-c"><span>${esc(c.t)} <small>peso ${c.peso}</small></span><i><b style="width:${c.pct === null ? 0 : Math.round(c.pct * 100)}%;--c:${c.pct === null ? '#9aa8b8' : c.pct >= .85 ? '#1baf7a' : c.pct >= .7 ? '#eda100' : '#d03b3b'}"></b></i><em>${c.pct === null ? '—' : fmt(c.pct * 100, 0) + '%'}</em></div>`).join('')}</div>
      ${fraco ? `<p class="mon-sug">${G.ic('rocket', '')}<span>Sugestão: reciclagem de <b>${esc(fraco.t)}</b> (${fmt(fraco.pct * 100, 0)}% de atendimento).</span>${A.planejarReciclagem && pode('agenda') ? `<button type="button" class="btn btn-sec btn-mini" id="monRecicla">Planejar reciclagem</button>` : ''}</p>` : ''}` : '<p class="dica">Nenhuma monitoria neste mês.</p>'}
    </article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Média por supervisor</h2><p>Equipes no mês</p></div></header>
      ${Object.keys(porSup).length ? `<table class="tabela"><thead><tr><th>Supervisor</th><th class="dir">Monitorias</th><th class="dir">Média</th></tr></thead><tbody>${Object.entries(porSup).sort((a, b) => cmpTxt(a[0], b[0])).map(([s, ns]) => { const v = ns.filter(x => x !== null); const md = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; return `<tr><td>${esc(s)}</td><td class="dir">${ns.length}</td><td class="dir">${tagNota(md)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="dica">—</p>'}
    </article>
  </div>
  <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('clipboard')}</span><div><h2>Monitorias do mês</h2><p>${filtro.length} registro(s)</p></div></header>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Consultor</th><th>Supervisor</th><th>Canal</th><th>Atendimento</th><th class="dir">Nota</th><th>Avaliador</th><th></th></tr></thead><tbody>
    ${filtro.map(m => `<tr><td>${dataBR(m.data)}</td><td><b>${esc(m.nome)}</b></td><td>${esc(m.supervisor)}</td><td>${esc(m.canal)}</td><td>${esc(m.atendimento || '—')}</td><td class="dir">${tagNota(m.nota)}${(m.criticas || []).length ? ' <span class="tag ruim" title="' + esc(m.criticas.join(', ')) + '">crítica</span>' : ''}</td><td>${esc(m.avaliador)}${m.origem === 'importada' ? ' <small class="tag neutro" title="' + esc(m.arquivo || '') + '">importada</small>' : ''}</td>
      <td class="acoes-linha"><button type="button" class="btn-icone" data-ver="${m.id}" title="Ver / editar">${G.ic('edit', '')}</button><button type="button" class="btn-icone" data-del="${m.id}" data-perm="monitorar excluir" title="Excluir">${G.ic('trash', '')}</button></td></tr>`).join('') || '<tr><td colspan="8" class="dica">Nenhuma monitoria.</td></tr>'}
    </tbody></table></div></article>`;
  G.icones(raiz);
  const b = id => document.getElementById(id);
  b('monNova').onclick = () => { est.editando = null; est.form = true; formulario(); };
  b('monImp').onclick = abrirImportMon;
  b('monMes').onchange = e => { est.mes = e.target.value; render(); };
  b('monSup').onchange = e => { est.sup = e.target.value; render(); };
  b('monBusca').oninput = e => { est.q = e.target.value; const p = e.target.selectionStart; render(); const x = b('monBusca'); x.focus(); x.setSelectionRange(p, p); };
  if (b('monRecicla')) b('monRecicla').onclick = () => A.planejarReciclagem(`Reciclagem: ${fraco.t}`, filtro.filter(m => FATOR[(m.respostas || {})[fraco.k]] !== 1).map(m => m.nome));
  raiz.querySelectorAll('[data-ver]').forEach(x => x.onclick = () => { est.editando = x.dataset.ver; est.form = true; formulario(); });
  raiz.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { const m = lista.find(y => y.id === x.dataset.del); if (m && confirm(`Excluir a monitoria de ${m.nome} (${dataBR(m.data)})?`)) { lista = lista.filter(y => y !== m); salvar(); render(); toast('Monitoria excluída'); } });
  if (est.form) formulario();
}

function formulario() {
  const w = document.getElementById('monFormWrap'); if (!w) return;
  const m = est.editando ? lista.find(x => x.id === est.editando) : null;
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
    msg.textContent = 'Lendo o arquivo…'; msg.className = 'msg';
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
function processarMon(arq, aba, iCab, cab, m) {
  const linhas = aba.linhas.slice(iCab + 1).map((l, i) => ({ l, r: iCab + 1 + i })).filter(x => x.l && x.l.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  // escala da nota: 0–1 (fração), 0–10 ou 0–100
  const notasBrutas = m.nota < 0 ? [] : linhas.map(x => x.l[m.nota]).map(v => typeof v === 'number' ? v : A.num(String(v ?? '').replace('%', ''))).filter(v => v !== null && isFinite(v));
  const mx = notasBrutas.length ? Math.max(...notasBrutas) : 0;
  const fmtNota = m.nota < 0 ? '' : ((aba.formatos || [])[linhas[0] && linhas[0].r] || [])[m.nota];
  const escala = fmtNota === 'pct' || mx <= 1.0001 ? 100 : mx <= 10 ? 10 : 1;
  const usadas = new Set(Object.values(m).filter(i => i >= 0));
  const extras = cab.map((c, i) => [c, i]).filter(([c, i]) => c && !usadas.has(i)).slice(0, 60);
  const regs = [], fora = new Set(); let semData = 0;
  for (const { l, r } of linhas) {
    const nomeTxt = m.cons >= 0 ? String(l[m.cons] ?? '').trim() : '', matTxt = m.mat >= 0 ? String(l[m.mat] ?? '').trim() : '';
    if (!nomeTxt && !matTxt) continue;
    const c = (matTxt && A.identificarConsultor && A.identificarConsultor(matTxt)) || (nomeTxt && A.identificarConsultor && A.identificarConsultor(nomeTxt)) || null;
    let data = m.data >= 0 ? dataISO(l[m.data]) : '';
    if (!data) { semData++; data = arq.mes + '-01'; }
    let nota = null;
    if (m.nota >= 0) { const raw = l[m.nota]; const n = typeof raw === 'number' ? raw : A.num(String(raw ?? '').replace('%', '')); if (n !== null && isFinite(n)) nota = Math.round(n * escala * 10) / 10; }
    const nome = c ? c.nome : nomeTxt.toUpperCase();
    if (!c) fora.add(nome || matTxt);
    const at = m.at >= 0 ? txtCel(l[m.at]) : '';
    const aval = m.aval >= 0 ? txtCel(l[m.aval]) : '';
    const campos = {}; extras.forEach(([h, i]) => { const t = txtCel(l[i]); if (t) campos[h] = t.slice(0, 300); });
    regs.push({ id: 'imp-' + hashTxt([norm(nome), data, at, aval, nota, r].join('|')), origem: 'importada', arquivo: arq.nome, nome, matricula: (c && c.mat) || matTxt, supervisor: (m.sup >= 0 && String(l[m.sup] ?? '').trim().toUpperCase()) || (c && c.supervisor) || '', foraBD: !c || undefined, data, canal: m.canal >= 0 ? txtCel(l[m.canal]) : '', atendimento: at, avaliador: aval, nota, positivos: m.pos >= 0 ? txtCel(l[m.pos]).slice(0, 500) : '', melhorias: m.mel >= 0 ? txtCel(l[m.mel]).slice(0, 500) : '', campos, respostas: {}, criticas: [] });
  }
  return { regs, fora: [...fora], semData, escala, extras: extras.map(e => e[0]) };
}
function conferir(arq, aba, iCab, cab, m) {
  const f = document.getElementById('monImpForm'), r = processarMon(arq, aba, iCab, cab, m);
  const meses = [...new Set(r.regs.map(x => x.data.slice(0, 7)))].sort();
  const atuais = new Set((ler(KEY, []) || []).map(x => x.id));
  const novas = r.regs.filter(x => !atuais.has(x.id)).length;
  const notas = r.regs.map(x => x.nota).filter(v => v !== null);
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Conferir antes de salvar</h2><p>${esc(arq.nome)} · ${meses.map(mesTxt).join(', ') || '—'}</p></div></header>
    <div class="an-chips"><span><small>Monitorias</small><b>${r.regs.length}</b></span><span><small>Novas</small><b>${novas}</b></span><span><small>Atualizadas</small><b>${r.regs.length - novas}</b></span><span><small>Nota média</small><b>${notas.length ? fmt(notas.reduce((a, b) => a + b, 0) / notas.length, 1) + '%' : '—'}</b></span><span><small>Fora do BD</small><b>${r.fora.length}</b></span></div>
    ${r.semData ? `<p class="aviso-fluxo">${r.semData} linha(s) sem data: ficam no mês escolhido (${mesTxt(arq.mes)}).</p>` : ''}
    ${r.fora.length ? `<details class="do-trein"><summary>${G.ic('alert', '')}Não estão no BD atual (${r.fora.length})</summary><p class="dica">Entram mesmo assim, com o nome da planilha.</p><ul class="aps-lidos">${r.fora.slice(0, 80).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
    <p class="dica">Nota lida na escala ${r.escala === 100 ? '0 a 1 (convertida para %)' : r.escala === 10 ? '0 a 10 (convertida para %)' : '0 a 100'}. ${r.extras.length ? `Também guardadas: ${r.extras.slice(0, 12).map(esc).join(', ')}${r.extras.length > 12 ? '…' : ''}.` : ''}</p>
    <div class="tabela-wrap" style="max-height:220px"><table class="tabela"><thead><tr><th>Data</th><th>Consultor</th><th>Supervisor</th><th>Avaliador</th><th class="dir">Nota</th></tr></thead><tbody>${r.regs.slice(0, 8).map(x => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.nome)}</td><td>${esc(x.supervisor)}</td><td>${esc(x.avaliador)}</td><td class="dir">${tagNota(x.nota)}</td></tr>`).join('')}</tbody></table></div>
    <div class="dlg-rod"><small class="msg" id="miMsg"></small><span><button type="button" class="btn btn-sec" id="miVoltar2">Voltar</button> <button type="button" class="btn btn-pri" id="miSalvar"${r.regs.length ? '' : ' disabled'}>${G.ic('check')}Salvar ${r.regs.length} monitoria(s)</button></span></div>`;
  G.icones(f);
  document.getElementById('miVoltar2').onclick = () => mapear(arq, arq.abas.indexOf(aba));
  document.getElementById('miSalvar').onclick = () => {
    lista = ler(KEY, []) || [];
    const agora = new Date().toISOString(), porId = new Map(lista.map(x => [x.id, x]));
    r.regs.forEach(x => { const ex = porId.get(x.id); if (ex) Object.assign(ex, x, { atualizadoEm: agora }); else lista.push({ ...x, criadoEm: agora, atualizadoEm: agora }); });
    salvar(); dlgImp.close(); est.mes = meses[meses.length - 1] || est.mes; render();
    toast(`${r.regs.length} monitoria(s) importada(s)`);
    if (window.NUVEM && NUVEM.ativo && NUVEM.ativo()) NUVEM.publicarAgora();
  };
}
function verImportada(m) {
  const w = document.getElementById('monFormWrap'); if (!w) return;
  w.innerHTML = `<article class="cartao mon-form"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Monitoria de ${esc(m.nome)}</h2><p>${dataBR(m.data)} · importada de ${esc(m.arquivo || 'planilha')}${m.avaliador ? ' · avaliador(a) ' + esc(m.avaliador) : ''}</p></div><button type="button" class="btn btn-sec" id="monFechar">Fechar</button></header>
    <div class="an-chips"><span><small>Nota</small><b>${tagNota(m.nota)}</b></span><span><small>Supervisor</small><b>${esc(m.supervisor || '—')}</b></span><span><small>Canal</small><b>${esc(m.canal || '—')}</b></span><span><small>Atendimento</small><b>${esc(m.atendimento || '—')}</b></span></div>
    ${m.positivos ? `<p><b>Pontos positivos:</b> ${esc(m.positivos)}</p>` : ''}${m.melhorias ? `<p><b>Pontos de melhoria:</b> ${esc(m.melhorias)}</p>` : ''}
    ${Object.keys(m.campos || {}).length ? `<div class="tabela-wrap"><table class="tabela mon-campos"><tbody>${Object.entries(m.campos).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </article>`;
  G.icones(w);
  document.getElementById('monFechar').onclick = () => { est.form = false; est.editando = null; w.innerHTML = ''; };
  w.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* bloco da ficha (Buscar) */
A.blocoMonitorias = p => {
  const xs = (ler(KEY, []) || []).filter(m => (p.matricula && m.matricula && String(m.matricula) === String(p.matricula)) || norm(m.nome) === norm(p.nome)).sort((a, b) => b.data.localeCompare(a.data));
  if (!xs.length) return '';
  const md = xs.slice(0, 5).map(x => x.nota).filter(v => v !== null);
  const pior = CRITERIOS.map(([k, t]) => { const v = xs.map(m => FATOR[(m.respostas || {})[k]]).filter(x => x !== null && x !== undefined); return { t, pct: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }; }).filter(c => c.pct !== null).sort((a, b) => a.pct - b.pct)[0];
  return `<article class="cartao"><header class="cab-card"><span class="icb">${G.ic('headset')}</span><div><h2>Monitorias</h2><p>${xs.length} avaliação(ões) · média das últimas ${md.length}: ${md.length ? fmt(md.reduce((a, b) => a + b, 0) / md.length, 1) + '%' : '—'}${pior ? ` · ponto mais fraco: <b>${esc(pior.t)}</b>` : ''}</p></div></header>
    <div class="mon-evol">${xs.slice(0, 12).reverse().map(x => `<div title="${dataBR(x.data)} · ${fmt(x.nota, 1)}%"><i style="height:${Math.max(4, x.nota || 0)}%;--c:${x.nota >= META ? '#1baf7a' : x.nota >= 70 ? '#eda100' : '#d03b3b'}"></i><small>${dataBR(x.data).slice(0, 5)}</small></div>`).join('')}</div></article>`;
};
A.mediaMonitoria = (p, desdeISO) => { const xs = (ler(KEY, []) || []).filter(m => (!desdeISO || m.data >= desdeISO) && ((p.matricula && String(m.matricula) === String(p.matricula)) || norm(m.nome) === norm(p.nome))).map(m => m.nota).filter(v => v !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };

document.addEventListener('aba-aberta', e => { if (e.detail === 'monitorias') render(); });
window.addEventListener('dados-atualizados', () => { if (document.getElementById('aba-monitorias').classList.contains('ativo') && !est.form) render(); });
if (document.getElementById('aba-monitorias').classList.contains('ativo')) render();
})();
