// 生命現象のアニメーション：段階（stage）ごとの進み u（0〜1）から SVG を描く
//   各アニメーションは { n: 段階の数, draw(s, u) → SVG の中身（viewBox 0 0 400 300） }
//   段階の名前と説明文は content/bio/anims.json（data/learn.json）にある。段階の数は検査で照合する
export const FILE_VERSION = '0.1.0';

// ---------------------------------------------------------------- 共通
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pt = (x, y) => `${f1(x)} ${f1(y)}`;
const tx = (x, y, s, cls = 'tx', extra = '') => {
  if (/text-anchor="start"/.test(extra)) { cls += ' st'; extra = extra.replace('text-anchor="start"', ''); }
  if (/text-anchor="end"/.test(extra)) { cls += ' en'; extra = extra.replace('text-anchor="end"', ''); }
  return `<text x="${f1(x)}" y="${f1(y)}" class="${cls}" ${extra}>${s}</text>`;
};
const line = (x1, y1, x2, y2, cls) => `<path d="M${pt(x1, y1)}L${pt(x2, y2)}" class="${cls}"/>`;
const arrow = (x1, y1, x2, y2, cls = 'arw') => `<path d="M${pt(x1, y1)}L${pt(x2, y2)}" class="${cls}" marker-end="url(#ah)"/>`;
const DEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ahd"/></marker></defs>';
const C = { red: '#d9574a', blue: '#3f7fd6', red2: '#f0a59b', blue2: '#9cc0ef', green: '#3c9a5c', orange: '#e2903a', purple: '#8a62c4', yellow: '#e6be3a', gray: '#9aa0aa' };

// 細胞膜：くびれ k（0〜1）をつけた楕円。cx を中心に左右へ分かれていく
function cellPath(cx, cy, rx, ry, k = 0, vertical = false) {
  const P = [];
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * Math.PI * 2;
    let x = rx * Math.cos(a), y = ry * Math.sin(a);
    const d = vertical ? y : x, w = vertical ? ry : rx;
    const f = 1 - k * Math.exp(-(d * d) / (2 * (w * 0.16) ** 2));
    if (vertical) x *= f; else y *= f;
    P.push(pt(cx + x, cy + y));
  }
  return `<path d="M${P.join('L')}Z" class="acell"/>`;
}
// 染色体：中心 (x, y)、長さ len、向き ang（度）、染色分体の数 nc（1 or 2）、太さ w。
// segs：染色分体ごとの色の区切り [[{to: 0〜1, c: 色}], …]（乗換えを表す）
function chrom(x, y, len, ang, nc, w, segs, alpha = 1) {
  let out = `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})" opacity="${f1(alpha)}">`;
  const gap = nc === 2 ? w * 0.55 : 0;
  for (let c = 0; c < nc; c++) {
    const ox = nc === 2 ? (c === 0 ? -gap : gap) : 0;
    let from = 0;
    for (const s of segs[c] || segs[0]) {
      const y1 = -len / 2 + len * from, y2 = -len / 2 + len * s.to;
      out += `<rect x="${f1(ox - w / 2)}" y="${f1(y1)}" width="${f1(w)}" height="${f1(Math.max(0.1, y2 - y1))}" rx="${f1(Math.min(w / 2, (y2 - y1) / 2))}" style="fill:${s.c}" class="chr"/>`;
      from = s.to;
    }
  }
  return out + `<circle cx="0" cy="0" r="${f1(w * 0.45 + gap * 0.5)}" class="cen"/></g>`;
}
// 糸状の染色質（間期）
function chromatin(cx, cy, r, color, seed, n = 1, alpha = 1) {
  let out = '';
  for (let k = 0; k < n; k++) {
    let d = '', x = cx + Math.cos(seed) * r * 0.3, y = cy + Math.sin(seed) * r * 0.3;
    d = `M${pt(x, y)}`;
    for (let i = 1; i < 9; i++) {
      const a = seed * 3.1 + i * 1.7 + k * 0.35;
      x = clamp(x + Math.cos(a) * r * 0.32, cx - r * 0.8, cx + r * 0.8);
      y = clamp(y + Math.sin(a * 1.3) * r * 0.32, cy - r * 0.8, cy + r * 0.8);
      d += `Q${pt(x + 6 + k * 2, y - 5)} ${pt(x, y)}`;
    }
    out += `<path d="${d}" class="chromatin" style="stroke:${color}" opacity="${f1(alpha)}"/>`;
  }
  return out;
}
// 段階ごとのグラフ（DNA 量・膜電位など）。vals：段階ごとの [始め, 終わり]（終わりへの変化は段階の後半で）
function stepGraph(x0, y0, w, h, n, s, u, fn, ticks, label) {
  const N = 120;
  const X = (t) => x0 + w * t / n, Y = (v) => y0 + h - h * (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]);
  let d = '';
  for (let i = 0; i <= N; i++) { const t = n * i / N; d += (i ? 'L' : 'M') + pt(X(t), Y(fn(t))); }
  const tc = s + u;
  let out = `<rect x="${x0}" y="${y0 - 4}" width="${w}" height="${h + 8}" class="gbox"/>`;
  out += ticks.map(v => `${line(x0, Y(v), x0 + w, Y(v), 'ggrid')}${tx(x0 - 4, Y(v) + 3.5, v, 'gtk')}`).join('');
  for (let i = 1; i < n; i++) out += line(X(i), y0 - 4, X(i), y0 + h + 4, 'ggrid');
  out += `<path d="${d}" class="gline"/>`;
  out += `<circle cx="${f1(X(tc))}" cy="${f1(Y(fn(tc)))}" r="4" class="gdot"/>${line(X(tc), y0 - 4, X(tc), y0 + h + 4, 'gcur')}`;
  return out + tx(x0 + 2, y0 - 8, label, 'gl', 'text-anchor="start"');
}

// ---------------------------------------------------------------- 1. 体細胞分裂（2n = 4）
const CH4 = [{ len: 46, c: C.red }, { len: 46, c: C.blue }, { len: 28, c: C.red }, { len: 28, c: C.blue }];
const mitosis = {
  n: 7,
  draw(s, u) {
    const dna = (t) => t < 1 ? 2 : t < 2 ? 2 + 2 * ease(t - 1) : t < 5.6 ? 4 : t < 6 ? 4 - 2 * ease((t - 5.6) / 0.4) : 2;
    let o = '';
    const cy = 120;
    const pinch = s === 5 ? ease(u) * 0.97 : s === 6 ? 1 : 0;
    if (s < 6) o += cellPath(200, cy, 175 + (s === 5 ? 10 * u : 0), 98, pinch);
    else { o += cellPath(108, cy, 92, 88) + cellPath(292, cy, 92, 88); }
    // 核膜
    const env = s <= 1 ? 1 : s === 2 ? 1 - u : s === 5 ? u : s === 6 ? 1 : 0;
    const nuc = (x) => `<circle cx="${x}" cy="${cy}" r="${s >= 5 ? 44 : 62}" class="anuc" opacity="${f1(env)}"/>`;
    if (s <= 2) o += nuc(200);
    if (s >= 5) o += nuc(s === 6 ? 108 : 88) + nuc(s === 6 ? 292 : 312);
    // 中心体と紡錘体
    const pole = s >= 2 && s <= 5 ? (s === 2 ? lerp(0, 1, ease(u)) : 1) : 0;
    const PL = [200 - 150 * pole, cy], PR = [200 + 150 * pole, cy];
    if (s >= 2 && s <= 5) {
      o += `<circle cx="${f1(PL[0])}" cy="${cy}" r="5" class="acen"/><circle cx="${f1(PR[0])}" cy="${cy}" r="5" class="acen"/>`;
      for (let k = -3; k <= 3; k++) {
        o += `<path d="M${pt(PL[0], cy)}Q200 ${f1(cy + k * 26 * pole)} ${pt(PR[0], cy)}" class="spin" opacity="${f1(s === 2 ? u : s === 5 ? 1 - u : 1)}"/>`;
      }
    }
    // 染色体
    const meta = [cy - 72, cy - 24, cy + 24, cy + 72];
    const pro = [[170, cy - 30, 30], [226, cy - 10, -40], [182, cy + 28, 70], [228, cy + 34, 10]];
    if (s <= 1) {
      CH4.forEach((ch, i) => { o += chromatin(200, cy, 60, ch.c, i + 1, 1); if (s === 1) o += chromatin(200, cy, 60, ch.c, i + 1.03, 1, ease(u)).replace(/class="chromatin"/, 'class="chromatin" transform="translate(3 3)"'); });
    } else if (s === 2) {
      CH4.forEach((ch, i) => {
        const w = lerp(3, 7, ease(u));
        if (u < 0.35) o += chromatin(200, cy, 60, ch.c, i + 1, 2, 1 - u / 0.35);
        o += chrom(pro[i][0], pro[i][1], ch.len * lerp(1.6, 1, ease(u)), pro[i][2], 2, w, [[{ to: 1, c: ch.c }]], clamp(u * 2.5));
      });
    } else if (s === 3) {
      CH4.forEach((ch, i) => {
        const t = ease(u);
        o += chrom(lerp(pro[i][0], 200, t), lerp(pro[i][1], meta[i], t), ch.len, lerp(pro[i][2], 0, t), 2, 7, [[{ to: 1, c: ch.c }]]);
        if (t > 0.5) o += line(PL[0], cy, 196, meta[i], 'kfib') + line(PR[0], cy, 204, meta[i], 'kfib');
      });
    } else if (s === 4 || s === 5) {
      const d = s === 4 ? ease(u) : 1;
      CH4.forEach((ch, i) => {
        for (const side of [-1, 1]) {
          const x = 200 + side * (4 + 110 * d), y = lerp(meta[i], cy + (meta[i] - cy) * 0.35, d);
          const ang = side * 90 * Math.min(1, d * 1.4) * 0;
          if (s === 5) {
            const t = ease(u);
            o += chrom(lerp(x, side < 0 ? 88 : 312, t), lerp(y, cy, t * 0.6), ch.len * lerp(1, 1.4, t), ang, 1, lerp(5, 2, t), [[{ to: 1, c: ch.c }]], 1 - t * 0.85);
            o += chromatin(side < 0 ? 88 : 312, cy, 42, ch.c, i + 1, 1, t);
          } else {
            o += chrom(x, y, ch.len, 0, 1, 5.5, [[{ to: 1, c: ch.c }]]);
            o += line(side < 0 ? PL[0] : PR[0], cy, x, y, 'kfib');
          }
        }
      });
    } else {
      CH4.forEach((ch, i) => { o += chromatin(108, cy, 42, ch.c, i + 1) + chromatin(292, cy, 42, ch.c, i + 1); });
    }
    o += stepGraph(40, 248, 340, 40, 7, s, u, dna, [0, 2, 4], '細胞1個あたりの DNA 量（相対値）');
    return o;
  },
};

// ---------------------------------------------------------------- 2. 減数分裂（2n = 4、長い染色体で乗換え）
const meiosis = {
  n: 8,
  draw(s, u) {
    const dna = (t) => t < 0.4 ? 2 : t < 1 ? 2 + 2 * ease((t - 0.4) / 0.6) : t < 4.6 ? 4 : t < 5 ? 4 - 2 * ease((t - 4.6) / 0.4) : t < 7.6 ? 2 : 2 - ease((t - 7.6) / 0.4);
    let o = '';
    const cy = 120;
    // 乗換え：長い染色体の内側の染色分体どうしの先端（0.62〜1）を交換
    const cross = s > 1 || (s === 1 && u > 0.75);
    const L = { R: [[{ to: 1, c: C.red }], cross ? [{ to: 0.62, c: C.red }, { to: 1, c: C.blue }] : [{ to: 1, c: C.red }]],
      B: [cross ? [{ to: 0.62, c: C.blue }, { to: 1, c: C.red }] : [{ to: 1, c: C.blue }], [{ to: 1, c: C.blue }]] };
    const Sr = [[{ to: 1, c: C.red }]], Sb = [[{ to: 1, c: C.blue }]];
    if (s <= 3) {
      o += cellPath(200, cy, 175, 98, 0);
      if (s <= 1) o += `<circle cx="200" cy="${cy}" r="66" class="anuc" opacity="${f1(s === 0 ? 1 : 1 - ease(u))}"/>`;
    } else if (s === 4) {
      o += cellPath(200, cy, 180, 98, ease(u) * 0.97);
    } else if (s <= 6) {
      o += cellPath(108, cy, 92, 88) + cellPath(292, cy, 92, 88);
    } else {
      const k = ease(u) * 0.97;
      o += cellPath(108, cy, 92, 92, k, true) + cellPath(292, cy, 92, 92, k, true);
    }
    if (s === 0) {
      [C.red, C.blue, C.red, C.blue].forEach((c, i) => { o += chromatin(200, cy, 62, c, i + 1); if (u > 0.4) o += chromatin(200, cy, 62, c, i + 1.03, 1, ease((u - 0.4) / 0.6)).replace('class="chromatin"', 'class="chromatin" transform="translate(3 3)"'); });
    } else if (s === 1) {
      // 凝縮して相同染色体が対合（二価染色体）
      const t = ease(clamp(u / 0.7));
      o += chrom(lerp(160, 186, t), cy - 20, 48, 0, 2, 6, L.R) + chrom(lerp(240, 200, t), cy - 20, 48, 0, 2, 6, L.B);
      o += chrom(lerp(170, 186, t), cy + 46, 28, 0, 2, 6, Sr) + chrom(lerp(236, 200, t), cy + 46, 28, 0, 2, 6, Sb);
      if (u > 0.7) o += `<circle cx="193" cy="${cy - 14}" r="${f1(9 * Math.sin(Math.PI * clamp((u - 0.7) / 0.3)))}" class="xover"/>`;
    } else if (s === 2 || s === 3) {
      const d = s === 3 ? ease(u) : 0;
      const yR = lerp(cy - 20, cy - 34, s === 2 ? ease(u) : 1), yS = lerp(cy + 46, cy + 34, s === 2 ? ease(u) : 1);
      const xs = (side) => 200 + side * (7 + 120 * d);
      o += `<circle cx="40" cy="${cy}" r="5" class="acen"/><circle cx="360" cy="${cy}" r="5" class="acen"/>`;
      for (let k = -3; k <= 3; k++) o += `<path d="M40 ${cy}Q200 ${cy + k * 26} 360 ${cy}" class="spin"/>`;
      o += chrom(xs(-1), yR, 48, 0, 2, 6, L.R) + chrom(xs(1), yR, 48, 0, 2, 6, L.B);
      o += chrom(xs(-1), yS, 28, 0, 2, 6, Sr) + chrom(xs(1), yS, 28, 0, 2, 6, Sb);
      if (s === 2) o += line(200, cy - 80, 200, cy + 80, 'eq');
    } else if (s === 4) {
      const t = ease(u);
      o += chrom(lerp(73, 108, t), cy - 34, 48, 0, 2, 6, L.R) + chrom(lerp(327, 292, t), cy - 34, 48, 0, 2, 6, L.B);
      o += chrom(lerp(73, 108, t), cy + 34, 28, 0, 2, 6, Sr) + chrom(lerp(327, 292, t), cy + 34, 28, 0, 2, 6, Sb);
    } else {
      // 第二分裂：それぞれの細胞で染色分体が上下に分かれる
      const d = s === 5 ? 0 : s === 6 ? ease(u) : 1;
      for (const [cx, segsL, segsS] of [[108, L.R, Sr], [292, L.B, Sb]]) {
        if (s === 5 || s === 6) {
          o += `<circle cx="${cx}" cy="${cy - 78}" r="4" class="acen"/><circle cx="${cx}" cy="${cy + 78}" r="4" class="acen"/>`;
          for (let k = -2; k <= 2; k++) o += `<path d="M${cx} ${cy - 78}Q${cx + k * 22} ${cy} ${cx} ${cy + 78}" class="spin"/>`;
        }
        const ys = (side) => cy + side * (6 + 52 * d);
        const xl = cx - 26 * (s === 5 ? ease(u) : 1), xs2 = cx + 26 * (s === 5 ? ease(u) : 1);
        if (s === 5) {
          o += chrom(lerp(cx, xl, 1), cy, 48, 90, 2, 6, segsL) + chrom(xs2, cy, 28, 90, 2, 6, segsS);
        } else {
          for (const side of [-1, 1]) {
            const k = side < 0 ? 0 : 1;
            o += chrom(xl, ys(side), 48, 90, 1, 6, [segsL[k]]) + chrom(xs2, ys(side), 28, 90, 1, 6, [segsS[k] || segsS[0]]);
          }
        }
      }
    }
    o += stepGraph(40, 248, 340, 40, 8, s, u, dna, [0, 1, 2, 4], '細胞1個あたりの DNA 量（相対値）');
    return o;
  },
};

// ---------------------------------------------------------------- 3. DNA の複製
const replication = {
  n: 6,
  draw(s, u) {
    let o = '';
    const T = s + u;
    const F = s >= 5 ? 380 : lerp(120, 360, clamp(T / 5));
    const yT = 70, yB = 200, yM1 = 130, yM2 = 142;
    if (s < 5) {
      // ほどけた部分（左）と2本鎖（右）
      o += `<path d="M30 ${yT}L${f1(F - 30)} ${yT}Q${f1(F - 8)} ${yT} ${f1(F)} ${yM1}L392 ${yM1}" class="old"/>`;
      o += `<path d="M30 ${yB}L${f1(F - 30)} ${yB}Q${f1(F - 8)} ${yB} ${f1(F)} ${yM2}L392 ${yM2}" class="old"/>`;
      for (let x = F + 8; x < 390; x += 10) o += line(x, yM1 + 1, x, yM2 - 1, 'hbond');
      o += `<circle cx="${f1(F)}" cy="${(yM1 + yM2) / 2}" r="10" class="heli"/>` + tx(F + 30, (yM1 + yM2) / 2 + 26, 'ヘリカーゼ', 'tx sm');
      o += tx(20, yT + 4, "3′", 'tx sm') + tx(20, yB + 4, "5′", 'tx sm');
      // リーディング鎖（上の鋳型に沿って右へ連続的に）
      if (s >= 1) o += `<rect x="40" y="${yT + 9}" width="18" height="6" class="primer" opacity="${f1(s >= 4 ? 1 - ease(u) : 1)}"/>`;
      if (s >= 2) {
        const end = s === 2 ? lerp(58, F - 22, ease(u)) : F - 22;
        o += `<path d="M58 ${yT + 12}L${f1(end)} ${yT + 12}" class="new"/>` + (s === 4 ? `<path d="M40 ${yT + 12}L58 ${yT + 12}" class="new" opacity="${f1(ease(u))}"/>` : '');
        o += `<circle cx="${f1(end + 6)}" cy="${yT + 12}" r="7" class="pol"/>` + arrow(end + 14, yT + 24, end + 34, yT + 24);
        o += tx(110, yT + 34, 'リーディング鎖（連続的）', 'tx sm');
      }
      // ラギング鎖（下の鋳型。フォーク側から左へ、とびとびに）
      const starts = [170, 240, 310];
      starts.forEach((st, k) => {
        const prev = k === 0 ? 40 : starts[k - 1] + 18;
        const born = (st + 30) / 400 * 5;   // フォークが st をこえたらプライマー
        if (s >= 1 && F > st + 20) {
          const lig = s === 4 ? ease(u) : 0;
          o += `<rect x="${st}" y="${yB - 15}" width="18" height="6" class="primer" opacity="${f1(1 - lig)}"/>`;
          if (lig > 0) o += `<path d="M${st} ${yB - 12}L${st + 18} ${yB - 12}" class="new" opacity="${f1(lig)}"/>`;
          if (s >= 3) {
            const grow = s === 3 ? ease(clamp(u * 1.6 - k * 0.25)) : 1;
            const L = (st - prev) * grow;
            o += `<path d="M${st} ${yB - 12}L${f1(st - L)} ${yB - 12}" class="new"/>`;
            if (s === 3 && grow < 1 && grow > 0) o += `<circle cx="${f1(st - L - 6)}" cy="${yB - 12}" r="7" class="pol"/>`;
            if (s === 4 && k < 3) o += `<circle cx="${prev - 2}" cy="${yB - 12}" r="${f1(5 * Math.sin(Math.PI * u))}" class="liga"/>`;
          }
        }
        void born;
      });
      if (s >= 3) o += tx(110, yB - 24, 'ラギング鎖（岡崎フラグメント）', 'tx sm') + arrow(150, yB + 18, 120, yB + 18);
      if (s === 1) o += tx(200, 260, '短い RNA（プライマー）が合成の起点になる', 'tx');
      if (s === 4) o += tx(200, 260, 'プライマーを DNA に置きかえ、DNA リガーゼで断片をつなぐ', 'tx');
      if (s === 0) o += tx(200, 260, '塩基どうしの水素結合が切れて、2本の鎖がほどける', 'tx');
    } else {
      // 半保存的複製
      const t = ease(u);
      const dy = lerp(0, 18, t);
      o += `<path d="M40 ${f1(80 - dy)}H360" class="old"/><path d="M40 ${f1(96 - dy)}H360" class="new"/>`;
      for (let x = 50; x < 360; x += 12) o += line(x, 82 - dy, x, 94 - dy, 'hbond');
      o += `<path d="M40 ${f1(178 + dy)}H360" class="new"/><path d="M40 ${f1(194 + dy)}H360" class="old"/>`;
      for (let x = 50; x < 360; x += 12) o += line(x, 180 + dy, x, 192 + dy, 'hbond');
      o += `<rect x="60" y="250" width="22" height="6" class="lgold"/>${tx(88, 257, 'もとの鎖', 'tx sm', 'text-anchor="start"')}<rect x="200" y="250" width="22" height="6" class="lgnew"/>${tx(228, 257, '新しく合成された鎖', 'tx sm', 'text-anchor="start"')}`;
    }
    return o;
  },
};

// ---------------------------------------------------------------- 4. 転写と翻訳
const CODONS = [['AUG', 'Met'], ['GCU', 'Ala'], ['UGG', 'Trp'], ['AAA', 'Lys'], ['GGC', 'Gly'], ['UAA', '終止']];
const AA_COL = { Met: C.green, Ala: C.orange, Trp: C.purple, Lys: C.blue, Gly: C.red };
const expression = {
  n: 7,
  draw(s, u) {
    let o = '';
    if (s <= 2) {
      // 核の中：DNA と RNA ポリメラーゼ
      o += `<rect x="12" y="12" width="376" height="236" rx="18" class="anuc2"/>${tx(30, 32, '核', 'tx sm', 'text-anchor="start"')}`;
      const P = s === 0 ? lerp(10, 60, ease(u)) : s === 1 ? lerp(60, 340, ease(u)) : 340;
      const open = s >= 1 && s <= 1;
      o += `<path d="M20 80H380" class="old"/><path d="M20 ${open ? 96 : 92}H380" class="old2"/>`;
      o += `<rect x="40" y="70" width="40" height="34" class="prom"/>${tx(60, 62, 'プロモーター', 'tx sm')}`;
      // 前駆体 mRNA：エキソン（色）とイントロン（灰）
      const exons = [[70, 140], [190, 260], [300, 350]], introns = [[140, 190], [260, 300]];
      if (s >= 1) {
        const end = s === 1 ? P - 10 : 350;
        const clip = (a, b) => [a, Math.min(b, end)];
        if (s === 1) {
          for (const [a, b] of exons) { const [x1, x2] = clip(a, b); if (x2 > x1) o += `<path d="M${x1} 140H${f1(x2)}" class="mrna"/>`; }
          for (const [a, b] of introns) { const [x1, x2] = clip(a, b); if (x2 > x1) o += `<path d="M${x1} 140H${f1(x2)}" class="intron"/>`; }
          o += `<path d="M${f1(end)} 140L${f1(P)} 98" class="mrna thin"/>`;
        } else {
          // スプライシング：イントロンがループになって外れ、エキソンがつながる
          const t = ease(u);
          const shift = [0, -50 * t, -90 * t];
          exons.forEach(([a, b], k) => { o += `<path d="M${f1(a + shift[k] + 40 * t)} ${f1(140 + 30 * t)}H${f1(b + shift[k] + 40 * t)}" class="mrna"/>`; });
          introns.forEach(([a, b], k) => { const mx = (a + b) / 2; o += `<path d="M${a} 140Q${mx} ${f1(140 - 50 * t)} ${b} 140" class="intron" opacity="${f1(1 - t)}"/>`; void k; });
          o += tx(200, 225, 'イントロンが除かれ、エキソンがつながる（スプライシング）', 'tx sm', `opacity="${f1(t)}"`);
        }
      }
      if (s <= 1) o += `<ellipse cx="${f1(P)}" cy="88" rx="26" ry="20" class="rnap"/>${tx(P, 92, 'RNA<tspan x="' + f1(P) + '" dy="11">pol</tspan>', 'tx sm w')}`;
      if (s === 1) o += arrow(P + 30, 118, P + 54, 118);
      return o;
    }
    if (s === 3) {
      // 核膜孔を通って細胞質へ
      o += `<path d="M200 12V108M200 132V248" class="nenv"/>${tx(100, 32, '核', 'tx sm')}${tx(300, 32, '細胞質', 'tx sm')}`;
      const x = lerp(60, 250, ease(u));
      o += `<path d="M${f1(x - 60)} 120H${f1(x + 60)}" class="mrna"/>${tx(x, 108, 'mRNA', 'tx sm')}`;
      return o;
    }
    // 翻訳
    const k0 = 60, W = 48;
    // リボソームの位置（何番目のコドンを読んでいるか）
    let pos = 0, chain = 0;
    if (s === 4) { pos = 0; chain = u > 0.6 ? 1 : 0; }
    else if (s === 5) { const t = u * 4; pos = Math.min(4, Math.floor(t) + (t % 1 > 0.7 ? 1 : 0)); chain = 1 + Math.floor(t); pos = Math.floor(t); }
    else { pos = 5; chain = 5; }
    const frac = s === 5 ? (u * 4) % 1 : 0;
    const rx = k0 + W * (pos + (s === 5 ? ease(clamp((frac - 0.6) / 0.4)) : 0)) + W;
    const off = s === 6 ? ease(u) * 40 : 0;
    o += `<ellipse cx="${f1(rx)}" cy="${f1(178 - off)}" rx="56" ry="24" class="ribo"/><ellipse cx="${f1(rx)}" cy="${f1(214 + off * 0.5)}" rx="50" ry="13" class="ribo"/>`;
    o += `<path d="M30 200H380" class="mrna"/>${tx(26, 216, "5′", 'tx sm')}${tx(384, 216, "3′", 'tx sm')}`;
    CODONS.forEach(([c], i) => { o += tx(k0 + W * i + W / 2, 220, c, 'tx cod'); o += line(k0 + W * i, 196, k0 + W * i, 204, 'ggrid'); });
    o += tx(rx, 154 - off, 'リボソーム', 'tx sm');
    // tRNA とアミノ酸
    const shown = s === 6 ? 5 : Math.min(5, chain);
    if (s !== 6) {
      const ti = s === 4 ? 0 : Math.min(4, pos + 1);
      if (s === 4 || pos < 4) {
        const tin = s === 4 ? ease(u) : ease(clamp(frac / 0.5));
        const [cd, aa] = CODONS[ti];
        const x = k0 + W * ti + W / 2, y = lerp(60, 160, tin);
        o += `<path d="M${f1(x - 14)} ${f1(y + 24)}V${f1(y)}H${f1(x + 14)}V${f1(y + 24)}" class="trna"/>`;
        o += `<circle cx="${f1(x)}" cy="${f1(y - 10)}" r="10" style="fill:${AA_COL[aa]}" class="aa"/>${tx(x, y - 7, aa, 'tx tiny w')}`;
        o += tx(x, y + 38, cd.replace(/./g, (b) => ({ A: 'U', U: 'A', G: 'C', C: 'G' }[b])), 'tx tiny', `opacity="${f1(tin)}"`);
      }
    }
    // ポリペプチド鎖
    for (let i = 0; i < shown; i++) {
      const aa = CODONS[i][1];
      const x = s === 6 ? 120 + i * 30 + 0 * u : rx - 10 - (shown - 1 - i) * 22, y = s === 6 ? lerp(120, 70 + 14 * Math.sin(i), ease(u)) : 120 - (shown - 1 - i) * 8;
      if (i) o += line(x - 22 + (s === 6 ? -8 : 0), s === 6 ? lerp(120, 70 + 14 * Math.sin(i - 1), ease(u)) : y + 8, x, y, 'pep');
      o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="10" style="fill:${AA_COL[aa]}" class="aa"/>${tx(x, y + 3, aa, 'tx tiny w')}`;
    }
    if (s === 6) o += tx(200, 270, '終止コドン UAA には対応する tRNA がない → 翻訳が終わる', 'tx sm');
    return o;
  },
};

// ---------------------------------------------------------------- 5. 活動電位
function vm(t) { // t：0〜5（段階）→ 膜電位 mV
  if (t < 1) return -70;
  if (t < 2) { const x = t - 1; return -70 + 110 * ease(x < 0.25 ? x * 1.2 : (x - 0.25) / 0.75 * 0.7 + 0.3) * 1; }
  if (t < 3) return 40 - 120 * ease(t - 2);
  if (t < 4) return -80 + 2 * Math.sin((t - 3) * 3);
  return -80 + 10 * ease(t - 4);
}
const action = {
  n: 5,
  draw(s, u) {
    let o = '';
    const T = s + u;
    // 膜（上が細胞外、下が細胞内）
    o += `<rect x="20" y="70" width="230" height="34" class="memb"/>${tx(135, 58, '細胞外', 'tx sm')}${tx(135, 128, '細胞内', 'tx sm')}`;
    const naOpen = s === 1, kOpen = s === 2 || s === 3;
    // Na⁺ チャネル・K⁺ チャネル・ナトリウムポンプ
    const ch = (x, open, label) => `<rect x="${x - 14}" y="66" width="10" height="42" class="chan"/><rect x="${x + (open ? 6 : 0)}" y="66" width="10" height="42" class="chan"/>${tx(x + 1, 150 + (label === 'K⁺' ? 0 : 0), label + 'チャネル', 'tx tiny')}`;
    o += ch(70, naOpen, 'Na⁺') + ch(150, kOpen, 'K⁺');
    o += `<rect x="208" y="66" width="28" height="42" rx="8" class="pump"/>${tx(222, 150, 'ポンプ', 'tx tiny')}`;
    // イオン
    const ion = (x, y, cls, t) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="5" class="${cls}"/>${t ? '' : ''}`;
    for (let i = 0; i < 5; i++) o += ion(30 + i * 9, 40 + (i % 2) * 8, 'na') + ion(40 + i * 8, 120 + (i % 2) * 7, 'kk');
    if (naOpen) for (let i = 0; i < 3; i++) { const y = lerp(40, 125, clamp(u * 1.5 - i * 0.2)); o += ion(76, y, 'na'); }
    if (kOpen) for (let i = 0; i < 3; i++) { const y = lerp(125, 40, clamp((s === 2 ? u : 1) * 1.5 - i * 0.2)); o += ion(158, y, 'kk'); }
    if (s === 4) { o += ion(214, lerp(120, 40, ease(u)), 'na') + ion(230, lerp(40, 120, ease(u)), 'kk'); }
    o += `<circle cx="30" cy="196" r="5" class="na"/>${tx(40, 200, 'Na⁺', 'tx sm', 'text-anchor="start"')}<circle cx="100" cy="196" r="5" class="kk"/>${tx(110, 200, 'K⁺', 'tx sm', 'text-anchor="start"')}`;
    // 電荷の分布（膜の内側）
    const inside = vm(T) > 0 ? '+' : '−';
    for (let i = 0; i < 6; i++) o += tx(32 + i * 40, 98, inside, 'tx chg') + tx(32 + i * 40, 82, inside === '+' ? '−' : '+', 'tx chg');
    // 膜電位のグラフ
    const gx = 270, gy = 30, gw = 116, gh = 200;
    const Y = (v) => gy + gh - gh * (v + 100) / 150;
    let d = '';
    for (let i = 0; i <= 100; i++) { const t = 5 * i / 100; d += (i ? 'L' : 'M') + pt(gx + gw * t / 5, Y(vm(t))); }
    o += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" class="gbox"/>`;
    for (const v of [40, 0, -70]) o += line(gx, Y(v), gx + gw, Y(v), 'ggrid') + tx(gx - 4, Y(v) + 3, v, 'gtk');
    o += `<path d="${d}" class="gline"/><circle cx="${f1(gx + gw * T / 5)}" cy="${f1(Y(vm(T)))}" r="4" class="gdot"/>`;
    o += tx(gx + gw / 2, gy + gh + 16, '時間 →（約 2 ms）', 'tx tiny') + tx(gx + gw / 2, gy - 8, '膜電位 [mV]', 'tx tiny');
    o += tx(330, 270, `${Math.round(vm(T))} mV`, 'tx big');
    return o;
  },
};

// ---------------------------------------------------------------- 6. シナプスでの伝達
const synapse = {
  n: 5,
  draw(s, u) {
    let o = '';
    o += `<path d="M90 20Q90 130 200 130Q310 130 310 20" class="term"/>${tx(200, 30, '神経終末（シナプス前細胞）', 'tx sm')}`;
    o += `<path d="M40 180H360" class="post"/><rect x="40" y="180" width="320" height="80" class="postc"/>${tx(200, 250, 'シナプス後細胞', 'tx sm')}`;
    // 受容体（イオンチャネル）
    const open = s === 3 || (s === 4 && u < 0.4);
    for (const x of [150, 200, 250]) o += `<rect x="${x - 12}" y="172" width="8" height="18" class="rec"/><rect x="${x + (open ? 8 : 4)}" y="172" width="8" height="18" class="rec"/>`;
    // 活動電位が届く
    if (s === 0) o += `<path d="M200 0V${f1(lerp(0, 60, ease(u)))}" class="ap"/>` + tx(208, 14, '活動電位', 'tx sm', `text-anchor="start" opacity="${f1(u)}"`);
    // Ca²⁺
    if (s >= 1) for (let i = 0; i < 4; i++) { const y = s === 1 ? lerp(160, 105, ease(clamp(u * 1.3 - i * 0.1))) : 105; o += `<circle cx="${120 + i * 50}" cy="${f1(y)}" r="4" class="ca" opacity="${s >= 3 ? 0.4 : 1}"/>`; }
    if (s >= 1) o += tx(330, 150, 'Ca²⁺', 'tx sm');
    // シナプス小胞
    const ves = [[160, 80], [200, 92], [240, 80], [180, 60], [222, 58]];
    ves.forEach(([x, y], k) => {
      if (k > 2) { o += `<circle cx="${x}" cy="${y}" r="11" class="ves"/>`; return; }
      const fuse = s === 2 ? ease(u) : s > 2 ? 1 : 0;
      const yy = lerp(y, 118, fuse);
      if (fuse < 1) o += `<circle cx="${x}" cy="${f1(yy)}" r="11" class="ves"/>`;
    });
    // 神経伝達物質
    if (s >= 2) {
      const t = s === 2 ? ease(u) : 1;
      for (let i = 0; i < 12; i++) {
        const x0 = 160 + (i % 3) * 40, xx = lerp(x0, 150 + (i % 3) * 50 + ((i * 7) % 9) - 4, t);
        let y = lerp(125, 150 + (i % 4) * 7, t);
        if (s >= 3) y = lerp(y, 168, s === 3 ? ease(u) : 1);
        const gone = s === 4 ? ease(u) : 0;
        o += `<circle cx="${f1(xx)}" cy="${f1(y)}" r="3" class="nt" opacity="${f1(1 - gone)}"/>`;
      }
      if (s < 4) o += tx(50, 150, '神経伝達物質', 'tx sm', 'text-anchor="start"');
    }
    if (s === 3) for (const x of [150, 200, 250]) o += arrow(x + 2, 160, x + 2, lerp(170, 215, ease(u)), 'arw na2');
    if (s === 3) o += tx(300, 214, 'Na⁺ が流入（脱分極）', 'tx sm');
    if (s === 4) o += tx(200, 150, '分解・回収されて伝達が終わる', 'tx sm');
    return o;
  },
};

// ---------------------------------------------------------------- 7. 筋収縮
const muscle = {
  n: 5,
  draw(s, u) {
    let o = '';
    const k = s === 3 ? ease(u) : s === 4 ? 1 - ease(u) : 0;
    const ZL = 40 + 36 * k, ZR = 360 - 36 * k;
    const ca = s === 1 ? ease(u) : s === 2 || s === 3 ? 1 : s === 4 ? 1 - ease(u) : 0;
    o += `<rect x="18" y="90" width="364" height="112" class="fmusc"/>`;
    for (const y of [104, 124, 144, 164, 184]) {
      o += `<path d="M${f1(ZL)} ${y}H${f1(ZL + 130)}" class="actin"/><path d="M${f1(ZR)} ${y}H${f1(ZR - 130)}" class="actin"/>`;
      o += `<circle cx="${f1(ZL + 40)}" cy="${y}" r="3" class="tropo" opacity="${f1(1 - ca * 0.6)}"/><circle cx="${f1(ZR - 40)}" cy="${y}" r="3" class="tropo" opacity="${f1(1 - ca * 0.6)}"/>`;
    }
    const swing = s === 3 ? Math.sin(u * Math.PI * 6) : 0;
    for (const y of [114, 134, 154, 174]) {
      o += `<path d="M130 ${y}H270" class="myosin"/>`;
      for (let x = 140; x <= 260; x += 12) {
        if (x > 192 && x < 208) continue;
        const d = x < 200 ? -1 : 1;
        const bind = s >= 2 && s <= 3 ? 1 : 0;
        const tilt = bind ? 7 + 3 * swing * d : 4;
        o += `<path d="M${x} ${y - 4}l${f1(tilt * d)} ${-6 - bind * 1}" class="head"/><path d="M${x} ${y + 4}l${f1(tilt * d)} ${6 + bind * 1}" class="head"/>`;
      }
    }
    o += `<path d="M${f1(ZL)} 90V202M${f1(ZR)} 90V202" class="zline"/>`;
    // Ca²⁺
    for (let i = 0; i < 6; i++) o += `<circle cx="${60 + i * 56}" cy="${f1(lerp(60, 96, ca) + (i % 2) * 4)}" r="4" class="ca" opacity="${f1(0.15 + ca * 0.85)}"/>`;
    o += tx(370, 62, 'Ca²⁺', 'tx sm');
    // 帯の長さ
    const brk = (a, b, y, lab) => `<path d="M${f1(a)} ${y}H${f1(b)}M${f1(a)} ${y - 5}v10M${f1(b)} ${y - 5}v10" class="brk"/>${tx((a + b) / 2, y + 16, lab, 'tx tiny')}`;
    o += brk(ZL, ZR, 222, `サルコメア ${Math.round((ZR - ZL) / 320 * 2.5 * 100) / 100} µm`);
    o += brk(130, 270, 250, '暗帯（変わらない）');
    o += brk(ZL + 130, ZR - 130, 278, 'H帯');
    o += brk(ZL, 130, 278, '明帯') + brk(270, ZR, 278, '明帯');
    o += `<rect x="40" y="12" width="10" height="10" class="lgact"/>${tx(56, 21, 'アクチン', 'tx tiny', 'text-anchor="start"')}<rect x="120" y="12" width="10" height="10" class="lgmyo"/>${tx(136, 21, 'ミオシン', 'tx tiny', 'text-anchor="start"')}<circle cx="215" cy="17" r="4" class="tropo"/>${tx(224, 21, 'トロポニン・トロポミオシン', 'tx tiny', 'text-anchor="start"')}`;
    return o;
  },
};

// ---------------------------------------------------------------- 8. 電子伝達系と ATP 合成（ミトコンドリア）・9. 光合成（チラコイド）
function hplus(n, y0, h, seed) {
  let o = '';
  for (let i = 0; i < n; i++) { const x = 30 + ((i * 53 + seed * 17) % 340), y = y0 + ((i * 29 + seed * 7) % h); o += `<text x="${x}" y="${y}" class="hp">H⁺</text>`; }
  return o;
}
const etc = {
  n: 5,
  draw(s, u) {
    let o = '';
    o += `<rect x="10" y="118" width="380" height="44" class="memb"/>${tx(20, 30, '膜間腔', 'tx sm', 'text-anchor="start"')}${tx(20, 280, 'マトリックス', 'tx sm', 'text-anchor="start"')}${tx(386, 146, '内膜', 'tx tiny', 'text-anchor="end"')}`;
    const cx = [70, 150, 230];
    cx.forEach((x, i) => { o += `<rect x="${x - 22}" y="108" width="44" height="64" rx="10" class="cplx"/>`; void i; });
    o += `<path d="M310 108h28v20h-6v34h18v26h-42v-26h18v-34h-16z" class="atps"/>${tx(324, 104, 'ATP 合成酵素', 'tx tiny')}`;
    const H = s === 0 ? 3 : s === 1 ? 3 + Math.round(9 * u) : 12;
    o += hplus(H, 46, 50, 1) + hplus(s === 0 ? 8 : Math.max(2, 8 - Math.round(H / 2)), 196, 50, 3);
    if (s === 0) { o += tx(70, 230, 'NADH → NAD⁺', 'tx sm') + arrow(70, 214, 70, 176) + tx(70, 250, '（クエン酸回路・解糖系から）', 'tx tiny'); }
    if (s >= 1 && s <= 4) {
      const t = s === 1 ? ease(u) : 1;
      const ex = lerp(70, 230, t);
      o += `<circle cx="${f1(ex)}" cy="140" r="6" class="eon"/>${tx(ex, 128, 'e⁻', 'tx tiny')}`;
      for (const x of cx) if (ex >= x - 2) o += arrow(x, 112, x, 80, 'arw hp2');
    }
    if (s === 2) o += tx(200, 26, '膜間腔の H⁺ 濃度が高くなる（濃度勾配）', 'tx sm');
    if (s === 3) {
      for (let i = 0; i < 3; i++) { const y = lerp(80, 210, clamp(u * 1.5 - i * 0.25)); o += `<text x="321" y="${f1(y)}" class="hp">H⁺</text>`; }
      o += tx(320, 252, 'ADP + Pi → ATP', 'tx sm');
      o += `<circle cx="324" cy="200" r="${f1(6 + 4 * Math.sin(u * 20))}" class="rot"/>`;
    }
    if (s === 4) o += tx(230, 226, '½O₂ + 2H⁺ + 2e⁻ → H₂O', 'tx sm') + arrow(230, 176, 230, 210);
    return o;
  },
};
const photo = {
  n: 5,
  draw(s, u) {
    let o = '';
    if (s <= 3) {
      o += `<rect x="10" y="118" width="380" height="44" class="memb g"/>${tx(20, 30, 'チラコイドの内側', 'tx sm', 'text-anchor="start"')}${tx(20, 262, 'ストロマ', 'tx sm', 'text-anchor="start"')}`;
      o += `<rect x="50" y="104" width="60" height="72" rx="12" class="ps"/>${tx(80, 144, 'II', 'tx w')}`;
      o += `<rect x="140" y="110" width="36" height="60" rx="8" class="cplx"/>`;
      o += `<rect x="210" y="104" width="60" height="72" rx="12" class="ps"/>${tx(240, 144, 'I', 'tx w')}`;
      o += `<path d="M310 108h28v20h-6v34h18v26h-42v-26h18v-34h-16z" class="atps"/>${tx(324, 100, 'ATP 合成酵素', 'tx tiny')}`;
      const light = (x) => `<path d="M${x - 30} 10L${x - 8} 30L${x - 18} 34L${x} 60" class="light"/>`;
      if (s <= 1) o += light(80) + (s === 1 ? light(240) : '');
      if (s === 0) { o += tx(80, 82, '2H₂O → O₂ + 4H⁺ + 4e⁻', 'tx sm') + `<text x="60" y="${f1(lerp(100, 40, ease(u)))}" class="hp">O₂</text>`; }
      if (s >= 1) { const ex = s === 1 ? lerp(80, 240, ease(u)) : 240; o += `<circle cx="${f1(ex)}" cy="140" r="6" class="eon"/>${tx(ex, 128, 'e⁻', 'tx tiny')}`; }
      if (s >= 1) o += tx(240, 230, 'NADP⁺ → NADPH', 'tx sm') + arrow(240, 178, 240, 214);
      o += hplus(s === 0 ? 4 : s === 1 ? 4 + Math.round(6 * u) : 10, 46, 50, 2);
      if (s === 2 || s === 3) {
        for (let i = 0; i < 3; i++) { const y = lerp(80, 210, clamp(u * 1.5 - i * 0.25)); o += `<text x="321" y="${f1(y)}" class="hp">H⁺</text>`; }
        o += tx(320, 252, 'ADP + Pi → ATP', 'tx sm');
      }
      if (s === 3) o += tx(200, 290, 'ATP と NADPH はストロマのカルビン回路で使われる', 'tx sm');
      return o;
    }
    // カルビン回路
    const R = 82, cxx = 200, cyy = 150;
    o += `<circle cx="${cxx}" cy="${cyy}" r="${R}" class="cyc"/>`;
    const node = (a, lab) => { const x = cxx + R * Math.cos(a), y = cyy + R * Math.sin(a); return `<rect x="${f1(x - 34)}" y="${f1(y - 13)}" width="68" height="26" rx="13" class="cnode"/>${tx(x, y + 4, lab, 'tx sm')}`; };
    o += node(-Math.PI / 2, 'RuBP (C5)') + node(Math.PI / 6, 'PGA (C3)') + node(Math.PI * 5 / 6, 'GAP (C3)');
    o += tx(340, 40, 'CO₂', 'tx') + arrow(326, 46, 262, 86);
    o += tx(330, 230, 'ATP・NADPH', 'tx sm') + arrow(300, 226, 258, 210);
    o += tx(70, 250, '有機物（グルコースなど）', 'tx sm') + arrow(120, 186, 90, 230);
    const a = -Math.PI / 2 + ease(u) * Math.PI * 2;
    o += `<circle cx="${f1(cxx + R * Math.cos(a))}" cy="${f1(cyy + R * Math.sin(a))}" r="7" class="gdot"/>`;
    o += tx(200, 154, 'カルビン回路', 'tx');
    o += tx(200, 172, 'ルビスコが CO₂ を固定', 'tx tiny');
    return o;
  },
};

// ---------------------------------------------------------------- 10. 免疫（体液性免疫・細胞性免疫）
const cell = (x, y, r, cls, lab) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" class="${cls}"/>${lab ? tx(x, y + 4, lab, 'tx tiny') : ''}`;
const antibody = (x, y, a = 0) => `<path d="M${f1(x)} ${f1(y + 8)}V${f1(y)}L${f1(x - 6)} ${f1(y - 7)}M${f1(x)} ${f1(y)}L${f1(x + 6)} ${f1(y - 7)}" class="ab" transform="rotate(${a} ${f1(x)} ${f1(y)})"/>`;
const antigen = (x, y) => `<path d="M${f1(x - 7)} ${f1(y)}L${f1(x)} ${f1(y - 7)}L${f1(x + 7)} ${f1(y)}L${f1(x)} ${f1(y + 7)}Z" class="ag"/>`;
const immune = {
  n: 6,
  draw(s, u) {
    let o = '';
    const t = ease(u);
    if (s === 0) {
      for (let i = 0; i < 5; i++) o += antigen(lerp(20, 150 + i * 20, t), 60 + i * 30);
      o += cell(260, 150, 34, 'dc', '樹状細胞');
      if (u > 0.6) o += antigen(258, 150);
      o += tx(200, 270, '抗原が侵入し、樹状細胞が食作用で取り込む', 'tx sm');
    } else if (s === 1) {
      o += cell(lerp(260, 140, t), 150, 34, 'dc', '樹状細胞') + antigen(lerp(290, 170, t), 130);
      o += cell(270, 150, 24, 'th', 'ヘルパーT');
      if (u > 0.6) o += line(174, 140, 246, 146, 'bindl');
      o += tx(200, 270, 'リンパ節で抗原を提示（MHC 分子にのせて）', 'tx sm');
    } else if (s === 2) {
      for (let i = 0; i < 1 + Math.round(3 * t); i++) o += cell(100 + i * 40, 90, 20, 'th', 'T');
      o += cell(110, 200, 22, 'bc', 'B') + antigen(110, 172);
      o += cell(280, 200, 22, 'kt', 'キラーT');
      if (u > 0.5) o += arrow(140, 110, 116, 170, 'arw hp2') + arrow(200, 110, 262, 180, 'arw hp2');
      o += tx(200, 270, 'ヘルパー T 細胞が増殖し、B 細胞・キラー T 細胞を活性化', 'tx sm');
    } else if (s === 3) {
      o += cell(90, 150, 32, 'pc', '形質細胞');
      for (let i = 0; i < 8; i++) { const x = lerp(120, 180 + (i % 4) * 46, t), y = lerp(150, 80 + Math.floor(i / 4) * 120 + (i % 2) * 14, t); o += antibody(x, y, i * 20); }
      for (let i = 0; i < 4; i++) o += antigen(200 + i * 46, 60 + (i % 2) * 140);
      o += tx(200, 270, '形質細胞が抗体をつくり、抗体が抗原と結合する', 'tx sm');
    } else if (s === 4) {
      o += cell(180, 140, 40, 'mp', 'マクロファージ');
      for (let i = 0; i < 4; i++) { const a = i * 1.57, r = lerp(110, 10, t); o += antigen(180 + r * Math.cos(a), 140 + r * Math.sin(a)) + antibody(180 + (r + 10) * Math.cos(a), 140 + (r + 10) * Math.sin(a), i * 90 + 90); }
      o += cell(320, 140, 26, 'kt', 'キラーT') + cell(370, 210, 18, 'inf', '') + tx(370, 240, '感染細胞', 'tx tiny');
      o += tx(200, 270, 'マクロファージが抗原抗体複合体を食べ、キラー T 細胞が感染細胞を破壊', 'tx sm');
    } else {
      o += cell(120, 130, 24, 'bc mem', '記憶B') + cell(200, 130, 24, 'th mem', '記憶T');
      // 一次応答と二次応答のグラフ
      const gx = 40, gy = 180, gw = 320, gh = 70;
      let d = '';
      for (let i = 0; i <= 80; i++) { const x = i / 80; const v = Math.exp(-((x - 0.2) ** 2) / 0.006) * 0.25 + (x > 0.55 ? Math.exp(-((x - 0.7) ** 2) / 0.01) * 1 : 0); d += (i ? 'L' : 'M') + pt(gx + gw * x, gy + gh - gh * v); }
      o += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" class="gbox"/><path d="${d}" class="gline" stroke-dasharray="${f1(800 * t)} 800"/>`;
      o += tx(gx + gw * 0.1, gy + gh + 14, '1回目の侵入', 'tx tiny') + tx(gx + gw * 0.58, gy + gh + 14, '2回目', 'tx tiny') + tx(gx + gw * 0.8, gy + 12, '二次応答（速く強い）', 'tx tiny');
      o += tx(300, 120, '記憶細胞が残る', 'tx sm');
    }
    return o;
  },
};

// ---------------------------------------------------------------- 11. 動物の発生（カエル）
const develop = {
  n: 7,
  draw(s, u) {
    let o = '';
    const t = ease(u);
    const cx = 200, cy = 140, R = 100;
    const grey = (y1) => `<path d="M${cx - R} ${cy}A${R} ${R} 0 0 0 ${cx + R} ${cy}" class="veg" opacity="${f1(y1)}"/>`;
    if (s === 0) {
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" class="egg"/>` + grey(1);
      o += `<path d="M${cx + 70} ${cy - 30}Q${cx + 96} ${cy} ${cx + 70} ${cy + 30}" class="gc" opacity="${f1(t)}"/>` + tx(cx + 140, cy + 4, '灰色三日月環', 'tx sm', `opacity="${f1(t)}"`);
      o += tx(cx, cy - R - 10, '動物極', 'tx tiny') + tx(cx, cy + R + 18, '植物極（卵黄が多い）', 'tx tiny');
      o += `<circle cx="${cx - 60}" cy="${cy - 50}" r="4" class="sperm" opacity="${f1(1 - t)}"/>`;
      return o;
    }
    if (s <= 3) {
      // 2・4・8細胞期（第3卵割は動物極側に偏る＝不等割）
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" class="egg"/>` + grey(1);
      if (s >= 1) o += line(cx, cy - R, cx, cy + R, 'cleave' + (s === 1 ? '' : ''));
      if (s === 1) o += `<path d="M${cx} ${cy - R}V${cy + R}" class="cleave" stroke-dasharray="${f1(200 * t)} 400"/>`;
      if (s >= 2) o += `<ellipse cx="${cx}" cy="${cy}" rx="${f1(s === 2 ? 30 * t : 30)}" ry="${R}" class="cleave"/>`;
      if (s >= 3) o += `<path d="M${cx - 96} ${cy - 30}Q${cx} ${cy - 40} ${cx + 96} ${cy - 30}" class="cleave" stroke-dasharray="${f1(220 * t)} 400"/>`;
      o += tx(cx, cy + R + 22, ['', '2細胞期（経割）', '4細胞期（経割）', '8細胞期（緯割・動物極側に偏る）'][s], 'tx sm');
      return o;
    }
    if (s === 4) {
      // 桑実胚 → 胞胚（断面）
      const n = 18;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2, rr = R - 14;
        const r2 = i % 2 ? rr - 18 : rr - 2;
        const x = cx + r2 * Math.cos(a) * 0.95, y = cy + r2 * Math.sin(a);
        o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(lerp(18, 13, t))}" class="${Math.sin(a) > 0.2 ? 'blv' : 'bla'}"/>`;
      }
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" class="egg out"/>`;
      o += `<ellipse cx="${cx}" cy="${cy - 20}" rx="${f1(lerp(10, 54, t))}" ry="${f1(lerp(8, 40, t))}" class="cav"/>` + tx(cx, cy - 16, '胞胚腔', 'tx sm', `opacity="${f1(t)}"`);
      o += tx(cx, cy + R + 22, '桑実胚 → 胞胚', 'tx sm');
      void n;
      return o;
    }
    if (s === 5) {
      // 原腸胚：原口（右下）から陥入して原腸ができ、外胚葉が全体を包み、中胚葉が背側（右）に沿って広がる
      const arc = (r, a0, a1) => { let d = ''; for (let i = 0; i <= 40; i++) { const a = (a0 + (a1 - a0) * i / 40) * Math.PI / 180; d += (i ? 'L' : 'M') + pt(cx + r * Math.cos(a), cy + r * Math.sin(a)); } return d; };
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" class="endo"/>`;
      o += `<ellipse cx="${f1(cx - 25)}" cy="${f1(cy - 35)}" rx="${f1(lerp(58, 22, t))}" ry="${f1(lerp(40, 15, t))}" class="cav"/>`;
      o += `<path d="${arc(R - 22, lerp(40, -110, t), 40)}" class="meso" style="stroke-width:12" opacity="${f1(clamp(t * 3))}"/>`;
      o += `<path d="${arc(R - 8, lerp(180, 62, t), lerp(360, 388, t))}" class="ectoa" style="stroke-width:16"/>`;
      const bp = [cx + R * Math.cos(Math.PI / 4), cy + R * Math.sin(Math.PI / 4)];
      o += `<path d="M${pt(bp[0], bp[1])}Q${cx + 10} ${cy + 26} ${cx - 50} ${cy - 2}" class="arch" style="stroke-width:18" stroke-dasharray="${f1(200 * t)} 400"/>`;
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" class="egg out"/>`;
      o += tx(cx + 92, cy + 96, '原口', 'tx sm');
      if (t > 0.5) o += tx(cx - 18, cy + 8, '原腸', 'tx tiny') + tx(cx - 25, cy - 31, '胞胚腔', 'tx tiny');
      o += tx(cx, cy + R + 22, '原腸胚（外胚葉・中胚葉・内胚葉）', 'tx sm');
      return o;
    }
    // 神経胚（横断面）：神経板が巻き込まれて神経管に
    o += `<ellipse cx="${cx}" cy="${cy}" rx="${R + 10}" ry="${R - 10}" class="ecto"/>`;
    const fold = t;
    o += `<path d="M${cx - 50} ${cy - R + 12}Q${cx} ${f1(cy - R + 12 + 46 * fold)} ${cx + 50} ${cy - R + 12}" class="nplate"/>`;
    o += `<circle cx="${cx}" cy="${f1(cy - R + 34)}" r="${f1(14 * fold)}" class="ntube"/>`;
    o += `<circle cx="${cx}" cy="${cy - 36}" r="10" class="noto"/>${tx(cx + 34, cy - 32, '脊索', 'tx tiny')}`;
    o += `<rect x="${cx - 64}" y="${cy - 52}" width="34" height="30" rx="8" class="somite"/><rect x="${cx + 30}" y="${cy - 52}" width="34" height="30" rx="8" class="somite"/>${tx(cx - 98, cy - 34, '体節', 'tx tiny')}`;
    o += `<ellipse cx="${cx}" cy="${cy + 30}" rx="40" ry="20" class="gut"/>${tx(cx, cy + 34, '腸管', 'tx tiny')}`;
    o += tx(cx + 70, cy - R + 8, fold > 0.6 ? '神経管' : '神経板', 'tx tiny');
    o += tx(cx, cy + R + 14, '神経胚（からだの軸ができる）', 'tx sm');
    return o;
  },
};

export const ANIMS = { mitosis, meiosis, replication, expression, action, synapse, muscle, etc, photo, immune, develop };
export const VIEWBOX = '0 0 400 300';
export function frame(id, s, u) {
  const A = ANIMS[id];
  if (!A) return '';
  return DEFS + A.draw(clamp(s, 0, A.n - 1), clamp(u));
}
