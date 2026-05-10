const fields = [
  "title",
  "artist",
  "album",
  "year",
  "releaseDate",
  "lyricist",
  "composer",
  "arranger",
  "producer",
  "artwork",
  "sourceUrl",
  "lyrics"
];

const exampleUrl = "https://www.kkbox.com/tw/tc/song/KtwsrbRFIXgP3koIOj";
const $ = (id) => document.getElementById(id);

function setState(state) {
  document.body.classList.remove("state-initial", "state-loading", "state-ready", "state-fallback");
  document.body.classList.add(`state-${state}`);
}

function setStatus(message, ok = true) {
  $("status").textContent = message;
  $("status").style.color = ok ? "#2f8b57" : "#b42318";
}

function clean(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function splitPeople(value) {
  return clean(value)
    .replace(/、/g, ", ")
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flattenObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenObjects(item, output));
    return output;
  }
  output.push(value);
  Object.values(value).forEach((item) => flattenObjects(item, output));
  return output;
}

function textFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
  return doc.body ? doc.body.innerText : html;
}

function metaContent(doc, ...names) {
  for (const name of names) {
    const node = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    if (node?.content) return clean(node.content);
  }
  return "";
}

function normalizeTitle(rawTitle) {
  return clean(rawTitle)
    .replace(/\s*-\s*KKBOX.*$/i, "")
    .replace(/\s*\|\s*KKBOX.*$/i, "");
}

function parseMeta(doc) {
  const ogTitle = metaContent(doc, "og:title", "twitter:title");
  const description = metaContent(doc, "og:description", "description", "twitter:description");
  const titleParts = ogTitle.split(/\s-\s|\s\|\s/).map(clean).filter(Boolean);
  const data = {
    title: normalizeTitle(titleParts[0] || ogTitle),
    artist: firstMatch(description, [/藝人[：:]\s*([^。\n]+)/, /歌手[：:]\s*([^。\n]+)/]),
    album: firstMatch(description, [/專輯[：:]\s*([^。\n]+)/]),
    releaseDate: firstMatch(description, [/(\d{4}[/-]\d{1,2}[/-]\d{1,2})/]),
    artwork: metaContent(doc, "og:image", "twitter:image", "image")
  };

  if (!data.artist && titleParts.length > 1 && !/KKBOX|歌曲|專輯/.test(titleParts[1])) {
    data.artist = titleParts[1];
  }
  return data;
}

function parseStructuredData(doc) {
  const data = {};
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')];
  for (const script of scripts) {
    const parsed = safeJsonParse(script.textContent);
    if (!parsed) continue;
    const objects = flattenObjects(parsed);
    for (const node of objects) {
      const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : String(node["@type"] || "");
      const looksMusic = /MusicRecording|MusicAlbum|Song/i.test(type) || node.byArtist || node.inAlbum;
      if (!looksMusic) continue;
      data.title ||= node.name || node.title;
      data.album ||= node.inAlbum?.name || node.album?.name || node.albumTitle;
      data.releaseDate ||= node.datePublished || node.releaseDate || node.dateCreated;
      data.artwork ||= Array.isArray(node.image) ? node.image[0] : node.image || node.coverUrl || node.cover;
      const artist = node.byArtist || node.artist || node.artists;
      if (Array.isArray(artist)) data.artist ||= artist.map((person) => person.name || person).join(", ");
      else if (artist) data.artist ||= artist.name || artist;
    }
  }
  return data;
}

function lineAfter(lines, labels) {
  const index = lines.findIndex((line) => labels.some((label) => line === label || line.includes(label)));
  return index >= 0 ? clean(lines[index + 1] || "") : "";
}

function likelyArtist(lines, title, album) {
  const blocked = new Set([
    title,
    album,
    "歌曲",
    "專輯",
    "出自專輯",
    "試聽",
    "聽全曲",
    "KKBOX",
    "特色功能",
    "訂閱方案",
    "娛樂情報",
    "會員服務",
    "關於我們"
  ].filter(Boolean));
  const named = firstMatch(lines.join("\n"), [/(?:藝人|歌手)\s*[：:]\s*([^\n]+)/]);
  if (named) return named;
  const titleIndex = lines.findIndex((line) => line === title);
  if (titleIndex >= 0) {
    for (const candidate of lines.slice(titleIndex + 1, titleIndex + 7)) {
      if (!blocked.has(candidate) && !/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(candidate)) return candidate;
    }
  }
  return "";
}

function parseLyrics(lines) {
  const firstCredit = lines.findIndex((line) => /^(作詞|作曲|編曲|製作|製作人)\s*[：:]/.test(line));
  if (firstCredit < 0) return "";
  const stopLabels = /^(專輯曲目|收錄專輯|熱門歌曲|相關歌曲|更多|分享|下載|試聽|聽全曲)$/;
  const lyricLines = [];
  for (const line of lines.slice(firstCredit)) {
    if (lyricLines.length > 6 && stopLabels.test(line)) break;
    lyricLines.push(line);
  }
  return lyricLines.join("\n");
}

function parseVisibleText(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const joined = lines.join("\n");
  const title = lineAfter(lines, ["歌曲"]) || firstMatch(joined, [/歌曲\s*\n([^\n]+)/]);
  const album = lineAfter(lines, ["出自專輯"]) || firstMatch(joined, [/專輯[：:]\s*([^\n]+)/]);
  const date = firstMatch(joined, [/(\d{4}[/-]\d{1,2}[/-]\d{1,2})/]);
  return {
    title,
    artist: likelyArtist(lines, title, album),
    album,
    releaseDate: date,
    year: date ? date.slice(0, 4) : firstMatch(joined, [/年份\s*[：:]\s*(\d{4})/]),
    lyricist: splitPeople(firstMatch(joined, [/作詞\s*[：:]\s*([^\n]+)/])),
    composer: splitPeople(firstMatch(joined, [/作曲\s*[：:]\s*([^\n]+)/])),
    arranger: splitPeople(firstMatch(joined, [/編曲\s*[：:]\s*([^\n]+)/])),
    producer: splitPeople(firstMatch(joined, [/製作人?\s*[：:]\s*([^\n]+)/])),
    lyrics: parseLyrics(lines)
  };
}

function mergeData(...sources) {
  const result = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      const cleaned = clean(value);
      if (cleaned) result[key] = cleaned;
    }
  }
  return result;
}

function parseSource(source, sourceUrl = "") {
  const looksHtml = /<html|<meta|<script|<body/i.test(source);
  const doc = new DOMParser().parseFromString(source, "text/html");
  const visibleText = looksHtml ? textFromHtml(source) : source;
  const rawText = looksHtml ? `${visibleText}\n${source}` : source;
  const merged = mergeData(parseMeta(doc), parseStructuredData(doc), parseVisibleText(rawText));
  if (!merged.year && merged.releaseDate) merged.year = merged.releaseDate.slice(0, 4);
  if (sourceUrl) merged.sourceUrl = sourceUrl;
  applyData(merged);
  return merged;
}

function applyData(data) {
  for (const field of fields) {
    if (data[field]) $(field).value = clean(data[field]);
  }
  updateArtwork();
  updatePlayer();
  buildExport();
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value || " ";
}

function updatePlayer() {
  const title = $("title").value.trim() || "Paste a KKBOX song";
  const artist = $("artist").value.trim() || "Then copy every field fast";
  const album = $("album").value.trim() || "Album";
  setText("playerTitle", title);
  setText("playerArtist", artist);
  setText("miniTitle", title);
  setText("miniArtist", artist);
}

function updateArtwork() {
  const url = $("artwork").value.trim();
  const img = $("artworkPreview");
  const thumb = $("playerThumb");
  const ambient = $("ambientArtwork");
  img.style.display = url ? "block" : "none";
  $("emptyArtwork").style.display = url ? "none" : "block";
  if (url) {
    img.src = url;
    if (thumb) thumb.src = url;
    ambient.src = url;
  } else {
    if (thumb) thumb.removeAttribute("src");
    ambient.removeAttribute("src");
  }
}

async function fetchViaProxy(url) {
  const endpoint = `/api/meta?url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildExport() {
  const rows = [
    ["Song", $("title").value],
    ["Artist", $("artist").value],
    ["Album", $("album").value],
    ["Year", $("year").value],
    ["Release Date", $("releaseDate").value],
    ["Lyricist", $("lyricist").value],
    ["Composer", $("composer").value],
    ["Arranger", $("arranger").value],
    ["Producer", $("producer").value],
    ["Artwork", $("artwork").value],
    ["Source", $("sourceUrl").value]
  ];
  const details = rows.filter(([, value]) => clean(value)).map(([key, value]) => `${key}: ${value}`).join("\n");
  $("exportText").value = `${details}\n\nLyrics:\n${$("lyrics").value.trim()}`.trim();
}

async function copyValue(id) {
  await navigator.clipboard.writeText($(id).value);
  setStatus("Copied");
}

$("songForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = $("songUrl").value.trim();
  if (!url) return setStatus("Paste a URL first", false);
  $("sourceUrl").value = url;
  setState("loading");
  setStatus("Reading...");
  try {
    const data = await fetchViaProxy(url);
    if (data.pageSource) $("sourceText").value = data.pageSource;
    applyData(data);
    setState(data.title || data.artist || data.artwork ? "ready" : "fallback");
    setStatus(data.title || data.artist || data.artwork ? "Read and parsed" : "Read, but no song data found", Boolean(data.title || data.artist || data.artwork));
  } catch (error) {
    setState("fallback");
    setStatus("Auto read failed. Paste page source or visible page text.", false);
  }
});

$("parseText").addEventListener("click", () => {
  const source = $("sourceText").value.trim();
  if (!source) return setStatus("Paste content first", false);
  setState("loading");
  const data = parseSource(source, $("songUrl").value.trim());
  if (data.title || data.artist || data.artwork || data.lyrics) {
    setState("ready");
    setStatus("Parsed pasted content");
  } else {
    setState("fallback");
    setStatus("Could not find song data in pasted content", false);
  }
});

$("loadExample").addEventListener("click", () => {
  $("songUrl").value = exampleUrl;
  $("sourceUrl").value = exampleUrl;
  setStatus("Example URL loaded");
});

$("clearAll").addEventListener("click", () => {
  fields.forEach((field) => $(field).value = "");
  $("songUrl").value = "";
  $("sourceText").value = "";
  $("exportText").value = "";
  updateArtwork();
  updatePlayer();
  setState("initial");
  setStatus("");
});

document.querySelectorAll(".copy[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copyValue(button.dataset.copy));
});

$("copyExport").addEventListener("click", async () => {
  buildExport();
  await copyValue("exportText");
});

$("buildExport").addEventListener("click", buildExport);
$("artwork").addEventListener("input", () => {
  updateArtwork();
  buildExport();
});
fields.forEach((field) => $(field)?.addEventListener("input", () => {
  updatePlayer();
  buildExport();
}));

$("loadExample").click();
updatePlayer();
