// 「入力用の答え」がアプリで読めるか検査する
//   node tools/check_answers.mjs data          … 取り込み済みの data/*.json を検査
//   node tools/check_answers.mjs specs.json    … {ID: {spec}} 形式のファイルを検査
import fs from 'fs';
import path from 'path';
import { parseSpec, checkField } from '../js/answer.js';

const target = process.argv[2] || 'data';
let specs = {};
if (fs.statSync(target).isDirectory()) {
  for (const f of fs.readdirSync(target).filter(f => f.startsWith('f-'))) {
    for (const [id, b] of Object.entries(JSON.parse(fs.readFileSync(path.join(target, f), 'utf8')))) if (b.in) specs[id] = b.in;
  }
} else {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(target, 'utf8')))) if (v.spec) specs[id] = v.spec;
}

const bad = {};          // { ID: [だめな小問の番号(0始まり)] }
let fields = 0, auto = 0;
const kinds = {};
function selfCheck(f) {
  let input;
  if (f.kind === 'cases') input = { mode: 'cases', rows: f.cases.map(c => ({ cond: c.condSrc, val: c.valSrc })) };
  else if (f.kind === 'set') input = { mode: 'plain', text: f.items.map(i => i.src).join(', ') };
  else if (f.kind === 'expr') input = { mode: 'plain', text: f.value.src };
  else if (f.kind === 'word') input = { mode: 'plain', text: f.accept[f.accept.length - 1] };
  else if (f.kind === 'approx') input = { mode: 'plain', text: String(f.value) };
  else if (f.kind === 'pick') {
    input = { sel: new Set(f.answer) };
    // 選びすぎ・足りないと不正解になることも確かめる
    const wrong = f.multi ? new Set([...Array(f.options.length).keys()]) : new Set([(f.answer[0] + 1) % f.options.length]);
    if (f.options.length > f.answer.length && checkField(f, { sel: wrong }).ok) throw new Error(`違う選び方でも正解になる（${f.src}）`);
  } else if (f.kind === 'order') {
    input = { seq: f.answer.slice() };
    if (checkField(f, { seq: f.answer.slice().reverse() }).ok) throw new Error(`逆の順でも正解になる（${f.src}）`);
  }
  else input = { mode: 'plain', text: f.src };
  const r = checkField(f, input);
  if (r.ok !== true) throw new Error(`正解を入れても正解にならない（${f.label || ''} ${f.src}）${r.error || ''}`);
}
const reasons = {};
for (const [id, text] of Object.entries(specs)) {
  const lines = String(text).split(/\n/);
  lines.forEach((line, k) => {
    try {
      const sp = parseSpec(line);
      // 語{…} の正解どうしが、表記を整えると同じになっていないか（書き間違いの発見用。重複はあってもよい）
      for (const p of sp.parts) for (const f of p.fields) {
        fields++;
        kinds[f.kind] = (kinds[f.kind] || 0) + 1;
        if (f.kind === 'self') continue;
        auto++;
        selfCheck(f);
      }
    } catch (e) {
      (bad[id] = bad[id] || []).push(k);
      reasons[`${id}#${k + 1}`] = `${e.message} ｜ ${line}`;
    }
  });
}
console.log(`問題 ${Object.keys(specs).length}・答え ${fields}（自動採点 ${auto}）`, kinds);
console.log(`読めない・整合しない小問 ${Object.values(bad).flat().length}（${Object.keys(bad).length}問）`);
for (const [k, m] of Object.entries(reasons).slice(0, 30)) console.log(' ', k, m);
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(bad, null, 1));
process.exitCode = Object.keys(bad).length ? 1 : 0;
