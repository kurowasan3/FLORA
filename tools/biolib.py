"""生物の学ぶデータの計算（build_data.py・validate_content.py が使う。js/learn.js にも同じ計算がある）"""
from collections import deque


def propagate(net, start, sign):
    """因果のネットワークで、start を sign（+1/−1）だけ変えたときの各ノードの変化。
    矢印の符号を掛け合わせ、start からいちばん短い経路で決める（start には戻らない）。
    同じ長さの経路で符号が食い違うノードは None（決まらない）。届かないノードは 0。
    戻り値 {ノード: +1 | -1 | 0 | None}, {ノード: 距離}"""
    out = {}
    for e in net['edges']:
        out.setdefault(e['from'], []).append(e)
    val, dist = {start: sign}, {start: 0}
    q = deque([start])
    while q:
        a = q.popleft()
        if val[a] is None:
            continue
        for e in out.get(a, []):
            b = e['to']
            if b == start:
                continue
            v = val[a] * e['sign']
            if b not in dist:
                dist[b], val[b] = dist[a] + 1, v
                q.append(b)
            elif dist[b] == dist[a] + 1 and val[b] != v:
                val[b] = None
    res = {n['id']: 0 for n in net['nodes']}
    res.update(val)
    return res, dist


def tree_leaves(node):
    if not node.get('children'):
        return [node]
    return [x for c in node['children'] for x in tree_leaves(c)]


def tree_nodes(node):
    yield node
    for c in node.get('children', []):
        yield from tree_nodes(c)
