/* =========================================================
   Leitor de planilhas Excel (.xlsx / .xlsm) direto no navegador,
   sem bibliotecas externas. Usa DecompressionStream para abrir o zip.
   ========================================================= */
(function () {
'use strict';

async function inflar(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
async function abrirZip(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer), dv = new DataView(arrayBuffer);
  let fim = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('Arquivo não é uma planilha Excel válida (.xlsx/.xlsm).');
  const total = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true);
  const arquivos = {}; const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const lNome = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lCom = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + lNome));
    arquivos[nome] = { metodo, tam, local };
    p += 46 + lNome + lExtra + lCom;
  }
  return {
    nomes: Object.keys(arquivos),
    async texto(nome) {
      const a = arquivos[nome]; if (!a) return null;
      const ini = a.local + 30 + dv.getUint16(a.local + 26, true) + dv.getUint16(a.local + 28, true);
      const dados = u8.subarray(ini, ini + a.tam);
      return dec.decode(a.metodo === 0 ? dados : await inflar(dados));
    }
  };
}
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/* Retorna [{ nome, linhas: [[...], ...] }] com valores crus (números para datas) */
async function lerPlanilha(arrayBuffer) {
  const zip = await abrirZip(arrayBuffer);
  const wb = xml(await zip.texto('xl/workbook.xml'));
  const rels = xml(await zip.texto('xl/_rels/workbook.xml.rels'));
  const alvo = {};
  [...rels.getElementsByTagName('Relationship')].forEach(r => alvo[r.getAttribute('Id')] = r.getAttribute('Target'));
  const ssTxt = await zip.texto('xl/sharedStrings.xml');
  const strings = ssTxt ? [...xml(ssTxt).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const abas = [];
  for (const s of wb.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let caminho = alvo[rid] || ''; caminho = caminho.startsWith('/') ? caminho.slice(1) : 'xl/' + caminho.replace(/^\.\//, '');
    const txt = await zip.texto(caminho); if (!txt) continue;
    const doc = xml(txt), linhas = [];
    for (const row of doc.getElementsByTagName('row')) {
      const r = +row.getAttribute('r') - 1, vals = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = null;
        if (t === 's') val = v ? strings[+v.textContent] ?? '' : '';
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
        else if (t === 'b') val = v ? v.textContent === '1' : null;
        else if (v) { const n = Number(v.textContent); val = isFinite(n) ? n : v.textContent; }
        vals[col(c.getAttribute('r') || '')] = val;
      }
      linhas[r] = vals;
    }
    abas.push({ nome: s.getAttribute('name'), linhas });
  }
  return abas;
}
const dataExcel = v => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === 'string') { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); }
  return '';
};
window.XLSXLeitor = { lerPlanilha, dataExcel };
})();
