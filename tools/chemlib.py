"""化学式・反応式の読み取りと検査（原子の数と電荷のつり合い）

    from chemlib import parse_formula, check_equation
    parse_formula('[Cu(NH3)4]^2+')   -> ({'Cu':1,'N':4,'H':12}, 2)
    check_equation('2Na + 2H2O -> 2NaOH + H2')  -> None（つり合っている）または 説明の文字列

反応式は mhchem（\\ce{...}）と同じ書き方：
  矢印  ->  <=>  <-  ->[上][下]   気体 ^  沈殿 v  状態 (aq) (s) (l) (g)  電子 e-   水和水 CuSO4.5H2O / CuSO4*5H2O
"""
import re
from collections import Counter
from fractions import Fraction

ELEMENTS = set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru '
               'Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At '
               'Rn Fr Ra Ac Th Pa U Np Pu'.split())
ARROW = re.compile(r'\s*(<=>>|<<=>|<=>|<->|->|<-)(\[[^\]]*\])*\s*')


def _strip_state(s):
    s = s.strip()
    s = re.sub(r'\((aq|s|l|g|[^\x00-\x7F]+)\)$', '', s)   # 状態 (aq)(固)(黒鉛) など
    s = re.sub(r'\s*[\^v]$', '', s)          # 気体↑・沈殿↓
    return s.strip()


def parse_formula(src):
    """化学式 → (元素の数, 電荷)。読めなければ ValueError"""
    s = _strip_state(src)
    if s in ('e-', 'e^-', 'e^{-}'):
        return Counter(), -1
    charge = 0
    m = re.search(r'\^\{?(\d*)([+-])\}?$', s) or re.search(r'(?<=[A-Za-z)\]\d])()([+-])$', s)
    if m:
        charge = (int(m.group(1)) if m.group(1) else 1) * (1 if m.group(2) == '+' else -1)
        s = s[:m.start()]
    total = Counter()
    for k, part in enumerate(re.split(r'[.*·・]', s)):
        mult = 1
        mm = re.match(r'^(\d+/\d+|\d+)', part)
        if k > 0 and mm:
            mult = Fraction(mm.group(1)); part = part[mm.end():]
        c = _group(part)
        for e, n in c.items():
            total[e] += n * mult
    if not total and charge == 0:
        raise ValueError(f'化学式を読めません：{src}')
    return total, charge


def _group(s):
    stack = [Counter()]
    i = 0
    while i < len(s):
        ch = s[i]
        if ch in '=#-~':   # 結合の線（CH2=CH2・HC#CH）
            i += 1
        elif ch in '([':
            stack.append(Counter()); i += 1
        elif ch in ')]':
            i += 1
            m = re.match(r'\d+', s[i:])
            n = int(m.group()) if m else 1
            if m:
                i += m.end()
            top = stack.pop()
            for e, k in top.items():
                stack[-1][e] += k * n
        else:
            m = re.match(r'([A-Z][a-z]?)(\d*)', s[i:])
            if not m or m.group(1) not in ELEMENTS:
                raise ValueError(f'化学式を読めません：{s}（{s[i:]} の所）')
            stack[-1][m.group(1)] += int(m.group(2) or 1)
            i += m.end()
    if len(stack) != 1:
        raise ValueError(f'かっこが閉じていません：{s}')
    return stack[0]


def split_side(side):
    """左辺・右辺を [(係数, 化学式)] に"""
    out = []
    for term in re.split(r'\s+\+\s+', side.strip()):
        term = term.strip()
        if not term:
            continue
        m = re.match(r'^(\d+/\d+|\d+(?:\.\d+)?)\s*(?=[A-Z(\[e])', term)
        coef = Fraction(m.group(1)) if m else Fraction(1)
        out.append((coef, term[m.end():] if m else term))
    return out


def sides(eq):
    eq = eq.strip()
    m = list(ARROW.finditer(eq))
    if len(m) != 1:
        raise ValueError(f'矢印が1つではありません：{eq}')
    return eq[:m[0].start()], eq[m[0].end():]


def check_equation(eq):
    """つり合っていれば None、そうでなければ説明"""
    try:
        L, R = sides(eq)
        cnt = [Counter(), Counter()]
        chg = [Fraction(0), Fraction(0)]
        for k, side in enumerate((L, R)):
            for coef, f in split_side(side):
                c, q = parse_formula(f)
                for e, n in c.items():
                    cnt[k][e] += coef * n
                chg[k] += coef * q
    except ValueError as e:
        return str(e)
    bad = [f'{e}: {cnt[0][e]}→{cnt[1][e]}' for e in sorted(set(cnt[0]) | set(cnt[1])) if cnt[0][e] != cnt[1][e]]
    if chg[0] != chg[1]:
        bad.append(f'電荷: {chg[0]}→{chg[1]}')
    return ('つり合っていない：' + '、'.join(bad)) if bad else None


def formula_mass(src, masses):
    c, _ = parse_formula(src)
    return sum(masses[e] * n for e, n in c.items())


if __name__ == '__main__':
    for eq in ['2Na + 2H2O -> 2NaOH + H2 ^', 'Cu + 4HNO3 -> Cu(NO3)2 + 2H2O + 2NO2', 'Ag+ + 2NH3 -> [Ag(NH3)2]+',
               'CuSO4.5H2O -> CuSO4 + 5H2O', 'MnO4- + 8H+ + 5e- -> Mn^2+ + 4H2O', '2Na + H2O -> NaOH + H2']:
        print(eq, '→', check_equation(eq))
