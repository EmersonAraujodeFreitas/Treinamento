/* =========================================================
   Inovação Casa · Treinamento — fluxo de avaliação do treinando
   Cadastro (dados básicos) → Análise treinamento (período de treinamento,
   confirma o envio) → Análise supervisão (até o fim da experiência).
   As perguntas comportamentais são as mesmas nos dois lados para comparar.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, media, fmt, pct, esc, uid, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const KEY = 'inovacao_treinamento_analises_v1';
let analises = ler(KEY, []);
const salvar = () => gravar(KEY, analises);

const TIPOS = {
  treinamento: { titulo: 'Análise treinamento', sub: 'Acompanhamento do período de treinamento. Ao final, confirme o envio para a supervisão.', cor: '#2a78d6', icone: 'exam' },
  supervisao: { titulo: 'Análise supervisão', sub: 'Acompanhamento do colaborador na operação até o fim do período de experiência.', cor: '#eb6834', icone: 'headset' }
};
const CRITERIOS = [['comunicacao', 'Comunicação'], ['postura', 'Postura e ética'], ['pontualidade', 'Pontualidade'], ['engajamento', 'Engajamento'], ['aprendizado', 'Facilidade de aprendizado'], ['produtividade', 'Produtividade / ritmo'], ['script', 'Aderência ao script e processos']];
const SIT_T = ['Aprovado', 'Aprovado com ressalvas', 'Reprovado', 'Desistente'];
const SIT_S = ['Aprovado', 'Aprovado com ressalvas', 'Em desenvolvimento', 'Reprovado'];
const RESULTADOS = ['Efetivado', 'Desligado', 'Pediu desligamento'];
const INDICACOES = ['Captação', 'Permanência', 'Reciclagem', 'Não indicado'];
const POTENCIAL = ['Alto', 'Médio', 'Baixo'];
const EXPERIENCIA_DIAS = 90;
const sinal = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
const somaDias = (iso, d) => { const x = new Date(iso + 'T12:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const usuarioAtual = () => { const u = window.NUVEM && NUVEM.usuario && NUVEM.usuario(); return u ? (u.nome || u.usuario) : ''; };
const anDe = (tipo, id) => analises.find(a => a.tipo === tipo && a.treinandoId === id);
const mapaSup = () => { const m = new Map(); analises.forEach(a => { if (a.tipo === 'supervisao') m.set(a.treinandoId, a); }); return m; };
const vista = () => { const m = mapaSup(); return A.formacao().map(r => A.efetivo(r, m)); };
const TAG_ST = { 'Em treinamento': 'neutro', 'Em experiência': 'roxo', Aprovado: 'bom', Reprovado: 'ruim', Desistente: 'alerta', Desligado: 'ruim' };
const tagSt = s => `<span class="tag ${TAG_ST[s] || 'neutro'}">${esc(s || 'Em treinamento')}</span>`;
function prazo(fim) {
  if (!fim) return '';
  const d = diasEntre(hoje(), fim);
  return d > 0 ? `faltam ${d} dia${d > 1 ? 's' : ''}` : d === 0 ? 'termina hoje' : `venceu há ${-d} dia${d < -1 ? 's' : ''}`;
}

/* ---------------- nota da análise ---------------- */
// 70% notas (provas ou qualidade) + 30% avaliação dos critérios (1 a 5 vira 0 a 10)
function notaAnalise(a) {
  const notas = (a.notas || []).map(n => n.nota).filter(v => v !== null && v !== undefined && isFinite(v));
  const mn = notas.length ? media(notas.map(v => a.tipo === 'supervisao' ? v / 10 : (v > 10 ? v / 10 : v))) : null;
  const mc = media(Object.values(a.criterios || {}).filter(Boolean));
  const partes = [[mn, .7], [mc === null ? null : mc * 2, .3]].filter(p => p[0] !== null);
  if (!partes.length) return null;
  const pesos = partes.reduce((s, p) => s + p[1], 0);
  return Math.round(partes.reduce((s, p) => s + p[0] * p[1], 0) / pesos * 10) / 10;
}

/* =========================================================
   FORMULÁRIO (montado para cada tipo)
   ========================================================= */
function montar(raiz) {
  const tipo = raiz.dataset.tipo, T = TIPOS[tipo], TR = tipo === 'treinamento';
  const p = 'an' + (TR ? 'T' : 'S'), id = x => p + x;
  const sel = (x, lista) => `<select id="${id(x)}"><option value="">Selecione</option>${lista.map(v => `<option>${v}</option>`).join('')}</select>`;
  let passo = 0; const n = () => ++passo;

  raiz.innerHTML = `
  <div class="cab-pagina">
    <div><h1>${T.titulo}</h1><p class="sub">${T.sub}</p></div>
    <div class="cab-acoes"><span id="${id('Modo')}" class="selo selo-aviso" hidden>${G.ic('edit', '')}<span id="${id('ModoTxt')}">Editando</span></span>
      <button type="button" class="btn btn-sec" id="${id('Nova')}">${G.ic('plus')}Limpar tela</button></div>
  </div>
  <ol class="fluxo">
    <li class="${TR ? '' : 'feito'}"><b>1</b><span>Cadastro<small>dados básicos</small></span></li>
    <li class="${TR ? 'atual' : 'feito'}"><b>2</b><span>Análise treinamento<small>período de treinamento</small></span></li>
    <li class="${TR ? '' : 'atual'}"><b>3</b><span>Análise supervisão<small>até o fim da experiência</small></span></li>
  </ol>
  <div class="an-grade">
    <form class="an-form" id="${id('Form')}" novalidate autocomplete="off">
      <input type="hidden" id="${id('Id')}">
      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('user')}</span>${TR ? 'Treinando' : 'Colaborador'}<span class="passo">${n()}</span></legend>
        <div class="campo"><span>Nome <i class="obr">*</i></span>
          <div class="auto" id="${id('Auto')}"><input id="${id('Nome')}" placeholder="${TR ? 'Digite para buscar nos cadastros de formação…' : 'Digite para buscar entre os enviados pelo treinamento…'}"><ul class="auto-lista" hidden></ul></div>
          <small class="dica">${TR ? 'Ou escolha na lista “Em treinamento” ao lado.' : 'Só aparecem colaboradores que o treinamento já enviou para a supervisão.'}</small></div>
        <div class="an-resumo" id="${id('Resumo')}"></div>
      </fieldset>

      <div id="${id('Corpo')}" class="an-corpo" hidden>
      ${TR ? `
      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('medical')}</span>Frequência e atestados<span class="passo">${n()}</span></legend>
        <div class="grade g4">
          <div class="campo"><span>Apresentou atestado? <i class="obr">*</i></span>
            <div class="seg" id="${id('Atestado')}" data-valor=""><button type="button" data-v="Sim">Sim</button><button type="button" data-v="Não">Não</button></div></div>
          <label class="campo"><span>Faltas (dias)</span><input type="number" id="${id('Faltas')}" min="0" step="1" value="0"></label>
          <label class="campo"><span>Atrasos</span><input type="number" id="${id('Atrasos')}" min="0" step="1" value="0"></label>
          <label class="campo"><span>Frequência</span><input id="${id('Freq')}" readonly tabindex="-1" class="calc" placeholder="—"></label>
        </div>
        <div id="${id('BlocoAt')}" class="sub-bloco" hidden>
          <div class="sub-cab"><b class="com-ic">${G.ic('calendar')}Atestados apresentados</b><button type="button" class="btn btn-link" id="${id('AddAt')}">${G.ic('plus')}adicionar atestado</button></div>
          <div id="${id('Ats')}" class="linhas"></div>
        </div>
      </fieldset>` : `
      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('calendar')}</span>Período de experiência<span class="passo">${n()}</span></legend>
        <div class="grade g4">
          <label class="campo"><span>Início na operação <i class="obr">*</i></span><input type="date" id="${id('ExpIni')}"></label>
          <label class="campo"><span>Fim previsto da experiência <i class="obr">*</i></span><input type="date" id="${id('ExpFim')}"></label>
          <label class="campo c2"><span>Situação do prazo</span><input id="${id('ExpPrazo')}" readonly tabindex="-1" class="calc" placeholder="—"></label>
        </div>
        <small class="dica">O fim previsto é preenchido com ${EXPERIENCIA_DIAS} dias após o início; ajuste se o contrato for diferente.</small>
      </fieldset>`}

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic(T.icone)}</span>${TR ? 'Provas aplicadas nos dias de treinamento' : 'Notas da qualidade (monitorias)'}<span class="passo">${n()}</span><small>${TR ? 'nota de 0 a 10' : 'em %, ex.: 87,50%'}</small></legend>
        <div class="sub-bloco"><div class="sub-cab"><b class="com-ic">${G.ic(T.icone)}${TR ? 'Provas' : 'Monitorias'}</b><button type="button" class="btn btn-link" id="${id('AddNota')}">${G.ic('plus')}adicionar</button></div>
          <div class="linhas" id="${id('Notas')}"></div></div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('star')}</span>Avaliação comportamental<span class="passo">${n()}</span><small>1 = precisa melhorar · 5 = excelente</small></legend>
        <div class="grade g4 an-criterios" id="${id('Criterios')}">
          ${CRITERIOS.map(([k, t]) => `<div class="estrelas"><span>${t}</span><div class="escala" data-k="${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div>`).join('')}
        </div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('briefcase')}</span>Perfil percebido<span class="passo">${n()}</span></legend>
        <div class="grade g4">
          <div class="campo c2"><span>Perfil do consultor <i class="obr">*</i></span>
            <div class="seg" id="${id('Perfil')}" data-valor=""><button type="button" data-v="Vendas">Perfil de vendas</button><button type="button" data-v="Não vendas">Perfil de não vendas</button></div></div>
          <label class="campo"><span>Indicado para</span>${sel('Indicacao', INDICACOES)}</label>
          <label class="campo"><span>Potencial de liderança</span>${sel('Potencial', POTENCIAL)}</label>
        </div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('edit')}</span>${TR ? 'Apontamentos do período de treinamento' : 'Apontamentos do acompanhamento'}<span class="passo">${n()}</span></legend>
        <div class="sub-bloco"><div class="sub-cab"><b class="com-ic">${G.ic('clipboard')}Registro dia a dia</b><button type="button" class="btn btn-link" id="${id('AddAp')}">${G.ic('plus')}adicionar apontamento</button></div>
          <div class="linhas" id="${id('Aps')}"></div></div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('flag')}</span>${TR ? 'Parecer do treinamento' : 'Parecer da supervisão'}<span class="passo">${n()}</span></legend>
        <div class="grade g4">
          <label class="campo"><span>${TR ? 'Resultado do treinamento' : 'Situação recomendada'} <i class="obr">*</i></span>${sel('Situacao', TR ? SIT_T : SIT_S)}</label>
          <label class="campo"><span>Data da análise</span><input type="date" id="${id('Data')}"></label>
          <label class="campo c2"><span>Avaliador(a)</span><input id="${id('Avaliador')}" placeholder="Quem está avaliando"></label>
          <label class="campo c2"><span>Pontos fortes</span><textarea id="${id('Fortes')}" rows="2" placeholder="O que faz bem"></textarea></label>
          <label class="campo c2"><span>Pontos de atenção</span><textarea id="${id('Atencao')}" rows="2" placeholder="O que precisa desenvolver"></textarea></label>
          ${TR ? '' : `<label class="campo c2"><span>Resultado do período de experiência</span>${sel('Resultado', RESULTADOS)}<small class="dica">Preencha ao concluir o período de experiência.</small></label>`}
        </div>
        <div class="resumo-notas an-resumo-notas">
          <div class="rn"><span>${TR ? 'Média das provas' : 'Média da qualidade'}</span><b id="${id('MediaNotas')}">—</b></div>
          <div class="rn"><span>Comportamental</span><b id="${id('MediaCrit')}">—</b></div>
          <div class="rn"><span>Nota da análise <small class="auto-tag">automática</small></span><b id="${id('Nota')}">—</b><small class="dica">70% ${TR ? 'provas' : 'qualidade'} + 30% comportamental</small></div>
          <div class="rn rn-final"><span>${G.ic('award')}Nota final <small class="auto-tag">automática</small></span><b id="${id('NotaFinal')}">—</b><small class="dica" id="${id('NotaFinalDica')}">60% provas + 30% qualidade + 10% comportamental do treinamento</small></div>
        </div>
      </fieldset>

      <div class="barra-acoes">
        <div id="${id('Msg')}" class="msg" role="status"></div>
        <button type="submit" class="btn btn-sec">${G.ic('check')}<span>${TR ? 'Salvar apontamentos' : 'Salvar acompanhamento'}</span></button>
        <button type="button" class="btn btn-pri" id="${id('Enviar')}">${G.ic(TR ? 'send' : 'flag')}<span id="${id('EnviarTxt')}">${TR ? 'Confirmar envio para supervisão' : 'Concluir período de experiência'}</span></button>
      </div>
      </div>
    </form>
    <aside class="an-lado">
      <div class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('clock')}</span><div><h2>${TR ? 'Em treinamento' : 'Em período de experiência'}</h2><p>${TR ? 'Cadastros aguardando a análise do treinamento' : 'Enviados pelo treinamento'}</p></div></header>
        <select id="${id('FiltroTurma')}" class="an-filtro"><option value="">Todas as turmas</option></select>
        <ul class="an-lista" id="${id('Pendentes')}"></ul>
      </div>
      <div class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>${TR ? 'Enviados e encerrados' : 'Experiência concluída'}</h2><p>Clique para consultar ou editar</p></div></header>
        <input type="search" id="${id('Busca')}" class="an-filtro" placeholder="Buscar">
        <ul class="an-lista" id="${id('Feitos')}"></ul>
      </div>
    </aside>
  </div>`;

  const F = x => document.getElementById(id(x));
  let treinando = null; // registro bruto do cadastro de formação

  /* ---------- escolher o treinando ---------- */
  const elegiveis = () => TR ? A.formacao() : vista().filter(r => r.etapa !== 'treinamento' && (r.enviadoSupEm || anDe('supervisao', r.id)));
  A.autocomplete(F('Auto'), {
    fonte: () => elegiveis().map(r => r.nome).sort(cmpTxt),
    aoEscolher: (v, novo, blur) => {
      const r = elegiveis().find(x => norm(x.nome) === norm(v));
      if (r) abrir(A.formacao().find(x => x.id === r.id) || r); else if (!blur || !v) { limpar(); }
    }
  });
  function abrir(r) {
    limpar(); treinando = r; F('Nome').value = r.nome;
    const a = anDe(tipo, r.id);
    if (a) preencher(a); else padroes();
    F('Corpo').hidden = false; resumo(); estadoBotoes(); calcular();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function resumo() {
    const el = F('Resumo'), r = treinando;
    if (!r) { el.innerHTML = ''; return; }
    const v = A.efetivo(r, mapaSup());
    const chips = [['Turma', r.turma], ['IES', r.instituicao], ['Operação', r.operacao], ['Treinamento', [dataBR(r.dataInicio), dataBR(r.dataFim)].filter(Boolean).join(' a ')], ['Bairro', [r.bairro, r.cidade].filter(Boolean).join(', ')], ['Situação', null]];
    let html = `<div class="an-chips">${chips.filter(x => x[1] !== '' && x[1] !== undefined).map(([t, val]) => `<span><small>${t}</small><b>${t === 'Situação' ? tagSt(v.status) : esc(val)}</b></span>`).join('')}</div>`;
    if (!TR) {
      const t = anDe('treinamento', r.id) || {};
      const pt = r.parecerTrein || {};
      const aps = (r.apontamentosTrein || t.apontamentos || []);
      const mp = media((r.provas || []).map(x => x.nota > 10 ? x.nota / 10 : x.nota));
      const mc = media(Object.values(r.comportamental || {}));
      html += `<details class="do-trein" open><summary>${G.ic('exam', '')}O que o treinamento registrou ${r.enviadoSupEm ? `<small>enviado em ${dataBR(r.enviadoSupEm)}</small>` : ''}</summary>
        <div class="an-chips">${[['Média das provas', fmt(mp)], ['Comportamental', mc === null ? '—' : fmt(mc) + ' / 5'], ['Faltas', r.faltas ?? 0], ['Atestado', r.atestado || '—'], ['Perfil', r.perfil || t.perfil || '—'], ['Indicado para', r.indicacao || t.indicacao || '—'], ['Resultado', pt.situacao || t.situacao || '—']]
          .map(([k, val]) => `<span><small>${k}</small><b>${esc(val)}</b></span>`).join('')}</div>
        ${pt.fortes || t.fortes ? `<p><b>Pontos fortes:</b> ${esc(pt.fortes || t.fortes)}</p>` : ''}
        ${pt.atencao || t.atencao ? `<p><b>Pontos de atenção:</b> ${esc(pt.atencao || t.atencao)}</p>` : ''}
        ${aps.length ? `<ul class="aps-lidos">${aps.map(a => `<li><small>${dataBR(a.data) || '—'}</small>${esc(a.texto)}</li>`).join('')}</ul>` : '<p class="dica">Sem apontamentos do treinamento.</p>'}
      </details>`;
    }
    el.innerHTML = html;
  }

  /* ---------- campos ---------- */
  const setSeg = (el, v) => { el.dataset.valor = v || ''; $$('button', el).forEach(b => b.classList.toggle('on', b.dataset.v === v)); el.classList.remove('invalido'); };
  F('Perfil').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSeg(F('Perfil'), b.dataset.v); });
  F('Criterios').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const es = b.parentElement;
    es.dataset.v = es.dataset.v === b.dataset.n ? '' : b.dataset.n;
    $$('button', es).forEach(x => x.classList.toggle('on', x.dataset.n === es.dataset.v)); calcular();
  });
  const BTN_X = `<button type="button" class="btn-icone" title="Remover" aria-label="Remover">${G.ic('trash', '')}</button>`;
  const renumerar = l => $$('.linha .idx', l).forEach((x, i) => x.textContent = i + 1);
  const remover = l => l.addEventListener('click', e => { if (e.target.closest('.btn-icone')) { e.target.closest('.linha').remove(); renumerar(l); calcular(); } });

  function addNota(nt = {}) {
    const l = F('Notas'); const i = $$('.linha', l).length + 1;
    const val = nt.nota === null || nt.nota === undefined ? '' : fmt(nt.nota, TR ? 1 : 2);
    l.insertAdjacentHTML('beforeend', TR
      ? `<div class="linha linha-prova"><span class="idx">${i}</span><input class="n-nome" placeholder="Tema da prova" value="${esc(nt.nome || '')}"><input class="n-data" type="date" value="${esc(nt.data || '')}"><input class="n-nota" inputmode="decimal" placeholder="Nota" value="${val}">${BTN_X}</div>`
      : `<div class="linha linha-qual"><span class="idx">${i}</span><input class="n-data" type="date" value="${esc(nt.data || '')}"><span class="campo-pct"><input class="n-nota" inputmode="decimal" placeholder="0,00" value="${val}"><b>%</b></span>${BTN_X}</div>`);
  }
  F('AddNota').onclick = () => { addNota(); calcular(); };
  remover(F('Notas'));
  F('Notas').addEventListener('input', e => {
    if (!e.target.classList.contains('n-nota')) return;
    const limpo = e.target.value.replace(/[^\d,.]/g, ''); if (limpo !== e.target.value) e.target.value = limpo;
    const v = num(limpo), max = TR ? 10 : 100; e.target.classList.toggle('invalido', v !== null && (v < 0 || v > max)); calcular();
  });
  F('Notas').addEventListener('focusout', e => { if (!e.target.classList.contains('n-nota')) return; const v = num(e.target.value); if (v !== null && v <= (TR ? 10 : 100)) e.target.value = fmt(v, TR ? 1 : 2); });

  function addAp(a = {}) {
    const l = F('Aps'); const i = $$('.linha', l).length + 1;
    l.insertAdjacentHTML('beforeend', `<div class="linha linha-ap"><span class="idx">${i}</span><input class="ap-data" type="date" value="${esc(a.data || hoje())}"><textarea class="ap-txt" rows="2" placeholder="O que aconteceu, combinado ou observado">${esc(a.texto || '')}</textarea>${BTN_X}</div>`);
  }
  F('AddAp').onclick = () => { addAp(); $('.linha:last-child .ap-txt', F('Aps')).focus(); };
  remover(F('Aps'));

  if (TR) {
    F('Atestado').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg(F('Atestado'), b.dataset.v); F('BlocoAt').hidden = b.dataset.v !== 'Sim'; if (b.dataset.v === 'Sim' && !$('.linha', F('Ats'))) addAt(); });
    F('AddAt').onclick = () => addAt();
    remover(F('Ats'));
    ['Faltas'].forEach(x => F(x).addEventListener('input', frequencia));
  } else {
    F('ExpIni').addEventListener('change', () => { if (F('ExpIni').value) F('ExpFim').value = somaDias(F('ExpIni').value, EXPERIENCIA_DIAS); calcular(); });
    F('ExpFim').addEventListener('change', calcular);
  }
  function addAt(a = {}) {
    const l = F('Ats'); const i = $$('.linha', l).length + 1;
    l.insertAdjacentHTML('beforeend', `<div class="linha linha-at"><span class="idx">${i}</span><input class="a-data" type="date" value="${esc(a.data || '')}" title="Qual dia foi"><input class="a-dias" type="number" min="1" step="1" placeholder="Dias" value="${a.dias ?? ''}"><input class="a-obs" placeholder="Observação (opcional)" value="${esc(a.obs || '')}">${BTN_X}</div>`);
  }
  function frequencia() {
    if (!TR || !treinando) return;
    const dias = A.diasUteis(treinando.dataInicio, treinando.dataFim || null), f = num(F('Faltas').value) || 0;
    F('Freq').value = dias ? fmt(Math.max(0, (dias - f) / dias) * 100, 0) + '% de ' + dias + ' dias' : '';
  }

  const lerNotas = () => $$('.linha', F('Notas')).map(l => ({ nome: $('.n-nome', l) ? $('.n-nome', l).value.trim() : '', data: $('.n-data', l).value, nota: num($('.n-nota', l).value) })).filter(x => x.nome || x.data || x.nota !== null);
  const lerCrit = () => { const o = {}; $$('.escala', F('Criterios')).forEach(e => { if (e.dataset.v) o[e.dataset.k] = +e.dataset.v; }); return o; };
  const lerAps = () => $$('.linha', F('Aps')).map(l => ({ data: $('.ap-data', l).value, texto: $('.ap-txt', l).value.trim() })).filter(a => a.texto);
  const lerAts = () => TR ? $$('.linha', F('Ats')).map(l => ({ data: $('.a-data', l).value, dias: num($('.a-dias', l).value), obs: $('.a-obs', l).value.trim() })).filter(a => a.data || a.dias || a.obs) : [];

  function calcular() {
    const notas = lerNotas(), crit = lerCrit();
    const mn = media(notas.map(x => x.nota));
    F('MediaNotas').textContent = mn === null ? '—' : TR ? fmt(mn) : fmt(mn, 2) + '%';
    const mc = media(Object.values(crit)); F('MediaCrit').textContent = mc === null ? '—' : fmt(mc) + ' / 5';
    F('Nota').textContent = fmt(notaAnalise({ tipo, notas, criterios: crit }));
    // nota final: provas e comportamental vêm do treinamento, qualidade da supervisão
    let provas = [], qual = [], comp = {};
    if (treinando) {
      const sup = anDe('supervisao', treinando.id);
      provas = TR ? notas : (treinando.provas || []);
      comp = TR ? crit : (treinando.comportamental || {});
      qual = TR ? ((sup && sup.notas) || treinando.qualidade || []) : notas;
    }
    const nf = A.notaCalculada(provas, qual, comp);
    F('NotaFinal').textContent = fmt(nf);
    F('NotaFinalDica').textContent = !qual.some(q => q.nota !== null && q.nota !== undefined) ? 'Parcial: a qualidade (30%) entra na análise supervisão' : '60% provas + 30% qualidade + 10% comportamental do treinamento';
    if (!TR) F('ExpPrazo').value = F('ExpFim').value ? prazo(F('ExpFim').value) : '';
    frequencia();
  }

  /* ---------- limpar / preencher ---------- */
  const msg = (t, c) => { const m = F('Msg'); m.textContent = t; m.className = 'msg ' + (c || ''); };
  function limpar() {
    F('Form').reset(); F('Id').value = ''; treinando = null; F('Resumo').innerHTML = ''; F('Corpo').hidden = true;
    setSeg(F('Perfil'), '');
    $$('.escala', F('Criterios')).forEach(e => { e.dataset.v = ''; $$('button', e).forEach(b => b.classList.remove('on')); });
    F('Notas').innerHTML = ''; F('Aps').innerHTML = '';
    if (TR) { setSeg(F('Atestado'), ''); F('Ats').innerHTML = ''; F('BlocoAt').hidden = true; }
    F('Modo').hidden = true;
    $$('.invalido', F('Form')).forEach(e => e.classList.remove('invalido')); msg('');
  }
  function padroes() {
    for (let i = 0; i < 3; i++) addNota();
    F('Data').value = hoje(); F('Avaliador').value = usuarioAtual();
    const r = treinando;
    if (TR) {
      F('Faltas').value = r.faltas ?? 0; F('Atrasos').value = r.atrasos ?? 0;
      // cadastros antigos já tinham frequência, provas e comportamental
      if (r.atestado) { setSeg(F('Atestado'), r.atestado); F('BlocoAt').hidden = r.atestado !== 'Sim'; (r.atestados || []).forEach(addAt); }
      if ((r.provas || []).length) { F('Notas').innerHTML = ''; r.provas.forEach(addNota); }
      setCrit(r.comportamental); setSeg(F('Perfil'), r.perfil); F('Indicacao').value = r.indicacao || ''; F('Potencial').value = r.potencial || '';
    } else {
      const ini = r.enviadoSupEm || r.dataHabilitacao || hoje();
      F('ExpIni').value = ini; F('ExpFim').value = somaDias(ini, EXPERIENCIA_DIAS);
      if ((r.qualidade || []).length) { F('Notas').innerHTML = ''; r.qualidade.forEach(addNota); }
      setSeg(F('Perfil'), r.perfil); F('Indicacao').value = r.indicacao || ''; F('Potencial').value = r.potencial || '';
    }
  }
  function setCrit(c) { Object.entries(c || {}).forEach(([k, v]) => { const e = $(`.escala[data-k="${k}"]`, F('Criterios')); if (e) { e.dataset.v = String(v); $$('button', e).forEach(b => b.classList.toggle('on', b.dataset.n === String(v))); } }); }
  function preencher(a) {
    F('Id').value = a.id;
    setSeg(F('Perfil'), a.perfil); F('Indicacao').value = a.indicacao || ''; F('Potencial').value = a.potencial || '';
    setCrit(a.criterios);
    (a.notas || []).forEach(addNota); if (!(a.notas || []).length) addNota();
    (a.apontamentos || []).forEach(addAp);
    F('Situacao').value = a.situacao || ''; F('Data').value = a.data || hoje(); F('Avaliador').value = a.avaliador || usuarioAtual();
    F('Fortes').value = a.fortes || ''; F('Atencao').value = a.atencao || '';
    if (TR) {
      const r = treinando;
      F('Faltas').value = r.faltas ?? 0; F('Atrasos').value = r.atrasos ?? 0;
      setSeg(F('Atestado'), r.atestado || ''); F('BlocoAt').hidden = r.atestado !== 'Sim'; (r.atestados || []).forEach(addAt);
    } else {
      const ini = (a.experiencia || {}).inicio || treinando.enviadoSupEm || hoje();
      F('ExpIni').value = ini; F('ExpFim').value = (a.experiencia || {}).fim || somaDias(ini, EXPERIENCIA_DIAS);
      F('Resultado').value = a.resultadoFinal || '';
    }
    F('Modo').hidden = false; F('ModoTxt').textContent = 'Editando: ' + (a.nome || '').split(' ').slice(0, 2).join(' ');
  }
  function estadoBotoes() {
    const b = F('Enviar'), t = F('EnviarTxt'); if (!treinando) return;
    const r = A.efetivo(treinando, mapaSup());
    if (TR) {
      const sit = F('Situacao').value, encerra = sit === 'Reprovado' || sit === 'Desistente';
      b.hidden = r.etapa !== 'treinamento';
      t.textContent = encerra ? 'Encerrar treinamento (' + sit.toLowerCase() + ')' : 'Confirmar envio para supervisão';
      if (r.etapa !== 'treinamento') msg(r.etapa === 'supervisao' ? `Enviado para a supervisão em ${dataBR(treinando.enviadoSupEm)}. Você ainda pode corrigir os apontamentos.` : `Treinamento encerrado: ${r.status}.`, '');
    } else {
      const a = anDe('supervisao', treinando.id);
      const fechado = a && a.concluido;
      t.textContent = fechado ? 'Reabrir período de experiência' : 'Concluir período de experiência';
      b.classList.toggle('btn-pri', !fechado); b.classList.toggle('btn-sec', !!fechado);
      if (fechado) msg(`Período de experiência concluído em ${dataBR(a.concluidoEm)}: ${a.resultadoFinal}.`, '');
    }
  }
  F('Situacao').addEventListener('change', estadoBotoes);
  F('Nova').onclick = () => { limpar(); F('Nome').focus(); };
  F('Form').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });

  /* ---------- salvar ---------- */
  function validar(final) {
    $$('.invalido', F('Form')).forEach(x => x.classList.remove('invalido'));
    const erros = [];
    const marca = (el, txt) => { el.classList.add('invalido'); erros.push(txt); };
    if (!treinando) marca(F('Nome'), TR ? 'treinando do cadastro' : 'colaborador');
    if ($$('.n-nota.invalido', F('Notas')).length) erros.push(TR ? 'provas de 0 a 10' : 'qualidade entre 0,00% e 100,00%');
    if (!TR && F('ExpIni').value && F('ExpFim').value && F('ExpFim').value < F('ExpIni').value) marca(F('ExpFim'), 'fim da experiência depois do início');
    if (final) {
      if (!F('Perfil').dataset.valor) marca(F('Perfil'), 'perfil do consultor');
      if (!F('Situacao').value) marca(F('Situacao'), TR ? 'resultado do treinamento' : 'situação recomendada');
      if (TR) {
        if (!F('Atestado').dataset.valor) marca(F('Atestado'), 'se apresentou atestado');
        if (F('Atestado').dataset.valor === 'Sim' && !lerAts().some(a => a.data)) erros.push('dia do atestado');
        if (F('Situacao').value !== 'Desistente' && !lerNotas().some(x => x.nota !== null)) erros.push('ao menos uma nota de prova');
      } else {
        if (!F('ExpIni').value) marca(F('ExpIni'), 'início na operação');
        if (!F('Resultado').value) marca(F('Resultado'), 'resultado do período de experiência');
      }
    }
    if (erros.length) { msg('Confira: ' + erros.join(', ') + '.', 'erro'); const el = $('.invalido', F('Form')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
    return true;
  }
  function gravarAnalise() {
    const idAtual = F('Id').value;
    let a = idAtual ? analises.find(x => x.id === idAtual) : null;
    if (!a) { a = { id: uid(), criadoEm: new Date().toISOString() }; analises.push(a); }
    Object.assign(a, {
      tipo, treinandoId: treinando.id, nome: treinando.nome, turma: treinando.turma || '',
      perfil: F('Perfil').dataset.valor, indicacao: F('Indicacao').value, potencial: F('Potencial').value,
      criterios: lerCrit(), notas: lerNotas(), apontamentos: lerAps(), situacao: F('Situacao').value, data: F('Data').value,
      avaliador: F('Avaliador').value.trim(), usuario: (window.NUVEM && NUVEM.usuario && NUVEM.usuario() || {}).usuario || '',
      fortes: F('Fortes').value.trim(), atencao: F('Atencao').value.trim(), atualizadoEm: new Date().toISOString()
    });
    if (!TR) { a.experiencia = { inicio: F('ExpIni').value, fim: F('ExpFim').value }; a.resultadoFinal = F('Resultado').value; }
    a.nota = notaAnalise(a);
    F('Id').value = a.id;
    return a;
  }
  // o treinamento grava no cadastro o que é do período de treinamento (a supervisão vê por ali)
  function gravarNoCadastro(a, extra) {
    const r = { ...treinando };
    const ats = lerAts();
    Object.assign(r, {
      faltas: num(F('Faltas').value) || 0, atrasos: num(F('Atrasos').value) || 0,
      atestado: F('Atestado').dataset.valor, atestados: F('Atestado').dataset.valor === 'Sim' ? ats : [],
      provas: a.notas.map(x => ({ nome: x.nome, data: x.data, nota: x.nota })), comportamental: a.criterios,
      perfil: a.perfil, indicacao: a.indicacao, potencial: a.potencial,
      observacoes: [a.fortes && 'Pontos fortes: ' + a.fortes, a.atencao && 'Pontos de atenção: ' + a.atencao].filter(Boolean).join('\n'),
      apontamentosTrein: a.apontamentos, parecerTrein: { situacao: a.situacao, fortes: a.fortes, atencao: a.atencao, avaliador: a.avaliador, data: a.data },
      atualizadoEm: new Date().toISOString()
    }, extra || {});
    r.etapa = r.etapa || 'treinamento';
    if (!r.status) r.status = 'Em treinamento';
    r.notaFinal = A.notaCalculada(r.provas || [], r.qualidade || [], r.comportamental || {});
    A.salvarFormacao(r); treinando = r;
  }
  function concluirSalvar(texto) {
    salvar(); listas(); resumo(); estadoBotoes(); calcular();
    F('Modo').hidden = false; F('ModoTxt').textContent = 'Editando: ' + treinando.nome.split(' ').slice(0, 2).join(' ');
    toast(texto); msg(texto + '.', 'ok');
    window.dispatchEvent(new CustomEvent('dados-atualizados', { detail: { origem: 'analises' } }));
  }
  F('Form').addEventListener('submit', e => {
    e.preventDefault(); if (!validar(false)) return;
    const a = gravarAnalise();
    if (TR) gravarNoCadastro(a);
    concluirSalvar(TR ? `Apontamentos de ${treinando.nome.split(' ')[0]} salvos` : `Acompanhamento de ${treinando.nome.split(' ')[0]} salvo`);
  });
  F('Enviar').onclick = () => {
    if (!treinando) return;
    const nome = treinando.nome.split(' ')[0];
    if (TR) {
      if (!validar(true)) return;
      const sit = F('Situacao').value, encerra = sit === 'Reprovado' || sit === 'Desistente';
      if (!confirm(encerra ? `Encerrar o treinamento de ${treinando.nome} como ${sit}? O colaborador não segue para a supervisão.` : `Confirmar o fim do treinamento de ${treinando.nome} e enviar para a Análise supervisão?`)) return;
      const a = gravarAnalise(); a.enviado = true; a.enviadoEm = hoje();
      gravarNoCadastro(a, encerra ? { etapa: 'concluido', status: sit } : { etapa: 'supervisao', status: 'Em experiência', enviadoSupEm: hoje(), dataHabilitacao: hoje() });
      concluirSalvar(encerra ? `Treinamento de ${nome} encerrado` : `Envio de ${nome} para a supervisão confirmado`);
      return;
    }
    const sup = anDe('supervisao', treinando.id);
    if (sup && sup.concluido) {
      if (!confirm(`Reabrir o período de experiência de ${treinando.nome}?`)) return;
      sup.concluido = false; sup.concluidoEm = ''; sup.atualizadoEm = new Date().toISOString();
      msg(''); concluirSalvar(`Período de ${nome} reaberto`); return;
    }
    if (!validar(true)) return;
    if (!confirm(`Concluir o período de experiência de ${treinando.nome} como “${F('Resultado').value}”?`)) return;
    const a = gravarAnalise(); a.concluido = true; a.concluidoEm = hoje();
    concluirSalvar(`Experiência de ${nome} concluída: ${a.resultadoFinal}`);
  };

  /* ---------- listas laterais ---------- */
  F('FiltroTurma').addEventListener('change', listas);
  F('Busca').addEventListener('input', listas);
  [F('Pendentes'), F('Feitos')].forEach(ul => ul.addEventListener('click', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const r = A.formacao().find(x => x.id === li.dataset.id); if (r) abrir(r);
  }));
  function listas() {
    const regs = vista();
    const naEtapa = regs.filter(r => r.etapa === tipo);
    const turmas = [...new Set(naEtapa.map(r => r.turma).filter(Boolean))].sort(cmpTxt).reverse();
    const s = F('FiltroTurma'), at = s.value;
    s.innerHTML = '<option value="">Todas as turmas</option>' + turmas.map(t => `<option${t === at ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const pend = naEtapa.filter(r => !s.value || r.turma === s.value);
    if (TR) pend.sort((a, b) => cmpTxt(a.turma, b.turma) || cmpTxt(a.nome, b.nome));
    else pend.sort((a, b) => cmpTxt(((anDe('supervisao', a.id) || {}).experiencia || {}).fim || somaDias(a.enviadoSupEm || hoje(), EXPERIENCIA_DIAS), ((anDe('supervisao', b.id) || {}).experiencia || {}).fim || somaDias(b.enviadoSupEm || hoje(), EXPERIENCIA_DIAS)));
    F('Pendentes').innerHTML = pend.slice(0, 300).map(r => {
      const a = anDe(tipo, r.id);
      if (TR) return `<li data-id="${r.id}"><b>${esc(r.nome)}</b><small>${esc([r.turma, r.instituicao, r.operacao].filter(Boolean).join(' · '))}${a ? ' · <span class="tag neutro">em andamento</span>' : ''}</small></li>`;
      const fim = (a && a.experiencia && a.experiencia.fim) || somaDias(r.enviadoSupEm || hoje(), EXPERIENCIA_DIAS);
      const d = diasEntre(hoje(), fim);
      return `<li data-id="${r.id}"><b>${esc(r.nome)}</b><small>${esc([r.turma, r.operacao].filter(Boolean).join(' · '))} · <span class="tag ${d < 0 ? 'ruim' : d <= 15 ? 'alerta' : 'neutro'}">${prazo(fim)}</span>${a ? '' : ' · <span class="tag roxo">novo</span>'}</small></li>`;
    }).join('') || `<li class="vazio-lote">${TR ? 'Nenhum cadastro em treinamento.' : 'Ninguém em período de experiência.'}</li>`;
    const q = norm(F('Busca').value);
    const feitos = regs.filter(r => (TR ? r.etapa !== 'treinamento' && (r.enviadoSupEm || anDe('treinamento', r.id)) : r.etapa === 'concluido' && anDe('supervisao', r.id)) && (!q || norm(r.nome + ' ' + r.turma).includes(q)))
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
    F('Feitos').innerHTML = feitos.slice(0, 300).map(r => {
      const a = anDe(tipo, r.id);
      return `<li data-id="${r.id}"><b>${esc(r.nome)}</b><small>${tagSt(r.status)} · nota final ${fmt(r.notaFinal)}${a && a.data ? ' · ' + dataBR(TR ? (r.enviadoSupEm || a.data) : (a.concluidoEm || a.data)) : ''}</small></li>`;
    }).join('') || `<li class="vazio-lote">${TR ? 'Nenhum enviado ainda.' : 'Nenhuma experiência concluída.'}</li>`;
  }
  limpar(); listas();
  return { listas, atualizar() { if (treinando) { const r = A.formacao().find(x => x.id === treinando.id); if (r) { treinando = r; resumo(); estadoBotoes(); calcular(); } } } };
}

const modulos = {};
$$('.analise').forEach(r => modulos[r.dataset.tipo] = montar(r));
G.icones(document);

/* =========================================================
   COMPARATIVO NO DASHBOARD DE FORMAÇÃO
   ========================================================= */
function comparativo() {
  const el = document.getElementById('compAnalises'); if (!el) return;
  const lista = A.formacaoFiltrada();
  const ids = new Set(lista.map(r => r.id));
  const T = new Map(), S = new Map();
  analises.forEach(a => { if (!ids.has(a.treinandoId)) return; (a.tipo === 'treinamento' ? T : S).set(a.treinandoId, a); });
  const ambos = lista.filter(r => T.has(r.id) && S.has(r.id));
  if (!T.size && !S.size) { el.innerHTML = `<div class="g-vazio">${G.ic('users', '')}<span>Nenhuma análise de treinamento ou de supervisão feita para os treinandos filtrados.</span></div>`; return; }
  const mediaDe = (mapa, f) => media([...mapa.values()].map(f).filter(v => v !== null && v !== undefined));
  const grupo = mapa => {
    const o = { n: mapa.size, nota: mediaDe(mapa, a => a.nota) };
    CRITERIOS.forEach(([k]) => o[k] = mediaDe(mapa, a => (a.criterios || {})[k] ?? null));
    const com = [...mapa.values()].filter(a => a.situacao);
    o.aprov = com.length ? com.filter(a => /^Aprovado/.test(a.situacao)).length / com.length : null;
    o.vendas = mapa.size ? [...mapa.values()].filter(a => a.perfil === 'Vendas').length / mapa.size : null;
    return o;
  };
  const gT = grupo(T), gS = grupo(S);
  const conc = f => ambos.length ? ambos.filter(r => f(T.get(r.id)) === f(S.get(r.id))).length / ambos.length : null;
  const difs = ambos.map(r => (T.get(r.id).nota ?? null) !== null && (S.get(r.id).nota ?? null) !== null ? T.get(r.id).nota - S.get(r.id).nota : null).filter(v => v !== null);
  const cPerfil = conc(a => a.perfil), cSit = conc(a => /^Aprovado/.test(a.situacao) ? 'apr' : a.situacao), cInd = conc(a => a.indicacao || '—');
  const kp = (t, v, s, cor, ic) => `<div class="kpi" style="--c:${cor}"><div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(ic)}</span></div><b>${v}</b><small>${s}</small></div>`;
  const metricas = [['Nota da análise', 'nota', 10, 'award'], ...CRITERIOS.map(([k, t]) => [t, k, 5, 'star']), ['Recomendou aprovar', 'aprov', 1, 'check', true], ['Viu perfil de vendas', 'vendas', 1, 'briefcase', true]];
  const linhas = lista.filter(r => T.has(r.id) || S.has(r.id)).map(r => {
    const t = T.get(r.id), s = S.get(r.id); const d = t && s && t.nota !== null && s.nota !== null ? t.nota - s.nota : null;
    const diverg = t && s ? [t.perfil !== s.perfil && 'perfil', (/^Aprovado/.test(t.situacao) !== /^Aprovado/.test(s.situacao)) && 'situação', (t.indicacao || '') !== (s.indicacao || '') && 'indicação', d !== null && Math.abs(d) >= 1.5 && 'nota'].filter(Boolean) : null;
    return { r, t, s, d, diverg };
  }).sort((a, b) => (b.diverg ? b.diverg.length : -1) - (a.diverg ? a.diverg.length : -1) || Math.abs(b.d || 0) - Math.abs(a.d || 0));
  const cel = (a, k) => !a ? '<span class="dica">pendente</span>' : esc(a[k] || '—');
  el.innerHTML = `
    <div class="kpis kpis-comp">
      ${kp('Com as duas análises', ambos.length, `${T.size} de treinamento · ${S.size} de supervisão`, '#f5c542', 'users')}
      ${kp('Concordam no perfil', pct(cPerfil), 'vendas × não vendas', '#1baf7a', 'briefcase')}
      ${kp('Concordam na situação', pct(cSit), 'aprovar ou não', '#2a78d6', 'check')}
      ${kp('Concordam na indicação', pct(cInd), 'Captação, Permanência…', '#6250d6', 'target')}
      ${kp('Diferença média de nota', difs.length ? sinal(media(difs)) : '—', 'treinamento − supervisão', '#eb6834', 'scale')}
    </div>
    <div class="comparativo" id="compAnalisesDuelo"></div>
    <h3 class="sub-titulo">Treinando a treinando <small>divergências primeiro</small></h3>
    <div class="tabela-wrap"><table class="tabela comp-tab"><thead><tr><th>Treinando</th><th>Turma</th><th>Etapa</th><th class="dir">Nota trein.</th><th class="dir">Nota sup.</th><th class="dir">Diferença</th><th>Perfil trein. / sup.</th><th>Situação trein. / sup.</th><th>Indicação trein. / sup.</th><th>Divergências</th></tr></thead><tbody>
    ${linhas.map(({ r, t, s, d, diverg }) => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.turma)}</td><td>${tagSt(r.status)}</td><td class="dir">${t ? fmt(t.nota) : '—'}</td><td class="dir">${s ? fmt(s.nota) : '—'}</td>
      <td class="dir">${d === null ? '—' : `<span class="tag ${Math.abs(d) >= 1.5 ? 'ruim' : Math.abs(d) >= .5 ? 'alerta' : 'bom'}">${sinal(d)}</span>`}</td>
      <td>${cel(t, 'perfil')} / ${cel(s, 'perfil')}</td><td>${cel(t, 'situacao')} / ${cel(s, 'situacao')}</td><td>${cel(t, 'indicacao')} / ${cel(s, 'indicacao')}</td>
      <td>${diverg === null ? '<span class="tag neutro">falta análise</span>' : diverg.length ? diverg.map(x => `<span class="tag ruim">${x}</span>`).join(' ') : '<span class="tag bom">alinhados</span>'}</td></tr>`).join('')}
    </tbody></table></div>`;
  G.duelo(document.getElementById('compAnalisesDuelo'), [gT, gS], ['Análise treinamento', 'Análise supervisão'], metricas, ['#2a78d6', '#eb6834'], ['exam', 'headset'], 'análises');
}
document.addEventListener('dashboard-formacao', comparativo);
document.addEventListener('aba-aberta', e => { if (e.detail === 'analise-trein' && modulos.treinamento) modulos.treinamento.listas(); if (e.detail === 'analise-sup' && modulos.supervisao) modulos.supervisao.listas(); });
window.addEventListener('dados-atualizados', e => {
  if (!(e.detail && e.detail.origem === 'analises')) analises = ler(KEY, []);
  Object.values(modulos).forEach(m => { m.listas(); if (!(e.detail && e.detail.origem === 'analises')) m.atualizar(); });
  if (document.getElementById('aba-dashboard').classList.contains('ativo')) comparativo();
});
// o dashboard pode já estar aberto
if (document.getElementById('aba-dashboard').classList.contains('ativo')) comparativo();
})();
