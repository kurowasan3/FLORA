import { parseSpec, checkField, fieldTeX } from '../js/answer.js';
// 自動採点（answer.js）の回帰テスト
let passed = 0;
const spec = parseSpec(`(1) 14/3
(2) 最大値：7/4 ; 最小値：-3-2sqrt(3)
(3) {1, 35, 251, 505}
(4) (30/11, 48/11)
(5) 9:4
(6) a<-3 または 3<a
(7) 場合分け{ m<=1/2 → 6-2m | m>=1/2 → (14m+8)/3 }
(8) 証明
(9) 18個
(10) -16<k<9
(11) {4+sqrt(5), 4-sqrt(5)}
(12) 120°
(13) $y$：9x-16
(14) 3*2^(n-1)-n-1
(15) なし
(16) 場合分け{ a<0 → a | 0<=a<=2 → -a^2+a | a>2 → 4-3a }`);
const P = (n) => spec.parts.find(p => p.n == n).fields;
const T = (n, i, inp, want) => { const r = checkField(P(n)[i], typeof inp === 'string' ? { mode: 'plain', text: inp } : inp); const pass = r.ok === want; if (!pass) console.log('FAIL', n, JSON.stringify(inp), r); else passed++; if(!pass) process.exitCode=1; };
T(1,0,'14/3',true); T(1,0,'4.6667',false); T(1,0,'28/6',true);
T(2,0,'7/4',true); T(2,1,'-3-2√3',true); T(2,1,'-3+2√3',false);
T(3,0,'505, 251, 35, 1',true); T(3,0,'1,35,251',false);
T(4,0,'(30/11, 48/11)',true); T(4,0,'(48/11, 30/11)',false);
T(5,0,'18:8',true); T(5,0,'4:9',false);
T(6,0,'a<-3, a>3',true); T(6,0,'a<-3 または a>=3',false); T(6,0,'-3<a<3',false); T(6,0,'a < -3 or 3 < a',true);
T(7,0,{mode:'cases',rows:[{cond:'m<1/2',val:'6-2m'},{cond:'m>=1/2',val:'(14m+8)/3'}]},true);
T(7,0,{mode:'cases',rows:[{cond:'m<1/2',val:'6-2m'}]},false);
T(7,0,{mode:'cases',rows:[{cond:'m<1',val:'6-2m'},{cond:'m>=1',val:'(14m+8)/3'}]},false);
T(7,0,'6-2m',false);
T(8,0,'',null);
T(9,0,'18',true); T(9,0,'18個',true);
T(10,0,'-16<k<9',true); T(10,0,'-16<=k<9',false); T(10,0,'k>-16 かつ k<9',true);
T(11,0,'4±√5',true); T(11,0,'4-√5, 4+√5',true);
T(12,0,'120',true);
T(13,0,'y=9x-16',true); T(13,0,'9x-16',true);
T(14,0,'3·2^(n-1)-n-1',true); T(14,0,'(3/2)2^n-n-1',true); T(14,0,'3·2^n-n-1',false);
T(15,0,'なし',true); T(15,0,'x>1',false);
T(16,0,{mode:'cases',rows:[{cond:'a<=0',val:'a'},{cond:'0<a<2',val:'a-a^2'},{cond:'a>=2',val:'4-3a'}]},true);
// v0.6：度の記号つきの範囲・3乗根
const one = (spec, inp, want) => { const f = parseSpec(spec).parts[0].fields[0]; const r = checkField(f, { mode: 'plain', text: inp }); if (r.ok !== want) { console.log('FAIL', spec, inp, r); process.exitCode = 1; } else passed++; };
one('(1) 30<=θ<=150', '30°<=θ<=150°', true);
one('(1) {60°, 180°}', '60, 180', true);
one('4^(1/3)-2', '2^(2/3)-2', true);
// FLORA v0.4：数字の添字は数字だけ（r_1v_1、B_2d）、物理量は正の値で比べる
one('(1) v_2：r_1 v_1/r_2', 'r_1v_1/r_2', true);
one('(1) R：m V/(q B B_2 d)', 'mV/(qBB_2d)', true);
one('(1) V：m sqrt(2g h/(M(M+m)))', '(m/M)√(2Mgh/(M+m))', true);
one('(1) U：-G M m/R', 'GMm/R', false);
// FLORA：語・選ぶ・すべて選ぶ・並べる・約
const chem = (src, inp, want) => { const f = parseSpec(src).parts[0].fields[0]; const r = checkField(f, typeof inp === 'string' ? { mode: 'plain', text: inp } : inp); if (r.ok !== want) { console.log('FAIL', src, JSON.stringify(inp), r); process.exitCode = 1; } else passed++; };
chem('語{アンモニア|NH3}', 'あんもにあ', true); chem('語{アンモニア|NH3}', 'ＮＨ３', true); chem('語{アンモニア|NH3}', 'NH4', false);
chem('語{[Cu(NH3)4]^2+}', '[Cu(NH₃)₄]²⁺', true); chem('語{[Cu(NH3)4]^2+}', '[Cu(NH3)4]2+', true); chem('語{Co}', 'CO', false);
chem('語{テトラアンミン銅(II)イオン}', 'テトラアンミン銅（Ⅱ）イオン', true); chem('語{ハーバー・ボッシュ法}', 'ハーバーボッシュ法', true);
chem('選ぶ{A|B|C}=2', { sel: new Set([1]) }, true); chem('選ぶ{A|B|C}=2', { sel: new Set([0]) }, false); chem('選ぶ{A|B|C}=2', { sel: new Set() }, false);
chem('すべて選ぶ{A|B|C|D}=1,3', { sel: new Set([2, 0]) }, true); chem('すべて選ぶ{A|B|C|D}=1,3', { sel: new Set([0, 2, 3]) }, false); chem('すべて選ぶ{A|B|C|D}=1,3', { sel: new Set([0]) }, false);
chem('並べる{HF|HCl|HBr}=3>2>1', { seq: [2, 1, 0] }, true); chem('並べる{HF|HCl|HBr}=3>2>1', { seq: [0, 1, 2] }, false); chem('並べる{HF|HCl|HBr}=3>2>1', { seq: [2, 1] }, false);
chem('約{2.24|2} [L]', '2.2', true); chem('約{2.24|2} [L]', '2.3', false); chem('約{2.24|3} [L]', '2.24', true); chem('約{2.24|3} [L]', '2.2', false);
chem('約{0.0012|2}', '1.2e-3', true); chem('約{0.0012|2}', '1.2×10^-3', true); chem('約{0.0012|2}', '1.2*10^(-3)', true); chem('約{6.0e23|2}', '6.0×10^23', true);
chem('約{-111|3}', '−111', true); chem('約{7|1}', '+7', true);
let threw = false; try { parseSpec('選ぶ{A|B}=3'); } catch { threw = true; }
if (!threw) { console.log('FAIL 範囲外の番号を読めてしまう'); process.exitCode = 1; } else passed++;
if (!fieldTeX(P(7)[0]).includes('cases')) { console.log('FAIL fieldTeX'); process.exitCode = 1; }
console.log(`answer.test: ${passed} 件 OK${process.exitCode ? '（失敗あり）' : ''}`);
