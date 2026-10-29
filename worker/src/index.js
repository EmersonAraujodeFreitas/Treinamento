/* =========================================================
   Inovação Casa · Treinamento — servidor (Cloudflare Worker + D1)
   - Senhas conferidas aqui (PBKDF2 + segredo do servidor); nunca saem do servidor
   - Sessão assinada (HMAC) e conferida no banco a cada pedido
   - Cada perfil recebe SÓ os dados que pode ver; escrita validada por permissão
   - Bloqueio após 5 senhas erradas (15 min) e registro de acessos
   Variáveis (Settings → Variables and Secrets):
     SEGREDO_SESSAO  (secret) texto longo aleatório para assinar sessões
     PIMENTA         (secret) texto longo aleatório misturado às senhas
     ORIGENS         (text)   endereços que podem usar a API, separados por vírgula
   Banco D1 ligado com o nome DB
   ========================================================= */

const DATASETS_LISTA = ['formacao', 'ativos', 'analises'];
const VALORES = ['quadro', 'supervisores', 'bairros', 'meta'];
const PERFIS = ['Treinamento', 'Supervisão', 'Gerência', 'Administrador'];
const TODAS_ABAS = ['cadastro', 'analise-trein', 'analise-sup', 'dashboard', 'base', 'at-cadastro', 'at-registros', 'at-dashboard', 'at-base'];
const TODOS_BOTOES = ['editar', 'excluir', 'exportar', 'imprimir', 'backup', 'importarBD', 'supervisores', 'exemplo', 'apagar'];
const PERM_PADRAO = {
  'Treinamento': { abas: ['cadastro', 'analise-trein', 'dashboard', 'base', 'at-cadastro', 'at-registros', 'at-dashboard', 'at-base'], botoes: ['editar', 'excluir', 'exportar', 'imprimir', 'supervisores'] },
  'Supervisão': { abas: ['analise-sup', 'dashboard', 'at-registros', 'at-dashboard'], botoes: ['editar', 'exportar', 'imprimir'] },
  'Gerência': { abas: ['analise-trein', 'analise-sup', 'dashboard', 'base', 'at-registros', 'at-dashboard', 'at-base'], botoes: ['exportar', 'imprimir'] }
};
const ADMIN_INICIAL = { usuario: 'EMERSON', nome: 'Emerson', senha: '12345678' };
const ITERACOES = 10000; // a PIMENTA (segredo do servidor) protege as senhas mesmo se o banco vazar
const MAX_LOTE = 30; // registros por envio (limite de consultas do plano gratuito)
const SESSAO_HORAS = 12, SESSAO_MANTER_DIAS = 30;

/* ---------------- utilidades ---------------- */
const agora = () => new Date().toISOString();
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const normU = u => String(u || '').trim().toUpperCase();
function igualSeguro(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

async function hashSenha(env, senha, salHex) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(String(senha)), 'PBKDF2', false, ['deriveBits']);
  const sal = enc.encode(salHex + '|' + (env.PIMENTA || ''));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACOES }, chave, 256));
}
async function hmac(env, texto) {
  if (!env.SEGREDO_SESSAO || env.SEGREDO_SESSAO.length < 20) throw new Erro(500, 'Servidor sem SEGREDO_SESSAO configurado.');
  const k = await crypto.subtle.importKey('raw', enc.encode(env.SEGREDO_SESSAO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------------- banco ---------------- */
const um = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const todos = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results || [];
const exec = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();
async function registrar(env, usuario, acao, detalhe) { try { await exec(env, 'INSERT INTO log (quando, usuario, acao, detalhe) VALUES (?,?,?,?)', agora(), usuario || '', acao, String(detalhe || '').slice(0, 300)); } catch (e) { /* log é opcional */ } }
async function lerValor(env, chave, padrao) { const r = await um(env, 'SELECT dados FROM valores WHERE chave = ?', chave); return r ? JSON.parse(r.dados) : padrao; }
async function gravarValor(env, chave, dados, por) { await exec(env, 'INSERT INTO valores (chave, dados, atualizado_em, por) VALUES (?,?,?,?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em, por = excluded.por', chave, JSON.stringify(dados), agora(), por || ''); }
async function versao(env) { return (await lerValor(env, 'versao', 0)) || 0; }
async function subirVersao(env) { const v = (await versao(env)) + 1; await gravarValor(env, 'versao', v, ''); return v; }

async function garantirAdmin(env) {
  const n = await um(env, 'SELECT COUNT(*) AS n FROM usuarios');
  if (n && n.n > 0) return;
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  await exec(env, 'INSERT INTO usuarios (usuario, nome, perfil, ativo, sal, hash, trocar_senha, sessao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ADMIN_INICIAL.usuario, ADMIN_INICIAL.nome, 'Administrador', 1, sal, await hashSenha(env, env.ADMIN_SENHA_INICIAL || ADMIN_INICIAL.senha, sal), 1, 0, agora(), agora());
}

/* ---------------- permissões ---------------- */
async function permissoesDe(env, perfil) {
  if (perfil === 'Administrador') return { abas: TODAS_ABAS, botoes: TODOS_BOTOES };
  const perfis = await lerValor(env, 'perfis', {});
  const p = perfis[perfil] || PERM_PADRAO[perfil] || { abas: [], botoes: [] };
  return { abas: p.abas.filter(a => TODAS_ABAS.includes(a)), botoes: p.botoes.filter(b => TODOS_BOTOES.includes(b)) };
}
function acessoDe(perfil, perm) {
  const tem = a => perm.abas.includes(a), bt = b => perm.botoes.includes(b);
  if (perfil === 'Administrador') {
    return { ler: { formacao: true, ativos: true, quadro: true, supervisores: true, bairros: true, meta: true, analises: ['treinamento', 'supervisao'] },
      escrever: { formacao: true, ativos: true, quadro: true, supervisores: true, bairros: true, meta: true, analises: ['treinamento', 'supervisao'] }, editar: true, excluir: true };
  }
  const anLer = [], anEsc = [];
  if (tem('dashboard')) anLer.push('treinamento', 'supervisao');
  if (tem('analise-trein')) { anLer.push('treinamento'); anEsc.push('treinamento'); }
  if (tem('analise-sup')) { anLer.push('supervisao'); anEsc.push('supervisao'); }
  const ativos = ['at-cadastro', 'at-registros', 'at-dashboard', 'at-base'].some(tem);
  return {
    ler: {
      formacao: ['cadastro', 'dashboard', 'base', 'analise-trein', 'analise-sup'].some(tem),
      ativos, quadro: tem('at-cadastro') || tem('at-base'), supervisores: ativos, bairros: true, meta: true, analises: [...new Set(anLer)]
    },
    escrever: {
      formacao: tem('cadastro') || (tem('base') && (bt('editar') || bt('excluir') || bt('apagar') || bt('exemplo') || bt('backup'))),
      ativos: tem('at-cadastro') || (tem('at-registros') && (bt('editar') || bt('excluir') || bt('apagar') || bt('exemplo') || bt('backup'))),
      quadro: bt('importarBD'), supervisores: bt('supervisores') || tem('at-cadastro'), bairros: tem('cadastro') || tem('at-cadastro'), meta: tem('dashboard'),
      analises: [...new Set(anEsc)]
    },
    editar: bt('editar'), excluir: bt('excluir') || bt('apagar')
  };
}

/* ---------------- sessão ---------------- */
async function criarSessao(env, u, manter) {
  const exp = Date.now() + (manter ? SESSAO_MANTER_DIAS * 864e5 : SESSAO_HORAS * 36e5);
  const corpo = b64u(enc.encode(JSON.stringify({ u: u.usuario, s: u.sessao, exp })));
  return corpo + '.' + await hmac(env, corpo);
}
async function autenticar(env, req) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [corpo, sig] = tok.split('.');
  if (!corpo || !sig || !igualSeguro(sig, await hmac(env, corpo))) throw new Erro(401, 'Sessão inválida. Entre novamente.');
  let d; try { d = JSON.parse(new TextDecoder().decode(deb64u(corpo))); } catch (e) { throw new Erro(401, 'Sessão inválida.'); }
  if (!d.exp || d.exp < Date.now()) throw new Erro(401, 'Sessão expirada. Entre novamente.');
  const u = await um(env, 'SELECT usuario, nome, perfil, ativo, sessao, trocar_senha FROM usuarios WHERE usuario = ?', d.u);
  if (!u || !u.ativo || u.sessao !== d.s) throw new Erro(401, 'Acesso encerrado. Entre novamente.');
  return u;
}

/* ---------------- rotas ---------------- */
async function rotaLogin(env, req) {
  const { usuario, senha, manter } = await req.json();
  const id = normU(usuario);
  if (!id || !senha) throw new Erro(400, 'Informe usuário e senha.');
  const t = await um(env, 'SELECT falhas, bloqueado_ate FROM tentativas WHERE usuario = ?', id);
  if (t && t.bloqueado_ate && t.bloqueado_ate > agora()) throw new Erro(429, 'Muitas tentativas. Tente de novo em alguns minutos.');
  const u = await um(env, 'SELECT * FROM usuarios WHERE usuario = ?', id);
  const ok = u && u.ativo && igualSeguro(await hashSenha(env, senha, u.sal), u.hash);
  if (!ok) {
    const falhas = (t ? t.falhas : 0) + 1;
    await exec(env, 'INSERT INTO tentativas (usuario, falhas, bloqueado_ate) VALUES (?,?,?) ON CONFLICT(usuario) DO UPDATE SET falhas = excluded.falhas, bloqueado_ate = excluded.bloqueado_ate',
      id, falhas >= 5 ? 0 : falhas, falhas >= 5 ? new Date(Date.now() + 15 * 6e4).toISOString() : null);
    await registrar(env, id, 'login-falhou', '');
    throw new Erro(401, u && !u.ativo ? 'Este usuário está desativado.' : 'Usuário ou senha incorretos.');
  }
  await exec(env, 'DELETE FROM tentativas WHERE usuario = ?', id);
  await registrar(env, id, 'login', '');
  const perm = await permissoesDe(env, u.perfil);
  return { token: await criarSessao(env, u, !!manter), usuario: { usuario: u.usuario, nome: u.nome, perfil: u.perfil, trocarSenha: !!u.trocar_senha }, permissoes: perm };
}
async function rotaTrocarSenha(env, u, req) {
  const { atual, nova } = await req.json();
  if (!nova || String(nova).length < 8) throw new Erro(400, 'A nova senha precisa ter ao menos 8 caracteres.');
  const r = await um(env, 'SELECT sal, hash FROM usuarios WHERE usuario = ?', u.usuario);
  if (!igualSeguro(await hashSenha(env, atual, r.sal), r.hash)) throw new Erro(400, 'Senha atual incorreta.');
  if (nova === atual) throw new Erro(400, 'A nova senha precisa ser diferente da atual.');
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  await exec(env, 'UPDATE usuarios SET sal = ?, hash = ?, trocar_senha = 0, sessao = sessao + 1, atualizado_em = ? WHERE usuario = ?', sal, await hashSenha(env, nova, sal), agora(), u.usuario);
  await registrar(env, u.usuario, 'trocou-senha', '');
  const novo = await um(env, 'SELECT * FROM usuarios WHERE usuario = ?', u.usuario);
  return { token: await criarSessao(env, novo, true) };
}
async function rotaEstado(env, u) {
  const perm = await permissoesDe(env, u.perfil), ac = acessoDe(u.perfil, perm);
  const partes = [];
  for (const ds of DATASETS_LISTA) {
    let linhas = null;
    if (ds === 'analises') linhas = ac.ler.analises.length ? await todos(env, `SELECT dados FROM registros WHERE dataset = 'analises' AND apagado = 0 AND tipo IN (${ac.ler.analises.map(() => '?').join(',')})`, ...ac.ler.analises) : [];
    else if (ac.ler[ds]) linhas = await todos(env, 'SELECT dados FROM registros WHERE dataset = ? AND apagado = 0', ds);
    partes.push(JSON.stringify(ds) + ':' + (linhas ? '[' + linhas.map(r => r.dados).join(',') + ']' : 'null'));
  }
  const vals = ac.ler ? await todos(env, `SELECT chave, dados FROM valores WHERE chave IN (${VALORES.map(() => '?').join(',')})`, ...VALORES) : [];
  for (const v of VALORES) { const r = vals.find(x => x.chave === v); partes.push(JSON.stringify(v) + ':' + (ac.ler[v] && r ? r.dados : 'null')); }
  const cab = { versao: await versao(env), usuario: { usuario: u.usuario, nome: u.nome, perfil: u.perfil, trocarSenha: !!u.trocar_senha }, permissoes: perm, acesso: ac };
  return { __bruto: JSON.stringify(cab).slice(0, -1) + ',"datasets":{' + partes.join(',') + '}}' };
}
async function rotaSincronizar(env, u, req) {
  const corpo = await req.json();
  const perm = await permissoesDe(env, u.perfil), ac = acessoDe(u.perfil, perm);
  const recusados = [], escritas = [];
  const listas = corpo.listas || {};
  let total = 0;
  for (const ds of DATASETS_LISTA) { const l = listas[ds]; if (l) total += (l.salvar || []).length + (l.apagar || []).length; }
  if (total > MAX_LOTE) throw new Erro(413, `Envie no máximo ${MAX_LOTE} registros por vez.`);
  for (const ds of DATASETS_LISTA) {
    const l = listas[ds]; if (!l || (!(l.salvar || []).length && !(l.apagar || []).length)) continue;
    const ids = [...(l.salvar || []).map(r => r && r.id), ...(l.apagar || [])].filter(x => typeof x === 'string' && x.length <= 80);
    const existentes = new Map((ids.length ? await todos(env, `SELECT id, atualizado_em, apagado, tipo FROM registros WHERE dataset = ? AND id IN (${ids.map(() => '?').join(',')})`, ds, ...ids) : []).map(r => [r.id, r]));
    for (const rec of (l.salvar || [])) {
      if (!rec || typeof rec.id !== 'string' || rec.id.length > 80) continue;
      const tipo = ds === 'analises' ? (rec.tipo === 'supervisao' ? 'supervisao' : 'treinamento') : null;
      const podeEsc = ds === 'analises' ? ac.escrever.analises.includes(tipo) : ac.escrever[ds];
      if (!podeEsc) { recusados.push({ ds, id: rec.id, motivo: 'sem permissão' }); continue; }
      const atual = existentes.get(rec.id);
      if (atual && !atual.apagado && !ac.editar) { recusados.push({ ds, id: rec.id, motivo: 'sem permissão para editar' }); continue; }
      if (atual && ds === 'analises' && atual.tipo && atual.tipo !== tipo) { recusados.push({ ds, id: rec.id, motivo: 'tipo diferente' }); continue; }
      const quando = String(rec.atualizadoEm || rec.criadoEm || agora());
      if (atual && atual.atualizado_em > quando) continue; // o servidor já tem versão mais nova
      const txt = JSON.stringify(rec);
      if (txt.length > 200000) { recusados.push({ ds, id: rec.id, motivo: 'registro grande demais' }); continue; }
      escritas.push(env.DB.prepare('INSERT INTO registros (dataset, id, tipo, dados, atualizado_em, apagado, por) VALUES (?,?,?,?,?,0,?) ON CONFLICT(dataset, id) DO UPDATE SET tipo = excluded.tipo, dados = excluded.dados, atualizado_em = excluded.atualizado_em, apagado = 0, por = excluded.por')
        .bind(ds, rec.id, tipo, txt, quando, u.usuario));
    }
    for (const id of (l.apagar || [])) {
      const atual = existentes.get(String(id));
      if (!atual || atual.apagado) continue;
      const podeEsc = ds === 'analises' ? ac.escrever.analises.includes(atual.tipo) : ac.escrever[ds];
      if (!podeEsc || !ac.excluir) { recusados.push({ ds, id, motivo: 'sem permissão para excluir' }); continue; }
      escritas.push(env.DB.prepare("UPDATE registros SET apagado = 1, dados = '{}', atualizado_em = ?, por = ? WHERE dataset = ? AND id = ?").bind(agora(), u.usuario, ds, String(id)));
    }
  }
  for (const v of VALORES) {
    if (!Object.prototype.hasOwnProperty.call(corpo.valores || {}, v)) continue;
    if (!ac.escrever[v]) { recusados.push({ ds: v, motivo: 'sem permissão' }); continue; }
    let dados = corpo.valores[v];
    if (v === 'bairros') { const atual = await lerValor(env, 'bairros', {}); for (const [c, bs] of Object.entries(dados || {})) atual[c] = [...new Set([...(atual[c] || []), ...(Array.isArray(bs) ? bs : [])])].slice(0, 2000); dados = atual; }
    const txt = JSON.stringify(dados);
    if (txt.length > 5e6) { recusados.push({ ds: v, motivo: 'grande demais' }); continue; }
    escritas.push(env.DB.prepare('INSERT INTO valores (chave, dados, atualizado_em, por) VALUES (?,?,?,?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em, por = excluded.por').bind(v, txt, agora(), u.usuario));
  }
  let ver = await versao(env);
  if (escritas.length) {
    ver += 1;
    escritas.push(env.DB.prepare('INSERT INTO valores (chave, dados, atualizado_em, por) VALUES (?,?,?,?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em').bind('versao', String(ver), agora(), ''));
    escritas.push(env.DB.prepare('INSERT INTO log (quando, usuario, acao, detalhe) VALUES (?,?,?,?)').bind(agora(), u.usuario, 'salvou', Object.keys(listas).concat(Object.keys(corpo.valores || {})).join(',')));
    await env.DB.batch(escritas);
  }
  return { versao: ver, recusados };
}

/* ---------------- administrativo ---------------- */
function soAdmin(u) { if (u.perfil !== 'Administrador') throw new Erro(403, 'Somente o administrador.'); }
async function rotaAdmin(env, u, req, partes) {
  soAdmin(u);
  const m = req.method;
  if (partes[1] === 'usuarios') {
    if (m === 'GET') return { usuarios: await todos(env, 'SELECT usuario, nome, perfil, ativo, trocar_senha, criado_em, atualizado_em FROM usuarios ORDER BY usuario') };
    if (m === 'POST') {
      const { usuario, nome, perfil, senha } = await req.json();
      const id = normU(usuario).replace(/\s+/g, '.');
      if (!/^[A-Z0-9._-]{3,40}$/.test(id)) throw new Erro(400, 'Usuário inválido (use letras, números, ponto ou traço).');
      if (!PERFIS.includes(perfil)) throw new Erro(400, 'Perfil inválido.');
      if (!senha || String(senha).length < 8) throw new Erro(400, 'A senha precisa ter ao menos 8 caracteres.');
      if (await um(env, 'SELECT 1 FROM usuarios WHERE usuario = ?', id)) throw new Erro(400, 'Esse usuário já existe.');
      const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
      await exec(env, 'INSERT INTO usuarios (usuario, nome, perfil, ativo, sal, hash, trocar_senha, sessao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)', id, String(nome || id).slice(0, 80), perfil, 1, sal, await hashSenha(env, senha, sal), 1, 0, agora(), agora());
      await registrar(env, u.usuario, 'criou-usuario', id + ' (' + perfil + ')');
      return { ok: true };
    }
    const alvo = normU(decodeURIComponent(partes[2] || ''));
    const existe = await um(env, 'SELECT usuario, perfil FROM usuarios WHERE usuario = ?', alvo);
    if (!existe) throw new Erro(404, 'Usuário não encontrado.');
    if (m === 'PATCH') {
      const b = await req.json();
      if (alvo === u.usuario && (b.perfil && b.perfil !== 'Administrador' || b.ativo === false)) throw new Erro(400, 'Você não pode tirar o próprio acesso de administrador.');
      if (b.perfil) { if (!PERFIS.includes(b.perfil)) throw new Erro(400, 'Perfil inválido.'); await exec(env, 'UPDATE usuarios SET perfil = ?, sessao = sessao + 1, atualizado_em = ? WHERE usuario = ?', b.perfil, agora(), alvo); }
      if (b.nome) await exec(env, 'UPDATE usuarios SET nome = ?, atualizado_em = ? WHERE usuario = ?', String(b.nome).slice(0, 80), agora(), alvo);
      if (typeof b.ativo === 'boolean') await exec(env, 'UPDATE usuarios SET ativo = ?, sessao = sessao + 1, atualizado_em = ? WHERE usuario = ?', b.ativo ? 1 : 0, agora(), alvo);
      if (b.senha) {
        if (String(b.senha).length < 8) throw new Erro(400, 'A senha precisa ter ao menos 8 caracteres.');
        const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
        await exec(env, 'UPDATE usuarios SET sal = ?, hash = ?, trocar_senha = 1, sessao = sessao + 1, atualizado_em = ? WHERE usuario = ?', sal, await hashSenha(env, b.senha, sal), agora(), alvo);
        await exec(env, 'DELETE FROM tentativas WHERE usuario = ?', alvo);
      }
      await registrar(env, u.usuario, 'alterou-usuario', alvo + ' ' + Object.keys(b).join(','));
      return { ok: true };
    }
    if (m === 'DELETE') {
      if (alvo === u.usuario) throw new Erro(400, 'Você não pode excluir o próprio usuário.');
      await exec(env, 'DELETE FROM usuarios WHERE usuario = ?', alvo);
      await registrar(env, u.usuario, 'excluiu-usuario', alvo);
      return { ok: true };
    }
  }
  if (partes[1] === 'permissoes') {
    if (m === 'GET') return { perfis: await lerValor(env, 'perfis', {}), padrao: PERM_PADRAO };
    if (m === 'PUT') {
      const { perfis } = await req.json(); const limpo = {};
      for (const p of ['Treinamento', 'Supervisão', 'Gerência']) if (perfis && perfis[p]) limpo[p] = { abas: (perfis[p].abas || []).filter(a => TODAS_ABAS.includes(a)), botoes: (perfis[p].botoes || []).filter(b => TODOS_BOTOES.includes(b)) };
      await gravarValor(env, 'perfis', limpo, u.usuario); await subirVersao(env);
      await registrar(env, u.usuario, 'alterou-permissoes', '');
      return { ok: true };
    }
  }
  if (partes[1] === 'log' && m === 'GET') return { log: await todos(env, 'SELECT quando, usuario, acao, detalhe FROM log ORDER BY quando DESC LIMIT 200') };
  throw new Erro(404, 'Rota não encontrada.');
}

/* ---------------- diagnóstico (não mostra nenhum valor secreto) ---------------- */
async function diagnostico(env) {
  const d = { servico: 'treinamento-inovacao-casa', banco_ligado: !!(env.DB && env.DB.prepare), tabelas: [], segredo_sessao: !!(env.SEGREDO_SESSAO && env.SEGREDO_SESSAO.length >= 20), pimenta: !!env.PIMENTA, origens: String(env.ORIGENS || '') };
  if (d.banco_ligado) {
    try { d.tabelas = (await todos(env, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(r => r.name).filter(n => !n.startsWith('_') && !n.startsWith('sqlite')); }
    catch (e) { d.erro_banco = String(e.message || e).slice(0, 200); }
  }
  const faltam = ['usuarios', 'registros', 'valores', 'tentativas', 'log'].filter(t => !d.tabelas.includes(t));
  d.problemas = [];
  if (!d.banco_ligado) d.problemas.push('O banco não está ligado: em Settings → Bindings, adicione D1 com o nome DB.');
  else if (faltam.length) d.problemas.push('Faltam tabelas no banco (' + faltam.join(', ') + '): rode o schema.sql no Console do D1.');
  if (!d.segredo_sessao) d.problemas.push('Falta o segredo SEGREDO_SESSAO (mínimo 20 caracteres) em Settings → Variables and Secrets.');
  if (!d.pimenta) d.problemas.push('Falta o segredo PIMENTA em Settings → Variables and Secrets.');
  if (!d.origens) d.problemas.push('Falta a variável ORIGENS com o endereço do site.');
  d.ok = d.problemas.length === 0;
  return d;
}

/* ---------------- entrada ---------------- */
function cors(env, req) {
  const origem = req.headers.get('Origin') || '';
  const permitidas = String(env.ORIGENS || 'https://emersonaraujodefreitas.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const ok = permitidas.includes(origem);
  return { 'Access-Control-Allow-Origin': ok ? origem : permitidas[0] || '', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const resposta = (env, req, corpo, status = 200) => new Response(corpo && corpo.__bruto ? corpo.__bruto : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors(env, req) } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    try {
      const origem = req.headers.get('Origin');
      const permitidas = String(env.ORIGENS || 'https://emersonaraujodefreitas.github.io').split(',').map(s => s.trim());
      if (origem && !permitidas.includes(origem)) throw new Erro(403, 'Origem não permitida.');
      const partes = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').split('/');
      const rota = partes[0];
      if (rota === '' || rota === 'saude') return resposta(env, req, await diagnostico(env));
      await garantirAdmin(env);
      if (rota === 'login' && req.method === 'POST') return resposta(env, req, await rotaLogin(env, req));
      const u = await autenticar(env, req);
      if (u.trocar_senha && rota !== 'senha') throw new Erro(403, 'Troque a senha para continuar.');
      if (rota === 'senha' && req.method === 'POST') return resposta(env, req, await rotaTrocarSenha(env, u, req));
      if (rota === 'versao' && req.method === 'GET') return resposta(env, req, { versao: await versao(env) });
      if (rota === 'estado' && req.method === 'GET') return resposta(env, req, await rotaEstado(env, u));
      if (rota === 'sincronizar' && req.method === 'POST') return resposta(env, req, await rotaSincronizar(env, u, req));
      if (rota === 'admin') return resposta(env, req, await rotaAdmin(env, u, req, partes));
      throw new Erro(404, 'Rota não encontrada.');
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return resposta(env, req, { erro: status === 500 ? 'Erro no servidor.' : e.message }, status);
    }
  }
};
