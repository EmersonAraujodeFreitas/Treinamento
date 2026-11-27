/* =========================================================
   Painel de Controle · componentes de dashboard
   Medidores, anéis, barras agrupadas, dispersão (matriz),
   funil, barra empilhada e variação mês a mês. SVG puro.
   ========================================================= */
(function () {
'use strict';
const { fmt, esc } = window.APP;
let seq = 0; const uid = p => p + 'd' + (++seq).toString(36);
const PAL = ['#2a78d6', '#1baf7a', '#8e44c9', '#eb6834', '#eda100', '#d03b3b', '#0f9aa8', '#5b6ee1'];
const corFaixa = (r) => r === null || r === undefined ? '#8a96a8' : r >= 1 ? '#1baf7a' : r >= .85 ? '#8bc34a' : r >= .7 ? '#eda100' : '#d03b3b';

/* medidor semicircular: valor 0..1 (ou mais) */
function medidor(o) {
  const v = o.valor, p = v === null || v === undefined ? 0 : Math.max(0, Math.min(1, o.max ? v / o.max : v));
  const cor = o.cor || corFaixa(o.razao ?? null);
  const R = 52, C = Math.PI * R;
  return `<div class="db-gauge" style="--c:${cor}" ${o.tip ? `data-tip="${esc(o.tip)}"` : ''}>
    <svg viewBox="0 0 128 76" aria-hidden="true"><path class="db-g-fundo" d="M12 68 A52 52 0 0 1 116 68"/><path class="db-g-arco" d="M12 68 A52 52 0 0 1 116 68" stroke-dasharray="${C}" style="--off:${C * (1 - p)};--len:${C}"/>
    ${o.meta !== undefined && o.meta !== null ? (() => { const a = Math.PI * (1 - Math.min(1, o.max ? o.meta / o.max : o.meta)); const x = 64 + Math.cos(a) * R, y = 68 - Math.sin(a) * R; const x2 = 64 + Math.cos(a) * (R - 12), y2 = 68 - Math.sin(a) * (R - 12); return `<line class="db-g-meta" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/>`; })() : ''}</svg>
    <b>${o.texto ?? '—'}</b><span>${esc(o.rotulo || '')}</span>${o.sub ? `<small>${o.sub}</small>` : ''}</div>`;
}
/* anel grande com número no centro */
function anel(o) {
  const p = Math.max(0, Math.min(1, o.pct || 0)), cor = o.cor || '#1baf7a';
  return `<div class="db-anel" style="--c:${cor}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="db-a-fundo"/><circle cx="60" cy="60" r="50" class="db-a-arco" pathLength="100" style="--p:${p * 100}" transform="rotate(-90 60 60)"/></svg>
    <div class="db-a-txt"><small>${esc(o.titulo || '')}</small><b>${o.centro ?? fmt(p * 100, 0) + '%'}</b>${o.sub ? `<em>${o.sub}</em>` : ''}</div></div>`;
}
/* variação contra o mês anterior */
function delta(atual, anterior, sentido, tipo) {
  if (atual === null || atual === undefined || anterior === null || anterior === undefined || !isFinite(atual) || !isFinite(anterior)) return '';
  const d = atual - anterior; if (Math.abs(d) < 1e-9) return '<span class="db-delta neutro">= mês anterior</span>';
  const bom = sentido === 0 ? null : (d > 0) === (sentido > 0);
  const txt = tipo === 'pct' ? fmt(Math.abs(d) * 100, 1) + ' p.p.' : tipo === 'tempo' ? hms(Math.abs(d)) : anterior ? fmt(Math.abs(d / anterior) * 100, 0) + '%' : fmt(Math.abs(d), 0);
  return `<span class="db-delta ${bom === null ? 'neutro' : bom ? 'bom' : 'ruim'}">${d > 0 ? '▲' : '▼'} ${txt}</span>`;
}
const hms = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
/* barras agrupadas (categorias × séries) */
function agrupadas(el, cats, series, o = {}) {
  if (!cats.length || !series.length) { el.innerHTML = '<div class="g-vazio"><span>Sem dados para exibir</span></div>'; return; }
  const W = Math.max(300, el.clientWidth || 520), H = o.altura || 240, pl = 8, pr = 8, pt = 26, pb = 40;
  const todos = series.flatMap(s => s.valores).filter(v => v !== null && v !== undefined && isFinite(v));
  const max = o.max || Math.max(...todos, 0) * 1.15 || 1;
  const iw = W - pl - pr, ih = H - pt - pb, slot = iw / cats.length, gw = Math.min(slot * .78, 34 * series.length + 8), bw = (gw - 4 * (series.length - 1)) / series.length;
  const y = v => pt + ih - Math.max(0, v) / max * ih;
  let s = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  [.25, .5, .75, 1].forEach(t => s += `<line class="g-grade" x1="${pl}" x2="${W - pr}" y1="${y(max * t)}" y2="${y(max * t)}"/>`);
  if (o.meta !== undefined && o.meta !== null) s += `<g class="g-meta"><line x1="${pl}" x2="${W - pr}" y1="${y(o.meta)}" y2="${y(o.meta)}"/></g>`;
  cats.forEach((c, i) => {
    const x0 = pl + slot * i + (slot - gw) / 2;
    series.forEach((se, k) => {
      const v = se.valores[i]; if (v === null || v === undefined || !isFinite(v)) return;
      const x = x0 + k * (bw + 4), yy = y(v), h = pt + ih - yy, r = Math.min(5, bw / 2, h);
      s += `<g class="g-col" style="--d:${(i * series.length + k) * 40}ms" data-tip="${esc(`<b>${esc(c)}</b><br>${esc(se.nome)}: ${o.fmt ? o.fmt(v) : fmt(v)}`)}"><path class="g-bar" fill="${se.cor}" d="M${x},${pt + ih}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${pt + ih}Z"/>
        <text class="g-val" x="${x + bw / 2}" y="${yy - 6}" text-anchor="middle" style="font-size:${bw < 22 ? 9 : 10.5}px">${o.fmt ? o.fmt(v) : fmt(v)}</text></g>`;
    });
    const rot = c.length > 14 && slot < 110 ? c.slice(0, 12) + '…' : c;
    s += `<text class="g-x" x="${pl + slot * i + slot / 2}" y="${H - pb + 18}" text-anchor="middle">${esc(rot)}</text>`;
  });
  s += `<line class="g-base" x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}"/></svg>`;
  el.innerHTML = s + (series.length > 1 || o.meta != null ? `<div class="g-leg">${series.map(se => `<span><i style="background:${se.cor}"></i>${esc(se.nome)}</span>`).join('')}${o.meta != null ? `<span><i class="leg-meta"></i>Meta ${o.fmt ? o.fmt(o.meta) : fmt(o.meta)}</span>` : ''}</div>` : '');
}
/* linha(s) por categoria (ex.: evolução mensal ou supervisor × feedback) */
function linhasCat(el, cats, series, o = {}) {
  if (!cats.length || !series.length) { el.innerHTML = '<div class="g-vazio"><span>Sem dados para exibir</span></div>'; return; }
  const W = Math.max(300, el.clientWidth || 520), H = o.altura || 220, pl = 14, pr = 14, pt = 26, pb = 36;
  const todos = series.flatMap(s => s.valores).filter(v => v !== null && isFinite(v));
  const mn = o.min ?? Math.min(0, ...todos), mx = (Math.max(...todos, 0) - mn) * 1.18 + mn || 1;
  const x = i => cats.length === 1 ? W / 2 : pl + 20 + (W - pl - pr - 40) * i / (cats.length - 1);
  const y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  let s = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  series.forEach((se, k) => {
    const pts = se.valores.map((v, i) => v === null || !isFinite(v) ? null : [x(i), y(v), v, i]).filter(Boolean);
    if (pts.length > 1) s += `<path class="g-linha" pathLength="1" style="--d:${k * 150}ms;stroke:${se.cor}" d="M${pts.map(p => p[0] + ',' + p[1]).join(' L')}"/>`;
    pts.forEach(p => s += `<g data-tip="${esc(`<b>${esc(cats[p[3]])}</b><br>${esc(se.nome)}: ${o.fmt ? o.fmt(p[2]) : fmt(p[2])}`)}"><circle class="db-pt" cx="${p[0]}" cy="${p[1]}" r="11" fill="${se.cor}"/><text x="${p[0]}" y="${p[1] + 3.5}" text-anchor="middle" class="db-pt-t">${o.curto ? o.curto(p[2]) : fmt(p[2], 0)}</text></g>`);
  });
  cats.forEach((c, i) => s += `<text class="g-x" x="${x(i)}" y="${H - 10}" text-anchor="middle">${esc(c.length > 12 && cats.length > 5 ? c.slice(0, 10) + '…' : c)}</text>`);
  el.innerHTML = s + '</svg>' + `<div class="g-leg">${series.map(se => `<span><i style="background:${se.cor}"></i>${esc(se.nome)}</span>`).join('')}</div>`;
}
/* matriz de dispersão com quadrantes nas medianas */
function matriz(el, pts, o = {}) {
  pts = pts.filter(p => isFinite(p.x) && isFinite(p.y));
  if (pts.length < 3) { el.innerHTML = '<div class="g-vazio"><span>Poucos consultores com os dois indicadores</span></div>'; return; }
  const W = Math.max(320, el.clientWidth || 560), H = o.altura || 320, pl = 46, pr = 14, pt = 14, pb = 38;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const med = a => { const b = [...a].sort((p, q) => p - q); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const mx = med(xs), my = med(ys);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x1 - x0) * .08 || 1, py = (y1 - y0) * .08 || 1;
  const X = v => pl + (v - x0 + px) / (x1 - x0 + 2 * px) * (W - pl - pr), Y = v => pt + (1 - (v - y0 + py) / (y1 - y0 + 2 * py)) * (H - pt - pb);
  const Q = o.quadrantes || ['Destaques', 'Volume sem qualidade', 'Qualidade sem volume', 'Atenção'];
  let s = `<svg class="gsvg db-matriz" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <rect class="db-q db-q1" x="${X(mx)}" y="${pt}" width="${W - pr - X(mx)}" height="${Y(my) - pt}"/><rect class="db-q db-q4" x="${pl}" y="${Y(my)}" width="${X(mx) - pl}" height="${H - pb - Y(my)}"/>
    <text class="db-q-t" x="${W - pr - 6}" y="${pt + 14}" text-anchor="end">${esc(Q[0])}</text><text class="db-q-t" x="${pl + 6}" y="${pt + 14}">${esc(Q[2])}</text>
    <text class="db-q-t" x="${W - pr - 6}" y="${H - pb - 6}" text-anchor="end">${esc(Q[1])}</text><text class="db-q-t" x="${pl + 6}" y="${H - pb - 6}">${esc(Q[3])}</text>
    <line class="db-med" x1="${X(mx)}" x2="${X(mx)}" y1="${pt}" y2="${H - pb}"/><line class="db-med" x1="${pl}" x2="${W - pr}" y1="${Y(my)}" y2="${Y(my)}"/>
    <text class="g-x" x="${(pl + W - pr) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.xRot || '')} →</text>
    <text class="g-x" x="12" y="${(pt + H - pb) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pt + H - pb) / 2})">${esc(o.yRot || '')} →</text>`;
  pts.forEach((p, i) => {
    const q = p.x >= mx && p.y >= my ? '#1baf7a' : p.x < mx && p.y < my ? '#d03b3b' : '#eda100';
    s += `<circle class="db-bolha" style="--d:${i * 12}ms" cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 6}" fill="${p.cor || q}" data-nome="${esc(p.nome || '')}" data-tip="${esc(`<b>${esc(p.nome)}</b><br>${esc(o.xRot)}: ${o.fx ? o.fx(p.x) : fmt(p.x)}<br>${esc(o.yRot)}: ${o.fy ? o.fy(p.y) : fmt(p.y)}${p.extra ? '<br>' + p.extra : ''}`)}"/>`;
  });
  el.innerHTML = s + '</svg>';
}
/* funil horizontal */
function funil(itens) {
  const max = Math.max(...itens.map(i => i.valor || 0), 1);
  return `<div class="db-funil">${itens.map((it, i) => { const ant = i ? itens[i - 1].valor : null; return `<div class="db-f-et" style="--w:${Math.max(6, (it.valor || 0) / max * 100)}%;--c:${it.cor || PAL[i]};--d:${i * 90}ms"><div class="db-f-bar"><b>${fmt(it.valor || 0, 0)}</b><span>${esc(it.rotulo)}</span></div>${ant ? `<em>${fmt((it.valor || 0) / ant * 100, 1)}% da etapa anterior</em>` : '<em>&nbsp;</em>'}</div>`; }).join('')}</div>`;
}
/* barra 100% empilhada com legenda */
function empilhada(segs, o = {}) {
  const tot = segs.reduce((a, s) => a + (s.valor || 0), 0);
  if (!tot) return '<p class="dica">Sem dados.</p>';
  return `<div class="db-emp">${segs.filter(s => s.valor > 0).map((s, i) => `<i style="width:${s.valor / tot * 100}%;background:${s.cor || PAL[i]}" data-tip="${esc(`<b>${esc(s.rotulo)}</b><br>${o.fmt ? o.fmt(s.valor) : fmt(s.valor, 0)} · ${fmt(s.valor / tot * 100, 1)}%`)}">${s.valor / tot > .07 ? fmt(s.valor / tot * 100, 0) + '%' : ''}</i>`).join('')}</div>
    <div class="db-emp-leg">${segs.map((s, i) => `<span><i style="background:${s.cor || PAL[i]}"></i>${esc(s.rotulo)} <b>${o.fmt ? o.fmt(s.valor || 0) : fmt(s.valor || 0, 0)}</b></span>`).join('')}</div>`;
}
/* mini linha */
function spark(vals, cor = '#2a78d6') {
  const v = vals.filter(x => x !== null && isFinite(x)); if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), W = 90, H = 26;
  const pts = vals.map((x, i) => x === null || !isFinite(x) ? null : [i / (vals.length - 1) * W, H - 3 - (mx === mn ? .5 : (x - mn) / (mx - mn)) * (H - 6)]).filter(Boolean);
  return `<svg class="db-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="M${pts.map(p => p.join(',')).join(' L')}" stroke="${cor}"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.6" fill="${cor}"/></svg>`;
}
window.DB = { medidor, anel, delta, agrupadas, linhasCat, matriz, funil, empilhada, spark, corFaixa, PAL, hms };
})();
