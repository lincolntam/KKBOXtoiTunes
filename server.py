from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from html import unescape
import re
import json


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/meta":
            self.fetch_meta(parsed)
            return
        if parsed.path == "/api/fetch":
            self.fetch_url(parsed)
            return
        super().do_GET()

    def get_kkbox_html(self, url):
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-Hant,zh;q=0.9,en;q=0.8",
                "Accept-Encoding": "identity",
                "Connection": "close",
            },
        )
        with urlopen(request, timeout=10) as response:
            body = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
        return body.decode(charset, errors="replace")

    def fetch_meta(self, parsed):
        params = parse_qs(parsed.query)
        url = params.get("url", [""])[0]
        if not url.startswith(("https://www.kkbox.com/", "https://kkbox.com/")):
            self.send_json({"error": "Only KKBOX URLs are allowed"}, 400)
            return
        try:
            html = self.get_kkbox_html(url)
            data = extract_metadata(html)
            data["sourceUrl"] = url
            data["pageSource"] = html
            self.send_json(data, 200)
        except HTTPError as error:
            self.send_json({"error": f"KKBOX returned HTTP {error.code}"}, error.code)
        except URLError as error:
            self.send_json({"error": str(error.reason)}, 502)
        except TimeoutError:
            self.send_json({"error": "Request timed out"}, 504)

    def fetch_url(self, parsed):
        params = parse_qs(parsed.query)
        url = params.get("url", [""])[0]
        if not url.startswith(("https://www.kkbox.com/", "https://kkbox.com/")):
            self.send_json({"error": "Only KKBOX URLs are allowed"}, 400)
            return

        try:
            html = self.get_kkbox_html(url)
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except HTTPError as error:
            self.send_json({"error": f"KKBOX returned HTTP {error.code}"}, error.code)
        except URLError as error:
            self.send_json({"error": str(error.reason)}, 502)
        except TimeoutError:
            self.send_json({"error": "Request timed out"}, 504)

    def send_json(self, payload, status):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def clean(value):
    if value is None:
        return ""
    return re.sub(r"[ \t]+", " ", unescape(str(value))).strip()


def first_match(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.I | re.S)
        if match:
            return clean(match.group(1))
    return ""


def meta(html, *names):
    for name in names:
        pattern = rf'<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']'
        value = first_match(html, [pattern])
        if value:
            return value
        pattern = rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']'
        value = first_match(html, [pattern])
        if value:
            return value
    return ""


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def jsonld_data(html):
    data = {}
    blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.I | re.S)
    for block in blocks:
        try:
            parsed = json.loads(unescape(block.strip()))
        except Exception:
            continue
        for node in walk(parsed):
            node_type = " ".join(node.get("@type", [])) if isinstance(node.get("@type"), list) else str(node.get("@type", ""))
            if not re.search(r"MusicRecording|MusicAlbum|Song", node_type, re.I) and not (node.get("byArtist") or node.get("inAlbum")):
                continue
            data.setdefault("title", clean(node.get("name") or node.get("title")))
            album = node.get("inAlbum") or node.get("album") or {}
            if isinstance(album, dict):
                data.setdefault("album", clean(album.get("name")))
            elif album:
                data.setdefault("album", clean(album))
            data.setdefault("releaseDate", clean(node.get("datePublished") or node.get("releaseDate") or node.get("dateCreated")))
            image = node.get("image")
            if isinstance(image, list):
                image = image[0] if image else ""
            data.setdefault("artwork", clean(image))
            artist = node.get("byArtist") or node.get("artist") or node.get("artists")
            if isinstance(artist, list):
                data.setdefault("artist", ", ".join(clean(item.get("name") if isinstance(item, dict) else item) for item in artist if item))
            elif isinstance(artist, dict):
                data.setdefault("artist", clean(artist.get("name")))
            elif artist:
                data.setdefault("artist", clean(artist))
    return {key: value for key, value in data.items() if value}


def extract_metadata(html):
    text = re.sub(r"<(script|style|noscript|svg)[\s\S]*?</\1>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = "\n".join(clean(line) for line in text.splitlines() if clean(line))
    og_title = meta(html, "og:title", "twitter:title")
    description = meta(html, "og:description", "description", "twitter:description")
    parts = [clean(part) for part in re.split(r"\s-\s|\s\|\s", og_title) if clean(part)]
    data = {
        "title": re.sub(r"\s*(-|\|)\s*KKBOX.*$", "", parts[0] if parts else og_title, flags=re.I),
        "artist": first_match(description, [r"藝人[：:]\s*([^。\n]+)", r"歌手[：:]\s*([^。\n]+)"]) or (parts[1] if len(parts) > 1 and not re.search(r"KKBOX|歌曲|專輯", parts[1]) else ""),
        "album": first_match(description, [r"專輯[：:]\s*([^。\n]+)"]),
        "releaseDate": first_match(description + "\n" + text, [r"(\d{4}[/-]\d{1,2}[/-]\d{1,2})"]),
        "artwork": meta(html, "og:image", "twitter:image", "image"),
        "lyricist": first_match(text, [r"作詞\s*[：:]\s*([^\n]+)"]),
        "composer": first_match(text, [r"作曲\s*[：:]\s*([^\n]+)"]),
        "arranger": first_match(text, [r"編曲\s*[：:]\s*([^\n]+)"]),
        "producer": first_match(text, [r"製作人?\s*[：:]\s*([^\n]+)"]),
    }
    data.update({key: value for key, value in jsonld_data(html).items() if value and not data.get(key)})
    if data.get("releaseDate") and not data.get("year"):
        data["year"] = data["releaseDate"][:4]
    credit_start = re.search(r"(作詞\s*[：:][\s\S]+)", text)
    if credit_start:
        data["lyrics"] = credit_start.group(1).strip()
    return {key: value for key, value in data.items() if value}


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    print("Serving KKBOX Copy Kit on http://127.0.0.1:4173")
    server.serve_forever()
