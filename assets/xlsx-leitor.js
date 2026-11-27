/* =========================================================
   Leitor de planilhas Excel (.xlsx / .xlsm) direto no navegador,
   sem bibliotecas externas.
   - Roda num Web Worker: a tela não trava em arquivos grandes.
   - Lê o XML com um analisador de texto (bem mais rápido que DOM).
   - Mostra o progresso (%) e pode ler só as abas que interessam.
   ========================================================= */
(function () {
'use strict';

/* ---------- núcleo (usado dentro do worker e, se preciso, na própria página) ---------- */
function nucleo() {
  const dec = new TextDecoder();
  const ent = s => s.indexOf('&') < 0 ? s : s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(+e.slice(1)));
  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  function abrirZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let fim = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error('Arquivo não é uma planilha Excel válida (.xlsx/.xlsm).');
    const total = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true);
    const arquivos = {};
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), tamReal = dv.getUint32(p + 24, true);
      const lNome = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lCom = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      arquivos[dec.decode(u8.subarray(p + 46, p + 46 + lNome))] = { metodo, tam, tamReal, local };
      p += 46 + lNome + lExtra + lCom;
    }
    return {
      tamanho: nome => (arquivos[nome] || {}).tamReal || 0,
      async texto(nome) {
        const a = arquivos[nome]; if (!a) return null;
        const ini = a.local + 30 + dv.getUint16(a.local + 26, true) + dv.getUint16(a.local + 28, true);
        const dados = u8.subarray(ini, ini + a.tam);
        return dec.decode(a.metodo === 0 ? dados : await inflar(dados));
      }
    };
  }
  const atrib = (tag, nome) => { const m = tag.match(new RegExp('\\s' + nome + '="([^"]*)"')); return m ? m[1] : null; };
  const col = ref => { let n = 0; for (let i = 0; i < ref.length; i++) { const c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };
  async function preparar(buf) {
    const zip = abrirZip(buf);
    const wb = await zip.texto('xl/workbook.xml'), rels = await zip.texto('xl/_rels/workbook.xml.rels');
    const alvo = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(t => { alvo[atrib(t, 'Id')] = atrib(t, 'Target'); });
    const abas = (wb.match(/<sheet\b[^>]*>/g) || []).map(t => {
      let c = alvo[atrib(t, 'r:id')] || ''; c = c.startsWith('/') ? c.slice(1) : 'xl/' + c.replace(/^\.\//, '');
      return { nome: ent(atrib(t, 'name') || ''), caminho: c, tamanho: zip.tamanho(c) };
    }).filter(a => a.tamanho);
    return { zip, abas, strings: null, estilos: null };
  }
  async function strings(ctx) {
    if (ctx.strings) return ctx.strings;
    const t = await ctx.zip.texto('xl/sharedStrings.xml'); const out = [];
    if (t) { const re = /<si>([\s\S]*?)<\/si>/g; let m; while ((m = re.exec(t))) { const s = m[1]; if (s.indexOf('<r>') < 0 && s.indexOf('<rPh') < 0) { const x = s.match(/<t[^>]*>([\s\S]*?)<\/t>/); out.push(x ? ent(x[1]) : ''); } else { let txt = ''; const r2 = /<t[^>]*>([\s\S]*?)<\/t>/g; let y; const semFon = s.replace(/<rPh[\s\S]*?<\/rPh>/g, ''); while ((y = r2.exec(semFon))) txt += y[1]; out.push(ent(txt)); } } }
    return (ctx.strings = out);
  }
  async function estilos(ctx) {
    if (ctx.estilos) return ctx.estilos;
    const tipo = []; const t = await ctx.zip.texto('xl/styles.xml');
    if (t) {
      const cod = {}; (t.match(/<numFmt\b[^>]*>/g) || []).forEach(x => { cod[atrib(x, 'numFmtId')] = ent(atrib(x, 'formatCode') || ''); });
      const cx = (t.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
      (cx.match(/<xf\b[^>]*>/g) || []).forEach((x, i) => {
        const id = +atrib(x, 'numFmtId') || 0, c = (cod[id] || '').replace(/"[^"]*"|\[(?![hms]\])[^\]]*\]/gi, '');
        tipo[i] = id === 9 || id === 10 || /%/.test(c) ? 'pct' : [18, 19, 20, 21, 45, 46, 47].includes(id) || /(^|[^a-z])(h|\[h\])+:mm|mm:ss/i.test(c) ? 'tempo' : [14, 15, 16, 17, 22].includes(id) || /d+[\/.-]m+|y{2,}/i.test(c) ? 'data' : '';
      });
    }
    return (ctx.estilos = tipo);
  }
  /* lê uma aba; maxLinhas limita (prévia); progresso(fração) */
  async function lerAba(ctx, aba, maxLinhas, progresso) {
    const xml = await ctx.zip.texto(aba.caminho); const ss = await strings(ctx), st = await estilos(ctx);
    const linhas = [], formatos = [], N = xml.length;
    let pos = xml.indexOf('<sheetData'), cont = 0, ultimo = 0;
    if (pos < 0) return { nome: aba.nome, linhas, formatos };
    while (true) {
      const ini = xml.indexOf('<row', pos); if (ini < 0) break;
      const fimTag = xml.indexOf('>', ini);
      let fim;
      if (xml[fimTag - 1] === '/') { pos = fimTag + 1; continue; }
      fim = xml.indexOf('</row>', fimTag); if (fim < 0) break;
      const rAt = atrib(xml.slice(ini, fimTag + 1), 'r'); const r = rAt ? +rAt - 1 : linhas.length;
      const corpo = xml.slice(fimTag + 1, fim), vals = [], fm = [];
      let p = 0, auto = 0;
      while (true) {
        const ci = corpo.indexOf('<c', p); if (ci < 0) break;
        const te = corpo.indexOf('>', ci); const tag = corpo.slice(ci, te + 1);
        let conteudo = '';
        if (tag[tag.length - 2] === '/') p = te + 1;
        else { const cf = corpo.indexOf('</c>', te); conteudo = corpo.slice(te + 1, cf); p = cf + 4; }
        const ref = atrib(tag, 'r'); const ci2 = ref ? col(ref) : auto; auto = ci2 + 1;
        const t = atrib(tag, 't'), s = atrib(tag, 's');
        let val = null;
        if (t === 'inlineStr') { const x = conteudo.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = x ? ent(x[1]) : ''; }
        else { const vi = conteudo.indexOf('<v>'); if (vi >= 0) { const v = conteudo.slice(vi + 3, conteudo.indexOf('</v>', vi)); if (t === 's') val = ss[+v] ?? ''; else if (t === 'str' || t === 'e') val = ent(v); else if (t === 'b') val = v === '1'; else { const n = Number(v); val = isFinite(n) ? n : ent(v); } } }
        vals[ci2] = val;
        if (typeof val === 'number' && s && st[+s]) fm[ci2] = st[+s];
      }
      linhas[r] = vals; if (fm.length) formatos[r] = fm;
      pos = fim + 6; cont++;
      if (maxLinhas && cont >= maxLinhas) break;
      if (progresso && pos - ultimo > 400000) { ultimo = pos; progresso(pos / N); }
    }
    return { nome: aba.nome, linhas, formatos };
  }
  return { preparar, lerAba, strings, estilos };
}

/* ---------- worker ---------- */
let worker = null, seqMsg = 0; const pend = new Map();
function obterWorker() {
  if (worker !== null) return worker;
  try {
    const src = `const N=(${nucleo.toString()})();let ctx=null;
onmessage=async e=>{const {id,cmd,buf,abas,max}=e.data;const prog=(f,t)=>postMessage({id,prog:f,txt:t});
try{
 if(cmd==='abrir'){prog(.02,'Abrindo o arquivo…');ctx=await N.preparar(buf);postMessage({id,ok:ctx.abas.map(a=>({nome:a.nome,tamanho:a.tamanho}))});}
 else if(cmd==='previa'){prog(.05,'Lendo textos da planilha…');await N.strings(ctx);await N.estilos(ctx);const out=[];for(const [i,a] of ctx.abas.entries()){if(abas&&!abas.includes(a.nome))continue;prog(.1+.1*i/ctx.abas.length,'Conferindo a aba '+a.nome+'…');out.push(await N.lerAba(ctx,a,max||30));}postMessage({id,ok:out});}
 else if(cmd==='ler'){const sel=ctx.abas.filter(a=>!abas||abas.includes(a.nome));const tot=sel.reduce((s,a)=>s+a.tamanho,0)||1;let feito=0;const out=[];await N.strings(ctx);await N.estilos(ctx);
  for(const a of sel){out.push(await N.lerAba(ctx,a,0,f=>prog(.2+.78*(feito+f*a.tamanho)/tot,'Lendo '+a.nome+'…')));feito+=a.tamanho;}
  postMessage({id,ok:out});}
}catch(err){postMessage({id,erro:String(err&&err.message||err)});}};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; if (e.data.prog !== undefined) { p.prog && p.prog(e.data.prog, e.data.txt); return; } pend.delete(e.data.id); e.data.erro ? p.rej(new Error(e.data.erro)) : p.res(e.data.ok); };
    worker.onerror = () => { worker = false; };
  } catch (e) { worker = false; }
  return worker;
}
const chamar = (msg, prog, transf) => new Promise((res, rej) => { const id = ++seqMsg; pend.set(id, { res, rej, prog }); obterWorker().postMessage({ ...msg, id }, transf || []); });

/* fallback sem worker */
let local = null;
async function semWorker(buf, o) {
  const N = nucleo(); const ctx = await N.preparar(buf);
  const sel = ctx.abas.filter(a => !o.abas || o.abas.includes(a.nome));
  const out = []; for (const a of sel) out.push(await N.lerAba(ctx, a, 0, f => o.progresso && o.progresso(f)));
  return out;
}

/* API
   lerPlanilha(buf, { progresso(fração, texto), escolher(previas) → nomes das abas a ler })
   Sem "escolher", lê todas as abas. Retorna [{ nome, linhas, formatos }]. */
async function lerPlanilha(arrayBuffer, o = {}) {
  const prog = (f, t) => o.progresso && o.progresso(Math.max(0, Math.min(1, f)), t || '');
  if (!obterWorker()) { const r = await semWorker(arrayBuffer, o); prog(1, 'Pronto'); return r; }
  try {
    await chamar({ cmd: 'abrir', buf: arrayBuffer }, prog, [arrayBuffer]);
    let abas = null;
    if (o.escolher) { const previas = await chamar({ cmd: 'previa', max: 30 }, prog); abas = await o.escolher(previas); }
    const r = await chamar({ cmd: 'ler', abas }, prog);
    prog(1, 'Pronto');
    return r;
  } catch (e) {
    if (/Worker|clone|transfer/i.test(String(e.message))) { worker = false; return semWorker(arrayBuffer, o); }
    throw e;
  }
}
const dataExcel = v => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === 'string') { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); }
  return '';
};
/* barra de progresso para mostrar numa mensagem */
const barra = el => (f, t) => { if (!el) return; el.className = 'msg'; el.innerHTML = `<span class="xl-prog"><i style="width:${Math.round(f * 100)}%"></i></span><b>${Math.round(f * 100)}%</b> ${t ? String(t).replace(/[<>&]/g, '') : ''}`; };
window.XLSXLeitor = { lerPlanilha, dataExcel, barra };
})();
