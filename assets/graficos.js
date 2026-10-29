/* =========================================================
   Inovação Casa · Treinamento — gráficos em SVG e ícones animados
   Sem bibliotecas externas: barras, linha, rosca e comparativos.
   ========================================================= */
(function () {
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => n === null || n === undefined || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
let seq = 0;
const uid = p => p + (++seq).toString(36);

/* =========================================================
   ÍCONES (traço 24×24) — animação de desenho + movimento contínuo
   ========================================================= */
const IC = {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.5 1.9 5 4.9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  pin: '<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
  medical: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1"/><path class="pulsa" d="M12 9.5v6M9 12.5h6"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5"/><path class="gira" d="m12 6.6.85 1.75 1.9.28-1.38 1.34.33 1.9L12 10.97l-1.7.9.33-1.9-1.38-1.34 1.9-.28z"/>',
  flag: '<path d="M5 21V4"/><path class="onda" d="M5 4.5c4-2 7 2 11 0 1-.5 2-.5 3-.2v9c-1-.3-2-.3-3 .2-4 2-7-2-11 0"/>',
  chart: '<path d="M4 20h16"/><rect class="b1" x="5.5" y="11" width="3" height="7" rx="1"/><rect class="b2" x="10.5" y="6" width="3" height="12" rx="1"/><rect class="b3" x="15.5" y="9" width="3" height="9" rx="1"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1"/><path class="linha1" d="M9 10h6"/><path class="linha2" d="M9 14h4"/>',
  target: '<circle class="anel" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path class="chk" d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
  down: '<path d="m3 7 6.5 6.5 4-4L21 17"/><path d="M15 17h6v-6"/>',
  up: '<path d="m3 17 6.5-6.5 4 4L21 7"/><path d="M15 7h6v6"/>',
  scale: '<path d="M12 4v16M7 20h10"/><g class="braco"><path d="M5 7h14"/><path d="M5 7 2.5 13a2.6 2.6 0 0 0 5 0zM19 7l-2.5 6a2.6 2.6 0 0 0 5 0z"/></g>',
  building: '<path d="M4 21V8l6-3v16M10 21V3l10 4v14M3 21h18M13.5 9h2M13.5 12.5h2M13.5 16h2M6.5 11h1M6.5 14.5h1"/>',
  sparkles: '<path class="s1" d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path class="s2" d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  cake: '<path d="M4 20V13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M3 20h18M4 15.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M12 11V7.5"/><path class="chama" d="M12 3.5c.9 1 .9 2.2 0 3-.9-.8-.9-2 0-3z"/>',
  histogram: '<path d="M3 20h18"/><rect class="b1" x="4" y="14" width="3.2" height="6" rx=".8"/><rect class="b2" x="8.3" y="9" width="3.2" height="11" rx=".8"/><rect class="b3" x="12.6" y="5" width="3.2" height="15" rx=".8"/><rect class="b4" x="16.9" y="11" width="3.2" height="9" rx=".8"/>',
  activity: '<path class="pulso" d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path class="fatia" d="M15 2.6A9 9 0 0 1 21.4 9H15z"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path class="folha" d="M7 14h10v6.5H7z"/>',
  download: '<path class="seta" d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload: '<path class="seta" d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  exam: '<path d="M4 20h16"/><g class="lapis"><path d="M14.5 3.5l4 4L8 18H4v-4z"/><path d="M12.5 5.5l4 4"/></g>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13.5" width="4" height="6" rx="1.5"/><rect x="17" y="13.5" width="4" height="6" rx="1.5"/><path d="M19 19.5c0 1.4-1.6 2-4 2h-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path class="ponteiro" d="M12 7v5l3.5 2"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  rocket: '<path d="M12 15.5 8.5 12C10 7 13.5 4 20 4c0 6.5-3 10-8 11.5z"/><path d="M8.5 12 5 11.5 7.5 9h4M12 15.5l.5 3.5 2.5-2.5v-4"/><path class="fogo" d="M6.5 15.5c-1.5.5-2.5 2.5-2.5 4.5 2 0 4-1 4.5-2.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path class="dia" d="M8 14h2.5v2.5H8z"/>'
};
// animação contínua padrão de cada ícone (pode ser trocada com data-a)
const ANIM = {
  users: 'float', user: 'float', pin: 'bounce', briefcase: 'tilt', medical: 'beat', award: 'spin', flag: 'wave', chart: 'bars',
  database: 'pulse', clipboard: 'write', target: 'ring', check: 'redraw', alert: 'shake', trophy: 'bounce', down: 'drift-down', up: 'drift-up',
  scale: 'balance', building: 'float', sparkles: 'twinkle', cake: 'flame', histogram: 'bars', activity: 'trace', pie: 'slice', map: 'float',
  print: 'paper', download: 'drop', upload: 'lift', plus: 'pulse', percent: 'pulse', exam: 'scribble', headset: 'float', clock: 'tick',
  star: 'twinkle', edit: '', trash: '', rocket: 'launch', layers: 'float', search: 'pulse', calendar: 'pulse'
};
function ic(nome, anim) {
  const corpo = IC[nome]; if (!corpo) return '';
  const a = anim === undefined ? ANIM[nome] || '' : anim;
  const svg = corpo.replace(/<(path|circle|rect|ellipse)\b/g, '<$1 pathLength="100"');
  return `<span class="ic${a ? ' a-' + a : ''}" aria-hidden="true"><svg viewBox="0 0 24 24">${svg}</svg></span>`;
}
function icones(raiz = document) {
  raiz.querySelectorAll('[data-ic]').forEach(el => {
    if (el.dataset.icOk) return;
    el.innerHTML = ic(el.dataset.ic, el.dataset.a) + el.innerHTML; el.dataset.icOk = '1';
  });
}

/* =========================================================
   TOOLTIP global (data-tip com HTML já escapado)
   ========================================================= */
function iniciarTooltip() {
  const tip = document.getElementById('tip'); if (!tip) return;
  let alvo = null;
  const pos = e => {
    const m = 14, r = tip.getBoundingClientRect();
    let x = e.clientX + m, y = e.clientY + m;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - m;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - m;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (t === alvo) return; alvo = t;
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = t.dataset.tip; tip.hidden = false; pos(e);
  });
  document.addEventListener('mousemove', e => { if (alvo) pos(e); });
  document.addEventListener('scroll', () => { tip.hidden = true; alvo = null; }, true);
}

/* =========================================================
   GRÁFICOS
   ========================================================= */
const ticks10 = [0, 2, 4, 6, 8, 10];
function ticksPara(max) {
  if (max === 10) return ticks10;
  const passo = max / 4; return [0, 1, 2, 3, 4].map(i => +(passo * i).toFixed(2));
}
function maxBonito(v) {
  if (!(v > 0)) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * p;
}
const gradiente = (id, cor) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="${cor}" stop-opacity=".78"/></linearGradient>`;
function vazio(el, txt) { el.innerHTML = `<div class="g-vazio">${ic('chart', '')}<span>${txt || 'Sem dados para exibir'}</span></div>`; }

/* ---------- barras verticais ---------- */
function colunas(el, itens, o = {}) {
  if (!itens.length) return vazio(el);
  const W = Math.max(280, el.clientWidth || 500), H = o.altura || 270;
  const pl = 34, pr = 10, pt = 28, pb = 36;
  const max = o.max || maxBonito(Math.max(...itens.map(i => i.valor || 0)) * 1.12);
  const tk = o.ticks || ticksPara(max);
  const iw = W - pl - pr, ih = H - pt - pb, n = itens.length, slot = iw / n, bw = Math.min(54, slot * .62);
  const y = v => pt + ih - (Math.max(0, v) / max) * ih;
  const grads = {}; let defs = '';
  itens.forEach(it => { if (!grads[it.cor]) { grads[it.cor] = uid('gr'); defs += gradiente(grads[it.cor], it.cor); } });
  let s = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(o.titulo || 'Gráfico de barras')}"><defs>${defs}</defs>`;
  tk.forEach(t => s += `<line class="g-grade" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="g-tick" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t, Number.isInteger(t) ? 0 : 1)}</text>`);
  if (o.meta !== undefined && o.meta !== null) s += linhaMetaH(pl, W - pr, y(o.meta));
  itens.forEach((it, i) => {
    const x = pl + slot * i + (slot - bw) / 2, v = it.valor || 0, h = Math.max(0, pt + ih - y(v)), yy = pt + ih - h, r = Math.min(7, bw / 2, h);
    const d = h > 0 ? `M${x},${pt + ih}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${pt + ih}Z` : '';
    const rot = slot < 64 && it.rotulo.length > 4 ? it.rotulo.slice(0, 3) + '.' : it.rotulo.length > 11 && slot < 80 ? it.rotulo.slice(0, 9) + '…' : it.rotulo;
    s += `<g class="g-col" style="--d:${i * 55}ms" data-tip="${esc(it.tip || '')}">
      <rect class="g-hit" x="${pl + slot * i}" y="${pt}" width="${slot}" height="${ih}"/>
      <path class="g-bar" d="${d}" fill="url(#${grads[it.cor]})"/>
      <text class="g-val${h > 26 ? ' dentro' : ''}" x="${x + bw / 2}" y="${h > 26 ? yy + 17 : yy - 8}" text-anchor="middle">${esc(it.rotuloValor ?? fmt(v))}</text>
      <text class="g-x" x="${x + bw / 2}" y="${H - pb + 20}" text-anchor="middle">${esc(rot)}</text></g>`;
  });
  s += `<line class="g-base" x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}"/>`;
  el.innerHTML = s + '</svg>' + legenda(o.legenda, o.meta);
}
function linhaMetaH(x1, x2, yy) {
  return `<g class="g-meta"><line x1="${x1}" x2="${x2}" y1="${yy}" y2="${yy}"/></g>`;
}
function legenda(itens, meta) {
  if ((!itens || !itens.length) && (meta === undefined || meta === null)) return '';
  return `<div class="g-leg">${(itens || []).map(([t, c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}${meta !== undefined && meta !== null ? `<span><i class="leg-meta"></i>Meta ${fmt(meta)}</span>` : ''}</div>`;
}

/* ---------- barras horizontais (ranking) ---------- */
function ranking(el, itens, o = {}) {
  if (!itens.length) return vazio(el, o.vazio);
  const max = o.max || maxBonito(Math.max(...itens.map(i => i.valor || 0)) * 1.05);
  const temMeta = o.meta !== undefined && o.meta !== null;
  const posMeta = temMeta ? Math.min(100, o.meta / max * 100) : 0;
  el.innerHTML = `<div class="hb${o.posicao ? ' com-pos' : ''}" style="--meta:${posMeta}%">
    ${temMeta ? `<div class="hb-cab"><span></span><div class="hb-escala"><b style="left:${posMeta}%">meta ${fmt(o.meta)}</b></div><span></span></div>` : ''}
    ${itens.map((it, i) => {
      const w = Math.max(0, Math.min(100, (it.valor || 0) / max * 100));
      const med = o.posicao && i < 3 ? ` med${i + 1}` : '';
      return `<div class="hb-row" style="--d:${Math.min(i, 30) * 35}ms" data-tip="${esc(it.tip || '')}">
        ${o.posicao ? `<span class="hb-pos${med}">${i + 1}</span>` : ''}
        <div class="hb-lab"><b>${esc(it.rotulo)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
        <div class="hb-track${temMeta ? ' tem-meta' : ''}"><i style="--w:${w}%;--c:${it.cor}"></i></div>
        <div class="hb-val">${esc(it.rotuloValor ?? fmt(it.valor))}</div></div>`;
    }).join('')}</div>${legenda(o.legenda)}`;
}

/* ---------- linhas ---------- */
function linhas(el, rotulos, series, o = {}) {
  series = series.filter(s => s.valores.some(v => v !== null));
  if (!rotulos.length || !series.length) return vazio(el, 'Nenhuma prova lançada');
  const W = Math.max(280, el.clientWidth || 500), H = o.altura || 270;
  const pl = 34, pr = 16, pt = 22, pb = 34;
  const todos = series.flatMap(se => se.valores).filter(v => v !== null);
  const min = o.min ?? Math.max(0, Math.floor(Math.min(...todos, o.meta ?? 10)) - 1), max = o.max ?? 10;
  const tk = o.ticks || Array.from({ length: max - min + 1 }, (_, i) => min + i).filter((t, i, a) => a.length <= 7 || (t - min) % 2 === 0);
  const iw = W - pl - pr, ih = H - pt - pb, n = rotulos.length;
  const x = i => n === 1 ? pl + iw / 2 : pl + 18 + (iw - 36) * i / (n - 1);
  const y = v => pt + ih - ((v - min) / (max - min)) * ih;
  let defs = '', s = '';
  tk.forEach(t => s += `<line class="g-grade" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="g-tick" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`);
  s += `<line class="g-base" x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}"/>`;
  if (o.meta !== undefined && o.meta !== null) s += linhaMetaH(pl, W - pr, y(o.meta), o.meta, true);
  series.forEach((se, k) => {
    const pts = se.valores.map((v, i) => v === null ? null : [x(i), y(v)]).filter(Boolean);
    if (!pts.length) return;
    const caminho = suave(pts);
    const ga = uid('ga'); defs += `<linearGradient id="${ga}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${se.cor}" stop-opacity="${k ? .08 : .18}"/><stop offset="1" stop-color="${se.cor}" stop-opacity="0"/></linearGradient>`;
    s += `<path class="g-area" style="--d:${k * 150}ms" d="${caminho} L${pts[pts.length - 1][0]},${pt + ih} L${pts[0][0]},${pt + ih} Z" fill="url(#${ga})"/>`;
    s += `<path class="g-linha" style="--d:${k * 150}ms;stroke:${se.cor}" pathLength="1" d="${caminho}"/>`;
    se.valores.forEach((v, i) => { if (v !== null) s += `<circle class="g-ponto" style="--d:${400 + i * 70 + k * 150}ms;stroke:${se.cor}" cx="${x(i)}" cy="${y(v)}" r="4.5"/>`; });
  });
  rotulos.forEach((r, i) => {
    const linhasTip = series.map(se => `<span class="tip-l"><i style="background:${se.cor}"></i>${esc(se.nome)}: <b>${fmt(se.valores[i])}</b></span>`).join('');
    const larg = n === 1 ? iw : (iw - 36) / (n - 1);
    s += `<g class="g-colx" data-tip="${esc(`<b>${esc(r)}</b>` + linhasTip)}"><rect class="g-hit" x="${x(i) - larg / 2}" y="${pt}" width="${larg}" height="${ih}"/><line class="g-guia" x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${pt + ih}"/><text class="g-x" x="${x(i)}" y="${H - pb + 20}" text-anchor="middle">${esc(r)}</text></g>`;
  });
  el.innerHTML = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(o.titulo || 'Gráfico de linhas')}"><defs>${defs}</defs>${s}</svg>` + legenda(series.map(se => [se.nome, se.cor]), o.meta);
}
function suave(p) {
  if (p.length < 3) return 'M' + p.map(q => q.join(',')).join(' L');
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, t = .18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/* ---------- rosca ---------- */
function rosca(el, itens, o = {}) {
  itens = itens.filter(i => i.valor > 0);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!total) return vazio(el);
  let ini = 0, segs = '';
  itens.forEach((it, i) => {
    const p = it.valor / total * 100, gap = itens.length > 1 ? .8 : 0;
    segs += `<circle class="g-seg" cx="60" cy="60" r="46" pathLength="100" stroke="${it.cor}" stroke-dasharray="${Math.max(0, p - gap)} ${100 - Math.max(0, p - gap)}" stroke-dashoffset="${-ini}" data-tip="${esc(`<b>${esc(it.rotulo)}</b><br>${it.valor} treinandos · ${fmt(p, 0)}%`)}"/>`;
    ini += p;
  });
  el.innerHTML = `<div class="rosca">
    <svg viewBox="0 0 120 120" class="rosca-svg" role="img" aria-label="${esc(o.titulo || 'Distribuição')}">
      <circle cx="60" cy="60" r="46" class="rosca-fundo"/>
      <g transform="rotate(-90 60 60)">${segs}<circle class="rosca-revela" cx="60" cy="60" r="46" pathLength="100"/></g>
      <text x="60" y="58" text-anchor="middle" class="rosca-total">${total.toLocaleString('pt-BR')}</text>
      <text x="60" y="74" text-anchor="middle" class="rosca-rot">${esc(o.rotuloTotal || 'total')}</text>
    </svg>
    <ul class="rosca-leg">${itens.map((it, i) => `<li style="--d:${300 + i * 80}ms" data-tip="${esc(`<b>${esc(it.rotulo)}</b><br>${it.valor} treinandos`)}"><span class="rl-ic" style="color:${it.cor};background:${it.cor}1a">${ic(it.icone || 'user', '')}</span><span class="rl-t">${esc(it.rotulo)}</span><b>${it.valor}</b><small>${fmt(it.valor / total * 100, 0)}%</small><i class="rl-bar"><i style="width:${it.valor / total * 100}%;background:${it.cor}"></i></i></li>`).join('')}</ul>
  </div>`;
}

/* ---------- comparativo A × B ---------- */
function duelo(el, grupos, nomes, metricas, cores, icones = ['pin', 'map']) {
  const [A, B] = grupos;
  el.innerHTML = `<div class="duelo-cab">${nomes.map((n, i) => `<div class="dc dc${i}" style="--c:${cores[i]}"><span class="dc-ic">${ic(icones[i])}</span><div><b>${esc(n)}</b><small>${grupos[i].n} treinandos</small></div></div>`).join('<span class="dc-vs">×</span>')}</div>
  <div class="duelo-grid">${metricas.map(([titulo, k, max, icone, ehPct], mi) => {
    const a = A[k], b = B[k];
    const f = v => v === null || v === undefined ? '—' : ehPct ? fmt(v * 100, 0) + '%' : fmt(v);
    const dif = a !== null && b !== null && a !== undefined && b !== undefined ? a - b : null;
    const lider = dif === null || Math.abs(dif) < 1e-9 ? -1 : dif > 0 ? 0 : 1;
    const difTxt = dif === null ? '' : ehPct ? fmt(Math.abs(dif) * 100, 0) + ' p.p.' : fmt(Math.abs(dif)) + ' pt';
    return `<div class="duelo-item" style="--d:${mi * 80}ms">
      <div class="di-cab"><span class="di-ic">${ic(icone)}</span><span>${titulo}</span>${lider >= 0 ? `<em class="di-dif" style="--c:${cores[lider]}">${ic(lider ? 'down' : 'up', '')}${difTxt}</em>` : ''}</div>
      ${[a, b].map((v, i) => `<div class="di-row${lider === i ? ' lider' : ''}" data-tip="${esc(`<b>${esc(nomes[i])}</b><br>${titulo}: ${f(v)}`)}"><div class="di-bar"><i style="--w:${v === null || v === undefined ? 0 : Math.max(2, Math.min(100, v / max * 100))}%;--c:${cores[i]}"></i></div><b>${f(v)}</b></div>`).join('')}
    </div>`;
  }).join('')}</div>`;
}

window.G = { ic, icones, iniciarTooltip, colunas, ranking, linhas, rosca, duelo, legenda };
})();
