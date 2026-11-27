/* =========================================================
   Painel de Controle · Relatório mensal e LGPD
   Relatório do mês pronto para imprimir ou salvar em PDF e
   prazo de guarda que apaga detalhes sensíveis antigos.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { norm, fmt, pct, esc, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const K = { quadro: 'inovacao_treinamento_quadro_v1', oc: 'inovacao_treinamento_ocorrencias_v1', mon: 'inovacao_treinamento_monitorias_v1', at: 'inovacao_treinamento_ativos_v1', des: 'inovacao_treinamento_desempenho_v1', mot: 'inovacao_treinamento_motivos_v1', an: 'inovacao_treinamento_analises_v1' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesTxt = m => `${MESES[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}`;
const VOL = ['Pedido de demissão', 'Abandono de emprego'];
const media = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function montar(mes) {
  const q = ler(K.quadro, { itens: [] }) || { itens: [] }, oc = ler(K.oc, []) || [], mon = A.monitorias ? A.monitorias() : (ler(K.mon, []) || []), at = ler(K.at, []) || [], des = ler(K.des, {}) || {}, mot = ler(K.mot, {}) || {};
  const doMes = d => (d || '').slice(0, 7) === mes;
  const ativos = (q.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro);
  const emAtiv = ativos.filter(c => /^ativ/.test(norm(c.status))).length;
  const saidas = (q.saidas || []).filter(s => doMes(s.desligamento || s.detectadoEm));
  const vol = saidas.filter(s => VOL.includes(mot[s.chave])).length, semMot = saidas.filter(s => !mot[s.chave]).length;
  const ocM = oc.filter(o => doMes(o.data));
  const cnt = t => ocM.filter(o => o.tipo === t).length;
  const diasAt = ocM.filter(o => o.tipo === 'Atestado').reduce((s, o) => s + (o.dias || 0), 0);
  const uteis = A.diasUteis ? A.diasUteis(mes + '-01', mes + '-' + new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate()) : 22;
  const abs = ativos.length && uteis ? (cnt('Falta') + diasAt) / (ativos.length * uteis) : null;
  const absP = A.indicadorMes ? A.indicadorMes(mes, 'Ponto', 'abs') : null;
  const form = (A.vista ? A.vista() : A.formacao());
  const turmasMes = [...new Set(form.filter(r => doMes(r.dataInicio)).map(r => r.turma).filter(Boolean))];
  const enviadosMes = form.filter(r => doMes(r.enviadoSupEm)).length;
  const sup = (ler(K.an, []) || []).filter(a => a.tipo === 'supervisao' && a.concluido && doMes(a.concluidoEm));
  const atM = at.filter(r => doMes(r.data));
  const porTipo = {}; atM.forEach(r => { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; });
  const monM = mon.filter(m => doMes(m.data)), notas = monM.map(m => m.nota).filter(v => v !== null && v !== undefined);
  const supMap = {}; ativos.forEach(c => { const s = c.supervisor || '—'; supMap[s] = supMap[s] || { hc: 0, desl: 0, faltas: 0, atest: 0, medidas: 0, notas: [] }; supMap[s].hc++; });
  const supDe = n => { const c = (q.itens || []).concat(q.saidas || []).find(x => norm(x.nome) === norm(n)); return c ? c.supervisor : ''; };
  saidas.forEach(s => { if (supMap[s.supervisor]) supMap[s.supervisor].desl++; });
  ocM.forEach(o => { const s = supMap[o.supervisor || supDe(o.nome)]; if (!s) return; if (o.tipo === 'Falta') s.faltas++; else if (o.tipo === 'Atestado') s.atest += o.dias || 0; else if (o.tipo === 'Advertência' || o.tipo === 'Suspensão') s.medidas++; });
  monM.forEach(m => { const s = supMap[m.supervisor || supDe(m.nome)]; if (s && m.nota !== null) s.notas.push(m.nota); });
  const linha = (t, v) => `<tr><td>${t}</td><td class="dir"><b>${v}</b></td></tr>`;
  const u = (window.NUVEM && NUVEM.usuario && NUVEM.usuario()) || {};
  const fontes = Object.keys(des.modelos || {});
  return `<div class="rel-doc" id="relDoc">
    <header class="rel-cab"><div><small>INOVAÇÃO CASA · PAINEL DE CONTROLE</small><h1>Relatório da operação · ${mesTxt(mes)}</h1></div><p>Gerado em ${dataBR(hoje())}${u.nome ? ' por ' + esc(u.nome) : ''}<br>BD: ${esc(q.arquivo || '—')}</p></header>
    <section class="rel-kpis">
      <div><small>Headcount</small><b>${ativos.length}</b><em>${emAtiv} em atividade · ${ativos.length - emAtiv} férias/afastados</em></div>
      <div><small>Desligamentos</small><b>${saidas.length}</b><em>turnover ${ativos.length + saidas.length ? fmt(saidas.length / (ativos.length + saidas.length) * 100, 1) + '%' : '—'} · ${vol} voluntário(s)${semMot ? ` · ${semMot} sem motivo` : ''}</em></div>
      <div><small>Absenteísmo</small><b>${absP ? absP.txt : abs === null ? '—' : fmt(abs * 100, 2) + '%'}</b><em>${absP ? 'ABS do ponto (relatório de indicadores) · ' : ''}${cnt('Falta')} falta(s) e ${diasAt} dia(s) de atestado lançados</em></div>
      <div><small>Qualidade</small><b>${notas.length ? fmt(media(notas), 1) + '%' : '—'}</b><em>${monM.length} monitoria(s) · ${notas.filter(n => n >= 85).length} na meta</em></div>
    </section>
    <section class="rel-2">
      <div><h2>Quadro e movimentação</h2><table class="tabela">${linha('Captação', ativos.filter(c => c.operacao === 'Captação').length)}${linha('Permanência', ativos.filter(c => c.operacao === 'Permanência').length)}${linha('UVA', ativos.filter(c => c.ies === 'UVA').length)}${linha('Unijorge', ativos.filter(c => c.ies === 'Unijorge').length)}${linha('Entraram no BD', q.comparacao && q.comparacao.periodo === mes ? q.comparacao.entraram.length : '—')}${linha('Desligados', saidas.length)}</table></div>
      <div><h2>Ocorrências</h2><table class="tabela">${linha('Faltas', cnt('Falta'))}${linha('Atrasos', cnt('Atraso'))}${linha('Atestados (dias)', `${cnt('Atestado')} (${diasAt})`)}${linha('Feedbacks', cnt('Feedback'))}${linha('Advertências', cnt('Advertência'))}${linha('Suspensões', cnt('Suspensão'))}</table></div>
      <div><h2>Formação inicial</h2><table class="tabela">${linha('Turmas iniciadas', turmasMes.length ? turmasMes.join(', ') : '0')}${linha('Treinandos dessas turmas', form.filter(r => doMes(r.dataInicio)).length)}${linha('Enviados para a supervisão', enviadosMes)}${linha('Experiências concluídas', sup.length)}${linha('Efetivados', sup.filter(a => a.resultadoFinal === 'Efetivado').length)}</table></div>
      <div><h2>Treinamentos de ativos</h2><table class="tabela">${Object.entries(porTipo).map(([t, n]) => linha(esc(t), n)).join('') || linha('Nenhum', 0)}${linha('Presentes', atM.filter(r => r.presenca === 'Presente').length)}${linha('Pendentes / reagendados', atM.filter(r => r.status === 'Pendente' || r.status === 'Reagendado').length)}</table></div>
    </section>
    ${A.relatorioDesempenho ? A.relatorioDesempenho(mes) : ''}
    <section><h2>Por supervisor</h2><table class="tabela"><thead><tr><th>Supervisor</th><th class="dir">Equipe</th><th class="dir">Desligados</th><th class="dir">Faltas</th><th class="dir">Atestado (dias)</th><th class="dir">Medidas</th><th class="dir">Monitoria</th></tr></thead><tbody>
      ${Object.entries(supMap).sort((a, b) => cmpTxt(a[0], b[0])).map(([s, x]) => `<tr><td>${esc(s)}</td><td class="dir">${x.hc}</td><td class="dir">${x.desl}</td><td class="dir">${x.faltas}</td><td class="dir">${x.atest}</td><td class="dir">${x.medidas}</td><td class="dir">${x.notas.length ? fmt(media(x.notas), 1) + '%' : '—'}</td></tr>`).join('')}</tbody></table></section>
    <footer class="rel-rod">Documento interno · contém dados de colaboradores · não compartilhe fora da gestão</footer>
  </div>`;
}

let dlg = null;
function abrir() {
  if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog class="dlg rel-dlg" id="dlgRel"><div class="dlg-in"><div class="rel-barra"><label class="mini">Mês <input type="month" id="relMes"></label><span><button type="button" class="btn btn-sec" id="relFechar">Fechar</button> <button type="button" class="btn btn-pri" id="relImp">Imprimir / salvar PDF</button></span></div><div id="relCorpo"></div></div></dialog>'); dlg = document.getElementById('dlgRel');
    document.getElementById('relFechar').onclick = () => dlg.close();
    document.getElementById('relMes').onchange = e => { document.getElementById('relCorpo').innerHTML = montar(e.target.value); };
    document.getElementById('relImp').onclick = () => { document.body.classList.add('imprimindo-rel'); window.print(); };
    window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo-rel'));
  }
  const m = hoje().slice(0, 7); document.getElementById('relMes').value = m; document.getElementById('relCorpo').innerHTML = montar(m);
  dlg.showModal();
}
A.relatorioMensal = abrir;

/* ---------------- LGPD: prazo de guarda ---------------- */
document.addEventListener('admin-servidor', e => {
  const el = e.detail; if (!el) return;
  el.innerHTML = `<h3>LGPD · prazo de guarda</h3>
    <p class="dica">Apaga os detalhes sensíveis de registros antigos e mantém só as contagens: CID e descrição de atestados, descrição e combinados de feedbacks e medidas, comentários das monitorias. Quem abriu a ficha de cada consultor fica no Registro de acessos.</p>
    <div class="adm-grade"><label class="campo"><span>Guardar detalhes por</span><select id="lgpdMeses"><option value="12">12 meses</option><option value="24" selected>24 meses</option><option value="36">36 meses</option><option value="60">60 meses</option></select></label></div>
    <div class="adm-acoes"><button type="button" class="btn btn-sec" id="lgpdAplicar">Aplicar agora</button></div><p class="msg" id="lgpdMsg"></p>`;
  document.getElementById('lgpdAplicar').onclick = () => {
    const meses = +document.getElementById('lgpdMeses').value, lim = new Date(); lim.setMonth(lim.getMonth() - meses); const corte = lim.toISOString().slice(0, 10);
    const oc = ler(K.oc, []) || [], mon = A.monitorias ? A.monitorias() : (ler(K.mon, []) || []);
    const velhosOc = oc.filter(o => o.data < corte && !o.anonimizado), velhosMon = mon.filter(m => m.data < corte && !m.anonimizado);
    if (!velhosOc.length && !velhosMon.length) { document.getElementById('lgpdMsg').textContent = `Nada anterior a ${dataBR(corte)} para anonimizar.`; return; }
    if (!confirm(`Apagar os detalhes sensíveis de ${velhosOc.length} ocorrência(s) e ${velhosMon.length} monitoria(s) anteriores a ${dataBR(corte)}? As contagens continuam. Não dá para desfazer.`)) return;
    const agora = new Date().toISOString();
    velhosOc.forEach(o => { ['cid', 'cidDesc', 'descricao', 'combinado', 'resultadoObs'].forEach(k => delete o[k]); o.anonimizado = true; o.atualizadoEm = agora; });
    velhosMon.forEach(m => { ['positivos', 'melhorias', 'atendimento'].forEach(k => delete m[k]); m.anonimizado = true; m.atualizadoEm = agora; });
    gravar(K.oc, oc); gravar(K.mon, mon);
    const msg = document.getElementById('lgpdMsg'); msg.textContent = `Pronto: ${velhosOc.length} ocorrência(s) e ${velhosMon.length} monitoria(s) anonimizadas. Publique para valer no servidor.`; msg.className = 'msg ok';
    if (window.NUVEM && NUVEM.publicarAgora) NUVEM.publicarAgora();
  };
});
})();
