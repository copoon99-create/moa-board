"""게시판 6곳의 최근 글을 긁어 posts.json 으로 저장한다. GitHub Actions 에서 30분마다 실행."""
import json, re, sys, time
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

KST = timezone(timedelta(hours=9))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
MAX_POSTS = 30

# 게시판 목록: 바꾸려면 여기만 고치면 된다.
BOARDS = [
    {"id": "fm-realestate", "name": "부동산", "kind": "fmkorea", "key": "realestate",
     "url": "https://m.fmkorea.com/realestate"},
    {"id": "dc-marvelsnap", "name": "마블 스냅 갤러리", "kind": "dc", "key": "marvelsnap",
     "url": "https://m.dcinside.com/board/marvelsnap"},
    {"id": "dc-bh", "name": "bh 갤러리", "kind": "dc", "key": "bh",
     "url": "https://m.dcinside.com/board/bh"},
    {"id": "dc-thesingularity", "name": "특이점이 온다 갤러리", "kind": "dc", "key": "thesingularity",
     "url": "https://m.dcinside.com/board/thesingularity"},
    {"id": "mlb-bullpen", "name": "불펜", "kind": "mlbpark", "key": "bullpen",
     "url": "https://mlbpark.donga.com/mp/b.php?b=bullpen"},
    {"id": "dc-ai_utilize", "name": "AI 활용 갤러리", "kind": "dc", "key": "ai_utilize",
     "url": "https://m.dcinside.com/board/ai_utilize"},
]

S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})


def get(url, **kw):
    r = S.get(url, timeout=20, **kw)
    r.raise_for_status()
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding
    return BeautifulSoup(r.text, "html.parser")


def txt(el):
    return el.get_text(" ", strip=True) if el else ""


def num(s):
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else 0


def parse_time(s):
    """'2026-10-04 12:30:11', '2026.10.04', '12:30', '12:30:11', '10.04', '10/04' -> ISO(KST)."""
    s = (s or "").strip()
    now = datetime.now(KST)
    m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", s)
    if m:
        y, mo, d, h, mi, se = (int(x) if x else 0 for x in m.groups())
        return datetime(y, mo, d, h, mi, se, tzinfo=KST).isoformat()
    m = re.search(r"(\d{2})[.\-/](\d{2})[.\-/](\d{2})", s)  # 26.10.04
    if m:
        y, mo, d = (int(x) for x in m.groups())
        return datetime(2000 + y, mo, d, tzinfo=KST).isoformat()
    m = re.search(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", s)
    if m:
        h, mi, se = (int(x) if x else 0 for x in m.groups())
        t = now.replace(hour=h, minute=mi, second=se, microsecond=0)
        if t > now + timedelta(minutes=5):
            t -= timedelta(days=1)
        return t.isoformat()
    m = re.search(r"^(\d{1,2})[.\-/](\d{1,2})$", s)
    if m:
        mo, d = (int(x) for x in m.groups())
        t = now.replace(month=mo, day=d, hour=0, minute=0, second=0, microsecond=0)
        if t > now:
            t = t.replace(year=t.year - 1)
        return t.isoformat()
    m = re.search(r"(\d+)\s*분\s*전", s)
    if m:
        return (now - timedelta(minutes=int(m.group(1)))).replace(microsecond=0).isoformat()
    m = re.search(r"(\d+)\s*시간\s*전", s)
    if m:
        return (now - timedelta(hours=int(m.group(1)))).replace(microsecond=0).isoformat()
    return ""


def dc(b):
    key = b["key"]
    # 일반/마이너/미니 갤러리 순서로 시도 (PC 목록은 정확한 작성 시각을 준다)
    for base in ("https://gall.dcinside.com/board/lists/",
                 "https://gall.dcinside.com/mgallery/board/lists/",
                 "https://gall.dcinside.com/mini/board/lists/"):
        try:
            soup = get(base, params={"id": key})
        except requests.HTTPError:
            continue
        rows = soup.select("tr.ub-content")
        if not rows:
            continue
        posts = []
        for tr in rows:
            no = txt(tr.select_one("td.gall_num"))
            if not no.isdigit():
                continue  # 공지, 설문, AD
            a = tr.select_one("td.gall_tit a[href*='no=']")
            if not a:
                continue
            for junk in a.select("em, span.reply_num"):
                junk.extract()
            w = tr.select_one("td.gall_writer")
            d = tr.select_one("td.gall_date")
            posts.append({
                "title": txt(a),
                "url": f"https://m.dcinside.com/board/{key}/{no}",
                "author": (w.get("data-nick") if w else "") or txt(w),
                "time": parse_time((d.get("title") if d else "") or txt(d)),
                "comments": num(txt(tr.select_one("span.reply_num"))),
            })
        if posts:
            return posts
    raise RuntimeError("디시 목록을 찾지 못함")


def fmkorea(b):
    key = b["key"]
    soup = get("https://www.fmkorea.com/index.php", params={"mid": key},
               headers={"Referer": "https://www.fmkorea.com/"})
    posts = []
    for tr in soup.select("table.bd_lst tbody tr:not(.notice)"):
        a = tr.select_one("td.title a[href]")
        if not a:
            continue
        rc = tr.select_one("a.replyNum")
        title = txt(a)
        posts.append({
            "title": title,
            "url": urljoin("https://m.fmkorea.com/", a["href"]),
            "author": txt(tr.select_one("td.author")),
            "time": parse_time(txt(tr.select_one("td.time"))),
            "comments": num(txt(rc)),
        })
    if not posts:  # 웹진형 목록
        for li in soup.select("li.li"):
            a = li.select_one("h3.title a[href]")
            if not a:
                continue
            rc = a.select_one(".comment_count")
            if rc:
                rc.extract()
            posts.append({
                "title": txt(a),
                "url": urljoin("https://m.fmkorea.com/", a["href"]),
                "author": txt(li.select_one(".author")).lstrip("/ "),
                "time": parse_time(txt(li.select_one(".regdate"))),
                "comments": num(txt(rc)),
            })
    if not posts:
        title = txt(soup.select_one("title"))
        raise RuntimeError(f"펨코 목록을 찾지 못함 (페이지 제목: {title[:40]})")
    return posts


def mlbpark(b):
    soup = get("https://mlbpark.donga.com/mp/b.php", params={"b": b["key"], "m": "list"})
    posts = []
    for tr in soup.select("table.tbl_type01 tbody tr"):
        tds = tr.find_all("td")
        if not tds or not txt(tds[0]).isdigit():
            continue
        a = tr.select_one("a.txt[href]") or tr.select_one("td.t_left a[href]")
        if not a:
            continue
        posts.append({
            "title": a.get("alt") or txt(a),
            "url": urljoin("https://mlbpark.donga.com/", a["href"]),
            "author": txt(tr.select_one(".nick")),
            "time": parse_time(txt(tr.select_one(".date"))),
            "comments": num(txt(tr.select_one(".replycnt"))),
        })
    if not posts:
        raise RuntimeError("엠팍 목록을 찾지 못함")
    return posts


PARSERS = {"dc": dc, "fmkorea": fmkorea, "mlbpark": mlbpark}


def main(out="posts.json"):
    try:
        old = {x["id"]: x for x in json.load(open(out, encoding="utf-8"))["boards"]}
    except Exception:
        old = {}
    now = datetime.now(KST).replace(microsecond=0).isoformat()
    result = []
    for b in BOARDS:
        entry = {"id": b["id"], "name": b["name"], "url": b["url"]}
        try:
            posts = [p for p in PARSERS[b["kind"]](b) if p["title"]][:MAX_POSTS]
            entry.update(posts=posts, updatedAt=now)
            print(f"[ok] {b['name']}: {len(posts)}개")
        except Exception as e:  # 실패하면 지난번 글을 유지하고 오류만 기록
            prev = old.get(b["id"], {})
            entry.update(posts=prev.get("posts", []), updatedAt=prev.get("updatedAt", ""),
                         error=f"{type(e).__name__}: {e}"[:200])
            print(f"[실패] {b['name']}: {e}", file=sys.stderr)
        result.append(entry)
        time.sleep(1.5)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"updatedAt": now, "boards": result}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:])
