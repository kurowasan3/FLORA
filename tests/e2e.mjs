// ブラウザでの通し操作（Playwright・Chromium、iPhone 幅 390×844）
//   node tests/e2e.mjs
// 出題形式ごとの採点、学ぶの5つの機能、一部のデータだけ古いときの警告、オフライン、同期を確かめる。
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createMockSupabase } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
let fakeDataVersion = null;
const mock = createMockSupabase({ key: 'sb_publishable_e2e' });   // 同期のテスト用（このサーバーの /mock/ で応える）   // Service Worker のテスト用：index.json の dataVersion を差し替える
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/mock/')) {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', async () => {
      const r = await mock.handle({ method: req.method, url: req.url, headers: req.headers, body: body || null });
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(r.body);
    });
    return;
  }
  if (p === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    const v = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').match(/FILE_VERSION = '([^']+)'/)[1];
    return res.end(`export const FILE_VERSION = '${v}';
export const SUPABASE_URL = 'http://localhost:${server.address().port}/mock';
export const SUPABASE_KEY = 'sb_publishable_e2e';`);
  }
  if (fakeDataVersion && p === '/data/index.json') {
    const d = JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); d.dataVersion = fakeDataVersion;
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(d));
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const U = `http://localhost:${server.address().port}/`;

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const browser = await chromium.launch();

async function newPage({ state = null, route = null, sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: sw ? 'allow' : 'block' });
  if (state) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('flora.v1', s); } }, JSON.stringify(state));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  page.requested = [];
  page.on('request', r => page.requested.push(new URL(r.url()).pathname));
  if (route) await route(page);
  return page;
}
const next = (page) => page.locator('button:has-text("次")').first().click();

try {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/state-v1.json'), 'utf8'));
  const LS = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('flora.v1')));
  const conf = (page) => page.locator('#conf button').nth(1).click();
  // 1. 起動・タブ・出題形式を入力して採点
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    const tabs = await page.locator('.tabbar a span').allInnerTexts();
    ok(tabs.join() === '今日,学ぶ,カード,定着度,設定', `タブが生物版の構成 ${tabs}`);
    ok(await page.locator('#lv button').count() === 6, '難易度ボタンが6つ');
    ok(await page.locator('.fmt-card').count() === 8 && await page.locator('.fmt-card:disabled').count() === 0, '「形式ごとに演習」に8つの形式があり、すべて問題がある');
    ok(await page.locator('.banner').count() === 0, '起動時に警告が出ない');
    await page.evaluate("__flora.open(['CEL-CST-002', 'CEL-CST-004', 'GEN-MIT-001', 'GEN-BIO-003', 'CEL-CST-007', 'GEN-MEI-004', 'HOM-GLU-002'])"); await page.waitForTimeout(1200);
    // 図の名称（図つき・語句）
    await conf(page);
    ok(await page.locator('.question figure.pfig svg .pin').count() === 4, '図の名称：問題の図に ア〜エ の印');
    ok(await page.locator('.question figure.pfig .fig-body.paper').count() === 0, '学ぶの図からつくった問題の図はテーマに合わせて塗る（白い紙にしない）');
    const inp = page.locator('#inputs input');
    ok(await inp.count() === 4 && await page.locator('#kp').count() === 0, '図の名称：4つの欄、語句だけなのでキーは出ない');
    for (const [i, v] of ['核小体', 'ゴルジ体', '中心体', 'りそそーむ'].entries()) await inp.nth(i).fill(v);
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '語句：ひらがなでもカタカナの答えと一致して完答');
    ok(await page.locator('.zk-open').count() === 1 && (await page.locator('.zk-open').innerText()).includes('学ぶで確かめる'), '解いたあとに「学ぶで確かめる」');
    await next(page); await page.waitForTimeout(900);
    // 正誤・選択（すべて選ぶ）
    await conf(page);
    ok(await page.locator('.field.pick .opt').count() === 6, 'すべて選ぶ：選択肢が6つ');
    for (const i of [0, 1, 2]) await page.locator('.field.pick .opt').nth(i).click();
    await page.click('#judge'); await page.waitForTimeout(500);
    ok((await page.locator('#feedback').innerText()).includes('違う'), 'すべて選ぶ：間違いを含むと不正解');
    await page.locator('.field.pick .opt').nth(2).click(); await page.locator('.field.pick .opt').nth(3).click();
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), 'すべて選ぶ：選び直して正解（2回目）');
    await next(page); await page.waitForTimeout(900);
    // 順序（並べかえ）
    await conf(page);
    for (const t of ['前期', '中期', '後期', '終期']) await page.locator(`.field.order .pool button:has-text("${t}")`).click();
    ok(await page.locator('.field.order .placed').count() === 4, '順序：タップした順に並ぶ');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '順序：前期 → 中期 → 後期 → 終期 で完答');
    await next(page); await page.waitForTimeout(900);
    // 計算（整数）
    await conf(page);
    ok(await page.locator('.field.short').count() === 1, '計算：整数の答えは小さな欄');
    await page.locator('#inputs input').first().fill('1024');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '計算：整数');
    await next(page); await page.waitForTimeout(900);
    // 計算（有効数字つき）
    await conf(page);
    await page.locator('#inputs input').first().fill('90');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '計算：単位つきの数値');
    await next(page); await page.waitForTimeout(900);
    // 計算（比）
    await conf(page);
    await page.locator('#inputs input').first().fill('9:3:3:1');
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '計算：分離比 9:3:3:1');
    await next(page); await page.waitForTimeout(900);
    // 因果関係（増える・減る）
    await conf(page);
    ok(await page.locator('.field.pick').count() === 3, '因果関係：3つの量それぞれで増減を選ぶ');
    for (const [k, i] of [[0, 1], [1, 0], [2, 0]]) await page.locator('.field.pick').nth(k).locator('.opt').nth(i).click();
    await page.click('#judge'); await page.waitForTimeout(800);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '因果関係：インスリン↓・グルカゴン↑・アドレナリン↑ で完答');
    await page.locator('.zk-open').click(); await page.waitForTimeout(1500);
    ok(page.url().includes('#learn=causal/glucose') && await page.locator('.cnet .cnode').count() === 8, '「学ぶで確かめる」で血糖濃度の因果のネットワークが開く');
    const st = await LS(page);
    ok(['CEL-CST-002', 'CEL-CST-004', 'GEN-MIT-001', 'GEN-BIO-003', 'CEL-CST-007', 'GEN-MEI-004', 'HOM-GLU-002'].every(id => st.pstat[id]), '結果が問題ID で記録される');
    ok(st.log.find(l => l.p === 'CEL-CST-004').g === 2, '2回目で正解した問題は「一部・ヒントあり」と同じ扱い');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 2. 学ぶの5つの機能
  {
    const page = await newPage();
    await page.goto(U + '#learn'); await page.waitForTimeout(1200);
    ok(await page.locator('.zk-card').count() === 6, '学ぶのトップに5つの機能＋法則');
    const L = await page.evaluate(async () => (await fetch('data/learn.json')).json());
    // 図へのラベル付け
    await page.goto(U + '#learn=labels'); await page.waitForTimeout(1500);
    ok(await page.locator('.lab-card').count() === L.diagrams.length && await page.locator('.lab-thumb svg').count() === L.diagrams.length, `図の一覧（${L.diagrams.length}枚、サムネイルつき）`);
    await page.goto(U + '#learn=labels/heart'); await page.waitForTimeout(1200);
    const heart = L.diagrams.find(d => d.id === 'heart');
    ok(await page.locator('#lfig svg .pin').count() === heart.pins.length && await page.locator('.lab-legend li').count() === heart.pins.length, '見る：番号と名前の一覧');
    await page.locator('#lfig .pin').nth(2).click(); await page.waitForTimeout(200);
    ok(await page.locator('.lab-legend li.on').count() === 1, '見る：番号をタップすると一覧の名前が選ばれる');
    await page.locator('#lmode button[data-t="name"]').click(); await page.waitForTimeout(300);
    for (let k = 0; k < heart.pins.length; k++) {
      const n = +(await page.locator('.lab-q b').innerText());
      if (k === 0) { await page.locator('.lab-bank button:not([disabled])').filter({ hasNotText: heart.pins[n - 1].label }).first().click(); await page.waitForTimeout(100); }
      await page.locator(`.lab-bank button[data-w="${heart.pins[n - 1].label}"]`).click(); await page.waitForTimeout(80);
    }
    ok((await page.locator('#lside .result').innerText()).includes(`${heart.pins.length - 1} / ${heart.pins.length}`), '名前を答える：1つ間違えると、その部分は得点にならない');
    await page.locator('#lmode button[data-t="place"]').click(); await page.waitForTimeout(300);
    const q = (await page.locator('.lab-q b').innerText()).trim();
    const right = heart.pins.findIndex(p => p.label === q), wrong = right === 0 ? 1 : 0;
    await page.locator('#lfig .pin').nth(wrong).click(); await page.waitForTimeout(150);
    ok((await page.locator('#lfb').innerText()).includes('ちがいます'), '位置を答える：違う場所を押すと、それが何かを教える');
    await page.locator('#lfig .pin').nth(right).click(); await page.waitForTimeout(150);
    ok(await page.locator('#lfig .pin.ok').count() === 1, '位置を答える：正しい場所で緑になる');
    // 用語カード
    await page.goto(U + '#cards'); await page.waitForTimeout(1200);
    ok(await page.locator('.tabbar a.on span').innerText() === 'カード', 'カードのタブ');
    ok(await page.locator('.cterm').count() > 100, `用語の一覧（${await page.locator('.cterm').count()}語）`);
    await page.selectOption('#cdeck', 'GEN-06'); await page.waitForTimeout(1000);
    const nDeck = L.terms.filter(t => t.unit === 'GEN-06').length;
    ok(await page.locator('.cterm').count() === nDeck, '単元で絞り込める');
    await page.click('#cnew'); await page.waitForTimeout(500);
    for (let i = 0; i < Math.min(10, nDeck); i++) {
      await page.click('#flash'); await page.waitForTimeout(80);
      if (i === 0) ok(await page.locator('.grade4 button').count() === 4 && (await page.locator('.flash').innerText()).length > 20, 'めくると意味と4段階の評価');
      await page.locator(`.grade4 button[data-g="${i === 0 ? 1 : 3}"]`).click(); await page.waitForTimeout(80);
    }
    await page.click('#flash'); await page.waitForTimeout(80); await page.locator('.grade4 button[data-g="3"]').click(); await page.waitForTimeout(200);
    ok((await page.locator('#view').innerText()).includes('おつかれさま'), '「もう一度」のカードはセッションの後半にもう一度出る');
    const cs = (await LS(page)).cstat;
    ok(Object.keys(cs).length === Math.min(10, nDeck) && Object.values(cs).every(x => x.reps === 1), '用語カードの記憶の状態がカードごとに記録される');
    // アニメーション
    await page.goto(U + '#learn=anim'); await page.waitForTimeout(1200);
    ok(await page.locator('.lab-card').count() === L.anims.length, `アニメーションの一覧（${L.anims.length}本）`);
    await page.goto(U + '#learn=anim/mitosis'); await page.waitForTimeout(1000);
    await page.click('#aplay'); await page.waitForTimeout(1200);
    ok(+(await page.locator('#aseek').inputValue()) > 0.1, '再生すると進む');
    await page.click('#anext'); await page.waitForTimeout(200);
    ok((await page.locator('.anim-step').innerText()).startsWith('2 / 7') && await page.locator('#asvg path').count() > 5, '次の段階へ進める（描画あり）');
    await page.locator('#astages li').nth(3).click(); await page.waitForTimeout(200);
    ok((await page.locator('.anim-step').innerText()).includes('中期'), '段階の名前をタップするとその段階へ');
    await page.locator('#amode button[data-t="order"]').click(); await page.waitForTimeout(300);
    const mit = L.anims.find(a => a.id === 'mitosis');
    for (const s of mit.stages) { await page.locator('#abody .pool button', { hasText: s.name }).first().click(); await page.waitForTimeout(50); }
    await page.click('#ocheck'); await page.waitForTimeout(300);
    ok((await page.locator('#ores').innerText()).includes('7 / 7'), '順に並べる：正しく並べると満点');
    // 因果関係
    await page.goto(U + '#learn=causal'); await page.waitForTimeout(1000);
    ok(await page.locator('a.clink').count() === L.causal.length, `因果関係の一覧（${L.causal.length}）`);
    await page.goto(U + '#learn=causal/glucose'); await page.waitForTimeout(1000);
    const sc = L.causal.find(n => n.id === 'glucose').scenarios[0];
    for (const id of sc.ask) { const g = page.locator(`.cnode[data-n="${id}"]`); await g.click(); if (sc.ans[id] < 0) await page.locator(`.cnode[data-n="${id}"]`).click(); await page.waitForTimeout(60); }
    await page.click('#ccheck'); await page.waitForTimeout(3500);
    ok((await page.locator('#cres').innerText()).includes(`${sc.ask.length} / ${sc.ask.length}`), '増減を予測する：すべて当てると満点（伝わる順に表示）');
    ok(await page.locator('.cnet .cedge.on').count() >= sc.ask.length, '答え合わせで、変化が伝わる矢印が強調される');
    await page.locator('#cmode button[data-t="trace"]').click(); await page.waitForTimeout(300);
    await page.locator('.cnode[data-n="ins"]').click(); await page.waitForTimeout(200);
    ok((await page.locator('#cdet').innerText()).includes('これを変えるもの'), 'つながりをたどる：四角をタップすると原因と結果');
    // 系統・分類・進化
    await page.goto(U + '#learn=tree/animals'); await page.waitForTimeout(1000);
    ok(await page.locator('.phylo .tleaf').count() === 10 && await page.locator('.phylo .tch').count() >= 8, '系統樹：葉と形質の印');
    await page.locator('#phm button[data-m="quiz"]').click(); await page.waitForTimeout(200);
    ok((await page.locator('#tdet').innerText()).includes('どの枝'), '形質はどの枝で？：問題が出る');
    await page.locator('#tmode button[data-t="eras"]').click(); await page.waitForTimeout(300);
    ok(await page.locator('.era').count() === 4 && (await page.locator('.eras').innerText()).includes('約5.4億年前'), '地質時代の年表');
    await page.locator('#tmode button[data-t="popgen"]').click(); await page.waitForTimeout(300);
    ok(await page.locator('.pg .pgl').count() === 6 && await page.locator('.hwbar span').count() === 3, '集団遺伝：遺伝子頻度の変化とハーディ・ワインベルグの比');
    await page.selectOption('#iN', '10000'); await page.waitForTimeout(200);
    ok((await page.locator('#pgplot').innerText()).includes('A だけになった：0回、A がなくなった：0回'), '集団がとても大きく選択がないと、遺伝子頻度は変わらない');
    await page.locator('#tmode button[data-t="ranks"]').click(); await page.waitForTimeout(300);
    ok(await page.locator('.rank-table tbody tr').count() === 8, '分類の階級の表');
    await page.goto(U + '#learn=labels/heart'); await page.waitForTimeout(1000);
    await page.locator('.zk-prob').click(); await page.waitForTimeout(1200);
    ok(await page.locator('#conf button').count() === 3, '学ぶから関連する問題を解ける');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 3. 自己採点を含む問題・法則・設定・定着度
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__flora.open(['CEL-CST-008'])"); await page.waitForTimeout(1000);
    await conf(page);
    ok(await page.locator('.field.self').count() === 1, '記述の小問は自己採点');
    for (const t of ['粗面小胞体', 'ゴルジ体', '分泌小胞', '細胞外']) await page.locator(`.field.order .pool button:has-text("${t}")`).click();
    await page.click('#judge'); await page.waitForTimeout(600);
    ok(await page.locator('#self button').count() === 3 && await page.locator('#solbox').count() === 1, '記述の小問があると、解説を見てから自己採点');
    await page.locator('#self button').first().click(); await page.waitForTimeout(400);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '自動採点と自己採点を合わせて完答');
    await page.goto(U + '#concepts'); await page.waitForTimeout(800);
    ok(await page.locator('a.law').count() === 14 && await page.locator('.tabbar a.on span').innerText() === '学ぶ', '法則の一覧（14件）は「学ぶ」の中');
    await page.goto(U + '#law=hardy-weinberg'); await page.waitForTimeout(1000);
    ok(await page.locator('ol.derivation li.open').count() === 1, '法則のページ：導出は1段目だけ開いている');
    await page.click('#dall'); await page.waitForTimeout(200);
    ok(await page.locator('ol.derivation li:not(.open)').count() === 0 && await page.locator('.law-page .katex').count() > 5, 'すべて表示で導出が全部出る');
    await page.goto(U + '#law=segregation'); await page.waitForTimeout(800);
    ok((await page.locator('.law-page').innerText()).includes('この法則の根拠'), '実験から得た法則は根拠を出す');
    await page.goto(U + '#settings'); await page.waitForTimeout(600);
    await page.locator('.segment.theme button:has-text("ダーク")').click();
    ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'ダークモード');
    await page.goto(U + '#learn=labels/eye'); await page.waitForTimeout(1000);
    ok(await page.locator('#lfig svg .pin').count() > 5, 'ダークモードでも図が出る');
    await page.goto(U + '#map'); await page.waitForTimeout(600);
    ok((await page.locator('#view').innerText()).includes('定着度'), '定着度画面');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 4. 学習記録のある端末：CSV・続きに記録
  {
    const page = await newPage({ state: fixture });
    await page.goto(U + '#settings'); await page.waitForTimeout(1200);
    const dl = page.waitForEvent('download');
    await page.click('#csvall');
    const csv = fs.readFileSync(await (await dl).path(), 'utf8');
    ok(csv.split('\n').filter(l => l.trim()).length === fixture.log.length + 1, `CSV に記録 ${fixture.log.length}件がすべて出る`);
    await page.evaluate("__flora.open(['GEN-DNA-002'])"); await page.waitForTimeout(1000);
    await conf(page);
    await page.locator('#inputs input').first().fill('20');
    await page.click('#judge'); await page.waitForTimeout(600);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '記録のある端末で解ける');
    const st = await LS(page);
    ok(Object.keys(fixture.pstat).every(k => st.pstat[k]), '前の復習状態がすべて残る');
    ok(st.log.length === fixture.log.length + 1, '学習記録が続きに足される');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 5. 一部の data/ だけ古い
  {
    const page = await newPage({ route: (p) => p.route('**/data/f-CEL-01.json', async (r) => {
      const res = await r.fetch(); const d = await res.json(); d._meta = { dataVersion: 'old000000000' };
      await r.fulfill({ response: res, body: JSON.stringify(d) });
    }) });
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__flora.open(['CEL-CST-001'])"); await page.waitForTimeout(800);
    const b = page.locator('.banner');
    ok(await b.count() === 1 && (await b.innerText()).includes('data/f-CEL-01.json'), '古い本文ファイルを読むと警告が出る');
    ok(await page.locator('#inputs input').count() > 0, '警告が出ても問題は解ける');
  }
  // 6. 検索・問題セット・共有リンク
  {
    const page = await newPage({ state: fixture });
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    ok(await page.locator('#sets .set-card').count() === 3, '今日の画面に問題セット3つ');
    await page.fill('#sq', '組換え価'); await page.press('#sq', 'Enter'); await page.waitForTimeout(1200);
    ok(await page.locator('.res-row').count() >= 2, '検索できる');
    await page.goto(U + '#set=col-cell-start'); await page.waitForTimeout(1500);
    ok(page.url().endsWith('#today') && await page.locator('#conf button').count() === 3, '#set= のリンクで問題セットが始まる');
    await page.goto(U + '#ids=HOM-GLU-002'); await page.waitForTimeout(1500);
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes('体内環境・血糖・体温の調節')), '#ids= のリンクで指定の問題が出る');
    await page.goto(U + '#today'); await page.waitForTimeout(800);
    ok(await page.locator('#conf button').count() === 3 || await page.locator('.hero').count() === 1, '今日の画面へ戻れる');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 7'. Service Worker：自分のキャッシュだけを管理し、同じドメインの他のアプリのキャッシュは消さない。オフラインでも問題・学ぶが使える
  {
    const page = await newPage({ sw: true });
    await page.goto(U + '#today');
    await page.evaluate(async () => { await (await caches.open('lemma-v0.9.0')).put('/x', new Response('lemma')); await (await caches.open('celestia-v0.5.0')).put('/y', new Response('c')); });
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    await page.reload(); await page.waitForTimeout(1200);
    await page.evaluate("__flora.open(['CEL-CST-001'])"); await page.waitForTimeout(1500);
    await page.goto(U + '#learn=labels/heart'); await page.waitForTimeout(1500);
    const v = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8')).dataVersion;
    const keys = await page.evaluate(async () => caches.keys());
    ok(keys.includes('flora-data-' + v) && keys.includes('flora-v0.1.0'), `コード用とデータ用のキャッシュ ${keys}`);
    ok(keys.includes('lemma-v0.9.0') && keys.includes('celestia-v0.5.0'), '同じドメインの他のアプリのキャッシュを消さない');
    await page.context().setOffline(true);
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate("__flora.open(['CEL-CST-001'])"); await page.waitForTimeout(1500);
    ok(await page.locator('#inputs input').count() === 1, 'オフラインでも開いた問題が解ける');
    await page.goto(U + '#learn=labels/heart'); await page.waitForTimeout(1500);
    ok(await page.locator('#lfig svg .pin').count() === 10, 'オフラインでも学ぶの図が使える');
    await page.context().setOffline(false);
    fakeDataVersion = 'e2enewversion';
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    await page.evaluate(async () => fetch('data/index.json', { cache: 'no-cache' }));
    await page.waitForTimeout(500);
    const keys2 = await page.evaluate(async () => caches.keys());
    ok(keys2.includes('flora-data-e2enewversion') && !keys2.includes('flora-data-' + v) && keys2.includes('lemma-v0.9.0'), `データの版が変わると自分の古いデータ用キャッシュだけを消す ${keys2}`);
    fakeDataVersion = null;
  }
  // 7. アカウントと同期：2台の端末でログインすると記録が合わさる（にせ Supabase）
  {
    const login = async (page) => {
      await page.goto(U + '#settings'); await page.waitForTimeout(1500);
      await page.fill('#acct-email', 'me@example.com'); await page.click('#acct-send'); await page.waitForTimeout(500);
      await page.fill('#acct-code', '123456'); await page.click('#acct-verify'); await page.waitForTimeout(1500);
    };
    const A = await newPage({ state: { ...fixture, log: fixture.log.slice(0, 25) } });
    await login(A);
    ok((await A.locator('#acct').innerText()).includes('Lemma と共通'), 'アカウントが Lemma と共通であることを表示');
    const B = await newPage({ state: { ...fixture, log: fixture.log.slice(20) } });
    await login(B);
    const nB = (await LS(B)).log.length;
    ok(nB === fixture.log.length, `端末B：両方の端末の記録が合わさる（${nB}件）`);
    ok(await B.evaluate(() => !!localStorage.getItem('flora.auth') && !localStorage.getItem('lemma.auth')), 'ログイン情報は flora.auth に保存（Lemma と別）');
    ok([...mock.rows.values()][0] && mock.rows.size === 1, 'サーバーの表 flora_state に1行');
    const real = (es) => es.filter(e => !/status of 403/.test(e));
    ok(real(A.errors).length === 0 && real(B.errors).length === 0, `ページのエラーなし ${A.errors} ${B.errors}`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`e2e: ${pass} 件 OK${fail ? `、${fail} 件失敗` : ''}`);
process.exitCode = fail ? 1 : 0;
