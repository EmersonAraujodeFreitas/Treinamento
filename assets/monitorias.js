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
    <div class="cab-acoes"><button type="button" class="btn btn-pri" id="monNova" data-perm="monitorar">${G.ic('plus')}Nova monitoria</button></div></div>
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
      ${filtro.length ? `<div class="mon-crit">${crit.map(c => `<div class="mon-c"><span>${esc(c.t)} <small>peso ${c.peso}</small></span><i><b style="width:${c.pct === null ? 0 : Math.round(c.pct * 100)}%;--c:${c.pct === null ? '#9aa8b8' : c.pct >= .85 ? '#1baf7a' : c.pct >= .7 ? '#eda100' : '#d03b3b'}"></b></i><em>${c.pct === null ? '—' : fmt(c.pct * 100, 0) + '%'}</em></div>`).join('')}</div>
      ${fraco ? `<p class="mon-sug">${G.ic('rocket', '')}<span>Sugestão: reciclagem de <b>${esc(fraco.t)}</b> (${fmt(fraco.pct * 100, 0)}% de atendimento).</span>${A.planejarReciclagem && pode('agenda') ? `<button type="button" class="btn btn-sec btn-mini" id="monRecicla">Planejar reciclagem</button>` : ''}</p>` : ''}` : '<p class="dica">Nenhuma monitoria neste mês.</p>'}
    </article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Média por supervisor</h2><p>Equipes no mês</p></div></header>
      ${Object.keys(porSup).length ? `<table class="tabela"><thead><tr><th>Supervisor</th><th class="dir">Monitorias</th><th class="dir">Média</th></tr></thead><tbody>${Object.entries(porSup).sort((a, b) => cmpTxt(a[0], b[0])).map(([s, ns]) => { const v = ns.filter(x => x !== null); const md = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; return `<tr><td>${esc(s)}</td><td class="dir">${ns.length}</td><td class="dir">${tagNota(md)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="dica">—</p>'}
    </article>
  </div>
  <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('clipboard')}</span><div><h2>Monitorias do mês</h2><p>${filtro.length} registro(s)</p></div></header>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Consultor</th><th>Supervisor</th><th>Canal</th><th>Atendimento</th><th class="dir">Nota</th><th>Avaliador</th><th></th></tr></thead><tbody>
    ${filtro.map(m => `<tr><td>${dataBR(m.data)}</td><td><b>${esc(m.nome)}</b></td><td>${esc(m.supervisor)}</td><td>${esc(m.canal)}</td><td>${esc(m.atendimento || '—')}</td><td class="dir">${tagNota(m.nota)}${(m.criticas || []).length ? ' <span class="tag ruim" title="' + esc(m.criticas.join(', ')) + '">crítica</span>' : ''}</td><td>${esc(m.avaliador)}</td>
      <td class="acoes-linha"><button type="button" class="btn-icone" data-ver="${m.id}" title="Ver / editar">${G.ic('edit', '')}</button><button type="button" class="btn-icone" data-del="${m.id}" data-perm="monitorar excluir" title="Excluir">${G.ic('trash', '')}</button></td></tr>`).join('') || '<tr><td colspan="8" class="dica">Nenhuma monitoria.</td></tr>'}
    </tbody></table></div></article>`;
  G.icones(raiz);
  const b = id => document.getElementById(id);
  b('monNova').onclick = () => { est.editando = null; est.form = true; formulario(); };
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
