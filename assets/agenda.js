/* =========================================================
   Painel de Controle · Planejamento e Checklist de admissão
   Calendário de turmas e reciclagens com convocação de consultores
   (vira registro pendente em Colaboradores ativos) e checklist de
   acessos/documentos de quem está entrando, marcado sozinho pelo BD.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, esc, uid, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const KEY = 'inovacao_treinamento_agenda_v1', KEY_ADM = 'inovacao_treinamento_admissao_v1', KEY_AT = 'inovacao_treinamento_ativos_v1', KEY_Q = 'inovacao_treinamento_quadro_v1';
const TIPOS = { 'Turma de formação': ['#0f3a6b', 'users'], 'Reciclagem': ['#2a78d6', 'clock'], 'Alinhamento': ['#1baf7a', 'target'], 'Novo conteúdo': ['#6250d6', 'exam'], 'Novo produto': ['#eb6834', 'rocket'] };
const STATUS = ['Planejado', 'Confirmado', 'Realizado', 'Cancelado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pode = x => !window.NUVEM || !NUVEM.pode || NUVEM.pode(x);
let eventos = ler(KEY, []) || [];
const salvar = () => gravar(KEY, eventos);
const vigentes = () => { const q = ler(KEY_Q, { itens: [] }) || { itens: [] }; return (q.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro); };
const somaDias = (iso, d) => { const x = new Date(iso + 'T12:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

/* =================== PLANEJAMENTO =================== */
const raiz = document.getElementById('agRaiz');
const est = { mes: hoje().slice(0, 7), vista: 'calendario' };
function render() {
  eventos = ler(KEY, []) || [];
  const [a, m] = est.mes.split('-').map(Number);
  const ini = new Date(a, m - 1, 1), dias = new Date(a, m, 0).getDate(), pad = (ini.getDay() + 6) % 7;
  const doDia = iso => eventos.filter(e => e.status !== 'Cancelado' && e.dataInicio <= iso && (e.dataFim || e.dataInicio) >= iso);
  const prox = eventos.filter(e => (e.dataFim || e.dataInicio) >= hoje() && e.status !== 'Cancelado').sort((x, y) => x.dataInicio.localeCompare(y.dataInicio));
  const cel = [];
  for (let i = 0; i < pad; i++) cel.push('<div class="ag-d ag-fora"></div>');
  for (let d = 1; d <= dias; d++) {
    const iso = `${est.mes}-${String(d).padStart(2, '0')}`, evs = doDia(iso);
    cel.push(`<div class="ag-d${iso === hoje() ? ' ag-hoje' : ''}"><span class="ag-n">${d}</span>${evs.slice(0, 3).map(e => `<button type="button" class="ag-ev" data-ev="${e.id}" style="--c:${(TIPOS[e.tipo] || ['#2a78d6'])[0]}" title="${esc(e.tipo + ': ' + e.titulo)}">${esc(e.titulo)}</button>`).join('')}${evs.length > 3 ? `<small>+${evs.length - 3}</small>` : ''}</div>`);
  }
  raiz.innerHTML = `
  <div class="cab-pagina"><div><h1>Planejamento</h1><p class="sub">Turmas de formação, reciclagens e alinhamentos · convoque os consultores e o registro já nasce pendente em Colaboradores ativos</p></div>
    <div class="cab-acoes"><button type="button" class="btn btn-pri" id="agNovo"${pode('agenda') ? '' : ' hidden'}>${G.ic('plus')}Novo evento</button></div></div>
  <div class="pn-grade ag-grade">
    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('calendar')}</span><div><h2>${MESES[m - 1]} de ${a}</h2><p>${eventos.filter(e => e.dataInicio.slice(0, 7) === est.mes).length} evento(s) no mês</p></div>
        <div class="cab-acoes"><button type="button" class="btn btn-sec btn-mini" id="agAnt">‹</button><button type="button" class="btn btn-sec btn-mini" id="agHoje">Hoje</button><button type="button" class="btn btn-sec btn-mini" id="agProx">›</button></div></header>
      <div class="ag-cal"><div class="ag-sem">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(x => `<b>${x}</b>`).join('')}</div><div class="ag-dias">${cel.join('')}</div></div>
      <div class="ag-leg">${Object.entries(TIPOS).map(([t, [c]]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>
    </article>
    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('clock')}</span><div><h2>Próximos</h2><p>${prox.length} evento(s)</p></div></header>
      <ul class="ag-lista">${prox.slice(0, 20).map(e => `<li data-ev="${e.id}" style="--c:${(TIPOS[e.tipo] || ['#2a78d6'])[0]}"><b>${esc(e.titulo)}</b><small>${esc(e.tipo)} · ${dataBR(e.dataInicio)}${e.dataFim && e.dataFim !== e.dataInicio ? ' a ' + dataBR(e.dataFim) : ''}${e.horario ? ' · ' + esc(e.horario) : ''}</small><small>${esc([e.instrutor, e.modalidade, e.vagas ? `${(e.convocados || []).length}/${e.vagas} vagas` : (e.convocados || []).length ? `${e.convocados.length} convocado(s)` : ''].filter(Boolean).join(' · '))}</small><span class="tag ${e.status === 'Confirmado' ? 'bom' : e.status === 'Realizado' ? 'neutro' : 'alerta'}">${esc(e.status)}</span></li>`).join('') || '<li class="vazio-lote">Nada planejado.</li>'}</ul>
    </article>
  </div>`;
  G.icones(raiz);
  const b = id => document.getElementById(id);
  const mover = n => { const d = new Date(a, m - 1 + n, 1); est.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; render(); };
  b('agAnt').onclick = () => mover(-1); b('agProx').onclick = () => mover(1); b('agHoje').onclick = () => { est.mes = hoje().slice(0, 7); render(); };
  b('agNovo').onclick = () => abrir(null);
  raiz.querySelectorAll('[data-ev]').forEach(x => x.onclick = () => abrir(eventos.find(e => e.id === x.dataset.ev)));
}

let dlg = null;
function abrir(e, pre) {
  if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog class="dlg dlg-grande" id="dlgAg"><form method="dialog" class="dlg-in" id="agForm" novalidate autocomplete="off"></form></dialog>'); dlg = document.getElementById('dlgAg'); }
  const f = document.getElementById('agForm'), ed = pode('agenda');
  const ev = e ? JSON.parse(JSON.stringify(e)) : Object.assign({ tipo: 'Reciclagem', titulo: '', dataInicio: hoje(), dataFim: '', status: 'Planejado', convocados: [] }, pre || {});
  const sups = [...new Set(vigentes().map(c => c.supervisor).filter(Boolean))].sort(cmpTxt);
  f.innerHTML = `<header class="cab-card"><span class="icb">${G.ic('calendar')}</span><div><h2>${e ? 'Evento' : 'Novo evento'}</h2><p>${e && e.registrosGerados ? `Registros gerados em ${dataBR(e.registrosGerados)}` : 'Turma, reciclagem ou alinhamento'}</p></div></header>
    <div class="grade g4">
      <label class="campo"><span>Tipo</span><select id="agTipo">${Object.keys(TIPOS).map(t => `<option${t === ev.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo c2"><span id="agTitRot">${ev.tipo === 'Turma de formação' ? 'Código da turma' : 'Tema'} <i class="obr">*</i></span><input id="agTit" value="${esc(ev.titulo)}"></label>
      <label class="campo"><span>Status</span><select id="agSt">${STATUS.map(s => `<option${s === ev.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="campo"><span>Início <i class="obr">*</i></span><input type="date" id="agIni" value="${ev.dataInicio || ''}"></label>
      <label class="campo"><span>Fim</span><input type="date" id="agFim" value="${ev.dataFim || ''}"></label>
      <label class="campo"><span>Horário</span><input id="agHora" placeholder="Ex.: 09:00 às 12:00" value="${esc(ev.horario || '')}"></label>
      <label class="campo"><span>Vagas</span><input type="number" id="agVagas" min="1" value="${ev.vagas || ''}"></label>
      <label class="campo"><span>Instrutor(a)</span><input id="agInstr" value="${esc(ev.instrutor || '')}"></label>
      <label class="campo"><span>Modalidade / local</span><input id="agMod" placeholder="Presencial, on-line, sala…" value="${esc(ev.modalidade || '')}"></label>
      <label class="campo"><span>Instituição</span><select id="agIes"><option value="">UVA e Unijorge</option>${['UVA', 'Unijorge'].map(x => `<option${x === ev.ies ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo"><span>Operação</span><select id="agOp"><option value="">Captação e Permanência</option>${['Captação', 'Permanência'].map(x => `<option${x === ev.operacao ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <div class="sub-bloco ag-conv" id="agConvBloco"${ev.tipo === 'Turma de formação' ? ' hidden' : ''}><div class="sub-cab"><b class="com-ic">${G.ic('users')}Convocados (<span id="agN">${ev.convocados.length}</span>)</b>
      <span class="ag-conv-acoes"><select id="agSupAdd"><option value="">+ equipe inteira de…</option>${sups.map(s => `<option>${esc(s)}</option>`).join('')}</select><span class="auto" id="agAuto"><input id="agPessoa" placeholder="+ consultor"><ul class="auto-lista" hidden></ul></span></span></div>
      <div class="ag-chips" id="agChips"></div></div>
    <label class="campo"><span>Observações</span><textarea id="agObs" rows="2">${esc(ev.obs || '')}</textarea></label>
    <div class="dlg-rod"><small class="msg" id="agMsg"></small><span>
      ${e && ed ? `<button type="button" class="btn btn-sec" id="agExcluir">${G.ic('trash')}Excluir</button>` : ''}
      <button class="btn btn-sec" value="cancelar" formnovalidate>Fechar</button>
      ${ed ? `<button type="button" class="btn btn-sec" id="agGerar"${ev.tipo === 'Turma de formação' ? ' hidden' : ''}>${G.ic('rocket')}Salvar e gerar registros pendentes</button><button type="button" class="btn btn-pri" id="agSalvar">${G.ic('check')}Salvar</button>` : ''}</span></div>`;
  G.icones(f); dlg.showModal();
  const chips = () => { document.getElementById('agChips').innerHTML = ev.convocados.map((c, i) => `<span class="chip-f on">${esc(c.nome)} <button type="button" data-rm="${i}" aria-label="Remover">×</button></span>`).join('') || '<span class="dica">Ninguém convocado.</span>'; document.getElementById('agN').textContent = ev.convocados.length; };
  const add = c => { if (!ev.convocados.some(x => norm(x.nome) === norm(c.nome))) ev.convocados.push({ nome: c.nome, mat: c.mat || '', supervisor: c.supervisor || '' }); chips(); };
  chips();
  document.getElementById('agChips').onclick = x => { const r = x.target.closest('[data-rm]'); if (r) { ev.convocados.splice(+r.dataset.rm, 1); chips(); } };
  document.getElementById('agSupAdd').onchange = x => { if (!x.target.value) return; vigentes().filter(c => c.supervisor === x.target.value).forEach(add); x.target.value = ''; };
  A.autocomplete(document.getElementById('agAuto'), { fonte: () => vigentes().map(c => c.nome).sort(cmpTxt), aoEscolher: v => { const c = vigentes().find(x => norm(x.nome) === norm(v)); if (c) { add(c); document.getElementById('agPessoa').value = ''; } } });
  document.getElementById('agTipo').onchange = x => { ev.tipo = x.target.value; const t = ev.tipo === 'Turma de formação'; document.getElementById('agTitRot').innerHTML = (t ? 'Código da turma' : 'Tema') + ' <i class="obr">*</i>'; document.getElementById('agConvBloco').hidden = t; const g = document.getElementById('agGerar'); if (g) g.hidden = t; };
  const coletar = () => {
    const msg = document.getElementById('agMsg');
    Object.assign(ev, { tipo: document.getElementById('agTipo').value, titulo: document.getElementById('agTit').value.trim(), status: document.getElementById('agSt').value, dataInicio: document.getElementById('agIni').value, dataFim: document.getElementById('agFim').value, horario: document.getElementById('agHora').value.trim(), vagas: num(document.getElementById('agVagas').value) || null, instrutor: document.getElementById('agInstr').value.trim(), modalidade: document.getElementById('agMod').value.trim(), ies: document.getElementById('agIes').value, operacao: document.getElementById('agOp').value, obs: document.getElementById('agObs').value.trim(), atualizadoEm: new Date().toISOString() });
    if (!ev.titulo || !ev.dataInicio) { msg.textContent = 'Informe o tema/código e a data de início.'; msg.className = 'msg erro'; return false; }
    if (ev.dataFim && ev.dataFim < ev.dataInicio) { msg.textContent = 'O fim não pode ser antes do início.'; msg.className = 'msg erro'; return false; }
    if (ev.vagas && ev.convocados.length > ev.vagas && !confirm(`São ${ev.convocados.length} convocados para ${ev.vagas} vagas. Salvar mesmo assim?`)) return false;
    if (!ev.id) { ev.id = uid(); ev.criadoEm = new Date().toISOString(); }
    eventos = ler(KEY, []) || []; const i = eventos.findIndex(x => x.id === ev.id); if (i >= 0) eventos[i] = ev; else eventos.push(ev);
    return true;
  };
  if (document.getElementById('agSalvar')) document.getElementById('agSalvar').onclick = () => { if (!coletar()) return; salvar(); dlg.close(); render(); toast('Evento salvo'); };
  if (document.getElementById('agGerar')) document.getElementById('agGerar').onclick = () => {
    if (!coletar()) return;
    if (!ev.convocados.length) { document.getElementById('agMsg').textContent = 'Convoque ao menos um consultor.'; document.getElementById('agMsg').className = 'msg erro'; return; }
    const regs = ler(KEY_AT, []) || [], bd = vigentes(), agora = new Date().toISOString(); let n = 0;
    ev.convocados.forEach(c => {
      if (regs.some(r => norm(r.nome) === norm(c.nome) && norm(r.tema) === norm(ev.titulo) && r.data === ev.dataInicio)) return;
      const p = bd.find(x => norm(x.nome) === norm(c.nome)) || {};
      regs.push({ id: uid(), criadoEm: agora, atualizadoEm: agora, tipo: ev.tipo, tema: ev.titulo, data: ev.dataInicio, instituicao: p.ies || ev.ies || '', operacao: p.operacao || ev.operacao || '', instrutor: ev.instrutor || '', modalidade: ev.modalidade || '', motivo: 'Planejamento', objetivo: ev.obs || '', nome: c.nome, matricula: p.mat || c.mat || '', login: p.login || '', idOlos: p.idOlos || '', hubspot: p.hubspot || '', escala: p.escala || '', admissao: p.admissao || '', email: (p.email || '').toLowerCase(), supervisor: p.supervisor || c.supervisor || '', turno: p.turno || '', cidade: p.cidade || '', bairro: p.bairro || '', presenca: '', status: 'Pendente', agendaId: ev.id });
      n++;
    });
    gravar(KEY_AT, regs); ev.registrosGerados = hoje(); salvar(); dlg.close(); render();
    toast(`${n} registro(s) pendente(s) criados em Colaboradores ativos`);
  };
  if (document.getElementById('agExcluir')) document.getElementById('agExcluir').onclick = () => { if (!confirm('Excluir este evento? Os registros já gerados continuam em Colaboradores ativos.')) return; eventos = (ler(KEY, []) || []).filter(x => x.id !== ev.id); salvar(); dlg.close(); render(); };
}
// chamado pelas Monitorias: abre um evento de reciclagem já com o tema e os consultores
A.planejarReciclagem = (tema, nomes) => {
  const bd = vigentes(); A.abrirAba('agenda');
  abrir(null, { tipo: 'Reciclagem', titulo: tema, dataInicio: somaDias(hoje(), 7), convocados: [...new Set(nomes)].map(n => { const c = bd.find(x => norm(x.nome) === norm(n)) || { nome: n }; return { nome: c.nome, mat: c.mat || '', supervisor: c.supervisor || '' }; }) });
};

/* =================== CHECKLIST DE ADMISSÃO =================== */
// itens com "bd" são marcados sozinhos quando o campo aparece no BD da operação
const ITENS = [['contrato', 'Contrato e documentos'], ['lgpd', 'Termo LGPD / confidencialidade'], ['email', 'E-mail corporativo', 'email'], ['rede', 'Login de rede', 'login'], ['olos', 'Login Olos', 'idOlos'], ['hubspot', 'Usuário HubSpot', 'hubspot'], ['academico', 'Sistema acadêmico'], ['cracha', 'Crachá'], ['estacao', 'Estação e headset']];
const raizA = document.getElementById('admRaiz');
const estA = { turma: '', etapa: 'abertos' };
function estadoDe(r, adm, bd) {
  const reg = adm.find(x => x.id === r.id) || { id: r.id, itens: {} };
  const c = bd.get(norm(r.nome)) || (A.identificarConsultor ? A.identificarConsultor(r.nome) : null);
  const itens = ITENS.map(([k, t, campo]) => { const auto = campo && c && c[campo] ? String(c[campo]) : ''; const man = reg.itens[k]; return { k, t, auto, ok: !!auto || !!(man && man.ok), man }; });
  return { reg, c, itens, feitos: itens.filter(i => i.ok).length };
}
function renderAdm() {
  const adm = ler(KEY_ADM, []) || [], q = ler(KEY_Q, { itens: [] }) || { itens: [] };
  const bd = new Map((q.itens || []).map(c => [norm(c.nome), c]));
  const form = (A.vista ? A.vista() : A.formacao()).filter(r => estA.etapa === 'todos' || r.etapa === 'treinamento' || r.etapa === 'supervisao');
  const turmas = [...new Set(form.map(r => r.turma).filter(Boolean))].sort(cmpTxt).reverse();
  const rows = form.filter(r => !estA.turma || r.turma === estA.turma).map(r => ({ r, ...estadoDe(r, adm, bd) })).sort((a, b) => a.feitos - b.feitos || cmpTxt(a.r.nome, b.r.nome));
  const completos = rows.filter(x => x.feitos === ITENS.length).length;
  const ed = pode('admissao');
  raizA.innerHTML = `
  <div class="cab-pagina"><div><h1>Checklist de admissão</h1><p class="sub">Acessos e documentos de quem está em treinamento ou experiência · e-mail, login de rede, Olos e HubSpot são marcados sozinhos quando aparecem no BD</p></div></div>
  <div class="des-filtros cartao">
    <label class="mini">Turma <select id="admTurma"><option value="">Todas</option>${turmas.map(t => `<option${t === estA.turma ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="mini">Quem <select id="admEtapa"><option value="abertos"${estA.etapa === 'abertos' ? ' selected' : ''}>Em treinamento ou experiência</option><option value="todos"${estA.etapa === 'todos' ? ' selected' : ''}>Todos da formação</option></select></label>
    <span class="dica">${completos} de ${rows.length} com tudo pronto</span>
  </div>
  <article class="cartao"><div class="tabela-wrap"><table class="tabela adm-ck"><thead><tr><th>Treinando</th><th>Turma</th><th>Fim do treinamento</th>${ITENS.map(([, t, campo]) => `<th class="ck-col" title="${esc(t)}${campo ? ' (automático pelo BD)' : ''}">${esc(t)}${campo ? ' <small>BD</small>' : ''}</th>`).join('')}<th class="dir">Pronto</th></tr></thead><tbody>
  ${rows.map(x => `<tr data-id="${x.r.id}"><td><b>${esc(x.r.nome)}</b></td><td>${esc(x.r.turma || '')}</td><td>${dataBR(x.r.dataFim) || '—'}${x.r.dataFim && x.r.dataFim <= somaDias(hoje(), 5) && x.feitos < ITENS.length && x.r.etapa === 'treinamento' ? ' <span class="tag alerta">prazo</span>' : ''}</td>
    ${x.itens.map(i => `<td class="ck-col">${i.auto ? `<span class="ck-auto" title="No BD: ${esc(i.auto)}">✓</span>` : `<input type="checkbox" data-k="${i.k}"${i.ok ? ' checked' : ''}${ed ? '' : ' disabled'} title="${i.man && i.man.em ? `marcado por ${esc(i.man.por || '')} em ${dataBR(i.man.em)}` : esc(i.t)}">`}</td>`).join('')}
    <td class="dir"><span class="tag ${x.feitos === ITENS.length ? 'bom' : x.feitos >= ITENS.length / 2 ? 'alerta' : 'ruim'}">${Math.round(x.feitos / ITENS.length * 100)}%</span></td></tr>`).join('') || `<tr><td colspan="${ITENS.length + 4}" class="dica">Ninguém em treinamento ou experiência.</td></tr>`}
  </tbody></table></div></article>`;
  document.getElementById('admTurma').onchange = e => { estA.turma = e.target.value; renderAdm(); };
  document.getElementById('admEtapa').onchange = e => { estA.etapa = e.target.value; renderAdm(); };
  raizA.querySelector('tbody').addEventListener('change', e => {
    const cb = e.target.closest('input[data-k]'); if (!cb) return;
    const id = cb.closest('tr').dataset.id, lista = ler(KEY_ADM, []) || [];
    let reg = lista.find(x => x.id === id); const r = form.find(x => x.id === id);
    if (!reg) { reg = { id, treinandoId: id, nome: r ? r.nome : '', itens: {} }; lista.push(reg); }
    reg.itens[cb.dataset.k] = { ok: cb.checked, em: hoje(), por: ((window.NUVEM && NUVEM.usuario && NUVEM.usuario()) || {}).nome || '' };
    reg.atualizadoEm = new Date().toISOString();
    gravar(KEY_ADM, lista); renderAdm();
  });
}
A.pendenciasAdmissao = () => {
  const adm = ler(KEY_ADM, []) || [], q = ler(KEY_Q, { itens: [] }) || { itens: [] };
  const bd = new Map((q.itens || []).map(c => [norm(c.nome), c]));
  return (A.vista ? A.vista() : A.formacao()).filter(r => r.etapa === 'treinamento' && r.dataFim && r.dataFim <= somaDias(hoje(), 5))
    .map(r => { const e = estadoDe(r, adm, bd); return { nome: r.nome, faltam: e.itens.filter(i => !i.ok).map(i => i.t) }; }).filter(x => x.faltam.length);
};

document.addEventListener('aba-aberta', e => { if (e.detail === 'agenda') render(); if (e.detail === 'admissao') renderAdm(); });
window.addEventListener('dados-atualizados', () => {
  if (document.getElementById('aba-agenda').classList.contains('ativo') && !(dlg && dlg.open)) render();
  if (document.getElementById('aba-admissao').classList.contains('ativo')) renderAdm();
});
if (document.getElementById('aba-agenda').classList.contains('ativo')) render();
if (document.getElementById('aba-admissao').classList.contains('ativo')) renderAdm();
})();
