// Small, dependency-free helpers for turning RSS/Atom and job-board responses
// into the JSON shape the site reads (data/news.json and data/jobs.json).

import { createHash } from "node:crypto";
import { classifyNews, classifyJob, jobRegion } from "../assets/topics.js";

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  trade: "™",
  reg: "®",
  copy: "©",
};

export function decodeEntities(text = "") {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function unwrapCdata(text = "") {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripHtml(html = "") {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text, max = 220) {
  if (!text || text.length <= max) return text || "";
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[\s,.;:–—-]+$/, "")}…`;
}

export function safeUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function idFor(...parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

export function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 90);
}

export function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : "";
}

function tagAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  let m;
  while ((m = re.exec(block))) {
    const attrs = m[1];
    if (tag === "link" && /rel=["'](?!alternate)/i.test(attrs)) continue;
    const a = attrs.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
    if (a) return decodeEntities(a[1]);
  }
  return "";
}

/**
 * Parse an RSS 2.0 or Atom document into plain items.
 * Returns [{ title, url, publishedAt, summary, source }].
 */
export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockTag = isAtom ? "entry" : "item";
  const blocks = xml.match(new RegExp(`<${blockTag}[\\s>][\\s\\S]*?<\\/${blockTag}>`, "gi")) || [];

  return blocks
    .map((block) => {
      const title = stripHtml(tagValue(block, "title"));
      const url = safeUrl(
        isAtom ? tagAttr(block, "link", "href") || tagValue(block, "id") : decodeEntities(tagValue(block, "link"))
      );
      const published =
        tagValue(block, "pubDate") ||
        tagValue(block, "published") ||
        tagValue(block, "updated") ||
        tagValue(block, "dc:date");
      const rawSummary =
        tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content");
      const source = stripHtml(tagValue(block, "source"));
      return {
        title,
        url,
        publishedAt: toIsoDate(published),
        summary: truncate(stripHtml(rawSummary)),
        source,
      };
    })
    .filter((item) => item.title && item.url);
}

/** Google News titles look like "Headline - Publisher"; split them apart. */
export function cleanGoogleNewsItem(item) {
  let { title, source } = item;
  if (source && title.endsWith(` - ${source}`)) {
    title = title.slice(0, -(source.length + 3)).trim();
  } else if (!source) {
    const idx = title.lastIndexOf(" - ");
    if (idx > 20) {
      source = title.slice(idx + 3).trim();
      title = title.slice(0, idx).trim();
    }
  }
  // Google News descriptions only repeat the headline as a link; drop them.
  return { ...item, title, source: source || "Google News", summary: "" };
}

export function toNewsItem(raw, fallbackSource, nowIso) {
  const text = `${raw.title} ${raw.summary || ""}`;
  return {
    id: idFor(normalizeTitle(raw.title)),
    title: raw.title,
    url: raw.url,
    source: raw.source || fallbackSource,
    publishedAt: raw.publishedAt || nowIso,
    summary: raw.summary || "",
    topics: classifyNews(text),
  };
}

/**
 * Merge freshly fetched news with what we already had, drop duplicates and
 * anything older than `maxAgeDays`, newest first.
 */
export function mergeNews(fresh, previous, { now = Date.now(), maxAgeDays = 21, limit = 240 } = {}) {
  const cutoff = now - maxAgeDays * 86400000;
  const seen = new Map();
  // Fresh items first so updated metadata wins; publisher feeds before Google News.
  const ordered = [...fresh].sort((a, b) => (a.source === "Google News") - (b.source === "Google News"));
  for (const item of [...ordered, ...previous]) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    const ts = Date.parse(item.publishedAt);
    if (!Number.isFinite(ts) || ts < cutoff || ts > now + 86400000) continue;
    seen.set(key, item);
  }
  return [...seen.values()]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export function toJobItem({ title, company, location, url, postedAt, sourceKey }) {
  const categories = classifyJob(title);
  const safe = safeUrl(url);
  if (!categories.length || !safe) return null;
  const loc = (location || "").replace(/\s+/g, " ").trim();
  return {
    id: idFor(company, title, loc, safe),
    title: title.trim(),
    company,
    location: loc || "Not specified",
    region: jobRegion(loc),
    url: safe,
    postedAt: toIsoDate(postedAt),
    categories,
    sourceKey,
  };
}

export function parseGreenhouse(json, company, token) {
  return (json.jobs || []).map((j) =>
    toJobItem({
      title: j.title,
      company,
      location: j.location?.name,
      url: j.absolute_url,
      postedAt: j.first_published || j.updated_at,
      sourceKey: `greenhouse:${token}`,
    })
  );
}

export function parseLever(json, company, token) {
  return (Array.isArray(json) ? json : []).map((j) =>
    toJobItem({
      title: j.text,
      company,
      location: j.categories?.location || j.workplaceType,
      url: j.hostedUrl,
      postedAt: j.createdAt,
      sourceKey: `lever:${token}`,
    })
  );
}

export function parseAshby(json, company, token) {
  return (json.jobs || []).map((j) =>
    toJobItem({
      title: j.title,
      company,
      location: [j.location, j.isRemote ? "Remote" : ""].filter(Boolean).join(" · "),
      url: j.jobUrl,
      postedAt: j.publishedAt,
      sourceKey: `ashby:${token}`,
    })
  );
}

export function parseRemotive(json, term) {
  return (json.jobs || []).map((j) =>
    toJobItem({
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location ? `Remote · ${j.candidate_required_location}` : "Remote",
      url: j.url,
      postedAt: j.publication_date,
      sourceKey: `remotive:${term}`,
    })
  );
}

/** True when two item lists are identical (used to skip no-op commits). */
export function sameItems(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
