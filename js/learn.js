// 学ぶ：CELESTIA のシミュレーションの代わりの5つの機能
//   #learn                    トップ
//   #learn=labels[/図ID]       図へのラベル付け（見る・名前を答える・位置を答える）
//   #learn=cards[/単元ID]      用語・概念カード（間隔反復で復習）。タブの「カード」もここ
//   #learn=anim[/ID]          生命現象のアニメーション（段階ごとに再生・並べかえ）
//   #learn=causal[/ID]        因果関係（たどる・増減を予測する）
//   #learn=tree[/ID]          系統・分類・進化（系統樹・地質時代・集団遺伝・分類の階級）
// データは data/learn.json（tools/build_data.py が content/bio/ から作る）
import { sanitizeSVG } from './problem/figures.js';
import { frame, ANIMS, VIEWBOX } from './anim.js';

export const FILE_VERSION = '0.1.0';

let L = null, C = null;   // 学ぶのデータ、アプリから渡される道具
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const e = (s) => C.esc(s ?? '');
const br = (s) => e(s).replace(/\n/g, '<br>');
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const PAGES = [
  { id: 'labels', name: '図へのラベル付け', desc: '細胞・心臓・眼・ネフロン…。各部の名前を答え、どこにあるかを指す', icon: 'pin' },
  { id: 'cards', name: '用語・概念カード', desc: 'めくって思い出す単語帳。忘れかけた頃にもう一度出す', icon: 'card' },
  { id: 'anim', name: '生命現象のアニメーション', desc: '分裂・複製・翻訳・活動電位・筋収縮…を段階ごとに再生', icon: 'play' },
  { id: 'causal', name: '因果関係の学習', desc: 'ホルモン・フィードバック・生態系。何が増え、何が減るかを予測', icon: 'flow' },
  { id: 'tree', name: '系統・分類・進化', desc: '系統樹で形質の獲得をたどる。地質時代・集団遺伝・分類の階級', icon: 'tree' },
  { id: 'laws', name: '法則・原理', desc: 'メンデルの法則・ハーディ・ワインベルグの法則など（導出つき）', icon: 'law', href: '#concepts' },
];
const ICONS = {
  pin: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>',
  card: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/><path d="M6 11h8M6 14h5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  flow: '<rect x="3" y="4" width="7" height="5" rx="1.5"/><rect x="14" y="4" width="7" height="5" rx="1.5"/><rect x="8.5" y="15" width="7" height="5" rx="1.5"/><path d="M6.5 9v2.5h11V9M12 11.5V15"/>',
  tree: '<path d="M4 20h16M7 20V12M7 12h5M12 12V6M12 6h7M12 12h7M17 6v0M19 6h1M19 12h1"/><circle cx="20" cy="6" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="7" cy="20" r="0.5"/>',
  law: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

// 画面を移るときに止めるもの（アニメーションの再生など）
let stoppers = [];
const onStop = (fn) => stoppers.push(fn);

export function renderLearn(view, data, arg, ctx) {
  L = data; C = ctx;
  stoppers = [];
  const [page, ...rest] = String(arg || '').split('/');
  const key = rest.join('/') || null;
  const fn = { labels: labelsPage, cards: cardsPage, anim: animPage, causal: causalPage, tree: treePage }[page];
  if (!fn) topPage(view); else { C.prefs.page = page; C.save(); fn(view, key); }
  return { destroy() { stoppers.forEach(f => { try { f(); } catch { /* 無視 */ } }); stoppers = []; } };
}

// ---------------------------------------------------------------- 共通
function head(title, kicker, sub, back = '#learn', backLabel = '学ぶ') {
  return `<a class="back" href="${back}">‹ ${e(backLabel)}</a><div class="kicker">${e(kicker)}</div><h1>${e(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}`;
}
function tabs(id, items, cur) {
  return `<div class="segment zk-tabs n${items.length}" id="${id}">${items.map(([k, label]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${e(label)}</button>`).join('')}</div>`;
}
function bindTabs(id, fn) {
  $$(`#${id} button`).forEach(b => b.addEventListener('click', () => { $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.t); }));
}
function probButton(page, key, label) {
  const ps = C.problemsFor(page, key);
  if (!ps.length) return '';
  return `<button class="btn primary block zk-prob" data-ids="${ps.map(p => p.id).join(',')}">${e(label || 'この内容の問題を解く')}（${ps.length}問）</button>`;
}
function bindProb(root) { $$('.zk-prob', root).forEach(b => b.addEventListener('click', () => C.openIds(b.dataset.ids.split(',')))); }
const unitName = (k) => (C.FIELDS.find(f => f.key === k) || {}).name || '';
const subjOf = (k) => (C.FIELDS.find(f => f.key === k) || {}).subject || '';
// 学ぶの記録（最高得点など）：state.lrec['labels/heart'] = { best: 0〜1, n: 回数, t }
function record(key, score) {
  const r = C.state().lrec || (C.state().lrec = {});
  const o = r[key] || { best: 0, n: 0 };
  r[key] = { best: Math.max(o.best, score), n: o.n + 1, t: Date.now() };
  C.save();
  return score > o.best;
}
const best = (key) => ((C.state().lrec || {})[key] || null);
const badge = (key) => { const b = best(key); return b ? `<span class="chip ${b.best >= 1 ? 'st-good' : 'plain'}">最高 ${Math.round(b.best * 100)}%</span>` : ''; };
function scoreHTML(ok, n, isBest) {
  const pct = Math.round(ok / n * 100);
  return `<div class="result ${pct >= 80 ? 'ok' : 'ng'} fade-in"><span class="mark">${pct >= 80 ? '◎' : '△'}</span><div>${ok} / ${n}（${pct}%）${isBest ? '<small>自己ベスト！</small>' : ''}</div></div>`;
}

// ---------------------------------------------------------------- トップ
function topPage(view) {
  const due = dueCards().length;
  const count = { labels: `${L.diagrams.length}枚の図`, cards: `${L.terms.length}語${due ? `・復習 ${due}枚` : ''}`, anim: `${L.anims.length}本`, causal: `${L.causal.length}のしくみ`, tree: `${L.tree.trees.length}つの系統樹ほか`, laws: '' };
  view.innerHTML = `<div class="fade-in">
    <div class="kicker">FLORA · 学ぶ</div>
    <h1>学ぶ</h1>
    <p class="sub">図・カード・アニメーション・因果のつながり・系統樹で、覚えたことを確かめる場所です。解いた問題の「学ぶで確かめる」からもここに来られます。</p>
    <div class="zk-grid">${PAGES.map(p => `<a class="zk-card" href="${p.href || '#learn=' + p.id}">${icon(p.icon)}<b>${e(p.name)}${count[p.id] ? `<em class="zk-count">${e(count[p.id])}</em>` : ''}</b><span>${e(p.desc)}</span></a>`).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------- 1. 図へのラベル付け
const svgCache = new Map();
function loadSVG(src) {
  if (!svgCache.has(src)) svgCache.set(src, fetch(src).then(r => { if (!r.ok) throw new Error(`${src} を読めません`); return r.text(); }).catch(err => { svgCache.delete(src); throw err; }));
  return svgCache.get(src);
}
function labelsPage(view, key) {
  const d = L.diagrams.find(x => x.id === key);
  if (!d) return labelsList(view);
  const mode = C.prefs.labelMode || 'view';
  view.innerHTML = `<div class="fade-in">${head(d.title, `図へのラベル付け · ${subjOf(d.unit)}・${unitName(d.unit)}`, e(d.desc), '#learn=labels', '図の一覧')}
    ${tabs('lmode', [['view', '見る'], ['name', '名前を答える'], ['place', '位置を答える']], mode)}
    <div class="lab-wrap"><div class="dg lab-fig" id="lfig"><p class="muted">図を読み込んでいます…</p></div>
    <div id="lside" class="lab-side"></div></div>
    ${probButton('labels', d.id, 'この図の問題を解く')}
  </div>`;
  bindProb(view);
  let svg = null;
  loadSVG(d.src).then(text => {
    svg = sanitizeSVG(text);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', d.title);
    const box = $('#lfig'); if (!box) return;
    box.innerHTML = ''; box.appendChild(document.importNode(svg, true));
    svg = box.querySelector('svg');
    run(mode);
  }).catch(err => { $('#lfig').innerHTML = `<p class="muted">${e(err.message)}</p>`; });
  bindTabs('lmode', (m) => { C.prefs.labelMode = m; C.save(); run(m); });

  function drawPins(cls = () => '', text = (i) => i + 1) {
    svg.querySelectorAll('.pin').forEach(n => n.remove());
    const ns = 'http://www.w3.org/2000/svg';
    d.pins.forEach((p, i) => {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', `pin ${cls(p, i)}`); g.dataset.i = i;
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', `${i + 1}番`);
      g.innerHTML = `${p.to ? `<path class="lead" d="M${p.x} ${p.y}L${p.to[0]} ${p.to[1]}"/><circle cx="${p.to[0]}" cy="${p.to[1]}" r="2.5" class="tip"/>` : ''}<circle cx="${p.x}" cy="${p.y}" r="11"/><text x="${p.x}" y="${p.y + 4}">${text(i)}</text>`;
      svg.appendChild(g);
    });
  }
  function onPin(fn) {
    $$('.pin', svg).forEach(g => {
      const act = () => fn(+g.dataset.i);
      g.addEventListener('click', act);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') act(); });
    });
  }
  function run(m) {
    if (!svg) return;
    const side = $('#lside');
    if (m === 'view') {
      let sel = -1;
      const draw = () => {
        drawPins((p, i) => i === sel ? 'sel' : '');
        onPin((i) => { sel = sel === i ? -1 : i; draw(); });
        side.innerHTML = `<ol class="lab-legend">${d.pins.map((p, i) => `<li class="${i === sel ? 'on' : ''}" data-i="${i}"><b>${i + 1}</b><span><strong>${e(p.label)}</strong>${p.note ? `<small>${e(p.note)}</small>` : ''}</span></li>`).join('')}</ol>`;
        $$('.lab-legend li', side).forEach(li => li.addEventListener('click', () => { sel = sel === +li.dataset.i ? -1 : +li.dataset.i; draw(); }));
      };
      draw();
      return;
    }
    // クイズ：名前を答える（ピン → 語を選ぶ）／位置を答える（語 → ピンを押す）
    const order = shuffle(d.pins.map((p, i) => i));
    const st = { k: 0, done: new Set(), miss: new Set(), ng: -1 };
    const words = shuffle(d.pins.map(p => p.label));
    const finish = () => {
      const ok = d.pins.length - st.miss.size, isBest = record(`labels/${d.id}`, ok / d.pins.length);
      C.play(ok === d.pins.length ? 'full' : 'part');
      side.innerHTML = `${scoreHTML(ok, d.pins.length, isBest)}
        ${st.miss.size ? `<p class="muted small">間違えた部分：${[...st.miss].map(i => e(d.pins[i].label)).join('、')}</p>` : ''}
        <div class="btn-row"><button class="btn primary" id="lagain">もう一度</button><button class="btn" id="lview">答えを見る</button></div>`;
      $('#lagain').addEventListener('click', () => run(m));
      $('#lview').addEventListener('click', () => { $('#lmode button[data-t="view"]').click(); });
    };
    const draw = () => {
      const cur = order[st.k];
      if (cur === undefined) { drawPins(() => 'ok', (i) => i + 1); return finish(); }
      if (m === 'name') {
        drawPins((p, i) => st.done.has(i) ? 'ok' : i === cur ? 'sel' : '', (i) => st.done.has(i) || i === cur ? i + 1 : '');
        side.innerHTML = `<div class="lab-q">${st.k + 1} / ${d.pins.length}　<b>${cur + 1}</b> の名前は？</div>
          <div class="opts pool lab-bank">${words.map(w => { const used = [...st.done].some(i => d.pins[i].label === w); return `<button class="chipbtn ${used ? 'used' : ''}" data-w="${e(w)}" ${used ? 'disabled' : ''}>${e(w)}</button>`; }).join('')}</div>
          <div id="lfb" class="lab-fb"></div>`;
        $$('.lab-bank [data-w]', side).forEach(b => b.addEventListener('click', () => answer(b.dataset.w === d.pins[cur].label, b)));
      } else {
        drawPins((p, i) => st.done.has(i) ? 'ok' : i === st.ng ? 'ng' : '', (i) => st.done.has(i) ? '✓' : '');
        onPin((i) => answer(i === cur, null, i));
        side.innerHTML = `<div class="lab-q">${st.k + 1} / ${d.pins.length}　<b>${e(d.pins[cur].label)}</b> はどこ？</div><p class="muted small">図の丸をタップ</p><div id="lfb" class="lab-fb"></div>`;
      }
    };
    const answer = (ok, btn, pinI) => {
      const cur = order[st.k];
      if (ok) {
        C.play('correct'); st.done.add(cur); st.k++; st.ng = -1;
        const p = d.pins[cur];
        draw();
        if (p.note && order[st.k] !== undefined) { const fb = $('#lfb'); if (fb) fb.innerHTML = `<span class="ok-note">✓ ${e(p.label)}：${e(p.note)}</span>`; }
      } else {
        C.play('wrong'); st.miss.add(cur);
        if (btn) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 400); }
        if (pinI != null) { st.ng = pinI; draw(); }
        const fb = $('#lfb'); if (fb) fb.innerHTML = `<span class="ng-note">ちがいます${pinI != null ? `（それは ${e(d.pins[pinI].label)}）` : ''}</span>`;
      }
    };
    draw();
  }
}
function labelsList(view) {
  const groups = new Map();
  for (const d of L.diagrams) { const s = subjOf(d.unit); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(d); }
  view.innerHTML = `<div class="fade-in">${head('図へのラベル付け', '学ぶ', '図の番号の部分の名前を答えたり、名前から場所を指したりして覚えます。')}
    ${[...groups].map(([s, ds]) => `<h2>${e(s)}</h2><div class="lab-grid">${ds.map(d => `<a class="lab-card" href="#learn=labels/${e(d.id)}"><div class="dg lab-thumb" data-src="${e(d.src)}"></div><b>${e(d.title)}</b><span class="muted small">${e(unitName(d.unit))}・${d.pins.length}か所 ${badge('labels/' + d.id)}</span></a>`).join('')}</div>`).join('')}
  </div>`;
  $$('.lab-thumb').forEach(async (box) => {
    try { const svg = sanitizeSVG(await loadSVG(box.dataset.src)); svg.setAttribute('aria-hidden', 'true'); box.appendChild(document.importNode(svg, true)); } catch { /* 無視 */ }
  });
}

// ---------------------------------------------------------------- 2. 用語・概念カード
const DAY = 86400000;
function cardR(st, now = Date.now()) { return C.retrievability(st, now); }
function dueCards(unit = null) {
  const cs = C.state().cstat || {}, now = Date.now();
  return L.terms.filter(t => cs[t.id] && cs[t.id].reps && (!unit || t.unit === unit || subjKey(t.unit) === unit) && cardR(cs[t.id], now) < 0.9);
}
const subjKey = (u) => u.slice(0, 3);
function deckOf(sel) { return L.terms.filter(t => !sel || t.unit === sel || subjKey(t.unit) === sel); }
function cardStatus(t) {
  const st = (C.state().cstat || {})[t.id];
  if (!st || !st.reps) return 'new';
  if (cardR(st) < 0.9) return 'due';
  return st.S >= 21 ? 'solid' : 'learning';
}
const STATUS = { new: '未学習', due: '復習', learning: '学習中', solid: '定着' };
export function cardsPage(view, key) {
  const fieldsSeen = [...new Set(L.terms.map(t => subjKey(t.unit)))];
  let sel = key || C.prefs.deck || '';
  if (sel && !L.terms.some(t => t.unit === sel || subjKey(t.unit) === sel)) sel = '';
  const dir = C.prefs.cardDir || 'term';
  const deck = deckOf(sel);
  const cnt = { new: 0, due: 0, learning: 0, solid: 0 };
  deck.forEach(t => cnt[cardStatus(t)]++);
  const fname = (k) => (C.FIELDS.find(f => f.fieldKey === k) || {}).subject || k;
  view.innerHTML = `<div class="fade-in">${head('用語・概念カード', '学ぶ', '用語を見て意味を思い出す（または意味から用語を思い出す）カードです。思い出せたかどうかで、次に出す日が変わります。')}
    <div class="zk-toolbar"><select id="cdeck" aria-label="範囲">
      <option value="">すべての分野（${L.terms.length}語）</option>
      ${fieldsSeen.map(fk => `<optgroup label="${e(fname(fk))}"><option value="${fk}" ${sel === fk ? 'selected' : ''}>${e(fname(fk))}すべて</option>${C.FIELDS.filter(f => f.fieldKey === fk && L.terms.some(t => t.unit === f.key)).map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${e(f.name)}</option>`).join('')}</optgroup>`).join('')}
    </select></div>
    ${tabs('cdir', [['term', '用語 → 意味'], ['def', '意味 → 用語']], dir)}
    <div class="stat-row cstat">${Object.keys(cnt).map(k => `<div class="stat s-${k}"><b>${cnt[k]}</b><span>${STATUS[k]}</span></div>`).join('')}</div>
    <div class="btn-row">
      <button class="btn primary" id="cdue" ${cnt.due ? '' : 'disabled'}>復習する（${cnt.due}枚）</button>
      <button class="btn" id="cnew" ${cnt.new ? '' : 'disabled'}>新しいカード（${Math.min(10, cnt.new)}枚）</button>
    </div>
    <button class="btn ghost block" id="cmix" style="margin-top:8px" ${deck.length ? '' : 'disabled'}>ランダムに10枚</button>
    <h2>一覧</h2>
    <form class="search" id="cform"><input type="search" id="cq" placeholder="用語・説明で探す" autocomplete="off"></form>
    <div id="clist" class="clist"></div>
    ${sel ? probButton('cards', sel.length > 3 ? sel : null, 'この単元の問題を解く') : ''}
  </div>`;
  bindProb(view);
  $('#cdeck').addEventListener('change', (ev) => { C.prefs.deck = ev.target.value; C.save(); location.hash = '#learn=cards' + (ev.target.value ? '/' + ev.target.value : ''); });
  bindTabs('cdir', (d) => { C.prefs.cardDir = d; C.save(); });
  const start = (list) => { if (list.length) study(view, list, sel); };
  $('#cdue').addEventListener('click', () => start(shuffle(deck.filter(t => cardStatus(t) === 'due')).slice(0, 30)));
  $('#cnew').addEventListener('click', () => start(deck.filter(t => cardStatus(t) === 'new').slice(0, 10)));
  $('#cmix').addEventListener('click', () => start(shuffle(deck).slice(0, 10)));
  const list = (q) => {
    const n = (s) => String(s).normalize('NFKC').toLowerCase();
    const items = deck.filter(t => !q || n(t.term + t.def).includes(n(q)));
    $('#clist').innerHTML = items.slice(0, 200).map(t => `<details class="cterm"><summary><b>${e(t.term)}</b><span class="chip st-${cardStatus(t)}">${STATUS[cardStatus(t)]}</span></summary>${termBody(t)}</details>`).join('') || '<p class="muted">見つかりません</p>';
  };
  $('#cq').addEventListener('input', (ev) => list(ev.target.value.trim()));
  $('#cform').addEventListener('submit', (ev) => ev.preventDefault());
  list('');
}
function termBody(t) {
  const dg = (t.dg || []).map(id => L.diagrams.find(d => d.id === id)).filter(Boolean);
  const an = (t.an || []).map(id => L.anims.find(a => a.id === id)).filter(Boolean);
  return `<p>${e(t.def)}</p><div class="tlinks"><span class="chip plain">${e(subjOf(t.unit))}・${e(unitName(t.unit))}</span>
    ${dg.map(d => `<a class="chip link" href="#learn=labels/${e(d.id)}">図：${e(d.title)}</a>`).join('')}
    ${an.map(a => `<a class="chip link" href="#learn=anim/${e(a.id)}">アニメ：${e(a.title)}</a>`).join('')}</div>`;
}
function study(view, cards, sel) {
  const dir = C.prefs.cardDir || 'term';
  const queue = cards.map(t => ({ t, again: false }));
  const res = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let i = 0, flipped = false;
  const total = cards.length;
  const draw = () => {
    const it = queue[i];
    if (!it) {
      view.innerHTML = `<div class="fade-in">${head('おつかれさま', '用語・概念カード', '', '#learn=cards' + (sel ? '/' + sel : ''), 'カード')}
        <div class="stat-row"><div class="stat"><b>${res[3] + res[4]}</b><span>覚えた</span></div><div class="stat"><b>${res[2]}</b><span>あいまい</span></div><div class="stat"><b>${res[1]}</b><span>もう一度</span></div></div>
        <p class="muted">思い出せなかったカードは近いうちに、思い出せたカードは間をあけて復習に出します。</p>
        <a class="btn primary block" href="#learn=cards${sel ? '/' + sel : ''}">カードの一覧へ</a></div>`;
      C.play('finish');
      return;
    }
    const t = it.t;
    const front = dir === 'term' ? `<div class="cfront">${e(t.term)}</div>` : `<div class="cfront def">${e(t.def.replace(new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '〔　〕'))}</div>`;
    const back = dir === 'term' ? `<div class="cback">${e(t.def)}</div>` : `<div class="cback"><b class="cterm-big">${e(t.term)}</b></div>`;
    view.innerHTML = `<div class="fade-in study">
      <div class="player-top"><a class="icon-btn" href="#learn=cards${sel ? '/' + sel : ''}" aria-label="やめる">×</a><div class="progress"><div style="width:${Math.round(Math.min(i, total) / total * 100)}%"></div></div></div>
      <div class="meta"><span class="chip">${e(subjOf(t.unit))}・${e(unitName(t.unit))}</span><span class="count">${Math.min(i + 1, total)} / ${total}${queue.length > total ? `（+${queue.length - total}）` : ''}</span></div>
      <button class="flash ${flipped ? 'flipped' : ''}" id="flash">${front}${flipped ? `<hr>${back}${termLinks(t)}` : '<span class="muted small">タップしてめくる</span>'}</button>
      ${flipped ? `<div class="segment grade4">${[[1, 'もう一度'], [2, 'あいまい'], [3, '覚えた'], [4, 'かんたん']].map(([g, l]) => `<button data-g="${g}"><b>${l}</b><small>${nextLabel(t, g)}</small></button>`).join('')}</div>` : ''}
    </div>`;
    $('#flash').addEventListener('click', (ev) => { if (ev.target.closest('a')) return; if (!flipped) { flipped = true; C.play('tap'); draw(); } });
    $$('.grade4 button').forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
  };
  const grade = (g) => {
    const it = queue[i];
    res[g]++;
    if (!it.again) {
      const cs = C.state().cstat || (C.state().cstat = {});
      cs[it.t.id] = C.review(cs[it.t.id], g, Date.now());
      C.save();
    }
    if (g === 1 && !it.again) queue.splice(Math.min(queue.length, i + 4), 0, { t: it.t, again: true });
    C.play(g >= 3 ? 'correct' : g === 2 ? 'part' : 'tap');
    i++; flipped = false; draw();
  };
  draw();
}
function termLinks(t) {
  const dg = (t.dg || []).slice(0, 2).map(id => L.diagrams.find(d => d.id === id)).filter(Boolean);
  const an = (t.an || []).slice(0, 2).map(id => L.anims.find(a => a.id === id)).filter(Boolean);
  if (!dg.length && !an.length) return '';
  return `<div class="tlinks">${dg.map(d => `<a class="chip link" href="#learn=labels/${e(d.id)}">図：${e(d.title)}</a>`).join('')}${an.map(a => `<a class="chip link" href="#learn=anim/${e(a.id)}">アニメ：${e(a.title)}</a>`).join('')}</div>`;
}
function nextLabel(t, g) {
  const st = C.review((C.state().cstat || {})[t.id], g, Date.now());
  const d = st.S;
  return d < 1 ? `${Math.max(1, Math.round(d * 24))}時間後` : d < 30 ? `${Math.round(d)}日後` : `${Math.round(d / 30)}か月後`;
}

// ---------------------------------------------------------------- 3. 生命現象のアニメーション
function animPage(view, key) {
  const a = L.anims.find(x => x.id === key);
  if (!a || !ANIMS[a.id]) return animList(view);
  const A = ANIMS[a.id], n = a.stages.length;
  let T = 0, playing = false, speed = C.prefs.animSpeed || 1, raf = 0, last = 0;
  const DUR = 3.2;   // 1段階の秒数（速さ 1 のとき）
  view.innerHTML = `<div class="fade-in">${head(a.title, `アニメーション · ${subjOf(a.unit)}・${unitName(a.unit)}`, '', '#learn=anim', 'アニメーションの一覧')}
    ${tabs('amode', [['play', '見る'], ['order', '順に並べる']], 'play')}
    <div id="abody"></div>
    ${probButton('anim', a.id, 'この内容の問題を解く')}
  </div>`;
  bindProb(view);
  const body = $('#abody');
  const stop = () => { playing = false; cancelAnimationFrame(raf); };
  onStop(stop);
  function showPlay() {
    body.innerHTML = `<div class="dg an anim-box"><svg viewBox="${VIEWBOX}" id="asvg" role="img" aria-label="${e(a.title)}"></svg></div>
      <input type="range" id="aseek" min="0" max="${n}" step="0.01" value="0" aria-label="位置">
      <div class="anim-ctrl">
        <button class="icon-btn" id="aprev" aria-label="前の段階">⏮</button>
        <button class="icon-btn big" id="aplay" aria-label="再生">▶</button>
        <button class="icon-btn" id="anext" aria-label="次の段階">⏭</button>
        <select id="aspd" aria-label="速さ">${[0.5, 1, 2].map(v => `<option value="${v}" ${v === speed ? 'selected' : ''}>×${v}</option>`).join('')}</select>
      </div>
      <div class="panel anim-cap" id="acap"></div>
      <ol class="anim-stages" id="astages">${a.stages.map((s, i) => `<li data-i="${i}"><b>${i + 1}</b>${e(s.name)}</li>`).join('')}</ol>`;
    const svg = $('#asvg'), cap = $('#acap'), seek = $('#aseek');
    let shown = -1;
    const render = () => {
      const s = Math.min(n - 1, Math.floor(T)), u = T >= n ? 1 : T - s;
      svg.innerHTML = frame(a.id, s, u);
      seek.value = T;
      if (s !== shown) {
        shown = s;
        cap.innerHTML = `<div class="anim-step">${s + 1} / ${n}　<b>${e(a.stages[s].name)}</b></div><p>${e(a.stages[s].text)}</p>`;
        $$('#astages li').forEach(li => li.classList.toggle('on', +li.dataset.i === s));
      }
      $('#aplay').textContent = playing ? '⏸' : '▶';
    };
    const tick = (now) => {
      if (!playing) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      T = Math.min(n, T + dt * speed / DUR);
      if (T >= n) { T = n; playing = false; }
      render();
      if (playing) raf = requestAnimationFrame(tick);
    };
    const play = () => { if (T >= n) T = 0; playing = true; last = performance.now(); raf = requestAnimationFrame(tick); render(); };
    $('#aplay').addEventListener('click', () => { if (playing) { stop(); render(); } else play(); });
    $('#aprev').addEventListener('click', () => { stop(); T = Math.max(0, Math.ceil(T) - 1 - (T % 1 === 0 ? 1 : 0)); T = Math.max(0, Math.floor(T)); render(); });
    $('#anext').addEventListener('click', () => { stop(); T = Math.min(n - 1, Math.floor(T) + 1); render(); });
    $('#aspd').addEventListener('change', (ev) => { speed = +ev.target.value; C.prefs.animSpeed = speed; C.save(); });
    seek.addEventListener('input', () => { stop(); T = +seek.value; render(); });
    $$('#astages li').forEach(li => li.addEventListener('click', () => { stop(); T = +li.dataset.i; render(); }));
    render();
  }
  function showOrder() {
    stop();
    const right = a.stages.map((s, i) => i);
    let pool = shuffle(right), seq = [], checked = false;
    if (pool.every((x, i) => x === i)) pool.reverse();
    const draw = () => {
      body.innerHTML = `<p class="sub">段階を、起こる順にタップして並べよう。</p>
        <div class="seq">${seq.length ? seq.map((i, k) => `<button class="chipbtn placed ${checked ? (i === k ? 'okc' : 'ngc') : ''}" data-un="${i}"><b>${k + 1}</b>${e(a.stages[i].name)}</button>`).join('<span class="gt">→</span>') : '<span class="muted small">ここに並びます</span>'}</div>
        <div class="opts pool">${pool.filter(i => !seq.includes(i)).map(i => `<button class="chipbtn" data-i="${i}">${e(a.stages[i].name)}</button>`).join('')}</div>
        <div class="btn-row">${checked ? '<button class="btn primary" id="oagain">もう一度</button>' : `<button class="btn primary" id="ocheck" ${seq.length === n ? '' : 'disabled'}>判定</button><button class="btn ghost" id="oreset">並べ直す</button>`}</div>
        <div id="ores"></div>`;
      $$('[data-i]', body).forEach(b => b.addEventListener('click', () => { if (checked) return; seq.push(+b.dataset.i); C.play('tap'); draw(); }));
      $$('[data-un]', body).forEach(b => b.addEventListener('click', () => { if (checked) return; seq = seq.filter(x => x !== +b.dataset.un); draw(); }));
      $('#oreset')?.addEventListener('click', () => { seq = []; draw(); });
      $('#oagain')?.addEventListener('click', () => { pool = shuffle(right); seq = []; checked = false; draw(); });
      $('#ocheck')?.addEventListener('click', () => {
        checked = true;
        const ok = seq.filter((x, k) => x === k).length, isBest = record(`anim/${a.id}`, ok / n);
        C.play(ok === n ? 'full' : 'wrong');
        draw();
        $('#ores').innerHTML = scoreHTML(ok, n, isBest) + (ok < n ? `<ol class="anim-stages small">${a.stages.map(s => `<li>${e(s.name)}</li>`).join('')}</ol><p class="muted small">↑ 正しい順</p>` : '');
      });
    };
    draw();
  }
  bindTabs('amode', (m) => (m === 'play' ? showPlay() : showOrder()));
  showPlay();
}
function animList(view) {
  const groups = new Map();
  for (const a of L.anims) { const s = subjOf(a.unit); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(a); }
  view.innerHTML = `<div class="fade-in">${head('生命現象のアニメーション', '学ぶ', '段階ごとに止めたり戻したりしながら、何がどの順に起こるかを確かめます。')}
    ${[...groups].map(([s, as]) => `<h2>${e(s)}</h2><div class="lab-grid">${as.map(a => `<a class="lab-card" href="#learn=anim/${e(a.id)}"><div class="dg an lab-thumb"><svg viewBox="${VIEWBOX}" aria-hidden="true">${ANIMS[a.id] ? frame(a.id, Math.min(a.stages.length - 1, 2), 0.6) : ''}</svg></div><b>${e(a.title)}</b><span class="muted small">${e(unitName(a.unit))}・${a.stages.length}段階 ${badge('anim/' + a.id)}</span></a>`).join('')}</div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------- 4. 因果関係
// tools/biolib.py の propagate と同じ計算：いちばん短い経路の符号の積（同じ長さで食い違えば null）
export function propagate(net, start, sign) {
  const out = {};
  for (const ed of net.edges) (out[ed.from] = out[ed.from] || []).push(ed);
  const val = { [start]: sign }, dist = { [start]: 0 }, via = {};
  const q = [start];
  while (q.length) {
    const a = q.shift();
    if (val[a] === null) continue;
    for (const ed of out[a] || []) {
      const b = ed.to;
      if (b === start) continue;
      const v = val[a] * ed.sign;
      if (!(b in dist)) { dist[b] = dist[a] + 1; val[b] = v; via[b] = [ed]; q.push(b); }
      else if (dist[b] === dist[a] + 1) { if (val[b] !== v) val[b] = null; else via[b].push(ed); }
    }
  }
  const res = {};
  for (const nd of net.nodes) res[nd.id] = nd.id in val ? val[nd.id] : 0;
  return { res, dist, via };
}
// 配置：列（0〜）と行の位置から。列の数に合わせて箱の幅を決める
function netLayout(net) {
  const maxC = Math.max(2, ...net.nodes.map(nd => nd.col));
  const W = 400, m = 8, gap = (W - 2 * m) / (maxC + 1);
  const NW = Math.min(118, gap - 8);
  const NH = Math.max(...net.nodes.map(nd => nd.label.split('\n').length)) > 2 ? 48 : 40;
  const xy = (nd) => [m + gap * (nd.col + 0.5), 30 + nd.row * 58];
  const H = Math.max(...net.nodes.map(nd => xy(nd)[1])) + NH / 2 + 12;
  return { W, H, NW, NH, xy, narrow: NW < 100 };
}
function netSVG(net, { marks = {}, hi = null, edgeOn = new Set(), dimOthers = false } = {}) {
  const N = Object.fromEntries(net.nodes.map(nd => [nd.id, nd]));
  const { W, H, NW, NH, xy, narrow } = netLayout(net);
  const clip = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.min(Math.abs((NW / 2 + 3) / (dx || 1e-9)), Math.abs((NH / 2 + 3) / (dy || 1e-9)), 0.5);
    return [x1 + dx * t, y1 + dy * t];
  };
  const hits = (pts, skip) => net.nodes.some(nd => {
    if (skip.includes(nd.id)) return false;
    const [x, y] = xy(nd);
    return pts.some(([px, py]) => Math.abs(px - x) < NW / 2 + 4 && Math.abs(py - y) < NH / 2 + 4);
  });
  const edges = net.edges.map((ed, k) => {
    const [x1, y1] = xy(N[ed.from]), [x2, y2] = xy(N[ed.to]);
    const rev = net.edges.some(o => o.from === ed.to && o.to === ed.from);
    const [ax, ay] = clip(x1, y1, x2, y2), [bx, by] = clip(x2, y2, x1, y1);
    const mx = (ax + bx) / 2, my = (ay + by) / 2, L2 = Math.hypot(bx - ax, by - ay) || 1;
    // ほかの箱に重ならない曲げ方を探す（逆向きの矢印があれば必ず曲げる）
    const cands = (rev ? [46, 70, 100, 130] : [0, 36, 60, 90, 120, 160, 200]).flatMap(v => (v && !rev ? [v, -v] : [v]));
    let bestV = cands[0], bestBad = Infinity, cx = mx, cy = my;
    for (const v of cands) {
      const qx = mx - (by - ay) / L2 * v, qy = my + (bx - ax) / L2 * v;
      const pts = [];
      for (let i = 1; i < 16; i++) { const t = i / 16; pts.push([(1 - t) ** 2 * ax + 2 * t * (1 - t) * qx + t * t * bx, (1 - t) ** 2 * ay + 2 * t * (1 - t) * qy + t * t * by]); }
      const bad = pts.filter(([px, py]) => px < 4 || px > W - 4 || py < 4 || py > H - 4).length * 3 + pts.filter(pp => hits([pp], [ed.from, ed.to])).length;
      if (bad < bestBad) { bestBad = bad; bestV = v; cx = qx; cy = qy; }
      if (!bad) break;
    }
    void bestV;
    const lx = 0.25 * ax + 0.5 * cx + 0.25 * bx, ly = 0.25 * ay + 0.5 * cy + 0.25 * by;
    const on = edgeOn.has(k), dim = dimOthers && !on;
    return `<g class="cedge ${ed.sign > 0 ? 'pos' : 'neg'} ${ed.fb ? 'fb' : ''} ${on ? 'on' : ''} ${dim ? 'dim' : ''}" data-k="${k}">
      <path d="M${ax.toFixed(1)} ${ay.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" marker-end="url(#cm${ed.sign > 0 ? 'p' : 'n'})"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="8"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}">${ed.sign > 0 ? '+' : '−'}</text></g>`;
  }).join('');
  const nodes = net.nodes.map(nd => {
    const [x, y] = xy(nd), lines = nd.label.split('\n'), m = marks[nd.id];
    const cls = narrow || lines.length > 1 ? 'sm' : '';
    return `<g class="cnode ${hi === nd.id ? 'sel' : ''} ${m ? 'm-' + m.cls : ''}" data-n="${e(nd.id)}" tabindex="0" role="button">
      <rect x="${x - NW / 2}" y="${y - NH / 2}" width="${NW}" height="${NH}" rx="9"/>
      ${lines.map((l, i) => `<text x="${x}" y="${(y + 4 + (i - (lines.length - 1) / 2) * 12.5).toFixed(1)}" class="${cls}">${e(l)}</text>`).join('')}
      ${m ? `<circle cx="${x + NW / 2 - 4}" cy="${y - NH / 2 + 2}" r="11" class="cbadge"/><text x="${x + NW / 2 - 4}" y="${y - NH / 2 + 7}" class="cbt">${m.text}</text>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" class="cnet"><defs>
    <marker id="cmp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ahp"/></marker>
    <marker id="cmn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ahn"/></marker></defs>${edges}${nodes}</svg>`;
}
const ARROW = { 1: '↑', '-1': '↓', 0: '→' };
function causalPage(view, key) {
  const net = L.causal.find(x => x.id === key);
  if (!net) return causalList(view);
  const label = (id) => net.nodes.find(nd => nd.id === id).label.replace(/\n/g, '');
  view.innerHTML = `<div class="fade-in">${head(net.title, `因果関係 · ${subjOf(net.unit)}・${unitName(net.unit)}`, e(net.desc), '#learn=causal', '因果関係の一覧')}
    ${tabs('cmode', [['predict', '増減を予測する'], ['trace', 'つながりをたどる']], C.prefs.causalMode || 'predict')}
    <div id="cbody"></div>
    <p class="muted small clegend"><span class="lg-pos">→ ＋</span> 増やす（促進）　<span class="lg-neg">→ −</span> 減らす（抑制）　<span class="lg-fb">┅</span> フィードバック</p>
    ${probButton('causal', net.id, 'このしくみの問題を解く')}
  </div>`;
  bindProb(view);
  const body = $('#cbody');
  function trace() {
    let hi = null;
    const draw = () => {
      const on = new Set(hi ? net.edges.map((ed, k) => (ed.from === hi || ed.to === hi ? k : -1)).filter(k => k >= 0) : []);
      body.innerHTML = `<div class="cnet-wrap">${netSVG(net, { hi, edgeOn: on, dimOthers: !!hi })}</div><div class="panel zk-detail" id="cdet">${hi ? detail(hi) : '<span class="muted">四角をタップすると、それを増やす・減らすもの、それが増やす・減らすものが出ます。</span>'}</div>`;
      $$('.cnode', body).forEach(g => g.addEventListener('click', () => { hi = hi === g.dataset.n ? null : g.dataset.n; draw(); }));
    };
    const detail = (id) => {
      const row = (ed, dirn) => `<li><span class="${ed.sign > 0 ? 'lg-pos' : 'lg-neg'}">${ed.sign > 0 ? '＋' : '−'}</span> ${e(label(dirn === 'in' ? ed.from : ed.to))}${ed.fb ? '（フィードバック）' : ''}${ed.note ? `<small class="muted">　${e(ed.note)}</small>` : ''}</li>`;
      const ins = net.edges.filter(ed => ed.to === id), outs = net.edges.filter(ed => ed.from === id);
      return `<div class="zk-dhead">${e(label(id))}</div>${ins.length ? `<h3>これを変えるもの</h3><ul class="clist2">${ins.map(ed => row(ed, 'in')).join('')}</ul>` : ''}${outs.length ? `<h3>これが変えるもの</h3><ul class="clist2">${outs.map(ed => row(ed, 'out')).join('')}</ul>` : ''}`;
    };
    draw();
  }
  function predict() {
    let sc = net.scenarios[0], guess = {}, checked = false, step = 0, timer = null;
    onStop(() => clearInterval(timer));
    const draw = () => {
      const { res, dist, via } = propagate(net, sc.start, sc.dir);
      const marks = { [sc.start]: { cls: 'start', text: sc.dir > 0 ? '↑' : '↓' } };
      for (const id of sc.ask) {
        if (!checked) marks[id] = { cls: guess[id] ? 'guess' : 'ask', text: guess[id] ? ARROW[guess[id]] : '?' };
        else if (dist[id] <= step) marks[id] = { cls: guess[id] === res[id] ? 'ok' : 'ng', text: ARROW[res[id]] };
        else marks[id] = { cls: 'guess', text: ARROW[guess[id]] };
      }
      if (checked) for (const id of Object.keys(dist)) if (!marks[id] && dist[id] <= step && id !== sc.start) marks[id] = { cls: 'pass', text: ARROW[res[id]] };
      const on = new Set();
      if (checked) for (const [id, eds] of Object.entries(via)) if (dist[id] <= step) eds.forEach(ed => on.add(net.edges.indexOf(ed)));
      const all = sc.ask.every(id => guess[id]);
      const ok = sc.ask.filter(id => guess[id] === res[id]).length;
      body.innerHTML = `<div class="chips cscen">${net.scenarios.map(x => `<button class="chipbtn ${x === sc ? 'on' : ''}" data-s="${e(x.id)}">${e(x.title)}</button>`).join('')}</div>
        <div class="panel cq"><b>${e(sc.title)}</b>：<span class="${sc.dir > 0 ? 'lg-pos' : 'lg-neg'}">${e(label(sc.start))} ${sc.dir > 0 ? '↑' : '↓'}</span><br>
          <span class="muted small">${checked ? '矢印をたどって、変化が伝わる順に表示しています。' : '「?」の四角をタップして、増える（↑）か減る（↓）かを予想しよう。'}</span></div>
        <div class="cnet-wrap">${netSVG(net, { marks, edgeOn: on, dimOthers: checked })}</div>
        <div class="btn-row">${checked ? '<button class="btn" id="cagain">やり直す</button>' : `<button class="btn primary" id="ccheck" ${all ? '' : 'disabled'}>答え合わせ</button>`}</div>
        <div id="cres">${checked && step >= Math.max(...sc.ask.map(id => dist[id])) ? `${scoreHTML(ok, sc.ask.length, false)}<div class="panel"><p style="margin:0">${e(sc.explain)}</p>
          <ul class="clist2">${sc.ask.map(id => `<li class="${guess[id] === res[id] ? 'okc' : 'ngc'}">${e(label(id))}：<b>${res[id] > 0 ? '増える ↑' : '減る ↓'}</b>${guess[id] === res[id] ? '' : '（予想 ' + ARROW[guess[id]] + '）'}</li>`).join('')}</ul></div>` : ''}</div>`;
      $$('.cscen [data-s]', body).forEach(b => b.addEventListener('click', () => { clearInterval(timer); sc = net.scenarios.find(x => x.id === b.dataset.s); guess = {}; checked = false; draw(); }));
      if (!checked) $$('.cnode', body).forEach(g => g.addEventListener('click', () => {
        const id = g.dataset.n; if (!sc.ask.includes(id)) return;
        guess[id] = guess[id] === 1 ? -1 : guess[id] === -1 ? undefined : 1; C.play('tap'); draw();
      }));
      $('#ccheck')?.addEventListener('click', () => {
        checked = true; step = 0;
        const maxD = Math.max(...sc.ask.map(id => dist[id]));
        record(`causal/${net.id}/${sc.id}`, ok / sc.ask.length);
        timer = setInterval(() => { step++; draw(); if (step >= maxD) { clearInterval(timer); C.play(ok === sc.ask.length ? 'full' : 'part'); } }, 650);
        draw();
      });
      $('#cagain')?.addEventListener('click', () => { clearInterval(timer); guess = {}; checked = false; draw(); });
    };
    draw();
  }
  bindTabs('cmode', (m) => { C.prefs.causalMode = m; C.save(); (m === 'trace' ? trace : predict)(); });
  ((C.prefs.causalMode || 'predict') === 'trace' ? trace : predict)();
}
function causalList(view) {
  const groups = new Map();
  for (const n of L.causal) { const s = subjOf(n.unit); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(n); }
  view.innerHTML = `<div class="fade-in">${head('因果関係の学習', '学ぶ', 'ホルモン・神経・遺伝子・生態系のつながりを矢印でたどり、「これが増えたら何が増え、何が減るか」を予測します。')}
    ${[...groups].map(([s, ns]) => `<h2>${e(s)}</h2><div class="rx-list">${ns.map(n => `<a class="set-card clink" href="#learn=causal/${e(n.id)}"><b>${e(n.title)}</b><span class="muted small">${e(n.desc)}</span><span class="muted small">予測 ${n.scenarios.length}問 ${n.scenarios.map(x => badge(`causal/${n.id}/${x.id}`)).join('')}</span></a>`).join('')}</div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------- 5. 系統・分類・進化
function treePage(view, key) {
  const T = L.tree;
  const t0 = T.trees.find(x => x.id === key);
  const mode = t0 ? 'tree' : ['eras', 'popgen', 'ranks'].includes(key) ? key : (C.prefs.treeMode || 'tree');
  view.innerHTML = `<div class="fade-in">${head('系統・分類・進化', '学ぶ', '系統樹で形質がどこで獲得されたかをたどり、地質時代の流れ・遺伝子頻度の変化・分類の階級を確かめます。')}
    ${tabs('tmode', [['tree', '系統樹'], ['eras', '地質時代'], ['popgen', '集団遺伝'], ['ranks', '分類の階級']], mode)}
    <div id="tbody"></div>
    <div id="tprob"></div>
  </div>`;
  const body = $('#tbody');
  const go = (m) => {
    C.prefs.treeMode = m; C.save();
    $('#tprob').innerHTML = probButton('tree', m === 'tree' ? null : m, '進化・系統の問題を解く');
    bindProb($('#tprob'));
    ({ tree: () => phylo(body, t0 || T.trees.find(x => x.id === C.prefs.treeId) || T.trees[0]), eras: () => eras(body), popgen: () => popgen(body), ranks: () => ranks(body) })[m]();
  };
  bindTabs('tmode', go);
  go(mode);
}
// 系統樹：葉は右端、節の横位置は深さで決める。形質は、その節に入る枝の上に番号で示す
function layoutTree(root) {
  const leaves = [];
  const depth = (nd, d) => { nd._d = d; (nd.children || []).forEach(c => depth(c, d + 1)); if (!nd.children) leaves.push(nd); };
  depth(root, 0);
  const maxD = Math.max(...leaves.map(l => l._d));
  leaves.forEach((l, i) => { l._y = 28 + i * 40; });
  const W = 400, xL = 236, x0 = 18;
  const place = (nd) => {
    if (!nd.children) { nd._x = xL; return; }
    nd.children.forEach(place);
    nd._y = (Math.min(...nd.children.map(c => c._y)) + Math.max(...nd.children.map(c => c._y))) / 2;
    nd._x = x0 + (xL - x0) * nd._d / (maxD + 0.6);
  };
  place(root);
  return { leaves, H: leaves.length * 40 + 16, W };
}
function phylo(body, t) {
  C.prefs.treeId = t.id; C.save();
  const all = []; const walk = (nd, par) => { nd._par = par; all.push(nd); (nd.children || []).forEach(c => walk(c, nd)); }; walk(t.root, null);
  const { H, W } = layoutTree(t.root);
  const chars = []; all.forEach(nd => (nd.chars || []).forEach(c => chars.push({ c, nd })));
  let mode = 'view', sel = null, quiz = null;
  const draw = () => {
    const branches = all.map((nd, k) => {
      const px = nd._par ? nd._par._x : nd._x - 14;
      const isQ = quiz && quiz.done.has(k);
      const ng = quiz && quiz.ng === k;
      return `<g class="tbr ${sel === nd ? 'sel' : ''} ${isQ ? 'okb' : ''} ${ng ? 'ngb' : ''}" data-k="${k}">
        ${nd._par ? `<path d="M${px.toFixed(1)} ${nd._par._y.toFixed(1)}V${nd._y.toFixed(1)}" class="tv"/>` : ''}
        <path d="M${px.toFixed(1)} ${nd._y.toFixed(1)}H${nd._x.toFixed(1)}" class="th"/>
        <rect x="${px.toFixed(1)}" y="${(nd._y - 12).toFixed(1)}" width="${Math.max(16, nd._x - px).toFixed(1)}" height="24" class="thit"/></g>`;
    }).join('');
    let ci = 0;
    const marks = mode === 'view' ? all.map(nd => {
      const n = (nd.chars || []).length;
      if (!n) return '';
      const px = nd._par ? nd._par._x : nd._x - 14, nums = nd.chars.map(() => ++ci).join('・'), w = 8 + nums.length * 6.5;
      const x = (px + nd._x) / 2;
      return `<g class="tch"><rect x="${(x - w / 2).toFixed(1)}" y="${(nd._y - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="4"/><text x="${x.toFixed(1)}" y="${(nd._y + 4).toFixed(1)}">${nums}</text></g>`;
    }).join('') : '';
    const labels = all.filter(nd => !nd.children).map(nd => `<g class="tleaf" data-k="${all.indexOf(nd)}"><text x="${nd._x + 6}" y="${nd._y + 4}" class="tl">${e(nd.name)}</text>${nd.ex ? `<text x="${nd._x + 6}" y="${nd._y + 17}" class="tex">${e(nd.ex)}</text>` : ''}</g>`).join('');
    const inner = all.filter(nd => nd.children && nd.name && mode === 'view').map(nd => `<text x="${(nd._x + 3).toFixed(1)}" y="${(nd._y - 6).toFixed(1)}" class="tin">${e(nd.name)}</text>`).join('');
    body.innerHTML = `<div class="chips">${L.tree.trees.map(x => `<button class="chipbtn ${x === t ? 'on' : ''}" data-t="${e(x.id)}">${e(x.title)}</button>`).join('')}</div>
      <p class="sub" style="margin:6px 0">${e(t.desc)}</p>
      <div class="segment n2" id="phm"><button data-m="view" class="${mode === 'view' ? 'on' : ''}">見る</button><button data-m="quiz" class="${mode === 'quiz' ? 'on' : ''}">形質はどの枝で？</button></div>
      <div class="tree-wrap"><svg viewBox="0 0 ${W} ${H}" class="phylo">${branches}${marks}${inner}${labels}</svg></div>
      <div id="tdet" class="panel zk-detail"></div>`;
    $$('#phm button', body).forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; sel = null; quiz = mode === 'quiz' ? { order: shuffle(chars), k: 0, done: new Set(), miss: 0, ng: -1 } : null; draw(); }));
    $$('[data-t]', body).forEach(b => b.addEventListener('click', () => phylo(body, L.tree.trees.find(x => x.id === b.dataset.t))));
    const det = $('#tdet');
    if (mode === 'view') {
      let n = 0;
      det.innerHTML = sel ? nodeDetail(sel) : `<ol class="tchars">${all.flatMap(nd => (nd.chars || []).map(c => `<li><b>${++n}</b>${e(c)}<small class="muted">（${e(nd.name || '')}）</small></li>`)).join('')}</ol><span class="muted small">枝や名前をタップすると説明が出ます。</span>`;
      $$('.tbr, .tleaf', body).forEach(g => g.addEventListener('click', () => { const nd = all[+g.dataset.k]; sel = sel === nd ? null : nd; draw(); }));
    } else {
      const q = quiz.order[quiz.k];
      if (!q) {
        const ok = chars.length - quiz.miss, isBest = record(`tree/${t.id}`, Math.max(0, ok) / chars.length);
        det.innerHTML = scoreHTML(Math.max(0, ok), chars.length, isBest) + '<button class="btn" id="tagain">もう一度</button>';
        $('#tagain').addEventListener('click', () => { quiz = { order: shuffle(chars), k: 0, done: new Set(), miss: 0, ng: -1 }; draw(); });
        return;
      }
      det.innerHTML = `<div class="lab-q">${quiz.k + 1} / ${chars.length}　<b>${e(q.c)}</b> を獲得したのはどの枝？</div><p class="muted small">その形質をもつグループすべての共通祖先につながる枝をタップ</p><div id="tfb"></div>`;
      $$('.tbr', body).forEach(g => g.addEventListener('click', () => {
        const k = +g.dataset.k;
        if (all[k] === q.nd) { C.play('correct'); quiz.done.add(k); quiz.k++; quiz.ng = -1; draw(); }
        else { C.play('wrong'); if (!quiz.missed?.has(q.c)) { quiz.miss++; (quiz.missed = quiz.missed || new Set()).add(q.c); } quiz.ng = k; draw(); $('#tfb').innerHTML = '<span class="ng-note">ちがいます。その枝の先のすべてがこの形質をもつかを考えよう。</span>'; }
      }));
    }
  };
  const nodeDetail = (nd) => {
    const leaves = []; const g = (x) => { if (!x.children) leaves.push(x.name); else x.children.forEach(g); }; g(nd);
    return `<div class="zk-dhead">${e(nd.name || leaves.join('・'))}</div>${nd.note ? `<p>${e(nd.note)}</p>` : ''}${nd.ex ? `<p class="muted small">例：${e(nd.ex)}</p>` : ''}
      ${(nd.chars || []).length ? `<p>この枝で獲得：<b>${nd.chars.map(e).join('、')}</b></p>` : ''}${nd.children ? `<p class="muted small">含むもの：${leaves.map(e).join('、')}</p>` : ''}`;
  };
  draw();
}
function fmtAge(t) {
  if (t >= 100) { const v = t / 100; return `約${Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, '')}億年前`; }
  return `約${Math.round(t * 100)}万年前`;
}
function eras(body) {
  const E = L.tree.eras;
  const evs = E.flatMap(x => x.events.map(ev => ({ ...ev, era: x.name })));
  let quiz = null;
  const draw = () => {
    body.innerHTML = `<div class="segment n2" id="em"><button data-m="view" class="${quiz ? '' : 'on'}">年表</button><button data-m="quiz" class="${quiz ? 'on' : ''}">古い順に並べる</button></div><div id="ebody"></div>`;
    $$('#em button', body).forEach(b => b.addEventListener('click', () => { quiz = b.dataset.m === 'quiz' ? newQuiz() : null; draw(); }));
    const eb = $('#ebody');
    if (!quiz) {
      eb.innerHTML = `<div class="eras">${E.map((x, i) => `<section class="era era${i}"><h3>${e(x.name)}<small>${fmtAge(x.from)}〜${x.to ? fmtAge(x.to) : '現在'}</small></h3>
        ${x.periods.length ? `<div class="periods">${x.periods.map(p => `<span class="chip plain">${e(p.name)}<small>${fmtAge(p.from)}〜</small></span>`).join('')}</div>` : ''}
        <ol class="events">${x.events.map(ev => `<li><time>${fmtAge(ev.t)}</time><span>${e(ev.text)}</span></li>`).join('')}</ol></section>`).join('')}</div>`;
      return;
    }
    const { items, seq, checked } = quiz;
    eb.innerHTML = `<p class="sub">古いできごとから順にタップしよう。</p>
      <div class="seq vert">${seq.length ? seq.map((i, k) => `<button class="chipbtn placed ${checked ? (items[i].ok === k ? 'okc' : 'ngc') : ''}" data-un="${i}"><b>${k + 1}</b>${e(items[i].text)}${checked ? `<small>${fmtAge(items[i].t)}</small>` : ''}</button>`).join('') : '<span class="muted small">ここに並びます</span>'}</div>
      <div class="opts pool">${items.map((it, i) => seq.includes(i) ? '' : `<button class="chipbtn" data-i="${i}">${e(it.text)}</button>`).join('')}</div>
      <div class="btn-row">${checked ? '<button class="btn primary" id="eagain">別の問題</button>' : `<button class="btn primary" id="echeck" ${seq.length === items.length ? '' : 'disabled'}>判定</button>`}</div><div id="eres"></div>`;
    $$('[data-i]', eb).forEach(b => b.addEventListener('click', () => { if (!checked) { seq.push(+b.dataset.i); C.play('tap'); draw(); } }));
    $$('[data-un]', eb).forEach(b => b.addEventListener('click', () => { if (!checked) { quiz.seq = seq.filter(x => x !== +b.dataset.un); draw(); } }));
    $('#eagain')?.addEventListener('click', () => { quiz = newQuiz(); draw(); });
    $('#echeck')?.addEventListener('click', () => {
      quiz.checked = true;
      const ok = quiz.seq.filter((i, k) => items[i].ok === k).length, isBest = record('tree/eras', ok / items.length);
      C.play(ok === items.length ? 'full' : 'wrong'); draw(); $('#eres').innerHTML = scoreHTML(ok, items.length, isBest);
    });
  };
  const newQuiz = () => {
    // 年代がはっきり離れた5つ
    let pick;
    for (let tries = 0; tries < 50; tries++) {
      pick = shuffle(evs).slice(0, 5).sort((a, b) => b.t - a.t);
      if (pick.every((x, i) => i === 0 || pick[i - 1].t / Math.max(x.t, 0.01) > 1.25)) break;
    }
    const items = shuffle(pick.map((x, i) => ({ ...x, ok: i })));
    return { items, seq: [], checked: false };
  };
  draw();
}
// 集団遺伝：ライト・フィッシャーのモデル（毎世代、選択のあと 2N 個の遺伝子を無作為に引き直す）
function popgen(body) {
  const P = C.prefs.pg || (C.prefs.pg = { p: 0.5, N: 50, s: 0, h: 0.5, gen: 100, reps: 6 });
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const binom = (n, p) => { if (n > 400) { const m = n * p, sd = Math.sqrt(n * p * (1 - p)); let g = 0; for (let i = 0; i < 12; i++) g += rnd(); return Math.max(0, Math.min(n, Math.round(m + sd * (g - 6)))); } let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; };
  const run = () => {
    seed = Math.floor(Math.random() * 1e9);
    const out = [];
    for (let r = 0; r < P.reps; r++) {
      let p = P.p; const line = [p];
      for (let g = 0; g < P.gen; g++) {
        const q = 1 - p, wAA = 1, wAa = 1 - P.h * P.s, waa = 1 - P.s;
        const wbar = p * p * wAA + 2 * p * q * wAa + q * q * waa;
        let p2 = (p * p * wAA + p * q * wAa) / wbar;
        p = P.N >= 10000 ? p2 : binom(2 * P.N, p2) / (2 * P.N);
        line.push(p);
      }
      out.push(line);
    }
    return out;
  };
  const draw = (lines) => {
    const W = 400, H = 220, x0 = 34, y0 = 12, w = W - x0 - 10, h = H - 40;
    const X = (g) => x0 + w * g / P.gen, Y = (p) => y0 + h - h * p;
    const cols = ['#2f7a34', '#3f7fd6', '#d9574a', '#e2903a', '#8a62c4', '#3c9a9a', '#a07a3a', '#c0475a'];
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="pg">${[0, 0.25, 0.5, 0.75, 1].map(v => `<path d="M${x0} ${Y(v)}H${x0 + w}" class="pgg"/><text x="${x0 - 4}" y="${Y(v) + 4}" class="pgt">${v}</text>`).join('')}
      ${[0, P.gen / 2, P.gen].map(g => `<text x="${X(g)}" y="${H - 12}" class="pgt c">${g}</text>`).join('')}<text x="${x0 + w / 2}" y="${H}" class="pgt c">世代</text>
      ${lines.map((l, i) => `<path d="${l.map((p, g) => (g ? 'L' : 'M') + X(g).toFixed(1) + ' ' + Y(p).toFixed(1)).join('')}" style="stroke:${cols[i % cols.length]}" class="pgl"/>`).join('')}</svg>`;
    const p = P.p, q = 1 - p;
    const fix = lines.filter(l => l[l.length - 1] >= 0.999).length, lost = lines.filter(l => l[l.length - 1] <= 0.001).length;
    $('#pgplot').innerHTML = svg + `<p class="muted small">遺伝子 A の頻度 p の変化（${P.reps}回の試行）。最後に A だけになった：${fix}回、A がなくなった：${lost}回</p>`;
    $('#pghw').innerHTML = `<div class="hwbar"><span style="flex:${p * p}">AA ${(p * p).toFixed(2)}</span><span style="flex:${2 * p * q}">Aa ${(2 * p * q).toFixed(2)}</span><span style="flex:${q * q}">aa ${(q * q).toFixed(2)}</span></div>
      <p class="muted small">はじめの集団がハーディ・ワインベルグ平衡なら、遺伝子型の頻度は p²：2pq：q²（p = ${p.toFixed(2)}）。</p>`;
  };
  body.innerHTML = `<p class="sub">集団の大きさが小さいほど、偶然による遺伝子頻度のゆらぎ（遺伝的浮動）が大きくなります。aa に不利な選択をかけると、A の頻度が上がっていきます。</p>
    <div class="panel pgctl">
      <label>はじめの A の頻度 p <b id="vp">${P.p}</b><input type="range" id="ip" min="0.05" max="0.95" step="0.05" value="${P.p}"></label>
      <label>集団の大きさ N（個体）<select id="iN">${[10, 50, 200, 1000, 10000].map(v => `<option value="${v}" ${v === P.N ? 'selected' : ''}>${v === 10000 ? 'とても大きい（浮動なし）' : v}</option>`).join('')}</select></label>
      <label>aa の不利さ s（自然選択）<b id="vs">${P.s}</b><input type="range" id="is" min="0" max="0.5" step="0.05" value="${P.s}"></label>
      <label>A の顕性の度合い（Aa の不利さ ＝ h × s）<select id="ih">${[[0, 'A が完全顕性（h=0）'], [0.5, '中間（h=0.5）'], [1, 'A が潜性（h=1）']].map(([v, l]) => `<option value="${v}" ${v === P.h ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn primary block" id="pgrun">もう一度ためす</button>
    </div>
    <div id="pgplot" class="pg-wrap"></div><h3 class="zk-label">ハーディ・ワインベルグの法則</h3><div id="pghw"></div>`;
  const re = () => { C.save(); draw(run()); };
  $('#ip').addEventListener('input', (ev) => { P.p = +ev.target.value; $('#vp').textContent = P.p; re(); });
  $('#is').addEventListener('input', (ev) => { P.s = +ev.target.value; $('#vs').textContent = P.s; re(); });
  $('#iN').addEventListener('change', (ev) => { P.N = +ev.target.value; re(); });
  $('#ih').addEventListener('change', (ev) => { P.h = +ev.target.value; re(); });
  $('#pgrun').addEventListener('click', re);
  draw(run());
}
function ranks(body) {
  const R = L.tree.ranks;
  let quiz = null;
  const draw = () => {
    body.innerHTML = `<p class="sub">生物は、大きいまとまりから順に ${R.ranks.map(e).join('・')} の階級で分類します。種の学名は属名と種小名で書きます（二名法）。</p>
      <div class="rank-wrap"><table class="rank-table"><thead><tr><th>階級</th>${R.examples.map(x => `<th>${e(x.name)}<small><i>${e(x.sci)}</i></small></th>`).join('')}</tr></thead>
      <tbody>${R.ranks.map((r, i) => `<tr><th>${e(r)}</th>${R.examples.map(x => `<td>${e(x.path[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <h2>階級を大きい順に並べる</h2>
      <div class="seq">${quiz.seq.length ? quiz.seq.map((i, k) => `<button class="chipbtn placed ${quiz.checked ? (i === k ? 'okc' : 'ngc') : ''}" data-un="${i}"><b>${k + 1}</b>${e(R.ranks[i])}</button>`).join('<span class="gt">＞</span>') : '<span class="muted small">ここに並びます</span>'}</div>
      <div class="opts pool">${quiz.pool.filter(i => !quiz.seq.includes(i)).map(i => `<button class="chipbtn" data-i="${i}">${e(R.ranks[i])}</button>`).join('')}</div>
      <div class="btn-row">${quiz.checked ? '<button class="btn" id="ragain">もう一度</button>' : `<button class="btn primary" id="rcheck" ${quiz.seq.length === R.ranks.length ? '' : 'disabled'}>判定</button>`}</div><div id="rres"></div>`;
    $$('[data-i]', body).forEach(b => b.addEventListener('click', () => { if (!quiz.checked) { quiz.seq.push(+b.dataset.i); draw(); } }));
    $$('[data-un]', body).forEach(b => b.addEventListener('click', () => { if (!quiz.checked) { quiz.seq = quiz.seq.filter(x => x !== +b.dataset.un); draw(); } }));
    $('#ragain')?.addEventListener('click', () => { quiz = fresh(); draw(); });
    $('#rcheck')?.addEventListener('click', () => {
      quiz.checked = true; const ok = quiz.seq.filter((x, k) => x === k).length, isBest = record('tree/ranks', ok / R.ranks.length);
      C.play(ok === R.ranks.length ? 'full' : 'wrong'); draw(); $('#rres').innerHTML = scoreHTML(ok, R.ranks.length, isBest);
    });
  };
  const fresh = () => ({ pool: shuffle(R.ranks.map((r, i) => i)), seq: [], checked: false });
  quiz = fresh();
  draw();
}
