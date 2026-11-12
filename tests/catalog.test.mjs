// catalog.js の単体テスト（ブラウザなしで data/ を読む）
//   node tests/catalog.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// catalog.js は相対 URL で fetch するので、リポジトリのファイルを返す fetch に差し替える
globalThis.fetch = async (url) => {
  const p = path.join(root, String(url));
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
  const text = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};
const CAT = await import('../js/catalog.js');

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };

const meta = await CAT.loadCatalog();
const idx = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8'));
ok(meta.ok && meta.format === 'flora.data/1', '問題データを読めること');
ok(CAT.ENTRIES.length === idx.count, `ENTRIES の数 ${CAT.ENTRIES.length} = ${idx.count}`);
ok(meta.warnings.length === 0, `形式の警告がないこと ${meta.warnings}`);
ok(CAT.FIELDS.every(f => f.subject && f.fieldKey && /^[A-Z]{3}-\d{2}$/.test(f.key)), '単元は「分野 → 単元」の形');
ok(CAT.LEVELS[2] === '入試基礎' && CAT.SUBJECT_ORDER[0] === '細胞と分子', '難易度と分野の並びをデータから読む');
const tax = JSON.parse(fs.readFileSync(path.join(root, 'content/taxonomy.json'), 'utf8'));
const emptyUnits = tax.units.filter(u => !CAT.ENTRIES.some(e => e.f === u.key)).map(u => u.key);
ok(emptyUnits.length === 0, `すべての単元に問題がある（ない単元：${emptyUnits}）`);
// 出題形式：すべての形式に問題がある
ok(CAT.FORMATS.every(fm => CAT.pool({ formats: [fm.id] }).length > 0), `すべての出題形式に問題がある（${CAT.FORMATS.map(fm => fm.name + ' ' + CAT.pool({ formats: [fm.id] }).length).join('・')}）`);
ok(CAT.pool({ formats: ['causal'] }).every(e => e.fm.includes('causal')), 'pool() の形式の絞り込み');
// 学ぶ
const L = await CAT.loadLearn();
ok(L.terms.length >= 300 && L.diagrams.length >= 15 && L.anims.length >= 10 && L.causal.length >= 10 && L.tree.trees.length >= 4, `学ぶのデータを読める（用語 ${L.terms.length}・図 ${L.diagrams.length}・アニメ ${L.anims.length}・因果 ${L.causal.length}）`);
ok(L.diagrams.every(d => fs.existsSync(path.join(root, d.src))), '図の SVG がそろっている');
ok(L.causal.every(n => n.scenarios.every(s => s.ask.every(k => s.ans[k] === 1 || s.ans[k] === -1))), '因果の予測の答えがすべて ↑ か ↓ に決まっている');
// アニメーション：段階の数が描画プログラムと一致
const AN = await import('../js/anim.js');
ok(L.anims.every(a => AN.ANIMS[a.id] && AN.ANIMS[a.id].n === a.stages.length), `アニメーションの段階の数が js/anim.js と一致（${L.anims.map(a => a.id + ':' + a.stages.length + '/' + (AN.ANIMS[a.id] || {}).n).join(' ')}）`);
let frameBad = 0;
for (const a of L.anims) for (let s = 0; s < a.stages.length; s++) for (const u of [0, 0.33, 0.5, 0.77, 1]) {
  const svg = AN.frame(a.id, s, u);
  if (!svg || /NaN|undefined|Infinity/.test(svg)) { frameBad++; if (frameBad < 4) console.log('  frame', a.id, s, u, (svg.match(/.{30}(NaN|undefined|Infinity).{10}/) || [])[0]); }
}
ok(frameBad === 0, 'アニメーションのすべての段階を NaN なしで描ける');
// 因果の計算：JS と Python（build_data.py）の結果が一致
const LJS = await import('../js/learn.js').catch(() => null);
if (LJS) ok(L.causal.every(n => n.scenarios.every(s => s.ask.every(k => LJS.propagate(n, s.start, s.dir).res[k] === s.ans[k]))), '因果の予測：js/learn.js と tools/biolib.py の計算が一致');
const lnBad = CAT.ENTRIES.filter(e => e.ln && !['labels', 'cards', 'anim', 'causal', 'tree', 'laws'].includes(e.ln.split('/')[0]));
ok(lnBad.length === 0, `問題の学ぶリンクのページが正しい（だめ ${lnBad.map(e => e.id)}）`);

ok(CAT.pool({ levels: [0] }).length > 0, 'pool() で基礎の問題がとれる');
const st = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/state-v1.json'), 'utf8'));
ok(CAT.pickPractice(st, { size: 3 }).length === 3, 'pickPractice()');
ok(Array.isArray(CAT.pickReview(st, { size: 5 })), 'pickReview()');

// 全問の本文を読み、共通ビューが作れること
await CAT.ensureBodies(CAT.ENTRIES.map(e => e.id));
ok(CAT.staleDataFiles().length === 0, `本文ファイルの版が揃っていること ${CAT.staleDataFiles()}`);
let bad = 0;
for (const e of CAT.ENTRIES) {
  const p = CAT.getProblem(e.id);
  const good = p && p.id === e.id && p.field === e.f && p.level === e.lv && p.subject && p.fieldName && p.html && p.html.q
    && (!!p.grading === !!e.in) && (!p.grading || typeof p.grading.spec === 'string') && p.figs && typeof p.figs === 'object';
  if (!good) { bad++; if (bad < 5) console.log('  bad', e.id, p && Object.keys(p)); }
}
ok(bad === 0, `getProblem() が全 ${CAT.ENTRIES.length}問で正しい形（だめ ${bad}問）`);
ok(CAT.getProblem('no-such-id') === undefined, '無い ID は undefined');
ok(CAT.getBody('_meta') === undefined, '_meta を本文として登録しないこと');

// 図：本文の枠と figs の対応。問題文に解答用の図の枠が無いこと
let figBad = 0;
for (const e of CAT.ENTRIES) {
  const b = CAT.getBody(e.id), figs = b.figs || {};
  const refs = (html) => [...html.matchAll(/data-fig="([^"]+)"/g)].map(m => m[1]);
  for (const r of refs(b.q)) if (!figs[r] || figs[r].role === 'answer') { figBad++; console.log('  問題文の図', e.id, r); }
  for (const r of refs(b.s)) if (!figs[r]) { figBad++; console.log('  解説の図', e.id, r); }
  for (const f of Object.values(figs)) if (f.src && !fs.existsSync(path.join(root, f.src))) { figBad++; console.log('  ファイル', e.id, f.src); }
}
ok(figBad === 0, '図の枠・情報・ファイルがそろい、問題文に解答用の図が無い');

// 概念・法則・誤概念
const K = await CAT.loadKnowledge();
ok(K.concepts.length && K.concept['mendel'] && K.law['hardy-weinberg'] && K.misconception['MC-ENZ-HEAT'], 'knowledge.json を読める');
ok(CAT.ENTRIES.every(e => (e.c || []).every(c => K.concept[c]) && (e.m || []).every(m => K.misconception[m])), '問題の概念・誤概念がすべて knowledge.json にある');

// 学習記録のサンプルが今のデータで使えること
const ids = new Set([...Object.keys(st.pstat), ...Object.keys(st.problems), ...st.log.map(l => l.p)]);
const missing = [...ids].filter(i => !CAT.entryById.has(i));
ok(missing.length === 0, `記録にある問題ID がすべてある（無い ${missing.slice(0, 5)}）`);
ok(st.practice.fields.every(k => CAT.fieldByKey[k]), '記録にある単元ID がすべてある');

// 検索・問題セット
ok(CAT.normText('最大・最小') === CAT.normText('最大最小') && CAT.normText('ＡＢ　c') === 'abc', 'normText が表記ゆれを吸収する');
const r1 = await CAT.searchProblems('組換え価');
ok(r1.length >= 2 && r1.some(e => e.id === 'GEN-LNK-002'), `「組換え価」で見つかる（${r1.length}問）`);
const r2 = await CAT.searchProblems('連鎖と組換え・染色体地図');
ok(r2.some(e => e.f === 'GEN-07'), '概念名でも見つかる');
const r3 = await CAT.searchProblems('呼吸', { levels: [0] });
ok(r3.length > 0 && r3.every(e => e.lv === 0), `法則名・難易度の絞り込み（${r3.length}問）`);
ok((await CAT.searchProblems('')).length === 0, '空の検索は0件');
const cols = await CAT.loadCollections();
ok(cols.length >= 1 && cols.every(c => c.items.every(it => CAT.entryById.has(it.id))), `問題セット ${cols.length}件、すべての問題がある`);
const pc = CAT.pickCollection({ problems: { [cols[0].items[0].id]: { last: 1, n: 1 } } }, cols[0], 3);
ok(pc.length === 3 && pc[0].pid === cols[0].items[1].id, 'pickCollection は未着手の問題から順に');

console.log(`catalog.test: ${pass} 件 OK${fail ? `、${fail} 件失敗` : ''}`);
process.exitCode = fail ? 1 : 0;
