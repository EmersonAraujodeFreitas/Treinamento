/* =========================================================
   Inovação Casa · Treinamento — Análise treinamento × Análise supervisão
   Mesmas perguntas para os dois lados, para comparar as percepções.
   Treinamento lança as provas; supervisão lança as notas da qualidade.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, media, fmt, pct, esc, uid, hoje, dataBR, cmpTxt, toast, ler, gravar } = A;
const KEY = 'inovacao_treinamento_analises_v1';
let analises = ler(KEY, []);
const salvar = () => gravar(KEY, analises);

const TIPOS = {
  treinamento: { titulo: 'Análise treinamento', quem: 'Treinamento', sub: 'Percepção da equipe de treinamento sobre o treinando', notas: 'provas', cor: '#2a78d6', icone: 'exam' },
  supervisao: { titulo: 'Análise supervisão', quem: 'Supervisão', sub: 'Percepção da supervisão sobre o treinando', notas: 'qualidade', cor: '#eb6834', icone: 'headset' }
};
const CRITERIOS = [['comunicacao', 'Comunicação'], ['postura', 'Postura e ética'], ['pontualidade', 'Pontualidade'], ['engajamento', 'Engajamento'], ['aprendizado', 'Facilidade de aprendizado'], ['produtividade', 'Produtividade / ritmo'], ['script', 'Aderência ao script e processos']];
const SITUACOES = ['Aprovado', 'Aprovado com ressalvas', 'Em desenvolvimento', 'Reprovado'];
const INDICACOES = ['Captação', 'Permanência', 'Reciclagem', 'Não indicado'];
const POTENCIAL = ['Alto', 'Médio', 'Baixo'];
const sinal = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);

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
  const tipo = raiz.dataset.tipo, T = TIPOS[tipo], p = 'an' + (tipo === 'treinamento' ? 'T' : 'S');
  const id = x => p + x;
  raiz.innerHTML = `
  <div class="cab-pagina">
    <div><h1>${T.titulo}</h1><p class="sub">${T.sub}. As perguntas são as mesmas nas duas análises para comparar no dashboard.</p></div>
    <div class="cab-acoes"><span id="${id('Modo')}" class="selo selo-aviso" hidden>${G.ic('edit', '')}<span>Editando análise</span></span>
      <button type="button" class="btn btn-sec" id="${id('Nova')}">${G.ic('plus')}Nova análise</button></div>
  </div>
  <div class="an-grade">
    <form class="an-form" id="${id('Form')}" novalidate autocomplete="off">
      <input type="hidden" id="${id('Id')}">
      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('user')}</span>Treinando<span class="passo">1</span></legend>
        <div class="campo"><span>Nome do treinando <i class="obr">*</i></span>
          <div class="auto" id="${id('Auto')}"><input id="${id('Nome')}" placeholder="Digite para buscar no cadastro de formação…"><ul class="auto-lista" hidden></ul></div>
          <small class="dica">Somente treinandos já cadastrados na formação inicial</small></div>
        <div class="an-resumo" id="${id('Resumo')}"></div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('briefcase')}</span>Perfil percebido<span class="passo">2</span></legend>
        <div class="grade g4">
          <div class="campo c2"><span>Perfil do consultor <i class="obr">*</i></span>
            <div class="seg" id="${id('Perfil')}" data-valor=""><button type="button" data-v="Vendas">Perfil de vendas</button><button type="button" data-v="Não vendas">Perfil de não vendas</button></div></div>
          <label class="campo"><span>Indicado para</span><select id="${id('Indicacao')}"><option value="">Selecione</option>${INDICACOES.map(x => `<option>${x}</option>`).join('')}</select></label>
          <label class="campo"><span>Potencial de liderança</span><select id="${id('Potencial')}"><option value="">Selecione</option>${POTENCIAL.map(x => `<option>${x}</option>`).join('')}</select></label>
        </div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('star')}</span>Avaliação comportamental<span class="passo">3</span><small>1 = precisa melhorar · 5 = excelente</small></legend>
        <div class="grade g4 an-criterios" id="${id('Criterios')}">
          ${CRITERIOS.map(([k, t]) => `<div class="estrelas"><span>${t}</span><div class="escala" data-k="${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div>`).join('')}
        </div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic(T.icone)}</span>${tipo === 'treinamento' ? 'Provas aplicadas nos dias de treinamento' : 'Últimas notas da qualidade (monitorias)'}<span class="passo">4</span><small>${tipo === 'treinamento' ? 'nota de 0 a 10' : 'em %, ex.: 87,50%'}</small></legend>
        <div class="sub-bloco"><div class="sub-cab"><b class="com-ic">${G.ic(T.icone)}${tipo === 'treinamento' ? 'Provas' : 'Monitorias'}</b><button type="button" class="btn btn-link" id="${id('AddNota')}">${G.ic('plus')}adicionar</button></div>
          <div class="linhas" id="${id('Notas')}"></div></div>
        <div class="resumo-notas an-resumo-notas">
          <div class="rn"><span>${tipo === 'treinamento' ? 'Média das provas' : 'Média da qualidade'}</span><b id="${id('MediaNotas')}">—</b></div>
          <div class="rn"><span>Comportamental</span><b id="${id('MediaCrit')}">—</b></div>
          <div class="rn rn-final"><span>${G.ic('award')}Nota da análise <small class="auto-tag">automática</small></span><b id="${id('Nota')}">—</b><small class="dica">70% ${tipo === 'treinamento' ? 'provas' : 'qualidade'} + 30% comportamental</small></div>
        </div>
      </fieldset>

      <fieldset class="bloco">
        <legend><span class="icb">${G.ic('flag')}</span>Parecer<span class="passo">5</span></legend>
        <div class="grade g4">
          <label class="campo"><span>Situação recomendada <i class="obr">*</i></span><select id="${id('Situacao')}"><option value="">Selecione</option>${SITUACOES.map(x => `<option>${x}</option>`).join('')}</select></label>
          <label class="campo"><span>Data da análise</span><input type="date" id="${id('Data')}"></label>
          <label class="campo c2"><span>Avaliador(a)</span><input id="${id('Avaliador')}" placeholder="Quem está avaliando"></label>
          <label class="campo c2"><span>Pontos fortes</span><textarea id="${id('Fortes')}" rows="2" placeholder="O que o treinando faz bem"></textarea></label>
          <label class="campo c2"><span>Pontos de atenção</span><textarea id="${id('Atencao')}" rows="2" placeholder="O que precisa desenvolver"></textarea></label>
        </div>
      </fieldset>

      <div class="barra-acoes">
        <div id="${id('Msg')}" class="msg" role="status"></div>
        <button type="button" class="btn btn-sec" id="${id('Limpar')}">Limpar</button>
        <button type="submit" class="btn btn-pri">${G.ic('check')}<span id="${id('SalvarTxt')}">Salvar análise</span></button>
      </div>
    </form>
    <aside class="an-lado">
      <div class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('clock')}</span><div><h2>Pendentes</h2><p>Treinandos ainda sem ${T.titulo.toLowerCase()}</p></div></header>
        <select id="${id('FiltroTurma')}" class="an-filtro"><option value="">Todas as turmas</option></select>
        <ul class="an-lista" id="${id('Pendentes')}"></ul>
      </div>
      <div class="cartao">
        <header class="cab-card"><span class="icb">${G.ic('check')}</span><div><h2>Já analisados</h2><p>Clique para editar</p></div></header>
        <input type="search" id="${id('Busca')}" class="an-filtro" placeholder="Buscar">
        <ul class="an-lista" id="${id('Feitos')}"></ul>
      </div>
    </aside>
  </div>`;

  const F = x => document.getElementById(id(x));
  let treinando = null;

  // treinando
  A.autocomplete(F('Auto'), {
    fonte: () => A.formacao().map(r => r.nome).sort(cmpTxt),
    aoEscolher: (v, novo, blur) => {
      const r = A.formacao().find(x => norm(x.nome) === norm(v));
      if (r) escolher(r); else if (!blur || !v) { treinando = null; resumo(); }
    }
  });
  function escolher(r) {
    treinando = r; F('Nome').value = r.nome; resumo();
    const existente = analises.find(a => a.tipo === tipo && a.treinandoId === r.id);
    if (existente && existente.id !== F('Id').value) { preencher(existente); msg('Este treinando já tem análise: ela foi aberta para edição.', ''); }
  }
  function resumo() {
    const r = treinando, el = F('Resumo');
    if (!r) { el.innerHTML = ''; return; }
    const outro = analises.find(a => a.tipo !== tipo && a.treinandoId === r.id);
    el.innerHTML = `<div class="an-chips">${[['Turma', r.turma], ['IES', r.instituicao], ['Operação', r.operacao], ['Bairro', [r.bairro, r.cidade].filter(Boolean).join(', ')], ['Situação no cadastro', r.status], ['Nota final do cadastro', fmt(r.notaFinal)]]
      .filter(x => x[1]).map(([t, v]) => `<span><small>${t}</small><b>${esc(v)}</b></span>`).join('')}</div>
      ${outro ? `<p class="dica">${G.ic('check', '')} A ${TIPOS[outro.tipo].titulo.toLowerCase()} deste treinando já foi feita.</p>` : ''}`;
  }

  // perfil e critérios
  F('Perfil').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg(b.dataset.v); });
  const setSeg = v => { F('Perfil').dataset.valor = v || ''; $$('button', F('Perfil')).forEach(b => b.classList.toggle('on', b.dataset.v === v)); F('Perfil').classList.remove('invalido'); };
  F('Criterios').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const esc_ = b.parentElement;
    esc_.dataset.v = esc_.dataset.v === b.dataset.n ? '' : b.dataset.n;
    $$('button', esc_).forEach(x => x.classList.toggle('on', x.dataset.n === esc_.dataset.v)); calcular();
  });

  // notas
  const BTN_X = `<button type="button" class="btn-icone" title="Remover" aria-label="Remover">${G.ic('trash', '')}</button>`;
  function addNota(n = {}) {
    const l = F('Notas'); const i = $$('.linha', l).length + 1;
    const val = n.nota === null || n.nota === undefined ? '' : fmt(n.nota, tipo === 'supervisao' ? 2 : 1);
    l.insertAdjacentHTML('beforeend', tipo === 'treinamento'
      ? `<div class="linha linha-prova"><span class="idx">${i}</span><input class="n-nome" placeholder="Tema da prova" value="${esc(n.nome || '')}"><input class="n-data" type="date" value="${esc(n.data || '')}"><input class="n-nota" inputmode="decimal" placeholder="Nota" value="${val}">${BTN_X}</div>`
      : `<div class="linha linha-qual"><span class="idx">${i}</span><input class="n-data" type="date" value="${esc(n.data || '')}"><span class="campo-pct"><input class="n-nota" inputmode="decimal" placeholder="0,00" value="${val}"><b>%</b></span>${BTN_X}</div>`);
  }
  F('AddNota').onclick = () => { addNota(); calcular(); };
  F('Notas').addEventListener('click', e => { if (e.target.closest('.btn-icone')) { e.target.closest('.linha').remove(); $$('.linha .idx', F('Notas')).forEach((x, i) => x.textContent = i + 1); calcular(); } });
  F('Notas').addEventListener('input', e => {
    if (!e.target.classList.contains('n-nota')) return;
    const limpo = e.target.value.replace(/[^\d,.]/g, ''); if (limpo !== e.target.value) e.target.value = limpo;
    const n = num(limpo), max = tipo === 'supervisao' ? 100 : 10; e.target.classList.toggle('invalido', n !== null && (n < 0 || n > max)); calcular();
  });
  F('Notas').addEventListener('focusout', e => { if (!e.target.classList.contains('n-nota')) return; const n = num(e.target.value); if (n !== null && n <= (tipo === 'supervisao' ? 100 : 10)) e.target.value = fmt(n, tipo === 'supervisao' ? 2 : 1); });
  const lerNotas = () => $$('.linha', F('Notas')).map(l => ({ nome: $('.n-nome', l) ? $('.n-nome', l).value.trim() : '', data: $('.n-data', l).value, nota: num($('.n-nota', l).value) })).filter(n => n.nome || n.data || n.nota !== null);
  const lerCrit = () => { const o = {}; $$('.escala', F('Criterios')).forEach(e => { if (e.dataset.v) o[e.dataset.k] = +e.dataset.v; }); return o; };
  function calcular() {
    const notas = lerNotas().map(n => n.nota).filter(v => v !== null);
    const mn = media(notas);
    F('MediaNotas').textContent = mn === null ? '—' : tipo === 'supervisao' ? fmt(mn, 2) + '%' : fmt(mn);
    const mc = media(Object.values(lerCrit())); F('MediaCrit').textContent = mc === null ? '—' : fmt(mc) + ' / 5';
    const n = notaAnalise({ tipo, notas: lerNotas(), criterios: lerCrit() }); F('Nota').textContent = fmt(n);
  }

  const msg = (t, c) => { const m = F('Msg'); m.textContent = t; m.className = 'msg ' + (c || ''); };
  function limpar() {
    F('Form').reset(); F('Id').value = ''; treinando = null; resumo(); setSeg('');
    $$('.escala', F('Criterios')).forEach(e => { e.dataset.v = ''; $$('button', e).forEach(b => b.classList.remove('on')); });
    F('Notas').innerHTML = ''; for (let i = 0; i < 3; i++) addNota();
    F('Data').value = hoje(); const u = window.NUVEM && NUVEM.usuario(); F('Avaliador').value = u ? (u.nome || u.usuario) : '';
    F('Modo').hidden = true; F('SalvarTxt').textContent = 'Salvar análise';
    $$('.invalido', F('Form')).forEach(e => e.classList.remove('invalido')); calcular(); msg('');
  }
  function preencher(a) {
    limpar(); F('Id').value = a.id;
    treinando = A.formacao().find(r => r.id === a.treinandoId) || { id: a.treinandoId, nome: a.nome }; F('Nome').value = treinando.nome; resumo();
    setSeg(a.perfil); F('Indicacao').value = a.indicacao || ''; F('Potencial').value = a.potencial || '';
    Object.entries(a.criterios || {}).forEach(([k, v]) => { const e = $(`.escala[data-k="${k}"]`, F('Criterios')); if (e) { e.dataset.v = String(v); $$('button', e).forEach(b => b.classList.toggle('on', b.dataset.n === String(v))); } });
    F('Notas').innerHTML = ''; (a.notas || []).forEach(addNota); if (!(a.notas || []).length) addNota();
    F('Situacao').value = a.situacao || ''; F('Data').value = a.data || ''; F('Avaliador').value = a.avaliador || '';
    F('Fortes').value = a.fortes || ''; F('Atencao').value = a.atencao || '';
    F('Modo').hidden = false; F('SalvarTxt').textContent = 'Salvar alterações'; calcular();
  }
  F('Limpar').onclick = limpar; F('Nova').onclick = () => { limpar(); F('Nome').focus(); };
  F('Form').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
  F('Form').addEventListener('submit', e => {
    e.preventDefault();
    $$('.invalido', F('Form')).forEach(x => x.classList.remove('invalido'));
    const erros = [];
    if (!treinando) { F('Nome').classList.add('invalido'); erros.push('treinando do cadastro'); }
    if (!F('Perfil').dataset.valor) { F('Perfil').classList.add('invalido'); erros.push('perfil'); }
    if (!F('Situacao').value) { F('Situacao').classList.add('invalido'); erros.push('situação recomendada'); }
    if ($$('.n-nota.invalido', F('Notas')).length) erros.push(tipo === 'supervisao' ? 'qualidade entre 0,00% e 100,00%' : 'provas de 0 a 10');
    if (erros.length) { msg('Confira: ' + erros.join(', ') + '.', 'erro'); return; }
    const idAtual = F('Id').value;
    const a = idAtual ? analises.find(x => x.id === idAtual) : { id: uid(), criadoEm: new Date().toISOString() };
    Object.assign(a, {
      tipo, treinandoId: treinando.id, nome: treinando.nome, turma: treinando.turma || '',
      perfil: F('Perfil').dataset.valor, indicacao: F('Indicacao').value, potencial: F('Potencial').value,
      criterios: lerCrit(), notas: lerNotas(), situacao: F('Situacao').value, data: F('Data').value,
      avaliador: F('Avaliador').value.trim(), usuario: (window.NUVEM && NUVEM.usuario() || {}).usuario || '',
      fortes: F('Fortes').value.trim(), atencao: F('Atencao').value.trim(), atualizadoEm: new Date().toISOString()
    });
    a.nota = notaAnalise(a);
    if (!idAtual) analises.push(a);
    salvar(); listas();
    toast(idAtual ? 'Análise atualizada' : 'Análise salva');
    const nome = a.nome.split(' ')[0]; limpar(); msg(`Análise de ${nome} salva.`, 'ok');
  });

  // listas laterais
  F('FiltroTurma').addEventListener('change', listas);
  F('Busca').addEventListener('input', listas);
  F('Pendentes').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (!li) return; const r = A.formacao().find(x => x.id === li.dataset.id); if (r) { limpar(); escolher(r); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  F('Feitos').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (!li) return; const a = analises.find(x => x.id === li.dataset.id); if (a) { preencher(a); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  function listas() {
    const regs = A.formacao();
    const turmas = [...new Set(regs.map(r => r.turma).filter(Boolean))].sort(cmpTxt).reverse();
    const sel = F('FiltroTurma'), at = sel.value;
    sel.innerHTML = '<option value="">Todas as turmas</option>' + turmas.map(t => `<option${t === at ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const feitos = new Set(analises.filter(a => a.tipo === tipo).map(a => a.treinandoId));
    const pend = regs.filter(r => !feitos.has(r.id) && (!sel.value || r.turma === sel.value) && r.status !== 'Desistente').sort((a, b) => cmpTxt(a.nome, b.nome));
    F('Pendentes').innerHTML = pend.slice(0, 200).map(r => `<li data-id="${r.id}"><b>${esc(r.nome)}</b><small>${esc([r.turma, r.instituicao, r.operacao].filter(Boolean).join(' · '))}</small></li>`).join('') || '<li class="vazio-lote">Nenhum pendente.</li>';
    const q = norm(F('Busca').value);
    const fe = analises.filter(a => a.tipo === tipo && (!q || norm(a.nome + ' ' + a.turma).includes(q))).sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
    F('Feitos').innerHTML = fe.slice(0, 200).map(a => `<li data-id="${a.id}"><b>${esc(a.nome)}</b><small>${esc(a.situacao)} · nota ${fmt(a.nota)} · ${dataBR(a.data)}</small></li>`).join('') || '<li class="vazio-lote">Nenhuma análise ainda.</li>';
  }
  limpar(); listas();
  return { listas, limpar };
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
  const card = document.getElementById('cardAnalises');
  if (!T.size && !S.size) { el.innerHTML = `<div class="g-vazio">${G.ic('users', '')}<span>Nenhuma análise de treinamento ou de supervisão feita para os treinandos filtrados.</span></div>`; return; }
  const mediaDe = (mapa, f) => media([...mapa.values()].map(f).filter(v => v !== null && v !== undefined));
  const grupo = mapa => {
    const o = { n: mapa.size, nota: mediaDe(mapa, a => a.nota) };
    CRITERIOS.forEach(([k]) => o[k] = mediaDe(mapa, a => (a.criterios || {})[k] ?? null));
    o.aprov = mapa.size ? [...mapa.values()].filter(a => /^Aprovado/.test(a.situacao)).length / mapa.size : null;
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
    <div class="tabela-wrap"><table class="tabela comp-tab"><thead><tr><th>Treinando</th><th>Turma</th><th class="dir">Nota trein.</th><th class="dir">Nota sup.</th><th class="dir">Diferença</th><th>Perfil trein. / sup.</th><th>Situação trein. / sup.</th><th>Indicação trein. / sup.</th><th>Divergências</th></tr></thead><tbody>
    ${linhas.map(({ r, t, s, d, diverg }) => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.turma)}</td><td class="dir">${t ? fmt(t.nota) : '—'}</td><td class="dir">${s ? fmt(s.nota) : '—'}</td>
      <td class="dir">${d === null ? '—' : `<span class="tag ${Math.abs(d) >= 1.5 ? 'ruim' : Math.abs(d) >= .5 ? 'alerta' : 'bom'}">${sinal(d)}</span>`}</td>
      <td>${cel(t, 'perfil')} / ${cel(s, 'perfil')}</td><td>${cel(t, 'situacao')} / ${cel(s, 'situacao')}</td><td>${cel(t, 'indicacao')} / ${cel(s, 'indicacao')}</td>
      <td>${diverg === null ? '<span class="tag neutro">falta análise</span>' : diverg.length ? diverg.map(x => `<span class="tag ruim">${x}</span>`).join(' ') : '<span class="tag bom">alinhados</span>'}</td></tr>`).join('')}
    </tbody></table></div>`;
  G.duelo(document.getElementById('compAnalisesDuelo'), [gT, gS], ['Análise treinamento', 'Análise supervisão'], metricas, ['#2a78d6', '#eb6834'], ['exam', 'headset'], 'análises');
}
document.addEventListener('dashboard-formacao', comparativo);
document.addEventListener('aba-aberta', e => { if (e.detail === 'analise-trein' && modulos.treinamento) modulos.treinamento.listas(); if (e.detail === 'analise-sup' && modulos.supervisao) modulos.supervisao.listas(); });
window.addEventListener('dados-atualizados', () => {
  analises = ler(KEY, []);
  Object.values(modulos).forEach(m => m.listas());
  if (document.getElementById('aba-dashboard').classList.contains('ativo')) comparativo();
});
// o dashboard pode já estar aberto
if (document.getElementById('aba-dashboard').classList.contains('ativo')) comparativo();
})();
