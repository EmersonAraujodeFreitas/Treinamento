/* =========================================================
   Inovação Casa · Treinamento — Colaboradores ativos
   Reciclagem, alinhamento, novos conteúdos e novos produtos.
   ========================================================= */
(function () {
'use strict';
const A = window.APP;
const { $, $$, norm, num, media, fmt, pct, esc, uid, hoje, dataBR, cmpTxt, toast, baixar, ler, gravar } = A;
const F = id => document.getElementById(id);

const KEY = 'inovacao_treinamento_ativos_v1';
let regs = ler(KEY, []);
const SUP_ANTIGOS = { 'Carla Menezes': 'ALINE DA CONCEIÇÃO SANTOS', 'Rogério Alves': 'ANA JULIA CRUZ LEITE', 'Juliana Paz': 'KELLY DOS SANTOS', 'Marcos Vinícius': 'LAIS SANTOS DE FREITAS' };
regs.forEach((r, i) => { if (r.exemplo) { if (SUP_ANTIGOS[r.supervisor]) r.supervisor = SUP_ANTIGOS[r.supervisor]; if (!r.instituicao) r.instituicao = i % 4 === 3 ? 'Unijorge' : 'UVA'; } });
const KEY_SUP = 'inovacao_treinamento_supervisores_v1';
const SUP_PADRAO = ['ALINE DA CONCEIÇÃO SANTOS', 'ANA JULIA CRUZ LEITE', 'DEBORA CORDEIRO DOS SANTOS ALMEIDA', 'KELLY DOS SANTOS', 'LAIS SANTOS DE FREITAS', 'PAULA VALERIA NASCIMENTO DA SILVA', 'MERCIA LINS DA SILVA', 'MICHELE OLIVEIRA DOS SANTOS'];
let supervisores = ler(KEY_SUP, null) || SUP_PADRAO.slice();
const salvarSup = () => { supervisores = [...new Map(supervisores.filter(Boolean).map(n => [norm(n), n.trim().replace(/\s+/g, ' ')])).values()].sort(cmpTxt); gravar(KEY_SUP, supervisores); };
const supReal = v => supervisores.find(n => norm(n) === norm(v));
const KEY_QUADRO = 'inovacao_treinamento_quadro_v1';
let quadro = ler(KEY_QUADRO, { itens: [], arquivo: '', importadoEm: '' });
quadro.itens.forEach(c => { if (c.bairro && !c.cidade) { const lc = A.acharBairro(c.bairro); c.cidade = lc.cidade; c.bairro = lc.bairro; } });
const ativosQuadro = () => quadro.itens.filter(c => c.status !== 'Desligado');
const salvar = () => { gravar(KEY, regs); F('atContBase').textContent = regs.length; rotuloExemplo(); };

const TIPOS = ['Reciclagem', 'Alinhamento', 'Novo conteúdo', 'Novo produto'];
const COR_TIPO = { 'Reciclagem': ['#2a78d6', 'clock'], 'Alinhamento': ['#1baf7a', 'target'], 'Novo conteúdo': ['#6250d6', 'exam'], 'Novo produto': ['#eb6834', 'rocket'] };
const STATUS = ['Concluído', 'Pendente', 'Reagendado', 'Cancelado'];
const PRESENCAS = ['Presente', 'Ausente', 'Justificado'];
const COR = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#6250d6' };
const q10 = v => v === null || v === undefined || !isFinite(v) ? null : v / 10;
const pctQ = v => v === null || v === undefined || !isFinite(v) ? '—' : fmt(v, 2) + '%';
const sinal = (v, d = 1, suf = '') => v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d) + suf;
const chaveColab = r => norm(r.email || r.matricula || r.nome);

/* =========================================================
   FORMULÁRIO
   ========================================================= */
function setSeg(id, v) {
  const seg = F(id); seg.dataset.valor = v || '';
  $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === v));
  seg.classList.remove('invalido');
}
['atTipo', 'atPresenca'].forEach(id => F(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setSeg(id, b.dataset.v); if (id === 'atPresenca') ajustarPresenca(); } }));
function ajustarPresenca() {
  const p = F('atPresenca').dataset.valor;
  if (p && p !== 'Presente' && !F('atStatus').value) F('atStatus').value = 'Reagendado';
  if (p === 'Presente' && !F('atStatus').value) F('atStatus').value = 'Concluído';
}
F('atAssimilacao').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const el = F('atAssimilacao'); el.dataset.v = el.dataset.v === b.dataset.n ? '' : b.dataset.n;
  $$('button', el).forEach(x => x.classList.toggle('on', x.dataset.n === el.dataset.v));
});

// percentuais e notas
['atQualAntes', 'atQualDepois', 'atPre', 'atPos', 'atCarga'].forEach(id => {
  const el = F(id);
  el.addEventListener('input', () => { const limpo = el.value.replace(/[^\d,.]/g, ''); if (limpo !== el.value) el.value = limpo; validarFaixa(el); evolucao(); });
  el.addEventListener('focusout', () => { const n = num(el.value); if (n === null) return; if (id.startsWith('atQual') && n <= 100) el.value = fmt(n, 2); else if ((id === 'atPre' || id === 'atPos') && n <= 10) el.value = fmt(n, 1); });
});
function validarFaixa(el) {
  const n = num(el.value), max = el.id.startsWith('atQual') ? 100 : el.id === 'atCarga' ? 200 : 10;
  el.classList.toggle('invalido', n !== null && (n < 0 || n > max));
}
function evolucao() {
  const pre = num(F('atPre').value), pos = num(F('atPos').value), qa = num(F('atQualAntes').value), qd = num(F('atQualDepois').value);
  const box = (el, d, txt) => { el.textContent = txt; el.className = 'ad-res' + (d === null ? '' : d > 0 ? ' sobe' : d < 0 ? ' desce' : ''); };
  const dn = pre !== null && pos !== null ? pos - pre : null;
  const dq = qa !== null && qd !== null ? qd - qa : null;
  box(F('atEvoNota'), dn, dn === null ? '—' : sinal(dn, 1, ' pt'));
  box(F('atEvoQual'), dq, dq === null ? '—' : sinal(dq, 2, ' p.p.'));
}

// cidade / bairro
A.autocomplete($('#atAutoCidade'), {
  fonte: () => A.MUN,
  aoEscolher: (v, novo, blur) => {
    const real = A.MUN_NORM.get(norm(v)), inp = F('atCidade');
    if (real) { const mudou = inp.dataset.ok !== real; inp.value = real; inp.dataset.ok = real; F('atBairro').disabled = false; F('atBairro').placeholder = 'Digite para buscar o bairro…'; if (mudou) F('atBairro').value = ''; inp.classList.remove('invalido'); }
    else { inp.dataset.ok = ''; F('atBairro').disabled = true; F('atBairro').value = ''; F('atBairro').placeholder = 'Escolha a cidade primeiro'; inp.classList.toggle('invalido', !!v); }
  }
});
A.autocomplete($('#atAutoBairro'), {
  fonte: () => A.bairrosDaCidade(F('atCidade').dataset.ok),
  permitirNovo: true, rotuloNovo: 'Usar novo bairro',
  aoEscolher: v => { const real = A.bairrosDaCidade(F('atCidade').dataset.ok).find(b => norm(b) === norm(v)); F('atBairro').value = real || v.replace(/\s+/g, ' '); }
});

// colaboradores conhecidos (ativos + aprovados da formação)
function colaboradores() {
  const m = new Map();
  A.formacao().filter(r => r.status === 'Aprovado').forEach(r => m.set(norm(r.email || r.nome), { nome: r.nome, email: r.email, cidade: r.cidade, bairro: r.bairro, operacao: r.indicacao === 'Permanência' || r.operacao === 'Permanência' ? 'Permanência' : r.operacao === 'Captação' || r.indicacao === 'Captação' ? 'Captação' : '', instituicao: r.instituicao, origem: 'Formação ' + (r.turma || '') }));
  regs.slice().sort((a, b) => (a.atualizadoEm || '').localeCompare(b.atualizadoEm || '')).forEach(r => m.set(chaveColab(r), { nome: r.nome, email: r.email, matricula: r.matricula, supervisor: r.supervisor, tempoCasa: r.tempoCasa, turno: r.turno, cidade: r.cidade, bairro: r.bairro, operacao: r.operacao, instituicao: r.instituicao, origem: (regs.filter(x => chaveColab(x) === chaveColab(r)).length) + ' treinamento(s) registrado(s)' }));
  quadro.itens.filter(c => c.status !== 'Desligado').forEach(c => {
    const k = norm(c.email || c.nome), ant = [...m.entries()].find(([kk, v]) => kk === k || norm(v.nome) === norm(c.nome) || (c.mat && v.matricula === c.mat));
    if (ant) m.delete(ant[0]);
    m.set(k, { nome: c.nome, email: c.email, matricula: c.mat, supervisor: c.supervisor, tempoCasa: c.tempoCasa, turno: c.turno, cidade: c.cidade, bairro: c.bairro, operacao: c.operacao, instituicao: c.ies, origem: 'BD da operação · ' + c.status + (c.grupo ? ' · ' + c.grupo : '') });
  });
  return [...m.values()].sort((a, b) => cmpTxt(a.nome, b.nome));
}
(function () {
  const wrap = $('#atAutoNome'), inp = F('atNome'), ul = $('ul', wrap);
  let itens = [], ativo = -1;
  function abrir() {
    const q = norm(inp.value);
    const termos = q.split(/\s+/).filter(Boolean);
    const todos = colaboradores();
    const achados = todos.map(c => {
      const alvo = norm([c.nome, c.email, c.matricula, c.supervisor].filter(Boolean).join(' '));
      if (termos.some(t => !alvo.includes(t))) return null;
      const n = norm(c.nome); return { c, peso: n.startsWith(q) ? 0 : n.split(' ').some(p => p.startsWith(termos[0] || '')) ? 1 : 2 };
    }).filter(Boolean).sort((a, b) => a.peso - b.peso || cmpTxt(a.c.nome, b.c.nome));
    itens = achados.slice(0, 40).map(x => x.c);
    const marca = txt => { let h = esc(txt); termos.forEach(t => { const i = norm(txt).indexOf(t); if (i >= 0) { const orig = txt.slice(i, i + t.length); h = h.replace(esc(orig), '<mark>' + esc(orig) + '</mark>'); } }); return h; };
    const sigla = n => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('');
    ul.innerHTML = (itens.length ? `<li class="cab-lista">${achados.length} ${achados.length === 1 ? 'colaborador encontrado' : 'colaboradores encontrados'}${achados.length > 40 ? ' · continue digitando para filtrar' : ''}</li>` : '') +
      (itens.length ? itens.map((c, i) => `<li data-i="${i}" class="item-colab"><span class="av">${esc(sigla(c.nome))}</span><span class="ic-txt"><b>${marca(c.nome)}</b><small>${esc([c.instituicao, c.operacao, c.supervisor].filter(Boolean).join(' · '))}</small></span><small class="orig">${esc(c.origem.startsWith('BD') ? c.origem.split(' · ')[1] || 'BD' : c.origem)}</small></li>`).join('')
      : `<li class="sem">${q ? (todos.length ? 'Nenhum consultor com esse nome no BD — se for novo, digite o nome completo' : 'Importe o BD da operação na Base de dados para ver a lista de consultores') : 'Nenhum colaborador na base ainda — importe o BD da operação'}</li>`);
    ativo = itens.length && q ? 0 : -1; marcar(); ul.hidden = false;
  }
  const marcar = () => { $$('li[data-i]', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); const a = $$('li[data-i]', ul)[ativo]; if (a) a.scrollIntoView({ block: 'nearest' }); };
  function escolher(i) {
    let c = itens[i]; if (!c) return; ul.hidden = true;
    inp.value = c.nome;
    const preenchidos = [];
    const set = (id, v) => { const el = F(id); const val = v || ''; if (el.tagName === 'SELECT' && val && ![...el.options].some(o => o.value === val || o.text === val)) return; el.value = val; if (val) preenchidos.push(el); };
    if (c.supervisor && !supReal(c.supervisor)) { supervisores.push(c.supervisor); salvarSup(); }
    set('atEmail', c.email); set('atMatricula', c.matricula); set('atSupervisor', supReal(c.supervisor) || c.supervisor); set('atTempoCasa', c.tempoCasa); set('atTurno', c.turno);
    if (c.operacao) set('atOperacao', c.operacao); if (c.instituicao) set('atInstituicao', c.instituicao);
    if (c.bairro && (!c.cidade || !A.bairrosDaCidade(c.cidade).some(b => norm(b) === norm(c.bairro)))) { const lc = A.acharBairro(c.bairro, c.cidade); c = { ...c, cidade: lc.cidade, bairro: lc.bairro }; }
    const cid = A.MUN_NORM.get(norm(c.cidade)) || '';
    if (cid && c.bairro) A.aprenderBairro(cid, c.bairro);
    F('atCidade').value = cid; F('atCidade').dataset.ok = cid; F('atBairro').disabled = !cid; F('atBairro').value = cid ? c.bairro || '' : ''; F('atBairro').placeholder = cid ? 'Digite para buscar o bairro…' : 'Escolha a cidade primeiro';
    if (cid) preenchidos.push(F('atCidade')); if (cid && c.bairro) preenchidos.push(F('atBairro'));
    preenchidos.forEach(el => { el.classList.remove('auto-preenchido'); void el.offsetWidth; el.classList.add('auto-preenchido'); });
    $$('#atForm .invalido').forEach(el => { if (preenchidos.includes(el) || el.id === 'atNome') el.classList.remove('invalido'); });
    F('atDicaNome').textContent = `${preenchidos.length} campos preenchidos automaticamente · origem: ${c.origem}`;
  }
  inp.addEventListener('input', abrir); inp.addEventListener('focus', abrir);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter') { if (!ul.hidden && ativo >= 0) { e.preventDefault(); escolher(ativo); } }
    else if (e.key === 'Escape' || e.key === 'Tab') ul.hidden = true;
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(+li.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(() => ul.hidden = true, 120));
})();

function datalists() {
  const uniq = k => [...new Set(regs.map(r => r[k]).filter(Boolean))].sort(cmpTxt);
  F('atListaTemas').innerHTML = uniq('tema').map(t => `<option value="${esc(t)}">`).join('');
  F('atListaInstrutores').innerHTML = uniq('instrutor').map(t => `<option value="${esc(t)}">`).join('');
}
// tema já usado puxa os dados da ação
F('atTema').addEventListener('change', () => {
  if (F('atId').value) return;
  const r = regs.slice().reverse().find(x => norm(x.tema) === norm(F('atTema').value)); if (!r) return;
  if (!F('atTipo').dataset.valor && r.tipo) setSeg('atTipo', r.tipo);
  [['atData', 'data'], ['atCarga', 'carga'], ['atOperacao', 'operacao'], ['atInstrutor', 'instrutor'], ['atModalidade', 'modalidade'], ['atMotivo', 'motivo'], ['atObjetivo', 'objetivo']]
    .forEach(([id, k]) => { if (!F(id).value && r[k] !== undefined && r[k] !== null) F(id).value = k === 'carga' ? fmt(r[k], r[k] % 1 ? 1 : 0) : r[k]; });
});

const ACAO = [['atTema', 'tema'], ['atData', 'data'], ['atInstituicao', 'instituicao'], ['atOperacao', 'operacao'], ['atInstrutor', 'instrutor'], ['atModalidade', 'modalidade'], ['atMotivo', 'motivo'], ['atObjetivo', 'objetivo']];
const COLAB = [['atNome', 'nome'], ['atMatricula', 'matricula'], ['atEmail', 'email'], ['atSupervisor', 'supervisor'], ['atTempoCasa', 'tempoCasa'], ['atTurno', 'turno']];
const msg = (t, tipo) => { const m = F('atMsg'); m.textContent = t; m.className = 'msg ' + (tipo || ''); };

function limpar(manterAcao) {
  const acao = manterAcao ? { tipo: F('atTipo').dataset.valor, ...Object.fromEntries(ACAO.map(([id, k]) => [k, F(id).value])), carga: F('atCarga').value } : null;
  F('atForm').reset(); F('atId').value = '';
  setSeg('atTipo', ''); setSeg('atPresenca', '');
  F('atAssimilacao').dataset.v = ''; $$('#atAssimilacao button').forEach(b => b.classList.remove('on'));
  F('atCidade').dataset.ok = ''; F('atBairro').disabled = true; F('atBairro').placeholder = 'Escolha a cidade primeiro';
  F('atDicaNome').textContent = 'Busca entre colaboradores já registrados e aprovados na formação inicial';
  $$('#atForm .invalido').forEach(e => e.classList.remove('invalido'));
  F('atModoEdicao').hidden = true; F('atSalvarTxt').textContent = 'Salvar registro'; F('atBtnNovo').lastChild.textContent = 'Novo registro';
  if (acao) { setSeg('atTipo', acao.tipo); ACAO.forEach(([id, k]) => F(id).value = acao[k]); F('atCarga').value = acao.carga; }
  evolucao(); msg('');
}
function preencher(r) {
  limpar(false);
  F('atId').value = r.id;
  setSeg('atTipo', r.tipo); setSeg('atPresenca', r.presenca);
  [...ACAO, ...COLAB].forEach(([id, k]) => F(id).value = r[k] ?? '');
  F('atCarga').value = r.carga === null || r.carga === undefined ? '' : fmt(r.carga, r.carga % 1 ? 1 : 0);
  F('atCidade').value = r.cidade || ''; F('atCidade').dataset.ok = A.MUN_NORM.get(norm(r.cidade)) || '';
  F('atBairro').disabled = !F('atCidade').dataset.ok; F('atBairro').value = r.bairro || '';
  F('atStatus').value = r.status || ''; F('atProxima').value = r.proxima || ''; F('atObs').value = r.obs || '';
  F('atPre').value = r.pre === null || r.pre === undefined ? '' : fmt(r.pre, 1);
  F('atPos').value = r.pos === null || r.pos === undefined ? '' : fmt(r.pos, 1);
  F('atQualAntes').value = r.qualAntes === null || r.qualAntes === undefined ? '' : fmt(r.qualAntes, 2);
  F('atQualDepois').value = r.qualDepois === null || r.qualDepois === undefined ? '' : fmt(r.qualDepois, 2);
  if (r.assimilacao) { F('atAssimilacao').dataset.v = String(r.assimilacao); $$('#atAssimilacao button').forEach(b => b.classList.toggle('on', b.dataset.n === String(r.assimilacao))); }
  F('atModoEdicao').hidden = false; F('atModoTxt').textContent = 'Editando: ' + (r.nome || '').split(' ').slice(0, 2).join(' ');
  F('atSalvarTxt').textContent = 'Salvar alterações'; F('atBtnNovo').lastChild.textContent = 'Cancelar edição';
  evolucao();
}
F('atBtnLimpar').onclick = () => limpar(false);
F('atBtnNovo').onclick = () => { limpar(false); F('atTema').focus(); };

F('atForm').addEventListener('submit', e => {
  e.preventDefault();
  $$('#atForm .invalido').forEach(x => x.classList.remove('invalido'));
  const erros = [];
  const exigir = (id, ok, txt) => { if (!ok) { F(id).classList.add('invalido'); erros.push([id, txt]); } };
  exigir('atTipo', F('atTipo').dataset.valor, 'tipo de treinamento');
  exigir('atTema', F('atTema').value.trim(), 'tema');
  exigir('atData', F('atData').value, 'data');
  exigir('atInstituicao', F('atInstituicao').value, 'instituição (UVA ou Unijorge)');
  exigir('atOperacao', F('atOperacao').value, 'operação (Captação ou Permanência)');
  exigir('atNome', F('atNome').value.trim().split(/\s+/).length >= 2, 'nome completo do colaborador');
  exigir('atPresenca', F('atPresenca').dataset.valor, 'presença');
  exigir('atStatus', F('atStatus').value, 'situação');
  const email = F('atEmail').value.trim();
  if (email) exigir('atEmail', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), 'e-mail válido');
  const pre = num(F('atPre').value), pos = num(F('atPos').value), qa = num(F('atQualAntes').value), qd = num(F('atQualDepois').value), carga = num(F('atCarga').value);
  if (pre !== null) exigir('atPre', pre >= 0 && pre <= 10, 'pré-teste de 0 a 10');
  if (pos !== null) exigir('atPos', pos >= 0 && pos <= 10, 'pós-teste de 0 a 10');
  if (qa !== null) exigir('atQualAntes', qa >= 0 && qa <= 100, 'qualidade antes entre 0,00% e 100,00%');
  if (qd !== null) exigir('atQualDepois', qd >= 0 && qd <= 100, 'qualidade depois entre 0,00% e 100,00%');
  if (carga !== null) exigir('atCarga', carga > 0 && carga <= 200, 'carga horária válida');
  if (erros.length) {
    msg('Confira: ' + erros.map(x => x[1]).join(', ') + '.', 'erro');
    const alvo = F(erros[0][0]); alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (alvo.focus) alvo.focus({ preventScroll: true });
    return;
  }
  const idAtual = F('atId').value;
  const nome = F('atNome').value.trim().replace(/\s+/g, ' ');
  const dup = regs.find(r => r.id !== idAtual && norm(r.nome) === norm(nome) && norm(r.tema) === norm(F('atTema').value) && r.data === F('atData').value);
  if (dup && !confirm(`${nome} já tem registro de "${dup.tema}" nesta data. Salvar mesmo assim?`)) return;
  const r = idAtual ? regs.find(x => x.id === idAtual) : { id: uid(), criadoEm: new Date().toISOString() };
  r.tipo = F('atTipo').dataset.valor;
  ACAO.forEach(([id, k]) => r[k] = F(id).value.trim());
  COLAB.forEach(([id, k]) => r[k] = F(id).value.trim());
  r.nome = nome; r.email = email.toLowerCase(); r.carga = carga;
  r.cidade = F('atCidade').dataset.ok || ''; r.bairro = r.cidade ? F('atBairro').value.trim() : '';
  r.presenca = F('atPresenca').dataset.valor; r.status = F('atStatus').value; r.proxima = F('atProxima').value; r.obs = F('atObs').value.trim();
  r.pre = pre; r.pos = pos; r.qualAntes = qa; r.qualDepois = qd;
  r.assimilacao = F('atAssimilacao').dataset.v ? +F('atAssimilacao').dataset.v : null;
  r.atualizadoEm = new Date().toISOString(); delete r.exemplo;
  if (!idAtual) regs.push(r);
  if (r.cidade && r.bairro) A.aprenderBairro(r.cidade, r.bairro);
  if (r.supervisor) { const real = supReal(r.supervisor); if (real) r.supervisor = real; else { supervisores.push(r.supervisor); salvarSup(); } }
  salvar(); datalists();
  if (idAtual) { preencher(r); msg('Alterações salvas. Você pode continuar editando ou buscar outro registro.', 'ok'); toast('Registro atualizado'); return; }
  limpar(true);
  msg(`Treinamento de ${r.nome.split(' ')[0]} salvo. A ação foi mantida para registrar o próximo colaborador.`, 'ok');
  toast('Registro salvo'); F('atNome').focus();
});

// buscar para editar
(function () {
  const wrap = F('atBuscaEdit'), inp = F('atBuscaEditar'), ul = $('ul', wrap);
  let itens = [], ativo = -1;
  function abrir() {
    const q = norm(inp.value);
    itens = regs.filter(r => !q || norm([r.nome, r.tema, r.supervisor, r.email, r.tipo].join(' ')).includes(q)).sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')).slice(0, 12);
    ul.innerHTML = itens.length ? itens.map((r, i) => `<li data-i="${i}"><span><b>${esc(r.nome)}</b><br><small>${esc(r.tipo)} · ${esc(r.tema)} · ${dataBR(r.data)}</small></span><small>${esc(r.status)}</small></li>`).join('')
      : `<li class="sem">${regs.length ? 'Nenhum registro encontrado' : 'Nenhum registro salvo ainda'}</li>`;
    ativo = itens.length ? 0 : -1; $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); ul.hidden = false;
  }
  function escolher(i) { const r = itens[i]; if (!r) return; ul.hidden = true; inp.value = ''; inp.blur(); preencher(r); msg('Registro carregado para edição. Altere o que precisar e clique em Salvar alterações.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  inp.addEventListener('input', abrir); inp.addEventListener('focus', abrir);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); $$('li', ul).forEach((li, i) => li.classList.toggle('ativo', i === ativo)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(ativo); }
    else if (e.key === 'Escape') ul.hidden = true;
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(+li.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(() => ul.hidden = true, 120));
})();

// supervisor: lista fixa + cadastro de novos
A.autocomplete($('#atAutoSup'), {
  fonte: () => supervisores, permitirNovo: true, rotuloNovo: 'Cadastrar supervisor',
  aoEscolher: (v, novo) => {
    const t = v.trim().replace(/\s+/g, ' '); if (!t) return;
    const real = supReal(t);
    if (real) { F('atSupervisor').value = real; return; }
    if (novo) { supervisores.push(t.toUpperCase()); salvarSup(); F('atSupervisor').value = t.toUpperCase(); toast('Supervisor cadastrado'); }
  }
});
function listaSup() {
  const uso = n => regs.filter(r => norm(r.supervisor) === norm(n)).length;
  F('supLista').innerHTML = supervisores.map((n, i) => `<li><span class="sup-av">${esc(n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join(''))}</span>
    <input value="${esc(n)}" data-i="${i}" aria-label="Nome do supervisor"><small>${uso(n)} registro${uso(n) === 1 ? '' : 's'}</small>
    <button type="button" class="btn-icone" data-del="${i}" title="Remover" aria-label="Remover">${G.ic('trash', '')}</button></li>`).join('') || '<li class="dica">Nenhum supervisor cadastrado.</li>';
  F('supInfo').textContent = `${supervisores.length} supervisores · renomear aqui atualiza os registros já salvos`;
}
F('atGerSup').onclick = () => { listaSup(); F('dlgSup').showModal(); setTimeout(() => F('supNovo').focus(), 50); };
function addSup() {
  const v = F('supNovo').value.trim().replace(/\s+/g, ' ').toUpperCase(); if (!v) return;
  if (supReal(v)) { toast('Esse supervisor já está na lista'); return; }
  supervisores.push(v); salvarSup(); F('supNovo').value = ''; listaSup(); toast('Supervisor cadastrado');
}
F('supAdd').onclick = addSup;
F('supNovo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSup(); } });
F('supLista').addEventListener('change', e => {
  const inp = e.target.closest('input[data-i]'); if (!inp) return;
  const antigo = supervisores[+inp.dataset.i], novo = inp.value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!novo) { inp.value = antigo; return; }
  regs.forEach(r => { if (norm(r.supervisor) === norm(antigo)) r.supervisor = novo; });
  supervisores[+inp.dataset.i] = novo; salvarSup(); salvar(); listaSup(); toast('Supervisor renomeado');
});
F('supLista').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const n = supervisores[+b.dataset.del];
  if (!confirm(`Remover ${n} da lista? Os registros já salvos continuam com o nome.`)) return;
  supervisores.splice(+b.dataset.del, 1); salvarSup(); listaSup();
});

/* =========================================================
   DASHBOARD
   ========================================================= */
const FILT = {};
const mes = d => d ? d.slice(0, 7) : '';
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = m => { const [a, mm] = m.split('-'); return NOMES_MES[+mm - 1] + '/' + a.slice(2); };
function filtrar(lista, ignorar) {
  return lista.filter(r => {
    for (const k of ['tipo', 'instituicao', 'operacao', 'tema', 'supervisor', 'instrutor', 'status', 'presenca']) if (k !== ignorar && FILT[k] && r[k] !== FILT[k]) return false;
    if (FILT.de && (r.data || '') < FILT.de) return false;
    if (FILT.ate && (r.data || '') > FILT.ate) return false;
    if (FILT.abrangencia === 'ssa' && r.cidade !== 'Salvador') return false;
    if (FILT.abrangencia === 'fora' && (!r.cidade || r.cidade === 'Salvador')) return false;
    return true;
  });
}
function opcoes(k, valores, todos) {
  const sel = $(`#atFiltros [data-f="${k}"]`);
  sel.innerHTML = `<option value="">${todos}</option>` + valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  sel.value = valores.includes(FILT[k]) ? FILT[k] : ''; FILT[k] = sel.value;
}
function montarFiltros() {
  const u = (k, l) => [...new Set(filtrar(regs, k).map(r => r[k]).filter(Boolean))].sort(cmpTxt);
  opcoes('tipo', TIPOS, 'Todos'); opcoes('tema', u('tema'), 'Todos'); opcoes('supervisor', u('supervisor'), 'Todos'); opcoes('instrutor', u('instrutor'), 'Todos');
  opcoes('status', STATUS, 'Todas'); opcoes('presenca', PRESENCAS, 'Todas');
  $$('#atFiltros [data-f]').forEach(el => el.classList.toggle('ativo', !!el.value));
}
F('atFiltros').addEventListener('change', e => { const el = e.target.closest('[data-f]'); if (el) { FILT[el.dataset.f] = el.value; render(); } });
F('atLimparFiltros').onclick = () => { Object.keys(FILT).forEach(k => delete FILT[k]); $$('#atFiltros [data-f]').forEach(el => el.value = ''); render(); };

function resumo(l) {
  const pres = l.filter(r => r.presenca === 'Presente');
  const comNota = pres.filter(r => r.pre !== null && r.pos !== null && r.pre !== undefined && r.pos !== undefined);
  const comQual = pres.filter(r => r.qualAntes !== null && r.qualDepois !== null && r.qualAntes !== undefined && r.qualDepois !== undefined);
  return {
    n: l.length, colab: new Set(l.map(chaveColab)).size,
    presenca: l.length ? pres.length / l.length : null,
    horas: pres.reduce((s, r) => s + (r.carga || 0), 0),
    pre: media(comNota.map(r => r.pre)), pos: media(comNota.map(r => r.pos)), nNota: comNota.length,
    qa: media(comQual.map(r => r.qualAntes)), qd: media(comQual.map(r => r.qualDepois)), nQual: comQual.length,
    evoNota: comNota.length ? media(comNota.map(r => r.pos - r.pre)) : null,
    evoQual: comQual.length ? media(comQual.map(r => r.qualDepois - r.qualAntes)) : null,
    melhorou: comQual.length ? comQual.filter(r => r.qualDepois > r.qualAntes).length / comQual.length : null,
    pend: l.filter(r => r.status === 'Pendente' || r.status === 'Reagendado').length,
    assim: media(pres.map(r => r.assimilacao ?? null)),
    concl: l.length ? l.filter(r => r.status === 'Concluído').length / l.length : null
  };
}
const agrupar = (l, f) => { const m = new Map(); l.forEach(r => { const k = f(r); if (k) (m.get(k) || m.set(k, []).get(k)).push(r); }); return m; };
const tipH = (t, linhas) => `<b>${esc(t)}</b>` + linhas.map(x => `<br>${esc(x)}`).join('');
function contar(raiz) {
  $$('[data-conta]', raiz).forEach(el => {
    const alvo = +el.dataset.conta, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || '', pre = el.dataset.pre || '';
    const t0 = performance.now();
    const passo = t => { const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = pre + fmt(alvo * e, dec) + suf; if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

function render() {
  montarFiltros();
  const l = filtrar(regs);
  const temFiltro = Object.values(FILT).some(Boolean);
  F('atResumoFiltro').textContent = temFiltro ? `${l.length} de ${regs.length} participações com os filtros aplicados` : `${regs.length} participações registradas`;
  F('atDashVazio').hidden = l.length > 0; F('atDashConteudo').hidden = !l.length;
  if (!l.length) { $('#atDashVazio b').textContent = regs.length ? 'Nenhum registro com esses filtros.' : 'Nenhum treinamento registrado.'; F('atBtnExemploDash').hidden = !!regs.length; return; }
  const R = resumo(l);
  const acoes = new Set(l.map(r => norm(r.tema) + '|' + r.data)).size;

  const kpi = (t, ic, cor, valor, dec, suf, sub, barra, destaque, pre) => `<div class="kpi${destaque ? ' destaque' : ''}" style="--c:${cor}">
    <div class="kpi-top"><span>${t}</span><span class="kpi-ic">${G.ic(ic)}</span></div>
    <b ${valor === null ? '' : `data-conta="${valor}" data-dec="${dec}" data-suf="${suf}" data-pre="${pre || ''}"`}>${valor === null ? '—' : (pre || '') + fmt(0, dec) + suf}</b>
    ${barra !== undefined ? `<div class="kpi-bar"><i style="--w:${Math.max(0, Math.min(100, (barra || 0) * 100))}%"></i></div>` : ''}<small>${sub}</small></div>`;
  F('atKpis').innerHTML = [
    kpi('Colaboradores treinados', 'users', '#f5c542', R.colab, 0, '', `${R.n} participações · ${acoes} ações`, undefined, true),
    kpi('Horas de treinamento', 'clock', COR.s1, R.horas, R.horas % 1 ? 1 : 0, 'h', `${fmt(R.colab ? R.horas / R.colab : 0)}h por colaborador`),
    kpi('Presença', 'check', '#0ca30c', R.presenca === null ? null : R.presenca * 100, 0, '%', `${l.filter(r => r.presenca !== 'Presente').length} faltas`, R.presenca),
    kpi('Nota pós-teste', 'exam', COR.s4, R.pos, 1, '', R.evoNota === null ? 'sem pré e pós lançados' : `${sinal(R.evoNota, 1)} pt em relação ao pré`, R.pos === null ? 0 : R.pos / 10),
    kpi('Qualidade depois', 'headset', COR.s3, R.qd, 2, '%', R.evoQual === null ? 'sem antes e depois lançados' : `${sinal(R.evoQual, 2)} p.p. em relação a antes`, R.qd === null ? 0 : R.qd / 100),
    kpi('Melhoraram na qualidade', 'up', COR.s2, R.melhorou === null ? null : R.melhorou * 100, 0, '%', `de ${R.nQual} com antes e depois`, R.melhorou),
    kpi('Pendentes / reagendados', 'alert', '#d03b3b', R.pend, 0, '', `${pct(R.concl)} concluídos`),
  ].join('');
  contar(F('atKpis'));

  // destaques
  const ins = [];
  const porTema = [...agrupar(l, r => r.tema).entries()].map(([t, rs]) => ({ t, ...resumo(rs) }));
  const minN = porTema.some(x => x.nQual >= 3) ? 3 : 1;
  const temaQ = porTema.filter(x => x.evoQual !== null && x.nQual >= minN).sort((a, b) => b.evoQual - a.evoQual);
  if (temaQ.length) ins.push(['bom', 'trophy', 'Tema com maior ganho', temaQ[0].t, `${sinal(temaQ[0].evoQual, 2)} p.p. na qualidade · ${temaQ[0].nQual} colaboradores`]);
  if (temaQ.length > 1 && temaQ[temaQ.length - 1].evoQual < temaQ[0].evoQual) { const p = temaQ[temaQ.length - 1]; ins.push([p.evoQual <= 0 ? 'ruim' : 'alerta', 'down', 'Tema com menor ganho', p.t, `${sinal(p.evoQual, 2)} p.p. na qualidade · avaliar reforço`]); }
  if (R.evoNota !== null) ins.push([R.evoNota > 0 ? 'bom' : 'alerta', 'exam', 'Conhecimento', `${sinal(R.evoNota, 1)} pt do pré para o pós`, `Pré ${fmt(R.pre)} → pós ${fmt(R.pos)} (${R.nNota} colaboradores)`]);
  const faltas = l.filter(r => r.presenca !== 'Presente').length;
  if (faltas) ins.push(['alerta', 'alert', 'Faltas', `${faltas} ausência${faltas > 1 ? 's' : ''}`, `${l.filter(r => r.presenca === 'Justificado').length} justificadas · reagendar quem não participou`]);
  const semAcomp = l.filter(r => r.status === 'Concluído' && r.presenca === 'Presente' && (r.qualDepois === null || r.qualDepois === undefined)).length;
  if (semAcomp) ins.push(['', 'clock', 'Sem medição depois', `${semAcomp} colaborador${semAcomp > 1 ? 'es' : ''}`, 'Concluíram o treinamento mas ainda não têm a nota da qualidade depois']);
  F('atInsights').innerHTML = ins.map(([c, ic, t, b, p], i) => `<div class="insight ${c}" style="--d:${i * 70}ms"><span class="ins-ic">${G.ic(ic)}</span><div><span>${t}</span><b>${esc(b)}</b><p>${esc(p)}</p></div></div>`).join('');

  // antes × depois
  G.duelo(F('atAntesDepois'), [{ n: R.nNota || R.nQual, nota: R.pre, qual: R.qa === null ? null : R.qa / 10 }, { n: R.nNota || R.nQual, nota: R.pos, qual: R.qd === null ? null : R.qd / 10 }],
    ['Antes do treinamento', 'Depois do treinamento'], [['Avaliação de conhecimento', 'nota', 10, 'exam'], ['Nota da qualidade', 'qual', 10, 'headset', 'q']], ['#9aa6b6', COR.s3], ['clock', 'up'], 'colaboradores');

  // tipos
  G.rosca(F('atGTipo'), TIPOS.map(t => ({ rotulo: t, valor: l.filter(r => r.tipo === t).length, cor: COR_TIPO[t][0], icone: COR_TIPO[t][1] })), { rotuloTotal: 'participações' });

  // por mês
  const meses = [...new Set(l.map(r => mes(r.data)).filter(Boolean))].sort().slice(-12);
  G.colunas(F('atGMes'), meses.map(m => { const rs = l.filter(r => mes(r.data) === m); const p = rs.filter(r => r.presenca === 'Presente').length; return { rotulo: rotMes(m), valor: rs.length, rotuloValor: String(rs.length), cor: COR.s1, tip: tipH(rotMes(m), [`${rs.length} participações`, `${p} presentes`, `${new Set(rs.map(r => norm(r.tema))).size} temas`]) }; }), { titulo: 'Participações por mês' });

  // ganho por tema / supervisor
  const rankGanho = (el, grupos, vazio) => {
    const minN = grupos.some(x => x.nQual >= 3) ? 3 : 1;
    const itens = grupos.filter(x => x.evoQual !== null && x.nQual >= minN).sort((a, b) => b.evoQual - a.evoQual).slice(0, 12);
    const max = Math.max(1, ...itens.map(x => Math.abs(x.evoQual))) * 1.1;
    G.ranking(el, itens.map(x => ({ rotulo: x.nome, sub: `${x.nQual} com antes e depois · ${pctQ(x.qa)} → ${pctQ(x.qd)}`, valor: Math.max(0, x.evoQual), rotuloValor: sinal(x.evoQual, 2), cor: x.evoQual > 0 ? COR.s3 : '#d03b3b',
      tip: tipH(x.nome, [`Qualidade antes: ${pctQ(x.qa)}`, `Qualidade depois: ${pctQ(x.qd)}`, `Ganho: ${sinal(x.evoQual, 2)} p.p.`, `Nota pós-teste: ${fmt(x.pos)}`]) })), { max, posicao: true, vazio });
  };
  rankGanho(F('atGTemas'), porTema.map(x => ({ nome: x.t, ...x })), 'Lance a qualidade antes e depois para ver o ganho');
  rankGanho(F('atGSupervisor'), [...agrupar(l, r => r.supervisor).entries()].map(([s, rs]) => ({ nome: s, ...resumo(rs) })), 'Informe o supervisor e a qualidade antes e depois');

  // cobertura do quadro
  const card = F('atGCobertura').closest('.cartao');
  if (!quadro.itens.length) { card.hidden = true; }
  else {
    card.hidden = false;
    const pres = l.filter(r => r.presenca === 'Presente');
    const foiTreinado = c => pres.some(r => (c.email && norm(r.email) === norm(c.email)) || (c.mat && r.matricula === c.mat) || norm(r.nome) === norm(c.nome));
    const base = ativosQuadro().filter(c => (!FILT.instituicao || c.ies === FILT.instituicao) && (!FILT.operacao || c.operacao === FILT.operacao) && (!FILT.supervisor || norm(c.supervisor) === norm(FILT.supervisor)));
    const porSup = [...agrupar(base, c => c.supervisor || 'Sem supervisor').entries()].map(([sp, cs]) => { const t = cs.filter(foiTreinado).length; return { sp, t, n: cs.length, p: t / cs.length }; }).sort((a, b) => b.p - a.p || b.n - a.n);
    const tot = base.length, tr = base.filter(foiTreinado).length;
    F('atCobInfo').textContent = `${tr} de ${tot} colaboradores ativos do BD (${pct(tot ? tr / tot : null)}) participaram de ao menos um treinamento no período filtrado`;
    G.ranking(F('atGCobertura'), porSup.map(x => ({ rotulo: x.sp, sub: `${x.t} de ${x.n} treinados · faltam ${x.n - x.t}`, valor: x.p * 100, rotuloValor: pct(x.p), cor: x.p >= .8 ? COR.s3 : x.p >= .5 ? COR.s1 : COR.s2,
      tip: tipH(x.sp, [`${x.t} de ${x.n} colaboradores treinados`, `Faltam ${x.n - x.t}`]) })), { max: 100, meta: 80, posicao: true, legenda: [['80% ou mais', COR.s3], ['50% a 79%', COR.s1], ['Abaixo de 50%', COR.s2]] });
    const faltam = tot - tr;
    if (faltam) F('atInsights').insertAdjacentHTML('beforeend', `<div class="insight alerta"><span class="ins-ic">${G.ic('users')}</span><div><span>Ainda sem treinamento</span><b>${faltam} colaborador${faltam > 1 ? 'es' : ''} ativo${faltam > 1 ? 's' : ''}</b><p>do BD da operação não participaram de nenhum treinamento no período</p></div></div>`);
  }

  // instituição
  const conv0 = x => ({ n: x.n, presenca: x.presenca, pos: x.pos, qd: x.qd === null ? null : x.qd / 10, concl: x.concl });
  G.duelo(F('atCompInst'), [conv0(resumo(l.filter(r => r.instituicao === 'UVA'))), conv0(resumo(l.filter(r => r.instituicao === 'Unijorge')))], ['UVA', 'Unijorge'],
    [['Presença', 'presenca', 1, 'check', true], ['Nota pós-teste', 'pos', 10, 'exam'], ['Qualidade depois', 'qd', 10, 'headset', 'q'], ['Concluídos', 'concl', 1, 'flag', true]], [COR.s1, COR.s4], ['building', 'building'], 'registros');

  // operação
  const cap = resumo(l.filter(r => r.operacao === 'Captação')), per = resumo(l.filter(r => r.operacao === 'Permanência'));
  const conv = x => ({ n: x.n, presenca: x.presenca, pos: x.pos, qd: x.qd === null ? null : x.qd / 10, evoQ: x.evoQual === null ? null : Math.max(0, x.evoQual) / 10, concl: x.concl });
  G.duelo(F('atCompOperacao'), [conv(cap), conv(per)], ['Captação', 'Permanência'],
    [['Presença', 'presenca', 1, 'check', true], ['Nota pós-teste', 'pos', 10, 'exam'], ['Qualidade depois', 'qd', 10, 'headset', 'q'], ['Concluídos', 'concl', 1, 'flag', true]], [COR.s1, COR.s2], ['briefcase', 'headset'], 'registros');

  // panorama por colaborador
  ESTADO.colab = [...agrupar(l, chaveColab).values()].map(rs => {
    const ult = rs.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
    const x = resumo(rs);
    return { nome: ult.nome, operacao: ult.operacao, supervisor: ult.supervisor || '', n: rs.length, horas: x.horas, ultima: ult.data, ultTema: ult.tema, pos: x.pos, qa: x.qa, qd: x.qd, evo: x.evoQual, faltas: rs.filter(r => r.presenca !== 'Presente').length };
  });
  renderColab();

  // pendências
  const pend = l.filter(r => r.status === 'Pendente' || r.status === 'Reagendado' || r.presenca !== 'Presente' || (r.proxima && r.proxima >= hoje()))
    .sort((a, b) => (a.proxima || a.data || '').localeCompare(b.proxima || b.data || ''));
  const tagSt = s => `<span class="tag ${{ 'Concluído': 'bom', 'Pendente': 'alerta', 'Reagendado': 'alerta', 'Cancelado': 'ruim' }[s] || 'neutro'}">${esc(s)}</span>`;
  F('atTPend').innerHTML = `<thead><tr><th>Colaborador</th><th>Tipo</th><th>Tema</th><th>Data</th><th>Presença</th><th>Situação</th><th>Próxima ação</th><th>Supervisor</th></tr></thead><tbody>${pend.map(r => `<tr>
    <td class="lk" data-edit="${r.id}">${esc(r.nome)}</td><td>${esc(r.tipo)}</td><td>${esc(r.tema)}</td><td>${dataBR(r.data)}</td>
    <td>${r.presenca === 'Presente' ? '<span class="tag bom">Presente</span>' : `<span class="tag ${r.presenca === 'Justificado' ? 'alerta' : 'ruim'}">${esc(r.presenca === 'Justificado' ? 'Justificada' : 'Ausente')}</span>`}</td>
    <td>${tagSt(r.status)}</td><td>${r.proxima ? `<b class="${r.proxima < hoje() ? 'atrasado' : ''}">${dataBR(r.proxima)}</b>` : '—'}</td><td>${esc(r.supervisor || '—')}</td></tr>`).join('') || `<tr><td colspan="8" class="dica" style="padding:16px">Nenhuma pendência. Tudo em dia.</td></tr>`}</tbody>`;
}
const ESTADO = { ord: { k: 'evo', asc: false }, ordB: { k: 'data', asc: false } };
const COLS = [['nome', 'Colaborador'], ['operacao', 'Operação'], ['supervisor', 'Supervisor'], ['n', 'Treinamentos', 1], ['horas', 'Horas', 1], ['ultima', 'Último'], ['ultTema', 'Último tema'], ['faltas', 'Faltas', 1], ['pos', 'Pós-teste', 1], ['qa', 'Qualidade antes', 1], ['qd', 'Qualidade depois', 1], ['evo', 'Ganho', 1]];
function renderColab() {
  const q = norm(F('atBuscaColab').value), o = ESTADO.ord;
  const rows = (ESTADO.colab || []).filter(c => !q || norm(c.nome + ' ' + c.supervisor).includes(q))
    .sort((a, b) => { const x = a[o.k], y = b[o.k]; const r = typeof x === 'string' || typeof y === 'string' ? cmpTxt(x || '', y || '') : (x ?? -999) - (y ?? -999); return o.asc ? r : -r; });
  F('atTColab').innerHTML = `<thead><tr>${COLS.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'dir' : ''} ${o.k === k ? 'ord' + (o.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(c => `<tr><td class="lk" data-sup="${esc(c.supervisor)}">${esc(c.nome)}</td><td>${esc(c.operacao)}</td><td>${esc(c.supervisor || '—')}</td><td class="dir">${c.n}</td><td class="dir">${fmt(c.horas, c.horas % 1 ? 1 : 0)}h</td>
    <td>${dataBR(c.ultima)}</td><td>${esc(c.ultTema)}</td><td class="dir">${c.faltas || '—'}</td><td class="dir">${fmt(c.pos)}</td><td class="dir">${pctQ(c.qa)}</td><td class="dir">${pctQ(c.qd)}</td>
    <td class="dir">${c.evo === null ? '—' : `<span class="tag ${c.evo > 0 ? 'bom' : c.evo < 0 ? 'ruim' : 'neutro'}">${G.ic(c.evo >= 0 ? 'up' : 'down', '')}${sinal(c.evo, 2)} p.p.</span>`}</td></tr>`).join('')
    || `<tr><td colspan="${COLS.length}" class="dica">Nenhum colaborador encontrado.</td></tr>`}</tbody>`;
}
F('atTColab').addEventListener('click', e => {
  const th = e.target.closest('th');
  if (th) { const k = th.dataset.k; ESTADO.ord = { k, asc: ESTADO.ord.k === k ? !ESTADO.ord.asc : ['nome', 'operacao', 'supervisor', 'ultTema'].includes(k) }; renderColab(); return; }
  const td = e.target.closest('td.lk'); if (td && td.dataset.sup) { FILT.supervisor = td.dataset.sup; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
F('atBuscaColab').addEventListener('input', renderColab);
F('atTPend').addEventListener('click', e => { const td = e.target.closest('[data-edit]'); if (td) editar(td.dataset.edit); });
F('atExpColab').onclick = () => {
  const linhas = [COLS.map(c => c[1])].concat((ESTADO.colab || []).map(c => [c.nome, c.operacao, c.supervisor, c.n, fmt(c.horas, 1), dataBR(c.ultima), c.ultTema, c.faltas, fmt(c.pos), pctQ(c.qa), pctQ(c.qd), c.evo === null ? '' : fmt(c.evo, 2)]));
  baixar(`colaboradores-ativos-${hoje()}.csv`, '﻿' + linhas.map(l => l.map(A.csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
};
F('atBtnImprimir').onclick = () => window.print();
function editar(id) { const r = regs.find(x => x.id === id); if (r) { preencher(r); A.abrirAba('at-cadastro'); } }

/* =========================================================
   BASE
   ========================================================= */
const COLS_B = [['nome', 'Colaborador'], ['instituicao', 'IES'], ['tipo', 'Tipo'], ['tema', 'Tema'], ['data', 'Data'], ['operacao', 'Operação'], ['supervisor', 'Supervisor'], ['presenca', 'Presença'], ['pos', 'Pós-teste', 1], ['qualDepois', 'Qualidade depois', 1], ['status', 'Situação']];
function renderBase() {
  const q = norm(F('atBuscaBase').value), o = ESTADO.ordB;
  const rows = regs.filter(r => !q || norm([r.nome, r.tema, r.supervisor, r.instrutor, r.email, r.tipo].join(' ')).includes(q))
    .sort((a, b) => { const x = a[o.k], y = b[o.k]; const r = typeof x === 'number' || typeof y === 'number' ? (x ?? -1) - (y ?? -1) : cmpTxt(x || '', y || ''); return o.asc ? r : -r; });
  const st = s => ({ 'Concluído': 'bom', 'Pendente': 'alerta', 'Reagendado': 'alerta', 'Cancelado': 'ruim' }[s] || 'neutro');
  F('atTBase').innerHTML = `<thead><tr>${COLS_B.map(([k, t, n]) => `<th data-k="${k}" class="${n ? 'dir' : ''} ${o.k === k ? 'ord' + (o.asc ? ' asc' : '') : ''}">${t}</th>`).join('')}<th></th></tr></thead>
  <tbody>${rows.map(r => `<tr><td class="lk" data-edit="${r.id}">${esc(r.nome)}${r.exemplo ? ' <span class="tag neutro">exemplo</span>' : ''}</td><td>${esc(r.instituicao || '—')}</td><td>${esc(r.tipo)}</td><td>${esc(r.tema)}</td><td>${dataBR(r.data)}</td><td>${esc(r.operacao)}</td><td>${esc(r.supervisor || '—')}</td>
    <td>${esc(r.presenca)}</td><td class="dir">${fmt(r.pos)}</td><td class="dir">${pctQ(r.qualDepois)}</td><td><span class="tag ${st(r.status)}">${esc(r.status)}</span></td>
    <td><div class="acoes-linha"><button class="btn-icone" data-edit="${r.id}" title="Editar" aria-label="Editar">${G.ic('edit', '')}</button><button class="btn-icone" data-del="${r.id}" title="Excluir" aria-label="Excluir">${G.ic('trash', '')}</button></div></td></tr>`).join('')
    || `<tr><td colspan="${COLS_B.length + 1}" class="dica" style="padding:20px">${regs.length ? 'Nenhum registro encontrado.' : 'Nenhum treinamento registrado ainda.'}</td></tr>`}</tbody>`;
}
F('atTBase').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (th) { const k = th.dataset.k; ESTADO.ordB = { k, asc: ESTADO.ordB.k === k ? !ESTADO.ordB.asc : !['data', 'pos', 'qualDepois'].includes(k) }; renderBase(); return; }
  const ed = e.target.closest('[data-edit]'); if (ed) { editar(ed.dataset.edit); return; }
  const del = e.target.closest('[data-del]');
  if (del) { const r = regs.find(x => x.id === del.dataset.del); if (r && confirm(`Excluir o registro de ${r.nome} (${r.tema})?`)) { regs = regs.filter(x => x !== r); salvar(); renderBase(); toast('Registro excluído'); } }
});
F('atBuscaBase').addEventListener('input', renderBase);
F('atBtnApagarTudo').onclick = () => {
  if (!regs.length) return toast('A base já está vazia');
  const t = prompt(`Isso apaga os ${regs.length} registros de colaboradores ativos deste navegador. Baixe o backup antes.\nDigite APAGAR para confirmar:`);
  if (t && t.trim().toUpperCase() === 'APAGAR') { regs = []; salvar(); renderBase(); datalists(); toast('Base apagada'); }
};

// exportar / importar
const MAPA = [['Tipo', 'tipo'], ['Tema', 'tema'], ['Data', 'data'], ['Carga horária (h)', 'carga'], ['Instituição', 'instituicao'], ['Operação', 'operacao'], ['Instrutor', 'instrutor'], ['Modalidade', 'modalidade'], ['Motivo', 'motivo'], ['Objetivo', 'objetivo'],
  ['Colaborador', 'nome'], ['Matrícula', 'matricula'], ['E-mail', 'email'], ['Supervisor', 'supervisor'], ['Tempo de casa', 'tempoCasa'], ['Turno', 'turno'], ['Cidade', 'cidade'], ['Bairro', 'bairro'],
  ['Presença', 'presenca'], ['Situação', 'status'], ['Próxima ação', 'proxima'], ['Pré-teste', 'pre'], ['Pós-teste', 'pos'], ['Qualidade antes (%)', 'qualAntes'], ['Qualidade depois (%)', 'qualDepois'], ['Assimilação (1-5)', 'assimilacao'], ['Observações', 'obs']];
const NUMS = { carga: 1, pre: 1, pos: 1, qualAntes: 2, qualDepois: 2, assimilacao: 0 };
F('atExpCsv').onclick = () => {
  if (!regs.length) return toast('Nenhum registro para exportar');
  const linhas = [MAPA.map(m => m[0])].concat(regs.map(r => MAPA.map(([, k]) => k === 'data' || k === 'proxima' ? dataBR(r[k]) : k in NUMS ? (r[k] === null || r[k] === undefined ? '' : fmt(r[k], NUMS[k])) : r[k] ?? '')));
  baixar(`colaboradores-ativos-registros-${hoje()}.csv`, '﻿' + linhas.map(l => l.map(A.csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
};
F('atExpJson').onclick = () => baixar(`colaboradores-ativos-backup-${hoje()}.json`, JSON.stringify({ versao: 1, area: 'colaboradores-ativos', geradoEm: new Date().toISOString(), registros: regs }, null, 1), 'application/json');
F('atImpArquivo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const txt = await f.text(); let novos = [];
    if (/\.json$/i.test(f.name)) { const j = JSON.parse(txt); novos = Array.isArray(j) ? j : j.registros || []; }
    else {
      const [cab, ...dados] = A.parseCSV(txt); const idx = h => cab.findIndex(c => norm(c) === norm(h));
      novos = dados.map(l => { const r = { id: uid(), criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
        MAPA.forEach(([h, k]) => { const i = idx(h); if (i >= 0) r[k] = (l[i] || '').trim(); });
        r.data = A.dataISO(r.data); r.proxima = A.dataISO(r.proxima);
        Object.keys(NUMS).forEach(k => r[k] = num(r[k]));
        r.cidade = A.MUN_NORM.get(norm(r.cidade)) || r.cidade || ''; return r; }).filter(r => r.nome);
    }
    if (!novos.length) return toast('Nenhum registro encontrado no arquivo');
    const ids = new Set(regs.map(r => r.id)); let add = 0, upd = 0;
    novos.forEach(n => { if (n.id && ids.has(n.id)) { Object.assign(regs.find(r => r.id === n.id), n); upd++; } else { regs.push({ ...n, id: n.id || uid() }); add++; } });
    salvar(); datalists(); renderBase(); toast(`${add} registros importados${upd ? `, ${upd} atualizados` : ''}`);
  } catch (err) { console.error(err); toast('Não foi possível ler o arquivo'); }
});

/* =========================================================
   QUADRO DA OPERAÇÃO (importação do BD GERAL .xlsx/.xlsm)
   ========================================================= */
const limpaCab = h => norm(String(h ?? '').replace(/ /g, ' ')).replace(/\s+/g, ' ').trim();
const titulo = s => String(s || '').trim().replace(/\s+/g, ' ');
function tempoDeCasa(adm) {
  if (!adm) return '';
  const meses = (Date.now() - new Date(adm + 'T12:00').getTime()) / (30.44 * 86400000);
  return meses < 3 ? 'Até 3 meses' : meses < 6 ? '3 a 6 meses' : meses < 12 ? '6 meses a 1 ano' : meses < 24 ? '1 a 2 anos' : 'Mais de 2 anos';
}
function telefone(v) {
  const d = String(v ?? '').replace(/\D/g, ''); if (d.length < 10) return '';
  const x = d.slice(-11); return x.length === 11 ? `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}` : `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
}
const iesDe = v => { const t = norm(v); if (!t || t === '-') return ''; const uva = t.includes('uva'), uj = /\buja?\b|unijorge|jorge/.test(t); return uva && uj ? '' : uva ? 'UVA' : uj ? 'Unijorge' : ''; };
async function importarBD(arquivo) {
  const abas = await XLSXLeitor.lerPlanilha(await arquivo.arrayBuffer());
  const pessoas = new Map(); let lidas = 0, desligados = 0; const usadas = [];
  // lê só as abas de BD dos consultores (BD GERAL e BD GERAL ADMISSÃO); ignora pausas, férias, desligamentos, gestão e logs
  const bdConsultores = abas.filter(x => /^bd geral/.test(norm(x.nome)));
  for (const aba of (bdConsultores.length ? bdConsultores : abas.filter(x => !/pausa|ferias|deslig|log|adm$/.test(norm(x.nome))))) {
    const iCab = aba.linhas.findIndex(l => l && l.some(v => limpaCab(v) === 'nome') && l.some(v => limpaCab(v) === 'supervisor') && l.some(v => limpaCab(v) === 'matricula'));
    if (iCab < 0) continue;
    const cab = aba.linhas[iCab].map(limpaCab);
    if (cab.includes('cargo')) continue; // aba de gestão (gerentes, coordenadores)
    if (/pausa/.test(norm(aba.nome))) continue; // abas de pausas repetem o quadro
    const ehDeslig = cab.includes('data de desligamento');
    if (!ehDeslig && !cab.includes('status')) continue;
    const ix = n => cab.indexOf(n);
    const pega = (l, ...nomes) => { for (const n of nomes) { const i = ix(n); if (i >= 0 && l[i] !== null && l[i] !== undefined && String(l[i]).trim() !== '' && String(l[i]).trim() !== '-') return l[i]; } return null; };
    const nomeAba = norm(aba.nome);
    let n = 0;
    for (const l of aba.linhas.slice(iCab + 1)) {
      if (!l) continue;
      const nome = titulo(pega(l, 'nome')); if (!nome || nome.split(' ').length < 2) continue;
      const mat = String(pega(l, 'matricula') ?? '').trim();
      const chave = mat || norm(nome);
      const grupo = titulo(pega(l, 'grupo'));
      const ies = iesDe(pega(l, 'operacao'));
      const operacao = /admiss|captac/.test(norm(grupo) + ' ' + nomeAba) ? 'Captação' : /servic|perman|rematric/.test(norm(grupo) + ' ' + nomeAba) ? 'Permanência' : '';
      const corp = ies === 'Unijorge' ? pega(l, 'corporativo uja', 'corporativo uva') : pega(l, 'corporativo uva', 'corporativo uja');
      const adm = XLSXLeitor.dataExcel(pega(l, 'admissao'));
      const local = A.acharBairro(titulo(pega(l, 'bairro')));
      const novo = {
        mat, idOlos: String(pega(l, 'id olos') ?? ''), nome, supervisor: titulo(pega(l, 'supervisor')).toUpperCase(), gerente: titulo(pega(l, 'gerente')),
        login: String(pega(l, 'login') ?? ''), grupo, ies, operacao, status: ehDeslig || /deslig/.test(norm(pega(l, 'status'))) ? 'Desligado' : titulo(pega(l, 'status')) || 'Ativo',
        escala: String(pega(l, 'escala') ?? ''), turno: titulo(pega(l, 'turno')), telefone: telefone(pega(l, 'telefone')),
        bairro: local.bairro, cidade: local.cidade,
        email: String(corp || '').trim().toLowerCase(), admissao: adm, tempoCasa: tempoDeCasa(adm), onda: titulo(pega(l, 'onda')),
        desligamento: ehDeslig ? XLSXLeitor.dataExcel(pega(l, 'data de desligamento')) : '', aba: aba.nome
      };
      const atual = pessoas.get(chave);
      if (atual) {
        Object.keys(novo).forEach(k => { if (!atual[k] && novo[k]) atual[k] = novo[k]; });
        if (ehDeslig) { atual.status = 'Desligado'; atual.desligamento = novo.desligamento; }
      } else pessoas.set(chave, novo);
      if (ehDeslig) desligados++;
      n++; lidas++;
    }
    if (n) usadas.push(`${aba.nome.trim()} (${n})`);
  }
  if (!pessoas.size) throw new Error('Não encontrei as colunas MATRÍCULA, NOME e SUPERVISOR em nenhuma aba.');
  quadro = { itens: [...pessoas.values()].sort((a, b) => cmpTxt(a.nome, b.nome)), arquivo: arquivo.name, importadoEm: new Date().toISOString(), abas: usadas };
  gravar(KEY_QUADRO, quadro);
  const antes = supervisores.length;
  quadro.itens.forEach(c => { if (c.supervisor && !supReal(c.supervisor)) supervisores.push(c.supervisor); });
  salvarSup();
  return { total: quadro.itens.length, ativos: ativosQuadro().length, desligados, novosSup: supervisores.length - antes, abas: usadas };
}
F('atImpBD').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (quadro.itens.length && !confirm(`Substituir o quadro atual (${quadro.itens.length} colaboradores, de ${quadro.arquivo}) pelo arquivo ${f.name}?\nOs registros de treinamento não são alterados.`)) return;
  try {
    toast('Lendo a planilha…');
    const r = await importarBD(f);
    renderQuadro(); renderBase();
    toast(`${r.ativos} colaboradores ativos importados${r.novosSup ? ` · ${r.novosSup} supervisores novos` : ''}`);
  } catch (err) { console.error(err); alert('Não foi possível importar: ' + err.message); }
});
function renderQuadro() {
  const tem = quadro.itens.length > 0;
  F('atQuadroResumo').hidden = !tem; F('atTQuadro').parentElement.hidden = !tem; F('atQuadroStatus').hidden = !tem; F('atBuscaQuadro').hidden = !tem;
  if (!tem) { F('atQuadroInfo').textContent = 'Importe o BD GERAL (.xlsx ou .xlsm) para trazer todos os colaboradores da operação. CPF e RG não são importados.'; return; }
  F('atQuadroInfo').textContent = `${quadro.arquivo} · importado em ${new Date(quadro.importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · abas: ${(quadro.abas || []).join(', ')}`;
  const sts = [...new Set(quadro.itens.map(c => c.status))].sort(cmpTxt);
  const selSt = F('atQuadroStatus'), atualSt = selSt.value;
  selSt.innerHTML = '<option value="">Todos os status</option>' + sts.map(x => `<option${x === atualSt ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const treinos = c => regs.filter(r => (c.email && norm(r.email) === norm(c.email)) || (c.mat && r.matricula === c.mat) || norm(r.nome) === norm(c.nome));
  const at = ativosQuadro();
  const cont = (f) => at.filter(f).length;
  const treinados = at.filter(c => treinos(c).some(r => r.presenca === 'Presente')).length;
  F('atQuadroResumo').innerHTML = [
    ['users', 'Ativos no quadro', at.length, ''], ['building', 'UVA', cont(c => c.ies === 'UVA'), ''], ['building', 'Unijorge', cont(c => c.ies === 'Unijorge'), ''],
    ['briefcase', 'Captação', cont(c => c.operacao === 'Captação'), ''], ['headset', 'Permanência', cont(c => c.operacao === 'Permanência'), ''],
    ['clock', 'Férias / afastados', cont(c => c.status !== 'Ativo'), ''], ['check', 'Já treinados', treinados, at.length ? pct(treinados / at.length) : '']
  ].map(([ic, t, v, sub]) => `<div class="qr"><span class="qr-ic">${G.ic(ic, '')}</span><div><small>${t}</small><b>${v.toLocaleString('pt-BR')}</b>${sub ? `<em>${sub}</em>` : ''}</div></div>`).join('');
  const q = norm(F('atBuscaQuadro').value), st = selSt.value;
  const rows = quadro.itens.filter(c => (!st || c.status === st) && (!q || norm([c.nome, c.login, c.mat, c.supervisor, c.grupo, c.bairro].join(' ')).includes(q)));
  const tagSt = x => `<span class="tag ${x === 'Ativo' ? 'bom' : x === 'Desligado' ? 'ruim' : 'alerta'}">${esc(x)}</span>`;
  F('atTQuadro').innerHTML = `<thead><tr><th>Colaborador</th><th>Matrícula</th><th>Login</th><th>Supervisor</th><th>IES</th><th>Operação</th><th>Grupo</th><th>Status</th><th>Turno</th><th>Tempo de casa</th><th class="dir">Treinamentos</th><th>Último</th><th></th></tr></thead>
  <tbody>${rows.slice(0, 600).map(c => { const t = treinos(c).sort((a, b) => (b.data || '').localeCompare(a.data || '')); return `<tr>
    <td><b>${esc(c.nome)}</b></td><td>${esc(c.mat)}</td><td>${esc(c.login)}</td><td>${esc(c.supervisor)}</td><td>${esc(c.ies || '—')}</td><td>${esc(c.operacao || '—')}</td><td>${esc(c.grupo)}</td><td>${tagSt(c.status)}</td><td>${esc(c.turno)}</td><td>${esc(c.tempoCasa)}</td>
    <td class="dir">${t.length || '—'}</td><td>${t[0] ? `${dataBR(t[0].data)} · ${esc(t[0].tema)}` : '<span class="dica">nunca treinado</span>'}</td>
    <td>${c.status !== 'Desligado' ? `<button class="btn btn-sec btn-mini" data-treinar="${esc(c.mat || c.nome)}">${G.ic('plus', '')}Registrar</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="13" class="dica">Ninguém encontrado.</td></tr>'}</tbody>`;
}
F('atBuscaQuadro').addEventListener('input', renderQuadro);
F('atQuadroStatus').addEventListener('change', renderQuadro);
F('atTQuadro').addEventListener('click', e => {
  const b = e.target.closest('[data-treinar]'); if (!b) return;
  const c = quadro.itens.find(x => (x.mat || x.nome) === b.dataset.treinar); if (!c) return;
  limpar(false);
  F('atNome').value = c.nome; F('atEmail').value = c.email; F('atMatricula').value = c.mat; F('atSupervisor').value = c.supervisor;
  F('atTempoCasa').value = c.tempoCasa; F('atTurno').value = c.turno; F('atOperacao').value = c.operacao; F('atInstituicao').value = c.ies;
  if (c.cidade) { F('atCidade').value = c.cidade; F('atCidade').dataset.ok = c.cidade; F('atBairro').disabled = false; F('atBairro').value = c.bairro; }
  F('atDicaNome').textContent = 'Dados preenchidos a partir de: BD da operação · ' + c.status;
  F('atData').value = hoje(); A.abrirAba('at-cadastro'); setTimeout(() => F('atTema').focus(), 100);
});

/* ---------------- dados de exemplo ---------------- */
function rotuloExemplo() { F('atBtnExemplo').textContent = regs.some(r => r.exemplo) ? 'Remover exemplos' : 'Dados de exemplo'; }
function exemplo() {
  if (regs.some(r => r.exemplo)) {
    if (confirm('Remover os dados de exemplo de colaboradores ativos?')) { regs = regs.filter(r => !r.exemplo); salvar(); datalists(); renderBase(); render(); toast('Exemplos removidos'); }
    return;
  }
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const pick = a => a[Math.floor(rnd() * a.length)];
  const nomes = ['Aline Matos', 'Bruno Teixeira', 'Camila Reis', 'Diego Santana', 'Elisa Moura', 'Felipe Andrade', 'Gisele Prado', 'Henrique Lopes', 'Ingrid Sales', 'Jonas Batista', 'Kelly Nunes', 'Leandro Cruz', 'Michele Dias', 'Natan Ribeiro', 'Paula Guedes', 'Rafaela Brito', 'Sérgio Pinto', 'Tatiane Lima', 'Uriel Costa', 'Vitória Borges', 'Wagner Melo', 'Yasmin Freitas'];
  const sup = SUP_PADRAO;
  const pessoas = nomes.map((n, i) => ({ nome: n, sup: sup[i % sup.length], inst: i % 4 === 3 ? 'Unijorge' : 'UVA', op: i % 3 ? 'Captação' : 'Permanência', base: 72 + rnd() * 18, cidade: rnd() < .75 ? 'Salvador' : pick(['Lauro de Freitas', 'Camaçari', 'Simões Filho']), tc: pick(['3 a 6 meses', '6 meses a 1 ano', '1 a 2 anos', 'Mais de 2 anos']) }));
  const bairros = ['Pituba', 'Cabula', 'Itapuã', 'Liberdade', 'Brotas', 'Imbuí', 'Cajazeiras X', 'Pernambués'];
  const acoes = [
    ['Reciclagem', 'Script de abordagem', '2026-07-08', 2, 'Indicação da qualidade', 3.5], ['Novo produto', 'Lançamento pós-graduação EAD', '2026-07-22', 3, 'Lançamento de produto', 1.5],
    ['Alinhamento', 'Nova política de bolsas', '2026-08-05', 1, 'Mudança de processo', 2], ['Reciclagem', 'Contorno de objeções', '2026-08-19', 2, 'Baixa performance', 4.5],
    ['Novo conteúdo', 'Atendimento humanizado', '2026-09-02', 2, 'Cronograma / rotina', 2.5], ['Alinhamento', 'Fluxo de rematrícula 2026.2', '2026-09-16', 1, 'Mudança de processo', 1],
    ['Reciclagem', 'Registro no HubSpot', '2026-09-30', 1.5, 'Indicação da qualidade', 3], ['Novo produto', 'Graduação semipresencial', '2026-10-14', 3, 'Lançamento de produto', 2],
    ['Alinhamento', 'Campanha de captação 2027.1', '2026-10-28', 1, 'Solicitação da supervisão', .5]];
  const novos = [];
  acoes.forEach(([tipo, tema, data, carga, motivo, ganho], ai) => {
    const ops = tema.includes('rematrícula') || tema.includes('humanizado') ? ['Permanência'] : tema.includes('captação') || tema.includes('objeções') ? ['Captação'] : ['Captação', 'Permanência'];
    pessoas.filter(p => ops.includes(p.op) && rnd() < .7).forEach(p => {
      const presenca = rnd() < .88 ? 'Presente' : rnd() < .5 ? 'Justificado' : 'Ausente';
      const futuro = data > '2026-10-20';
      const pre = +(4.5 + rnd() * 3.5).toFixed(1), pos = Math.min(10, +(pre + 1 + rnd() * 2.8).toFixed(1));
      const qa = +Math.min(99, p.base + (rnd() - .5) * 6).toFixed(2), qd = +Math.min(100, qa + ganho + (rnd() - .4) * 4).toFixed(2);
      novos.push({ id: uid() + ai + p.nome.length, exemplo: true, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
        tipo, tema, data, carga, instituicao: p.inst, operacao: p.op, instrutor: pick(['Patrícia Moura', 'Rodrigo Sales']), modalidade: pick(['Presencial', 'Remoto', 'Na posição (side by side)']), motivo, objetivo: '',
        nome: p.nome, matricula: '', email: norm(p.nome).replace(/\s+/g, '.') + '@exemplo.com', supervisor: p.sup, tempoCasa: p.tc, turno: pick(['Manhã', 'Tarde']),
        cidade: p.cidade, bairro: p.cidade === 'Salvador' ? pick(bairros) : 'Centro',
        presenca, status: presenca === 'Presente' ? (futuro && rnd() < .5 ? 'Pendente' : 'Concluído') : 'Reagendado', proxima: presenca === 'Presente' ? '' : '2026-11-' + String(5 + Math.floor(rnd() * 20)).padStart(2, '0'),
        pre: presenca === 'Presente' ? pre : null, pos: presenca === 'Presente' ? pos : null, qualAntes: qa, qualDepois: presenca === 'Presente' && !futuro ? qd : null,
        assimilacao: presenca === 'Presente' ? 2 + Math.floor(rnd() * 4) : null, obs: '' });
    });
  });
  regs = regs.concat(novos); salvar(); datalists(); renderBase(); render();
  toast(`${novos.length} registros de exemplo carregados`);
}
F('atBtnExemplo').onclick = exemplo; F('atBtnExemploDash').onclick = exemplo;

/* ---------------- início ---------------- */
document.addEventListener('aba-aberta', e => { if (e.detail === 'at-dashboard') render(); if (e.detail === 'at-base') { renderQuadro(); renderBase(); } });
let rz; let larg = innerWidth;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - larg) > 40 && F('aba-at-dashboard').classList.contains('ativo')) { larg = innerWidth; render(); } }, 250); });
G.icones(document);
salvarSup(); salvar(); datalists(); limpar(false);
F('atData').value = hoje();
})();
