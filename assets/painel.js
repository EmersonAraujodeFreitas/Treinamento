/* =========================================================
   Inovação Casa · Treinamento — Painel da operação
   Pendências do dia (o que precisa ser feito e por quem) e os
   indicadores de uma operação de call center: headcount, turnover,
   absenteísmo, funil da formação e visão por supervisor.
   Tudo é calculado no navegador com os dados que o perfil pode ver.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $$, norm, fmt, pct, esc, hoje, dataBR, cmpTxt, ler } = A;
const K = { motivos: 'inovacao_treinamento_motivos_v1', admissao: 'inovacao_treinamento_admissao_v1', agenda: 'inovacao_treinamento_agenda_v1', quadro: 'inovacao_treinamento_quadro_v1', ativos: 'inovacao_treinamento_ativos_v1', an: 'inovacao_treinamento_analises_v1', oc: 'inovacao_treinamento_ocorrencias_v1' };
const EXP_TOTAL = 90, EXP_MARCO = 45, BD_VELHO = 35;
const somaDias = (iso, d) => { const x = new Date(iso + 'T12:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const diasAte = iso => Math.round((new Date(iso + 'T12:00') - new Date(hoje() + 'T12:00')) / 864e5);
const desde = d => somaDias(hoje(), -d);
const mesTxt = m => { const [a, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm - 1] + '/' + a.slice(2); };
const podeVer = aba => !window.NUVEM || !NUVEM.pode || NUVEM.pode(aba);
const raiz = document.getElementById('painelRaiz');

function dados() {
  const quadro = ler(K.quadro, { itens: [] });
  const ativosBD = (quadro.itens || []).filter(c => c.status !== 'Desligado' && !c.supForaQuadro);
  const form = A.vista ? A.vista() : A.formacao();
  const an = ler(K.an, []);
  const sup = new Map(an.filter(a => a.tipo === 'supervisao').map(a => [a.treinandoId, a]));
  const trein = new Map(an.filter(a => a.tipo === 'treinamento').map(a => [a.treinandoId, a]));
  return { quadro, ativosBD, form, sup, trein, regs: ler(K.ativos, []), oc: ler(K.oc, []), motivos: ler(K.motivos, {}) || {}, admissao: ler(K.admissao, []) || [], agenda: ler(K.agenda, []) || [] };
}
const chaveP = (mat, nome) => mat ? 'm:' + mat : 'n:' + norm(nome);

/* ---------------- pendências ---------------- */
function pendencias(D) {
  const P = [];
  // cada perfil só vê as pendências da guia em que ele resolve (BD só para quem importa)
  const add = (nivel, ic, titulo, desc, aba, itens) => {
    if (!itens.length || !podeVer(aba)) return;
    if ((ic === 'database' || /hierarquia/i.test(titulo)) && !podeVer('importarBD')) return;
    P.push({ nivel, ic, titulo, desc, aba, itens });
  };
  const pessoa = (nome, info) => ({ nome, info });

  // formação: treinamento terminou e ninguém confirmou o envio
  const semEnvio = D.form.filter(r => r.etapa === 'treinamento' && r.dataFim && r.dataFim < hoje());
  add('alta', 'send', 'Treinamento encerrado sem envio para a supervisão', 'A turma já terminou. A analista de treinamento precisa lançar o parecer e confirmar o envio.', 'analise-trein',
    semEnvio.map(r => pessoa(r.nome, `${r.turma || 'sem turma'} · terminou em ${dataBR(r.dataFim)}`)));

  // experiência: marcos de 45 e 90 dias
  const exp = D.form.filter(r => r.etapa === 'supervisao').map(r => {
    const s = D.sup.get(r.id), ini = (s && s.experiencia && s.experiencia.inicio) || r.enviadoSupEm || r.dataHabilitacao || hoje();
    return { r, s, ini, fim: (s && s.experiencia && s.experiencia.fim) || somaDias(ini, EXP_TOTAL), marco: somaDias(ini, EXP_MARCO) };
  });
  add('alta', 'flag', 'Período de experiência vencido sem conclusão', 'Definir com a supervisão: efetivar ou desligar.', 'analise-sup',
    exp.filter(e => diasAte(e.fim) < 0).map(e => pessoa(e.r.nome, `venceu em ${dataBR(e.fim)} · ${e.r.supervisor || e.r.turma || ''}`)));
  add('media', 'clock', 'Experiência termina nos próximos 15 dias', 'Fazer a avaliação final e registrar o resultado na Análise supervisão.', 'analise-sup',
    exp.filter(e => diasAte(e.fim) >= 0 && diasAte(e.fim) <= 15).map(e => pessoa(e.r.nome, `termina em ${dataBR(e.fim)} (${diasAte(e.fim)} dia(s))`)));
  add('media', 'calendar', 'Marco de 45 dias da experiência', 'Primeira avaliação do contrato de experiência: registrar o acompanhamento.', 'analise-sup',
    exp.filter(e => diasAte(e.marco) <= 7 && diasAte(e.fim) > 15 && !(e.s && e.s.atualizadoEm && e.s.atualizadoEm.slice(0, 10) >= somaDias(e.marco, -10))).map(e => pessoa(e.r.nome, `45 dias em ${dataBR(e.marco)}`)));
  add('media', 'headset', 'Em experiência sem nenhum acompanhamento', 'Enviados há mais de 15 dias e a supervisão ainda não registrou nada.', 'analise-sup',
    exp.filter(e => !e.s && diasAte(e.ini) < -15).map(e => pessoa(e.r.nome, `enviado em ${dataBR(e.ini)}`)));

  // ativos: treinamentos atrasados
  const ultimoPor = new Map();
  D.regs.forEach(r => { const k = chaveP(r.matricula, r.nome); const u = ultimoPor.get(k); if (!u || (r.data || '') > (u.data || '')) ultimoPor.set(k, r); });
  const atrasados = D.regs.filter(r => ((r.status === 'Pendente' || r.status === 'Reagendado') && r.data && r.data < hoje()) ||
    (r.proxima && r.proxima < hoje() && (ultimoPor.get(chaveP(r.matricula, r.nome)) || {}).id === r.id));
  add('media', 'rocket', 'Reciclagens e treinamentos atrasados', 'Pendentes, reagendados ou com a próxima ação vencida.', 'at-registros',
    atrasados.map(r => pessoa(r.nome, `${r.tema || r.tipo || 'treinamento'} · ${r.proxima && r.proxima < hoje() ? 'próxima ação ' + dataBR(r.proxima) : dataBR(r.data)}`)));

  // consultores ativos que nunca passaram por treinamento de ativos (90+ dias de casa)
  const treinados = new Set(D.regs.filter(r => r.presenca === 'Presente').map(r => chaveP(r.matricula, r.nome)));
  const nomesTrein = new Set(D.regs.filter(r => r.presenca === 'Presente').map(r => norm(r.nome)));
  const nunca = D.ativosBD.filter(c => c.status === 'Ativo' && c.admissao && c.admissao < desde(90) && !treinados.has(chaveP(c.mat, c.nome)) && !nomesTrein.has(norm(c.nome)));


  // consultores com supervisor que não está no quadro de gestão (BD ADM)
  const semSup = (D.quadro.itens || []).filter(c => c.supForaQuadro && c.status !== 'Desligado');

  // feedbacks e medidas: plano de ação e ciência
  add('alta', 'scale', 'Medidas disciplinares sem ciência do colaborador', 'Advertência ou suspensão aplicada sem registro de ciência. Registre a assinatura ou a recusa.', 'buscar',
    D.oc.filter(o => (o.tipo === 'Advertência' || o.tipo === 'Suspensão') && o.ciencia === 'Pendente').map(o => pessoa(o.nome, `${o.tipo} de ${dataBR(o.data)}`)));
  add('media', 'target', 'Reavaliações de feedback vencidas', 'O prazo do combinado passou: registre se foi cumprido.', 'buscar',
    D.oc.filter(o => o.reavaliarEm && o.reavaliarEm < hoje() && (!o.resultado || o.resultado === 'Em andamento')).map(o => pessoa(o.nome, `${o.tipo}${o.origem ? ' (' + o.origem + ')' : ''} de ${dataBR(o.data)} · reavaliar em ${dataBR(o.reavaliarEm)}`)));
  // checklist de admissão incompleto perto do fim do treinamento
  if (A.pendenciasAdmissao) { const pa = A.pendenciasAdmissao(); add('media', 'check', 'Checklist de admissão incompleto', 'Treinamento termina em até 5 dias (ou já terminou) e ainda faltam acessos ou documentos.', 'admissao', pa.map(x => pessoa(x.nome, `faltam: ${x.faltam.join(', ')}`))); }
  // ocorrências
  const oc30 = D.oc.filter(o => o.data >= desde(30));
  add('alta', 'scale', 'Medidas disciplinares nos últimos 30 dias', 'Acompanhar com o supervisor e alinhar plano de desenvolvimento.', 'buscar',
    oc30.filter(o => o.tipo === 'Suspensão' || o.tipo === 'Advertência').sort((a, b) => b.data.localeCompare(a.data)).map(o => pessoa(o.nome, `${o.tipo}${o.tipo === 'Suspensão' ? ` de ${o.dias} dia(s)` : o.forma ? ' ' + o.forma.toLowerCase() : ''} · ${dataBR(o.data)}`)));
  const porP = new Map(); oc30.forEach(o => { const k = chaveP(o.matricula, o.nome); const x = porP.get(k) || { nome: o.nome, f: 0, a: 0, at: 0 }; if (o.tipo === 'Falta') x.f++; if (o.tipo === 'Atraso') x.a++; if (o.tipo === 'Atestado') x.at++; porP.set(k, x); });
  add('media', 'alert', 'Absenteísmo alto (30 dias)', '3 ou mais faltas/atrasos, ou 2 ou mais atestados. Conversa de feedback recomendada.', 'buscar',
    [...porP.values()].filter(x => x.f + x.a >= 3 || x.at >= 2).map(x => pessoa(x.nome, [x.f && `${x.f} falta(s)`, x.a && `${x.a} atraso(s)`, x.at && `${x.at} atestado(s)`].filter(Boolean).join(' · '))));

  // base
  const idadeBD = D.quadro.importadoEm ? Math.floor((Date.now() - new Date(D.quadro.importadoEm)) / 864e5) : null;
  if (idadeBD === null) add('media', 'database', 'BD da operação não importado', 'Importe o BD GERAL em Colaboradores ativos → Base de dados.', 'at-base', [pessoa('BD GERAL', 'nunca importado')]);
  else if (idadeBD > BD_VELHO) add('baixa', 'database', 'BD da operação desatualizado', `Última importação há ${idadeBD} dias. Importe o BD do mês para atualizar ativos e desligados.`, 'at-base', [pessoa(D.quadro.arquivo || 'BD', `importado em ${dataBR(D.quadro.importadoEm.slice(0, 10))}`)]);
  const ordem = { alta: 0, media: 1, baixa: 2 };
  return P.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || b.itens.length - a.itens.length);
}

/* ---------------- indicadores ---------------- */
function indicadores(D) {
  const hc = D.ativosBD.length;
  const mes = hoje().slice(0, 7);
  const saidas = (D.quadro.saidas || []).map(s => ({ ...s, mes: (s.desligamento || s.detectadoEm || '').slice(0, 7) }));
  const deslMes = saidas.filter(s => s.mes === mes).length;
  const turnover = hc + deslMes ? deslMes / (hc + deslMes) : null;
  const oc30 = D.oc.filter(o => o.data >= desde(30));
  const diasPerdidos = oc30.filter(o => o.tipo === 'Falta').length + oc30.filter(o => o.tipo === 'Atestado').reduce((s, o) => s + (o.dias || 0), 0);
  const uteis = A.diasUteis ? A.diasUteis(desde(30), hoje()) : 22;
  const absente = hc && uteis ? diasPerdidos / (hc * uteis) : null;
  const meses = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
  const porMes = meses.map(m => ({ m, n: saidas.filter(s => s.mes === m).length }));
  return { hc, deslMes, turnover, absente, diasPerdidos, uteis, porMes, saidas };
}

const MOTIVO_TIPO = { 'Pedido de demissão': 'Voluntário', 'Abandono de emprego': 'Voluntário', 'Término do contrato de experiência': 'Involuntário', 'Dispensa sem justa causa': 'Involuntário', 'Dispensa por justa causa': 'Involuntário', 'Acordo entre as partes': 'Acordo', 'Transferência ou promoção interna': 'Movimentação', 'Outro': 'Outro' };
function saidasAnalise(D) {
  const s12 = (D.quadro.saidas || []).filter(s => (s.desligamento || s.detectadoEm || '') >= desde(365));
  const motivoDe = s => D.motivos[s.chave] || '';
  const porMotivo = {}; s12.forEach(s => { const m = motivoDe(s) || 'Sem motivo informado'; porMotivo[m] = (porMotivo[m] || 0) + 1; });
  const tipos = { Voluntário: 0, Involuntário: 0, Acordo: 0, Movimentação: 0, Outro: 0, 'Sem motivo': 0 };
  s12.forEach(s => { const m = motivoDe(s); tipos[m ? MOTIVO_TIPO[m] || 'Outro' : 'Sem motivo']++; });
  const faixa = s => { const a = s.admissao, d = s.desligamento || s.detectadoEm; if (!a || !d) return 'Sem data'; const m = (new Date(d) - new Date(a)) / (30.44 * 864e5); return m < 3 ? 'Até 3 meses' : m < 6 ? '3 a 6 meses' : m < 12 ? '6 a 12 meses' : 'Mais de 1 ano'; };
  const porFaixa = { 'Até 3 meses': 0, '3 a 6 meses': 0, '6 a 12 meses': 0, 'Mais de 1 ano': 0, 'Sem data': 0 }; s12.forEach(s => porFaixa[faixa(s)]++);
  return { total: s12.length, porMotivo, tipos, porFaixa };
}
// curva de retenção da formação: dos que começaram há pelo menos N dias, quantos seguiam na operação no dia N
function retencao(D) {
  const saidas = new Map((D.quadro.saidas || []).map(s => [norm(s.nome), s.desligamento || s.detectadoEm]));
  const lin = D.form.filter(r => r.dataInicio).map(r => {
    let saiu = saidas.get(norm(r.nome)) || '';
    if (!saiu && (r.status === 'Reprovado' || r.status === 'Desistente')) saiu = r.dataFim || r.dataInicio;
    const s = D.sup.get(r.id); if (!saiu && s && s.concluido && s.resultadoFinal !== 'Efetivado') saiu = s.concluidoEm || '';
    return { r, ini: r.dataInicio, saiu };
  });
  const marcos = [30, 60, 90, 180];
  const taxa = (xs, n) => { const el = xs.filter(x => x.ini <= desde(n)); if (!el.length) return null; const ok = el.filter(x => !x.saiu || (new Date(x.saiu) - new Date(x.ini)) / 864e5 > n); return { pct: ok.length / el.length, n: el.length }; };
  const turmas = {}; lin.forEach(x => (turmas[x.r.turma || 'Sem turma'] = turmas[x.r.turma || 'Sem turma'] || []).push(x));
  return { marcos, geral: marcos.map(n => taxa(lin, n)), turmas: Object.entries(turmas).map(([t, xs]) => ({ t, ini: xs.map(x => x.ini).sort()[0], cad: xs.length, v: marcos.map(n => taxa(xs, n)) })).sort((a, b) => (b.ini || '').localeCompare(a.ini || '')).slice(0, 10) };
}
function funil(D) {
  const f = D.form;
  const enviados = f.filter(r => r.enviadoSupEm || r.etapa === 'supervisao' || (r.etapa === 'concluido' && D.sup.has(r.id)));
  const efetivados = f.filter(r => r.status === 'Aprovado' && D.sup.has(r.id) && D.sup.get(r.id).concluido);
  const perdasTrein = f.filter(r => r.status === 'Reprovado' || (r.status === 'Desistente' && !D.sup.has(r.id)));
  const perdasExp = f.filter(r => D.sup.has(r.id) && D.sup.get(r.id).concluido && r.status !== 'Aprovado');
  const turmas = new Map();
  f.forEach(r => { const t = r.turma || 'Sem turma'; const x = turmas.get(t) || { turma: t, ini: r.dataInicio || '', cad: 0, trein: 0, exp: 0, efet: 0, perda: 0 };
    x.cad++; if (r.etapa === 'treinamento') x.trein++; if (r.etapa === 'supervisao') x.exp++;
    if (efetivados.includes(r)) x.efet++; if (perdasTrein.includes(r) || perdasExp.includes(r)) x.perda++;
    if (r.dataInicio && (!x.ini || r.dataInicio < x.ini)) x.ini = r.dataInicio; turmas.set(t, x); });
  return { cad: f.length, emTrein: f.filter(r => r.etapa === 'treinamento').length, enviados: enviados.length, emExp: f.filter(r => r.etapa === 'supervisao').length, efetivados: efetivados.length, perdasTrein: perdasTrein.length, perdasExp: perdasExp.length, turmas: [...turmas.values()].sort((a, b) => (b.ini || '').localeCompare(a.ini || '')) };
}

function porSupervisor(D, I) {
  const m = new Map(), FORA = 'Supervisor fora do BD ADM (planilha desatualizada)';
  const atuais = (A.supAtuais && A.supAtuais()) || new Set(D.ativosBD.map(c => norm(c.supervisor)).filter(Boolean));
  const g = nome => { let k = (nome || 'Sem supervisor').toUpperCase(); if (nome && atuais.size && !atuais.has(norm(nome))) k = FORA; if (!m.has(k)) m.set(k, { sup: k, hc: 0, ferias: 0, desl90: 0, faltas: 0, atrasos: 0, atest: 0, diasAt: 0, medidas: 0, feedbacks: 0, trein90: 0 }); return m.get(k); };
  const supDe = new Map(); D.ativosBD.forEach(c => { supDe.set(chaveP(c.mat, c.nome), c.supervisor); supDe.set('n:' + norm(c.nome), c.supervisor); });
  D.ativosBD.forEach(c => { const x = g(c.supervisor); x.hc++; if (c.status !== 'Ativo') x.ferias++; });
  I.saidas.filter(s => (s.desligamento || s.detectadoEm || '') >= desde(90)).forEach(s => g(s.supervisor).desl90++);
  D.oc.filter(o => o.data >= desde(30)).forEach(o => { const x = g(o.supervisor || supDe.get(chaveP(o.matricula, o.nome)) || supDe.get('n:' + norm(o.nome)));
    if (o.tipo === 'Falta') x.faltas++; else if (o.tipo === 'Atraso') x.atrasos++; else if (o.tipo === 'Atestado') { x.atest++; x.diasAt += o.dias || 0; } else if (o.tipo === 'Feedback') x.feedbacks++; else x.medidas++; });
  D.regs.filter(r => r.presenca === 'Presente' && (r.data || '') >= desde(90)).forEach(r => { const s = r.supervisor || supDe.get(chaveP(r.matricula, r.nome)); if (s) g(s).trein90++; });
  return [...m.values()].filter(x => x.hc || x.desl90 || x.faltas || x.medidas).sort((a, b) => (a.sup === FORA) - (b.sup === FORA) || b.hc - a.hc || cmpTxt(a.sup, b.sup)).map(x => ({ ...x, fora: x.sup === FORA }));
}

/* ---------------- tela ---------------- */
function render() {
  const D = dados(), P = pendencias(D), I = indicadores(D), Fu = funil(D), S = porSupervisor(D, I), SA = saidasAnalise(D), RT = retencao(D);
  const total = P.reduce((s, p) => s + p.itens.length, 0);
  const urg = P.filter(p => p.nivel === 'alta').reduce((s, p) => s + p.itens.length, 0), aten = P.filter(p => p.nivel === 'media').reduce((s, p) => s + p.itens.length, 0);
  contador(urg + aten);
  const kp = (t, v, s, cor, ic) => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const maxM = Math.max(1, ...I.porMes.map(x => x.n));
  const etapas = [['Cadastrados', Fu.cad, '#0f3a6b'], ['Enviados para supervisão', Fu.enviados, '#2a78d6'], ['Efetivados', Fu.efetivados, '#1baf7a']];
  const nivelTxt = { alta: 'Urgente', media: 'Atenção', baixa: 'Planejar' };
  const u = (window.NUVEM && NUVEM.usuario && NUVEM.usuario()) || { nome: 'Emerson', perfil: 'Administrador' };
  const perfil = u.perfil, eq = window.NUVEM && NUVEM.equipe && NUVEM.equipe();
  const subPerfil = perfil === 'Supervisão' ? (eq && eq.supervisor ? `Sua equipe: <b>${esc(eq.supervisor)}</b> · ${I.hc} consultor(es)` : '<span class="tag alerta">Seu nome não foi encontrado como supervisor no BD ADM. Peça ao administrador para conferir seu nome completo.</span>')
    : perfil === 'Treinamento' ? 'Formação inicial, reciclagens e ocorrências' : perfil === 'Consulta' ? 'Indicadores da operação' : 'Visão geral de toda a operação';
  const atalhos = ATALHOS.filter(a => a.perfis.includes(perfil) && podeVer(a.aba));
  raiz.innerHTML = `
  <div class="cab-pagina pn-cab">
    <div><h1>Olá, ${esc(String(u.nome || u.usuario || '').split(' ')[0])}</h1><p class="sub">${subPerfil} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</p></div>
    <div class="cab-acoes"><span class="tag neutro pn-perfil">${G.ic('user', '')}${esc(perfil)}</span><button type="button" class="btn btn-sec" id="pnRel" data-perm="imprimir">${G.ic('print')}Relatório do mês</button><button type="button" class="btn btn-sec" id="pnAtualizar">${G.ic('clock')}Atualizar</button></div>
  </div>
  ${atalhos.length ? `<div class="pn-atalhos">${atalhos.map(a => `<button type="button" class="pn-atalho" data-ir="${a.aba}"${a.acao ? ` data-acao="${a.acao}"` : ''}><span class="pn-at-ic">${G.ic(a.ic, '')}</span><span><b>${a.t}</b><small>${a.d}</small></span></button>`).join('')}</div>` : ''}
  <div class="kpis pn-kpis">
    ${kp('Headcount', I.hc, D.quadro.importadoEm ? `${D.ativosBD.filter(c => /^ativ/.test(norm(c.status))).length} em atividade · ${D.ativosBD.filter(c => !/^ativ/.test(norm(c.status))).length} férias/afastados` : 'importe o BD', '#0f3a6b', 'users')}
    ${kp('Em formação', Fu.emTrein, 'turmas em treinamento', '#2a78d6', 'exam')}
    ${kp('Em experiência', Fu.emExp, 'acompanhados pela supervisão', '#6250d6', 'headset')}
    ${kp('Turnover do mês', I.turnover === null ? '—' : fmt(I.turnover * 100, 1) + '%', `${I.deslMes} desligamento(s) em ${mesTxt(hoje().slice(0, 7))}`, '#d03b3b', 'down')}
    ${kp('Absenteísmo 30 dias', I.absente === null ? '—' : fmt(I.absente * 100, 2) + '%', `${I.diasPerdidos} dia(s) perdidos · faltas e atestados lançados`, '#eda100', 'alert')}
    ${kp('Pendências', urg + aten, `${urg} urgente(s) · ${aten} de atenção${total - urg - aten ? ` · ${total - urg - aten} para planejar` : ''}`, urg + aten ? '#ec835a' : '#1baf7a', 'flag')}
  </div>

  ${perfil === 'Consulta' ? '' : `<article class="cartao">
    <header class="cab-card"><span class="icb">${G.ic('flag')}</span><div><h2>Pendências</h2><p>Em ordem de prioridade. Clique para ver os nomes e abra a guia certa para resolver.</p></div></header>
    ${P.length ? `<div class="pn-pend">${P.map((p, i) => `<details class="pn-item pn-${p.nivel}"${i < 2 && p.nivel === 'alta' ? ' open' : ''}>
      <summary><span class="pn-ic">${G.ic(p.ic, '')}</span><span class="pn-tx"><b>${esc(p.titulo)}</b><small>${esc(p.desc)}</small></span><span class="pn-nivel">${nivelTxt[p.nivel]}</span><b class="pn-n">${p.itens.length}</b></summary>
      <ul>${p.itens.slice(0, 60).map(x => `<li><b>${esc(x.nome)}</b><small>${esc(x.info)}</small></li>`).join('')}${p.itens.length > 60 ? `<li class="dica">e mais ${p.itens.length - 60}…</li>` : ''}</ul>
      ${podeVer(p.aba) ? `<button type="button" class="btn btn-sec btn-mini" data-ir="${p.aba}">${G.ic('arrow-right', '')}Abrir ${esc(NOME_ABA[p.aba] || '')}</button>` : ''}
    </details>`).join('')}</div>` : `<div class="g-vazio">${G.ic('check', '')}<span>Nenhuma pendência. Operação em dia.</span></div>`}
  </article>`}

  <div class="pn-grade">
    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Funil da formação</h2><p>Do cadastro à efetivação depois da experiência</p></div></header>
      <div class="pn-funil">${etapas.map(([t, v, c], i) => `<div class="pn-et" style="--c:${c};--w:${Fu.cad ? Math.max(18, Math.round(v / Fu.cad * 100)) : 18}%"><span><b>${v}</b>${esc(t)}</span>${i ? `<em>${Fu.cad ? pct(v / Fu.cad) : '—'} dos cadastrados</em>` : ''}</div>`).join('')}</div>
      <div class="an-chips pn-perdas"><span><small>Reprovados/desistentes no treinamento</small><b>${Fu.perdasTrein}</b></span><span><small>Desligados na experiência</small><b>${Fu.perdasExp}</b></span><span><small>Retenção na experiência (efetivados ÷ concluídos)</small><b>${Fu.efetivados + Fu.perdasExp ? pct(Fu.efetivados / (Fu.efetivados + Fu.perdasExp)) : '—'}</b></span><span><small>Ainda em experiência</small><b>${Fu.emExp}</b></span></div>
    </article>
    <article class="cartao">
      <header class="cab-card"><span class="icb">${G.ic('down')}</span><div><h2>Desligamentos por mês</h2><p>Histórico guardado a cada importação do BD</p></div></header>
      ${I.saidas.length ? `<div class="sai-meses pn-meses">${I.porMes.map(x => `<div class="sai-mes"><span style="height:${Math.round(x.n / maxM * 100)}%"><b>${x.n}</b></span><small>${mesTxt(x.m)}</small></div>`).join('')}</div>
        <p class="dica">Turnover do mês = desligados no mês ÷ (ativos + desligados no mês).</p>` : '<p class="dica">Aparece depois que o BD for importado com a versão nova do site.</p>'}
    </article>
  </div>

  ${perfil === 'Consulta' || perfil === 'Supervisão' ? '' : `<div class="pn-grade">
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('down')}</span><div><h2>Por que estão saindo</h2><p>Desligamentos dos últimos 12 meses (${SA.total}) · motivo informado em Base de dados (BD) → Desligados e saídas</p></div></header>
      ${SA.total ? `<div class="an-chips">${Object.entries(SA.tipos).filter(([, v]) => v).map(([k, v]) => `<span><small>${k}</small><b>${v} <em class="dica">${pct(v / SA.total)}</em></b></span>`).join('')}</div>
      <h3 class="sub-titulo">Motivos</h3><div class="mon-crit">${Object.entries(SA.porMotivo).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<div class="mon-c"><span>${esc(m)}</span><i><b style="width:${Math.round(v / SA.total * 100)}%;--c:${/Pedido|Abandono/.test(m) ? '#eb6834' : /Sem motivo/.test(m) ? '#9aa8b8' : '#2a78d6'}"></b></i><em>${v}</em></div>`).join('')}</div>
      <h3 class="sub-titulo">Tempo de casa na saída</h3><div class="mon-crit">${Object.entries(SA.porFaixa).filter(([, v]) => v).map(([m, v]) => `<div class="mon-c"><span>${m}</span><i><b style="width:${Math.round(v / SA.total * 100)}%;--c:#6250d6"></b></i><em>${v}</em></div>`).join('')}</div>` : '<p class="dica">Sem desligamentos registrados nos últimos 12 meses.</p>'}
    </article>
    <article class="cartao"><header class="cab-card"><span class="icb">${G.ic('target')}</span><div><h2>Retenção da formação</h2><p>Dos que começaram o treinamento, quantos seguiam na operação depois de 30, 60, 90 e 180 dias</p></div></header>
      <div class="ret-marcos">${RT.marcos.map((n, i) => `<div><b>${RT.geral[i] ? pct(RT.geral[i].pct) : '—'}</b><small>${n} dias${RT.geral[i] ? ` · ${RT.geral[i].n} pessoa(s)` : ''}</small></div>`).join('')}</div>
      ${RT.turmas.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Turma</th><th>Início</th><th class="dir">Cadastrados</th>${RT.marcos.map(n => `<th class="dir">${n}d</th>`).join('')}</tr></thead><tbody>${RT.turmas.map(t => `<tr><td><b>${esc(t.t)}</b></td><td>${dataBR(t.ini)}</td><td class="dir">${t.cad}</td>${t.v.map(x => `<td class="dir">${x ? `<span class="tag ${x.pct >= .8 ? 'bom' : x.pct >= .6 ? 'alerta' : 'ruim'}">${pct(x.pct)}</span>` : '<span class="dica">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="dica">Sem turmas com data de início.</p>'}
    </article>
  </div>`}

  <article class="cartao">
    <header class="cab-card"><span class="icb">${G.ic('users')}</span><div><h2>Visão por supervisor</h2><p>Equipe ativa no BD, desligamentos (90 dias), ocorrências (30 dias) e treinamentos (90 dias)</p></div></header>
    ${S.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Supervisor</th><th class="dir">Equipe</th><th class="dir">Férias/afast.</th><th class="dir">Desligados 90d</th><th class="dir">Faltas</th><th class="dir">Atrasos</th><th class="dir">Atestados (dias)</th><th class="dir">Advert./susp.</th><th class="dir">Feedbacks</th><th class="dir">Treinados 90d</th></tr></thead><tbody>
      ${S.map(x => `<tr${x.fora ? ' class="pn-fora"' : ''}><td>${x.fora ? `<span class="dica">${esc(x.sup)}</span>` : `<b>${esc(x.sup)}</b>`}</td><td class="dir">${x.hc}</td><td class="dir">${z(x.ferias)}</td><td class="dir">${x.desl90 ? `<span class="tag ruim">${x.desl90}</span>` : z(0)}</td><td class="dir">${z(x.faltas)}</td><td class="dir">${z(x.atrasos)}</td><td class="dir">${x.atest ? `${x.atest} (${x.diasAt})` : z(0)}</td><td class="dir">${x.medidas ? `<span class="tag alerta">${x.medidas}</span>` : z(0)}</td><td class="dir">${z(x.feedbacks)}</td><td class="dir">${x.hc ? `${x.trein90} <small class="dica">${pct(Math.min(1, x.trein90 / x.hc))}</small>` : z(x.trein90)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Importe o BD da operação para ver as equipes.</p>'}
  </article>

  ${perfil === 'Supervisão' ? '' : `<article class="cartao">
    <header class="cab-card"><span class="icb">${G.ic('exam')}</span><div><h2>Turmas</h2><p>Situação de cada turma de formação</p></div></header>
    ${Fu.turmas.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Turma</th><th>Início</th><th class="dir">Cadastrados</th><th class="dir">Em treinamento</th><th class="dir">Em experiência</th><th class="dir">Efetivados</th><th class="dir">Perdas</th><th class="dir">Retenção</th></tr></thead><tbody>
      ${Fu.turmas.slice(0, 40).map(t => `<tr><td><b>${esc(t.turma)}</b></td><td>${dataBR(t.ini) || '—'}</td><td class="dir">${t.cad}</td><td class="dir">${z(t.trein)}</td><td class="dir">${z(t.exp)}</td><td class="dir">${z(t.efet)}</td><td class="dir">${t.perda ? `<span class="tag ruim">${t.perda}</span>` : z(0)}</td><td class="dir">${t.efet + t.perda ? pct(t.efet / (t.efet + t.perda)) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Nenhuma turma cadastrada.</p>'}
  </article>`}`;
  G.icones(raiz);
  document.getElementById('pnAtualizar').onclick = render;
  document.getElementById('pnRel').onclick = () => A.relatorioMensal && A.relatorioMensal();
  raiz.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => A.abrirAba(b.dataset.ir));
}
const z = v => v ? v : '<span class="zero">0</span>';
// atalhos de cada perfil (só aparecem se a guia estiver liberada)
const ATALHOS = [
  { t: 'Novo cadastro', d: 'Treinando da turma', ic: 'plus', aba: 'cadastro', perfis: ['Treinamento', 'Administrador'] },
  { t: 'Análise treinamento', d: 'Apontamentos e envio', ic: 'exam', aba: 'analise-trein', perfis: ['Treinamento', 'Administrador'] },
  { t: 'Minha equipe', d: 'Ficha de cada consultor', ic: 'users', aba: 'buscar', perfis: ['Supervisão'] },
  { t: 'Análise supervisão', d: 'Período de experiência', ic: 'headset', aba: 'analise-sup', perfis: ['Supervisão', 'Administrador'] },
  { t: 'Registrar treinamento', d: 'Reciclagem ou alinhamento', ic: 'rocket', aba: 'at-cadastro', perfis: ['Treinamento', 'Supervisão', 'Administrador'] },
  { t: 'Lançar ocorrência', d: 'Atestado, falta, feedback…', ic: 'flag', aba: 'buscar', perfis: ['Treinamento', 'Administrador'] },
  { t: 'Buscar consultor', d: 'Perfil e ocorrências', ic: 'search', aba: 'buscar', perfis: ['Gerência'] },
  { t: 'Dashboard formação', d: 'Indicadores das turmas', ic: 'chart', aba: 'dashboard', perfis: ['Gerência', 'Consulta'] },
  { t: 'Dashboard ativos', d: 'Reciclagens e alinhamentos', ic: 'chart', aba: 'at-dashboard', perfis: ['Gerência', 'Consulta', 'Supervisão'] },
  { t: 'Importar BD', d: 'Atualizar o quadro do mês', ic: 'database', aba: 'at-base', perfis: ['Administrador'] }
];
function contador(n) { const c = document.getElementById('contPend'); if (c) { c.textContent = n; c.hidden = !n; c.title = n + ' pendência(s) urgentes ou de atenção'; } }
const contarPend = () => { try { contador(pendencias(dados()).filter(p => p.nivel !== 'baixa').reduce((s, p) => s + p.itens.length, 0)); } catch (e) { /* contador é opcional */ } };
const NOME_ABA = { 'analise-trein': 'Análise treinamento', 'analise-sup': 'Análise supervisão', 'at-registros': 'Registros', 'at-base': 'Base de dados', buscar: 'Buscar consultor' };

document.addEventListener('aba-aberta', e => { if (e.detail === 'painel') render(); });
window.addEventListener('dados-atualizados', () => { if (document.getElementById('aba-painel').classList.contains('ativo')) render(); else contarPend(); });
if (document.getElementById('aba-painel').classList.contains('ativo')) render();
else contarPend();
})();
