#!/usr/bin/env python3
"""問題管理表の形式（1問1フォルダの item.json ＋ problem.svg / solution.svg）を content/ に取り込む

    python3 tools/import_items.py <content フォルダ> [--sheet FLORA問題管理表.xlsx] [--verify <verify フォルダ>]

  ・<content フォルダ>/<ID>/item.json を読み、content/problems/<分野>/<ID>/problem.json を書く。
    問題ID は item.json の id をそのまま使う（変えない）。同じ ID がすでにあれば上書きする。
  ・単元は item.json の field（単元名）で taxonomy.json から引く（表記ゆれは ALIASES で吸収）。
  ・難易度 1〜5 → level：1=基礎(0)、2=標準(1)、3=国公立2次(3)、4=難関(4)、5=最難関(5)。
  ・問題文の enumerate を小問に、答え "(1) … (2) …" を小問ごとの答えに分ける（入力採点はしない：自己採点）。
  ・参考元（source・src_no）はアプリに出さないので取り込まない。
  ・管理表があれば、作成日・作成方法・検証3項目（二重解答／SymPy等／人間確認）を quality と provenance に写す。
  ・--verify があれば検証スクリプト <ID>.py を verify/ にコピーする。
  ・SVG の id は図ごとに接頭辞を付けて、同じページに並んでも衝突しないようにする。
"""
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_lib import CONTENT, ROOT  # noqa: E402

# 単元名の略し方・言い換え → taxonomy.json の単元名
ALIASES = {'細胞の構造': '生物の共通性と細胞の構造', '細胞小器官': '生物の共通性と細胞の構造', '生体膜': '生体膜と物質輸送', '物質輸送': '生体膜と物質輸送',
           'タンパク質': 'タンパク質の構造と働き', '代謝': '代謝とATP', 'ATP': '代謝とATP', '呼吸': '呼吸と発酵', '発酵': '呼吸と発酵',
           'DNA': 'DNAの構造と複製', '複製': 'DNAの構造と複製', '細胞周期': '細胞周期と体細胞分裂', '体細胞分裂': '細胞周期と体細胞分裂',
           '遺伝子発現': '転写と翻訳', 'タンパク質合成': '転写と翻訳', '発現調節': '遺伝子発現の調節', 'オペロン': '遺伝子発現の調節',
           'バイオテク': 'バイオテクノロジー', '遺伝子組換え': 'バイオテクノロジー', '減数分裂': '減数分裂と遺伝の法則', '遺伝': '減数分裂と遺伝の法則', 'メンデル': '減数分裂と遺伝の法則',
           '連鎖': '連鎖と組換え', '組換え': '連鎖と組換え', '受精': '配偶子形成と受精', '配偶子形成': '配偶子形成と受精', '発生': '動物の発生',
           '誘導': '発生のしくみ（誘導・位置情報）', '発生のしくみ': '発生のしくみ（誘導・位置情報）', '体液': '体液と循環', '循環': '体液と循環', '血液': '体液と循環',
           '腎臓': '腎臓と肝臓', '肝臓': '腎臓と肝臓', 'ホルモン': '自律神経とホルモン', '自律神経': '自律神経とホルモン', '内分泌': '自律神経とホルモン',
           '血糖': '血糖・体温の調節', '体温': '血糖・体温の調節', '恒常性': '血糖・体温の調節', '受容器': '受容器と感覚', '神経': 'ニューロンと神経系', 'ニューロン': 'ニューロンと神経系',
           '筋肉': '筋収縮', '行動': '動物の行動', '植物ホルモン': '植物ホルモンと成長', '花芽形成': '光と花芽形成', '光周性': '光と花芽形成',
           '遷移': '植生と遷移・バイオーム', 'バイオーム': '植生と遷移・バイオーム', '植生': '植生と遷移・バイオーム', '個体群': '個体群と生物群集', '生物群集': '個体群と生物群集',
           '生態系': '生態系と物質循環', '物質循環': '生態系と物質循環', '生物多様性': '生物多様性と生態系の保全', '環境保全': '生物多様性と生態系の保全',
           '生命の起源': '生命の起源と生物の変遷', '生物の変遷': '生命の起源と生物の変遷', '進化': '進化のしくみ', '系統': '系統と分類', '分類': '系統と分類'}
LEVEL = {1: 0, 2: 1, 3: 3, 4: 4, 5: 5}
# item.json の format（任意）：qa 一問一答／choice 正誤・選択／order 順序／causal 因果関係／label 図の名称／calc 計算／experiment 実験考察／written 論述。無ければ written
FORMATS = {'qa', 'choice', 'order', 'causal', 'label', 'calc', 'experiment', 'written'}

# タグ・テーマ・核に含まれる語 → 概念（上から順に、最大3つ）
KEYWORDS = [
    (r'細胞小器官|原核|真核|顕微鏡|ミクロメーター', 'cell-structure'), (r'浸透|能動輸送|チャネル|膜', 'membrane-transport'), (r'タンパク質の構造|アミノ酸|変性', 'protein-structure'),
    (r'酵素|基質|阻害', 'enzyme'), (r'ATP|代謝', 'atp'), (r'呼吸|発酵|解糖|クエン酸|電子伝達', 'respiration'), (r'光合成|カルビン|葉緑体|C4|CAM', 'photosynthesis'),
    (r'DNA|複製|シャルガフ', 'dna-structure'), (r'細胞周期|体細胞分裂', 'cell-cycle'), (r'転写|翻訳|コドン|スプライシング', 'gene-expression'), (r'オペロン|転写調節|調節遺伝子', 'gene-regulation'),
    (r'PCR|制限酵素|電気泳動|遺伝子組換え|ゲノム編集', 'biotech'), (r'減数分裂', 'meiosis'), (r'分離比|メンデル|検定交雑|伴性', 'mendel'), (r'連鎖|組換え価|染色体地図', 'linkage'),
    (r'受精|配偶子|卵形成|精子', 'fertilization'), (r'卵割|原腸|胚葉|神経胚', 'animal-development'), (r'誘導|形成体|ホメオティック|位置情報', 'induction'),
    (r'重複受精|胚乳|ABC', 'plant-development'), (r'血液|心臓|ヘモグロビン|凝固', 'body-fluid'), (r'腎臓|ネフロン|肝臓|尿', 'kidney-liver'),
    (r'ホルモン|フィードバック|自律神経', 'hormone'), (r'血糖|体温|インスリン', 'homeostasis'), (r'免疫|抗体|抗原|T細胞|B細胞', 'immunity'),
    (r'眼|耳|受容器|視細胞', 'receptor'), (r'ニューロン|活動電位|シナプス|伝導', 'neuron'), (r'筋収縮|サルコメア|アクチン|ミオシン', 'muscle'), (r'行動|学習|フェロモン', 'behavior'),
    (r'オーキシン|ジベレリン|植物ホルモン|屈性', 'plant-hormone'), (r'光周性|花芽|フィトクロム|春化', 'photoperiodism'),
    (r'遷移|バイオーム|植生', 'vegetation'), (r'個体群|標識再捕獲|種間|共生', 'population'), (r'生産量|物質循環|窒素|炭素|エネルギー効率', 'ecosystem'),
    (r'多様性|外来|富栄養|生物濃縮', 'biodiversity'), (r'地質時代|化石|生命の起源', 'history-of-life'), (r'ハーディ|遺伝的浮動|自然選択|種分化', 'evolution-mechanism'),
    (r'系統|分類|ドメイン|分子時計', 'phylogeny'),
]
# 語が1つも当たらないときの、単元ごとの概念
UNIT_DEFAULT = {
    'CEL-01': 'cell-structure', 'CEL-02': 'membrane-transport', 'CEL-03': 'protein-structure', 'CEL-04': 'enzyme', 'MET-01': 'atp', 'MET-02': 'respiration', 'MET-03': 'photosynthesis',
    'GEN-01': 'dna-structure', 'GEN-02': 'cell-cycle', 'GEN-03': 'gene-expression', 'GEN-04': 'gene-regulation', 'GEN-05': 'biotech', 'GEN-06': 'mendel', 'GEN-07': 'linkage',
    'DEV-01': 'fertilization', 'DEV-02': 'animal-development', 'DEV-03': 'induction', 'DEV-04': 'plant-development',
    'HOM-01': 'body-fluid', 'HOM-02': 'kidney-liver', 'HOM-03': 'hormone', 'HOM-04': 'homeostasis', 'HOM-05': 'immunity',
    'RES-01': 'receptor', 'RES-02': 'neuron', 'RES-03': 'muscle', 'RES-04': 'behavior', 'PLA-01': 'plant-hormone', 'PLA-02': 'photoperiodism',
    'ECO-01': 'vegetation', 'ECO-02': 'population', 'ECO-03': 'ecosystem', 'ECO-04': 'biodiversity', 'EVO-01': 'history-of-life', 'EVO-02': 'evolution-mechanism', 'EVO-03': 'phylogeny',
}
BASIC_UNITS = {'CEL-01', 'CEL-02', 'MET-01', 'GEN-01', 'GEN-02', 'GEN-03', 'HOM-01', 'HOM-02', 'HOM-03', 'HOM-04', 'HOM-05', 'ECO-01', 'ECO-03', 'ECO-04'}


def outside_math(s):
    """数式の外の位置だけを True にした配列（$…$・\\[…\\]・\\(…\\)）"""
    mask = [True] * len(s)
    for m in re.finditer(r'\$\$.*?\$\$|\\\[.*?\\\]|\\\(.*?\\\)|\$[^$]*\$', s, flags=re.S):
        for i in range(m.start(), m.end()):
            mask[i] = False
    return mask


def top_envs(text, env='enumerate'):
    """入れ子を考えて、いちばん外側の \\begin{env}…\\end{env} の (開始, 本文開始, 本文終了, 終了) を返す"""
    out, depth, start, body = [], 0, 0, 0
    for m in re.finditer(r'\\(begin|end)\{%s\}(\[[^\]]*\])?' % env, text):
        if m.group(1) == 'begin':
            if depth == 0:
                start, body = m.start(), m.end()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append((start, body, m.start(), m.end()))
    return out


def top_items(body):
    """入れ子の enumerate/itemize の中の \\item は分けない"""
    cuts, depth = [], 0
    for m in re.finditer(r'\\(begin|end)\{(?:enumerate|itemize)\}|\\item\b', body):
        if m.group(1) == 'begin':
            depth += 1
        elif m.group(1) == 'end':
            depth -= 1
        elif depth == 0:
            cuts.append(m)
    return [body[m.end():(cuts[k + 1].start() if k + 1 < len(cuts) else len(body))].strip() for k, m in enumerate(cuts)]


def split_statement(text):
    """問題文 → blocks（text / parts）。外側の enumerate の項目を小問にする。\\setcounter{enumi}{k} で番号を続ける"""
    blocks, num, pos = [], 0, 0
    SC = r'\\setcounter\{enumi\}\{(\d+)\}'
    for (st, bs, be, en) in top_envs(text):
        before, body = text[pos:st], text[bs:be]
        head = body.split('\\item', 1)[0]
        sc = re.findall(SC, before) + re.findall(SC, head)
        before = re.sub(SC, '', before).strip()
        if before:
            blocks.append({'type': 'text', 'tex': before})
        if sc:
            num = int(sc[-1])
        parts = []
        for it in top_items(re.sub(SC, '', body)):
            lab = re.match(r'\[([^\]]*)\]\s*', it)   # \item[(3)] は小問 3、\item[I.] は見出し（文章として入れる）
            if lab and not re.fullmatch(r'\(?\d+\)?\.?', lab.group(1).strip()):
                if parts:
                    blocks.append({'type': 'parts', 'items': parts})
                    parts = []
                blocks.append({'type': 'text', 'tex': f'\\textbf{{{lab.group(1).strip()}}}　' + it[lab.end():]})
                continue
            if lab:
                num = int(re.sub(r'\D', '', lab.group(1)))
                it = it[lab.end():]
            else:
                num += 1
            parts.append({'id': str(num), 'tex': it})
        if parts:
            blocks.append({'type': 'parts', 'items': parts})
        pos = en
    rest = re.sub(SC, '', text[pos:]).strip()
    if rest:
        blocks.append({'type': 'text', 'tex': rest})
    return blocks


def split_answer(ans, ids):
    """"(1) … (2) …" → 小問ごとの答え。小問番号は先頭か空白の直後にあるものだけを区切りとみなす。
    番号が小問と合わなければ 1つにまとめる"""
    mask = outside_math(ans)
    cands = [m for m in re.finditer(r'(?:^|(?<=[\s　]))\((\d+)\)', ans) if mask[m.start()]]
    cuts, k = [], 0
    for want in ids:
        while k < len(cands) and cands[k].group(1) != want:
            k += 1
        if k == len(cands):
            break
        cuts.append(cands[k])
        k += 1
    if ids and len(cuts) == len(ids) and cuts[0].start() == len(ans) - len(ans.lstrip()):
        out = []
        for j, m in enumerate(cuts):
            end = cuts[j + 1].start() if j + 1 < len(cuts) else len(ans)
            out.append({'id': m.group(1), 'tex': ans[m.end():end].strip().strip('　').strip()})
        return out, True
    return [{'id': 'main', 'tex': ans.strip()}], False


def prefix_svg_ids(svg, pre):
    ids = set(re.findall(r'\bid="([^"]+)"', svg))
    for i in sorted(ids, key=len, reverse=True):
        svg = re.sub(r'\bid="%s"' % re.escape(i), f'id="{pre}-{i}"', svg)
        svg = svg.replace(f'url(#{i})', f'url(#{pre}-{i})').replace(f'href="#{i}"', f'href="#{pre}-{i}"')
    return svg


def concepts_for(item, unit):
    text = ' '.join([item.get('tags', ''), item.get('theme', ''), item.get('core', '')])
    out = []
    for pat, cid in KEYWORDS:
        if re.search(pat, text) and cid not in out:
            out.append(cid)
    if unit.startswith('WAV-03') and 'interference' in out and 'light-interference' not in out:
        out[out.index('interference')] = 'light-interference'
    d = UNIT_DEFAULT[unit]
    if d in out:   # 単元の代表概念を先頭に
        out.remove(d)
    return ([d] + out)[:3]


def load_sheet(path):
    if not path:
        return {}
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['問題一覧']
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    col = {h: i for i, h in enumerate(head) if h}
    out = {}
    for r in rows[1:]:
        pid = r[col['ID']]
        if not pid or str(r[col.get('メモ', 0)] or '').startswith('記入例'):
            continue
        out[str(pid).strip()] = {h: r[i] for h, i in col.items()}
    return out


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    src = Path(argv[0])
    sheet = verify = None
    if '--sheet' in argv:
        sheet = argv[argv.index('--sheet') + 1]
    if '--verify' in argv:
        verify = Path(argv[argv.index('--verify') + 1])
    S = load_sheet(sheet)
    tax = json.loads((CONTENT / 'taxonomy.json').read_text(encoding='utf-8'))
    units = {u['name']: u for u in tax['units']}
    concepts = {c['id'] for c in json.loads((CONTENT / 'concepts.json').read_text(encoding='utf-8'))['concepts']}
    n, merged, problems = 0, [], []
    for d in sorted(p for p in src.iterdir() if (p / 'item.json').exists()):
        it = json.loads((d / 'item.json').read_text(encoding='utf-8'))
        pid = it['id']
        if not re.fullmatch(r'[A-Z]{3}-[A-Z]{3}-\d{3,}', pid) or pid != d.name:
            raise SystemExit(f'{d.name}: 問題ID {pid!r} が規則（ABC-DEF-001）に合わないか、フォルダ名と違います')
        uname = ALIASES.get(it['field'], it['field'])
        u = units.get(uname) or next((v for k, v in units.items() if ALIASES.get(k) == uname), None)
        if not u:
            raise SystemExit(f'{pid}: 単元「{it["field"]}」が taxonomy.json にありません')
        blocks = split_statement(it['problem'])
        ids = [x['id'] for b in blocks if b['type'] == 'parts' for x in b['items']]
        parts, ok = split_answer(it['answer'], ids)
        if not ok and ids:   # 答えを小問に分けられない → 小問は本文のまま（text）にする
            merged.append(pid)
            blocks = [{'type': 'text', 'tex': it['problem']}]
        figs, sol_blocks = [], []
        out = CONTENT / 'problems' / u['field'] / pid
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        if it.get('problem_fig'):
            svg = prefix_svg_ids((d / it['problem_fig']).read_text(encoding='utf-8'), 'q')
            (out / 'q-fig.svg').write_text(svg, encoding='utf-8')
            figs.append({'id': 'q-fig', 'role': 'question', 'kind': 'diagram', 'format': 'svg', 'src': 'q-fig.svg',
                         'alt': f'問題図：{it["theme"]}', 'caption': ''})
            k = 1 if blocks and blocks[0]['type'] == 'text' else 0
            blocks.insert(k, {'type': 'figure', 'ref': 'q-fig'})
        if it.get('solution_fig'):
            svg = prefix_svg_ids((d / it['solution_fig']).read_text(encoding='utf-8'), 'a')
            (out / 'a-fig.svg').write_text(svg, encoding='utf-8')
            figs.append({'id': 'a-fig', 'role': 'answer', 'kind': 'diagram', 'format': 'svg', 'src': 'a-fig.svg',
                         'alt': f'解答図：{it["theme"]}', 'caption': '解答図'})
            sol_blocks.append({'type': 'figure', 'ref': 'a-fig'})
        sol_blocks.append({'type': 'text', 'tex': it['solution']})
        row = S.get(pid, {})
        done = lambda k: str(row.get(k) or '').strip() == '済'   # noqa: E731
        created = row.get('作成日')
        created = created.strftime('%Y-%m-%d') if hasattr(created, 'strftime') else '2026-11-07'
        cs = [c for c in concepts_for(it, u['key']) if c in concepts]
        syn = False
        p = {
            'id': pid, 'schema': 'flora.problem/1', 'field': u['field'], 'unit': u['key'], 'topic': it['theme'], 'course': it.get('course') or ('生物基礎' if u['key'] in BASIC_UNITS else '生物'),
            'level': LEVEL[int(it['difficulty'])], 'minutes': int(it.get('time_min') or 20),
            'format': [f for f in re.split(r'[,，、\s]+', str(it.get('format') or '')) if f in FORMATS] or ['written'], 'examStyle': 'national-2nd',
            'statement': {'blocks': blocks}, 'figures': figs,
            'answer': {'parts': parts},
            'solutions': [{'id': 'main', 'kind': 'main', 'blocks': sol_blocks}],
            'idea': {'tex': it['core']} if it.get('core') else None,
            'concepts': cs, 'laws': [], 'misconceptions': [],
            'tags': [t.strip() for t in re.split(r'[,，、]', it.get('tags') or '') if t.strip()],
            'provenance': {'created': created, 'method': str(row.get('作成方法') or 'AI生成') + '（問題管理表から取り込み）'},
            'quality': {'status': 'published',
                        'checks': {'schema': True, 'units': False, 'figures': False,
                                   'biology': bool(it.get('verified')) or done('検証:SymPy等'), 'human': done('検証:人間確認')},
                        'verified': all(done(k) for k in ('検証:二重解答', '検証:SymPy等', '検証:人間確認'))},
        }
        if p['idea'] is None:
            del p['idea']
        (out / 'problem.json').write_text(json.dumps(p, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        if verify and (verify / f'{pid}.py').exists():
            (ROOT / 'verify').mkdir(exist_ok=True)
            shutil.copy(verify / f'{pid}.py', ROOT / 'verify' / f'{pid}.py')
        problems.append(pid)
        n += 1
    print(f'{n}問を取り込みました')
    if merged:
        print(f'答えを小問に分けられず、1つにまとめた問題 {len(merged)}問：' + ' '.join(merged))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
