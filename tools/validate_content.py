#!/usr/bin/env python3
"""正規データ（content/）の整合検査。JSON Schema では見られない「ファイルどうし・データどうし」の関係を調べる。

    python3 tools/validate_content.py                 いつもの検査（CI でも実行）
    python3 tools/validate_content.py --write-golden  問題ID の台帳 tests/golden/ids.txt を今のデータで作り直す

調べること
  ID      問題ID の重複、フォルダ名・分野フォルダとの一致、台帳（tests/golden/ids.txt）にある ID が消えていないか
  分類    unit が field の下にあるか（taxonomy.json）
  図      ID の重複、参照先ファイルの有無、参照されない図・フォルダ内の孤立ファイル、
          問題文が解答用の図を参照していないか（解答図の漏れ）、解答用の図が解説から参照されているか
  SVG     XML として読めるか、viewBox、script・foreignObject・on* 属性・外部 URL・埋め込み画像（base64）が無いか、大きさ
  化学    問題文・答え・解説の \\ce{…} の反応式で、原子の数と電荷がつり合っているか（tools/chemlib.py）
          学ぶのデータ（content/bio/）：用語・図のピン・アニメーション・因果のネットワーク（予測の答えが1つに決まるか）・系統樹・地質時代
  参照    concepts / laws / misconceptions / remedy / 学ぶへのリンク（learn）
  小問    問題文の小問 ID と答えの小問 ID の一致
  単位    入力用の答えに書いた単位 [ ] が単位表にあるか
エラーが1件でもあれば終了コード 1。警告は表示するだけ。
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_lib import CONTENT, ROOT, figure_refs, load_bio, load_knowledge, load_problems, part_ids  # noqa: E402
from chemlib import check_equation  # noqa: E402
from biolib import propagate, tree_nodes, tree_leaves  # noqa: E402

GOLDEN = ROOT / 'tests' / 'golden' / 'ids.txt'
SVGNS = '{http://www.w3.org/2000/svg}'
MAX_SVG = 200_000
MAX_IMG = 600_000

# 高校生物で使う単位（入力用の答えの [ ] に書けるもの）
UNITS = set('''mol g kg mg µg L mL µL cm cm^2 cm^3 m m^2 mm µm nm km s ms min 時間 日 年 万年 億年 ℃ °C K J kJ kJ/mol mV V
mg/mL g/L mol/L m/s mm/s cm/s ° 度 ％ % 倍 個 個体 匹 本 種類 通り 回 組 対 塩基 塩基対 kb 分子 g/(m^2·年) kg/(m^2·年) mg/(100cm^2·時間) mL/分 L/日 bp'''.split())


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f'{where}: {msg}')

    def warn(self, where, msg):
        self.warnings.append(f'{where}: {msg}')


# ---------------------------------------------------------------- SVG
def tag(el):
    return el.tag.replace(SVGNS, '')


def check_svg_file(path, R, where):
    data = path.read_bytes()
    if len(data) > MAX_SVG:
        R.err(where, f'{path.name} が大きすぎます（{len(data)} バイト、上限 {MAX_SVG}）')
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        R.err(where, f'{path.name} を XML として読めません：{e}')
        return None
    if tag(root) != 'svg':
        R.err(where, f'{path.name} の最上位が <svg> ではありません')
    if not root.get('viewBox'):
        R.err(where, f'{path.name} に viewBox がありません（拡大縮小できない）')
    for el in root.iter():
        t = tag(el)
        if t in ('script', 'foreignObject', 'iframe', 'object', 'embed'):
            R.err(where, f'{path.name} に <{t}> があります（使えません）')
        for k, v in el.attrib.items():
            name = k.split('}')[-1]
            if name.lower().startswith('on'):
                R.err(where, f'{path.name} にイベント属性 {name} があります')
            if name == 'href' and not v.startswith('#'):
                R.err(where, f'{path.name} が外部を参照しています（{v[:40]}）')
            if 'base64' in v:
                R.err(where, f'{path.name} に埋め込み画像（base64）があります。画像は別ファイルにしてください')
    return root


# ---------------------------------------------------------------- 問題
def check_problem(d, p, K, R, ids_seen):
    pid = p['id']
    where = f'{pid}'
    if pid in ids_seen:
        R.err(where, f'問題ID が重複しています（{ids_seen[pid]} と {d}）')
    ids_seen[pid] = d
    if d.name != pid:
        R.err(where, f'フォルダ名 {d.name} が問題ID と違います')
    if d.parent.name != p['field']:
        R.err(where, f'分野フォルダ {d.parent.name} と field {p["field"]} が違います（分野を移すときはフォルダも移す。ID は変えない）')
    units = {u['key']: u for u in K['taxonomy']['units']}
    if p['unit'] not in units:
        R.err(where, f'単元 {p["unit"]} が taxonomy.json にありません')
    elif units[p['unit']]['field'] != p['field']:
        R.err(where, f'単元 {p["unit"]} は分野 {units[p["unit"]]["field"]} のものです（field は {p["field"]}）')

    # 図
    figs = {}
    for fg in p['figures']:
        if fg['id'] in figs:
            R.err(where, f'図ID {fg["id"]} が重複しています')
        figs[fg['id']] = fg
    q_refs = figure_refs(p['statement']['blocks'])
    s_refs = [r for s in p['solutions'] for r in figure_refs(s['blocks'])]
    for r in q_refs + s_refs:
        if r not in figs:
            R.err(where, f'図 {r} を参照していますが、figures にありません')
    for r in q_refs:
        if r in figs and figs[r]['role'] == 'answer':
            R.err(where, f'問題文が解答用の図 {r} を参照しています（答え合わせ前に見えてしまう）')
    for fid, fg in figs.items():
        if fid not in q_refs and fid not in s_refs:
            R.err(where, f'図 {fid} がどこからも参照されていません')
        if fg['role'] == 'question' and fid not in q_refs:
            R.warn(where, f'問題用の図 {fid} が問題文で使われていません')
        if fg['role'] == 'answer' and fid not in s_refs:
            R.err(where, f'解答用の図 {fid} が解説で使われていません')
    used_files = {'problem.json'}
    for fg in p['figures']:
        if fg.get('src'):
            f = d / fg['src']
            used_files.add(fg['src'])
            if not f.exists():
                R.err(where, f'図 {fg["id"]} のファイル {fg["src"]} がありません')
                continue
            if f.suffix == '.svg':
                spec = f.with_name(f.name.replace('.svg', '.fig.json'))
                if spec.exists():
                    used_files.add(spec.name)
                check_svg_file(f, R, where)
            elif f.stat().st_size > MAX_IMG:
                R.err(where, f'{fg["src"]} が大きすぎます（{f.stat().st_size} バイト。長辺 1600px 以下の WebP に）')
    for f in d.iterdir():
        if f.is_file() and f.name not in used_files:
            R.err(where, f'フォルダに使われていないファイル {f.name} があります')

    # 小問
    q_parts = part_ids(p['statement']['blocks'])
    a_parts = [x['id'] for x in p['answer']['parts']]
    if q_parts and q_parts != a_parts:
        R.err(where, f'問題文の小問 {q_parts} と答えの小問 {a_parts} が対応していません')
    if not q_parts and a_parts != ['main']:
        R.err(where, f'小問の無い問題の答えは id "main" 1つにしてください（今は {a_parts}）')

    # 参照
    concepts = {c['id'] for c in K['concepts']}
    laws = {x['id'] for x in K['laws']}
    mcs = {m['id'] for m in K['misconceptions']}
    for c in p['concepts']:
        if c not in concepts:
            R.err(where, f'概念 {c} が concepts.json にありません')
    for x in p['laws']:
        if x not in laws:
            R.err(where, f'法則 {x} が laws.json にありません')
    mc_refs = list(p['misconceptions'])
    mc_refs += [c['misconception'] for c in (p.get('choices') or []) if c.get('misconception')]
    mc_refs += [c['misconception'] for c in (p.get('predict') or {}).get('choices', []) if c.get('misconception')]
    mc_refs += [w['misconception'] for x in p['answer']['parts'] for w in x.get('wrong', [])]
    for m in mc_refs:
        if m not in mcs:
            R.err(where, f'誤概念 {m} が misconceptions.json にありません')
    if not p['concepts']:
        R.warn(where, 'concepts が空です')

    # 学ぶへのリンク
    if p.get('learn'):
        check_learn_ref(p['learn'], R, where)

    # 反応式のつり合い
    for src, text in problem_texts(p):
        for eq in re.findall(r'\\ce\{((?:[^{}]|\{[^{}]*\})*)\}', text):
            if should_check(eq):
                e = check_equation(clean_ce(eq))
                if e:
                    R.err(where, f'{src} の反応式 {eq} が{e}')

    # 単位
    for x in p['answer']['parts']:
        for u in re.findall(r'\[([^\[\]]+)\]\s*$', x.get('grading', '')):
            if u.strip() not in UNITS:
                R.err(where, f'({x["id"]}) の単位 [{u}] が単位表にありません（tools/validate_content.py の UNITS）')

    # 公開状態
    q = p['quality']
    if q['status'] == 'published' and any(f.get('format') in ('png', 'webp') for f in p['figures']) and not q['checks'].get('human'):
        R.warn(where, '写真・画像の図は人の確認（checks.human）を付けてから公開してください')


def problem_texts(p):
    """問題の中の文章（LaTeX）を [(場所, 文章)] で"""
    out = []
    def blocks(bs, where):
        for b in bs:
            if b['type'] == 'text':
                out.append((where, b['tex']))
            elif b['type'] == 'parts':
                for it in b['items']:
                    out.append((f'{where}({it["id"]})', it['tex']))
    blocks(p['statement']['blocks'], '問題文')
    for s in p['solutions']:
        blocks(s['blocks'], '解説')
    for x in p['answer']['parts']:
        out.append((f'答え({x["id"]})', x['tex']))
    for c in p.get('choices') or []:
        out.append(('選択肢', c['tex']))
    return out


def clean_ce(eq):
    """\\ce の中の、つり合いに関係しない書き込み（矢印の上下の文字・状態・空白の命令）を除く"""
    eq = re.sub(r'(->|<=>|<-)\[[^\]]*\](\[[^\]]*\])?', r'\1', eq)
    eq = re.sub(r'\\[a-zA-Z]+\{[^{}]*\}|\\[,;:! ]|\\quad', ' ', eq)
    eq = re.sub(r'\{(\d*[+-])\}', r'\1', eq)
    return eq


def should_check(eq):
    """完全な反応式（矢印が1つで、+ か係数がある。空欄 \\boxed・□・？・… を含まない）だけを検査する"""
    if re.search(r'boxed|□|\?|？|…|\\square|\\text|\\mathrm|\$', eq):
        return False
    if re.search(r'(^|[\s(+-])R(?=[-\s(]|$)|_\{?n|(^|\s)n\s*[A-Z(]|[A-Z]\d*n\b', eq):   # 一般式（R−・重合度 n）は数えられない
        return False
    arrows = re.findall(r'<=>|->|<-', eq)
    if len(arrows) != 1:
        return False
    return ' + ' in eq or re.search(r'(^|\s)\d+(/\d+)?\s*[A-Z(\[]', eq) is not None


LEARN_PAGES = ('labels', 'cards', 'anim', 'causal', 'tree', 'laws')
TREE_KEYS = ('eras', 'popgen', 'ranks')


def check_learn_ref(z, R, where):
    B = load_bio()
    page, key = z.get('page'), z.get('key')
    if page not in LEARN_PAGES:
        R.err(where, f'学ぶのページ {page} がありません（{"・".join(LEARN_PAGES)}）')
        return
    keys = {
        'labels': {d['id'] for d in B['diagrams']['diagrams']}, 'anim': {a['id'] for a in B['anims']['anims']},
        'causal': {n['id'] for n in B['causal']['nets']}, 'tree': {t['id'] for t in B['tree']['trees']} | set(TREE_KEYS),
        'cards': {u['key'] for u in load_knowledge()['taxonomy']['units']},
    }.get(page)
    if key and keys is not None and key not in keys:
        R.err(where, f'学ぶ {page} に {key} がありません')


def check_bio_data(R):
    """学ぶのデータ（content/bio/）"""
    B = load_bio()
    units = {u['key'] for u in load_knowledge()['taxonomy']['units']}
    ids, words = set(), set()
    for t in B['terms']['terms']:
        if t['id'] in ids:
            R.err('bio/terms.json', f'ID {t["id"]} が重複しています')
        if t['term'] in words:
            R.err('bio/terms.json', f'用語 {t["term"]} が重複しています')
        ids.add(t['id']); words.add(t['term'])
        if t['unit'] not in units:
            R.err('bio/terms.json', f'{t["term"]} の単元 {t["unit"]} がありません')
    seen = set()
    for d in B['diagrams']['diagrams']:
        w = f'bio/diagrams.json {d["id"]}'
        if d['id'] in seen:
            R.err(w, '図の ID が重複しています')
        seen.add(d['id'])
        if d['unit'] not in units:
            R.err(w, f'単元 {d["unit"]} がありません')
        f = CONTENT / 'bio' / 'diagrams' / d['src']
        if not f.exists():
            R.err(w, f'{d["src"]} がありません'); continue
        root = check_svg_file(f, R, w)
        if root is None:
            continue
        x0, y0, vw, vh = map(float, root.get('viewBox').split())
        labels = [p['label'] for p in d['pins']]
        if len(set(labels)) != len(labels):
            R.err(w, 'ラベルが重複しています')
        if len(d['pins']) < 3:
            R.err(w, 'ピンは3つ以上にしてください')
        for p in d['pins']:
            for (x, y) in [(p['x'], p['y'])] + ([tuple(p['to'])] if p.get('to') else []):
                if not (x0 <= x <= x0 + vw and y0 <= y <= y0 + vh):
                    R.err(w, f'ピン {p["label"]} が図の外にあります')
        for i, p in enumerate(d['pins']):
            for q in d['pins'][i + 1:]:
                if (p['x'] - q['x']) ** 2 + (p['y'] - q['y']) ** 2 < 18 ** 2:
                    R.err(w, f'ピン {p["label"]} と {q["label"]} が近すぎます（重なって押せない）')
    for f in (CONTENT / 'bio' / 'diagrams').glob('*.svg'):
        if f.name not in {d['src'] for d in B['diagrams']['diagrams']}:
            R.err('bio/diagrams', f'使われていないファイル {f.name} があります')
    for a in B['anims']['anims']:
        if a['unit'] not in units:
            R.err('bio/anims.json', f'{a["id"]} の単元 {a["unit"]} がありません')
        if len(a['stages']) < 2:
            R.err('bio/anims.json', f'{a["id"]} の段階が少なすぎます')
        names = [st['name'] for st in a['stages']]
        if len(set(names)) != len(names):
            R.err('bio/anims.json', f'{a["id"]} に同じ名前の段階があります（「順に並べる」で区別できない）')
    for n in B['causal']['nets']:
        w = f'bio/causal.json {n["id"]}'
        if n['unit'] not in units:
            R.err(w, f'単元 {n["unit"]} がありません')
        nid = [x['id'] for x in n['nodes']]
        if len(set(nid)) != len(nid):
            R.err(w, 'ノードの ID が重複しています')
        pos = [(x['col'], x['row']) for x in n['nodes']]
        for i, (c, r) in enumerate(pos):
            for (c2, r2) in pos[i + 1:]:
                if abs(c - c2) < 0.95 and abs(r - r2) < 0.9:
                    R.err(w, f'ノードが重なっています（列 {c}・行 {r} と {r2}）')
        for e in n['edges']:
            if e['from'] not in nid or e['to'] not in nid:
                R.err(w, f'矢印 {e["from"]}→{e["to"]} のノードがありません')
            if e['sign'] not in (1, -1):
                R.err(w, f'矢印 {e["from"]}→{e["to"]} の符号は 1 か -1')
        for sc in n['scenarios']:
            if sc['start'] not in nid:
                R.err(w, f'{sc["id"]} の始点 {sc["start"]} がありません'); continue
            res, _ = propagate(n, sc['start'], sc['dir'])
            for k in sc['ask']:
                if k not in nid:
                    R.err(w, f'{sc["id"]} の {k} がありません')
                elif res[k] is None:
                    R.err(w, f'{sc["id"]} の {k} は、経路によって増減が食い違います（答えが決まらない）')
                elif res[k] == 0:
                    R.err(w, f'{sc["id"]} の {k} は始点から矢印でたどれません')
                if k == sc['start']:
                    R.err(w, f'{sc["id"]} で始点そのものを聞いています')
    T = B['tree']
    for t in T['trees']:
        names = [x['name'] for x in tree_leaves(t['root'])]
        if len(set(names)) != len(names) or not all(names):
            R.err('bio/tree.json', f'{t["id"]} の葉の名前が重複または空です')
        chars = [c for x in tree_nodes(t['root']) for c in x.get('chars', [])]
        if len(set(chars)) != len(chars):
            R.err('bio/tree.json', f'{t["id"]} の形質が重複しています（どの枝か1つに決まらない）')
        for x in tree_nodes(t['root']):
            if x.get('children') and len(x['children']) < 2:
                R.err('bio/tree.json', f'{t["id"]} に枝分かれしない節があります')
    prev = None
    for e in T['eras']:
        if e['from'] <= e['to']:
            R.err('bio/tree.json', f'{e["name"]} の年代が逆です')
        if prev is not None and e['from'] != prev:
            R.err('bio/tree.json', f'{e["name"]} が前の時代とつながっていません')
        prev = e['to']
        for ev in e['events']:
            if not (e['to'] <= ev['t'] <= e['from']):
                R.err('bio/tree.json', f'{e["name"]} のできごと「{ev["text"]}」の年代 {ev["t"]} が時代の外です')
        ts = [ev['t'] for ev in e['events']]
        if ts != sorted(ts, reverse=True):
            R.err('bio/tree.json', f'{e["name"]} のできごとが古い順になっていません')
    for ex in T['ranks']['examples']:
        if len(ex['path']) != len(T['ranks']['ranks']):
            R.err('bio/tree.json', f'分類の例 {ex["name"]} の階級の数が違います')


# ---------------------------------------------------------------- 知識（概念・法則・誤概念）
def check_knowledge(K, problem_ids, R):
    for name, items in (('concepts', K['concepts']), ('laws', K['laws']), ('misconceptions', K['misconceptions'])):
        seen = set()
        for it in items:
            if it['id'] in seen:
                R.err(f'{name}.json', f'ID {it["id"]} が重複しています')
            seen.add(it['id'])
    concepts = {c['id']: c for c in K['concepts']}
    laws = {x['id'] for x in K['laws']}
    fields = {f['key'] for f in K['taxonomy']['fields']}
    for c in K['concepts']:
        if c['field'] not in fields:
            R.err('concepts.json', f'{c["id"]} の分野 {c["field"]} がありません')
        for r in c['requires']:
            if r not in concepts:
                R.err('concepts.json', f'{c["id"]} の前提 {r} がありません')
        for x in c['laws']:
            if x not in laws:
                R.err('concepts.json', f'{c["id"]} の法則 {x} が laws.json にありません')
    # 前提関係に循環が無いか
    state = {}

    def visit(cid, path):
        if state.get(cid) == 1:
            R.err('concepts.json', f'前提関係が循環しています：{" → ".join(path + [cid])}')
            return
        if state.get(cid) == 2 or cid not in concepts:
            return
        state[cid] = 1
        for r in concepts[cid]['requires']:
            visit(r, path + [cid])
        state[cid] = 2
    for cid in concepts:
        visit(cid, [])
    for x in K['laws']:
        for c in x['concepts']:
            if c not in concepts:
                R.err('laws.json', f'{x["id"]} の概念 {c} が concepts.json にありません')
    for m in K['misconceptions']:
        for c in m['concepts']:
            if c not in concepts:
                R.err('misconceptions.json', f'{m["id"]} の概念 {c} がありません')
        for pid in m['remedy']:
            if pid not in problem_ids:
                R.err('misconceptions.json', f'{m["id"]} の補強問題 {pid} がありません')

def main():
    R = Report()
    K = load_knowledge()
    probs = load_problems()
    ids_seen = {}
    for d, p in probs:
        check_problem(d, p, K, R, ids_seen)
    check_knowledge(K, set(ids_seen), R)
    check_bio_data(R)
    ids = sorted(ids_seen)
    if '--write-golden' in sys.argv:
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        old = set(GOLDEN.read_text(encoding='utf-8').split()) if GOLDEN.exists() else set()
        GOLDEN.write_text('\n'.join(sorted(old | set(ids))) + '\n', encoding='utf-8')
        print(f'台帳 tests/golden/ids.txt を更新しました（{len(old | set(ids))}件）')
    elif GOLDEN.exists():
        lost = sorted(set(GOLDEN.read_text(encoding='utf-8').split()) - set(ids))
        for x in lost:
            R.err('台帳', f'問題ID {x} が消えています（ID は消さない。出さないときは quality.status を hidden に）')
    nfig = sum(len(p['figures']) for _, p in probs)
    print(f'問題 {len(probs)}問・図 {nfig}枚・概念 {len(K["concepts"])}・法則 {len(K["laws"])}・誤概念 {len(K["misconceptions"])}・'
          f'学ぶのデータ を検査：エラー {len(R.errors)}件、警告 {len(R.warnings)}件')
    for e in R.errors[:60]:
        print('  ✗', e)
    for w in R.warnings[:30]:
        print('  ・', w)
    sys.exit(1 if R.errors else 0)


if __name__ == '__main__':
    main()
