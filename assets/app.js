import { NEWS_TOPICS, JOB_CATEGORIES, classifyNews } from "./topics.js";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const NEWS_URL = "data/news.json";
const JOBS_URL = "data/jobs.json";
const POLL_MS = 10 * 60 * 1000;
const STALE_MS = 48 * 60 * 60 * 1000;
const NEWS_PAGE = 30;
const JOBS_PAGE = 12;

const TOPIC_COLORS = {
  india: "var(--t-india)",
  design: "var(--t-design)",
  manufacturing: "var(--t-manufacturing)",
  packaging: "var(--t-packaging)",
  ai: "var(--t-ai)",
  policy: "var(--t-policy)",
};

const COMPANIES = [
  "TSMC", "Intel", "Samsung", "NVIDIA", "AMD", "Qualcomm", "Micron", "SK hynix", "ASML", "Synopsys",
  "Cadence", "Arm", "Broadcom", "Apple", "Tata", "Texas Instruments", "GlobalFoundries", "Applied Materials",
  "Infineon", "STMicro", "NXP", "MediaTek", "Rapidus", "Huawei", "SMIC", "Marvell", "Lam Research",
  "Tokyo Electron", "Microchip", "Renesas", "Foxconn", "HCL", "Kaynes", "CG Power", "Tenstorrent", "SiFive",
  "Siemens", "Keysight", "Ansys", "Analog Devices", "onsemi", "Wolfspeed", "UMC", "Kioxia", "Western Digital",
];

const ROLE_QUERIES = {
  all: "VLSI",
  design: "RTL design",
  verification: "design verification",
  physical: "physical design",
  dft: "DFT engineer",
  analog: "analog design",
  fpga: "FPGA engineer",
  validation: "post silicon validation",
  architecture: "SoC architect",
  process: "semiconductor process engineer",
};

const CAREER_PAGES = [
  ["NVIDIA", "https://www.nvidia.com/en-us/about-nvidia/careers/"],
  ["AMD", "https://careers.amd.com/"],
  ["Intel", "https://jobs.intel.com/"],
  ["Qualcomm", "https://careers.qualcomm.com/"],
  ["Texas Instruments", "https://careers.ti.com/"],
  ["Synopsys", "https://careers.synopsys.com/"],
  ["Cadence", "https://www.cadence.com/en_US/home/company/careers.html"],
  ["Micron", "https://careers.micron.com/"],
  ["Arm", "https://careers.arm.com/"],
  ["MediaTek", "https://careers.mediatek.com/"],
  ["Broadcom", "https://www.broadcom.com/company/careers"],
  ["Tata Electronics", "https://www.tataelectronics.com/careers"],
];

const RESOURCES = [
  {
    title: "Learn & practice",
    links: [
      ["ChipVerify", "https://www.chipverify.com/", "Verilog, SystemVerilog and UVM tutorials"],
      ["Verification Academy", "https://verificationacademy.com/", "Courses and cookbooks on UVM and formal"],
      ["HDLBits", "https://hdlbits.01xz.net/", "Bite-sized Verilog practice problems"],
      ["NPTEL", "https://nptel.ac.in/", "Free IIT courses on VLSI and digital design"],
    ],
  },
  {
    title: "Open-source silicon",
    links: [
      ["Tiny Tapeout", "https://tinytapeout.com/", "Get your own design manufactured on a shared chip"],
      ["OpenROAD", "https://theopenroadproject.org/", "Open RTL-to-GDS flow"],
      ["SkyWater SKY130 PDK", "https://github.com/google/skywater-pdk", "Open 130 nm process design kit"],
      ["RISC-V International", "https://riscv.org/", "Specs, news and the RISC-V ecosystem"],
    ],
  },
  {
    title: "Industry & policy",
    links: [
      ["India Semiconductor Mission", "https://ism.gov.in/", "Schemes, approved fabs and OSAT projects"],
      ["SemiEngineering", "https://semiengineering.com/", "Deep technical coverage of the chip stack"],
      ["SEMI", "https://www.semi.org/", "Industry association, market data and events"],
      ["SIA", "https://www.semiconductors.org/", "Semiconductor Industry Association reports"],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch {
    return "#";
  }
}

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — ignore */
    }
  },
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-calendarDaysAgo(ts), "day");
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function calendarDaysAgo(ts) {
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(new Date()) - start(new Date(ts))) / 86400000);
}

function dayLabel(iso) {
  const d = new Date(iso);
  const days = calendarDaysAgo(d.getTime());
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const topicLabel = Object.fromEntries(NEWS_TOPICS.map((t) => [t.id, t.label]));
const roleLabel = Object.fromEntries(JOB_CATEGORIES.map((c) => [c.id, c.label]));

function initials(name = "") {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);
const state = {
  news: [],
  jobs: [],
  newsGeneratedAt: null,
  jobsGeneratedAt: null,
  newsSource: "feed", // "feed" | "live"
  topic: params.get("topic") || "all",
  newsQuery: params.get("q") || "",
  newsLimit: NEWS_PAGE,
  role: params.get("role") || "all",
  region: params.get("region") || "all",
  jobsQuery: "",
  jobsLimit: JOBS_PAGE,
  topIds: new Set(),
  saved: new Map(store.get("vp-saved", [])),
  lastVisit: store.get("vp-last-visit", null),
};

function syncUrl() {
  const p = new URLSearchParams();
  if (state.topic !== "all") p.set("topic", state.topic);
  if (state.newsQuery) p.set("q", state.newsQuery);
  if (state.role !== "all") p.set("role", state.role);
  if (state.region !== "all") p.set("region", state.region);
  const qs = p.toString();
  history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

async function getJson(url) {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Fallback when the scheduled feed hasn't produced data yet (or is stale):
// pull recent semiconductor stories straight from the Hacker News search API.
async function loadLiveNews() {
  const since = Math.floor((Date.now() - 14 * 86400000) / 1000);
  const queries = ["semiconductor", "TSMC", "chip design", "RISC-V", "Nvidia chip", "foundry"];
  const results = await Promise.allSettled(
    queries.map((q) =>
      fetch(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=30`
      ).then((r) => (r.ok ? r.json() : { hits: [] }))
    )
  );
  const seen = new Set();
  const items = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value.hits || []) {
      if (!hit.url || !hit.title) continue;
      const key = hit.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let host = "Hacker News";
      try {
        host = new URL(hit.url).hostname.replace(/^www\./, "");
      } catch {}
      items.push({
        id: `hn-${hit.objectID}`,
        title: hit.title,
        url: hit.url,
        source: host,
        publishedAt: hit.created_at,
        summary: "",
        topics: classifyNews(hit.title),
      });
    }
  }
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

async function loadNews() {
  let feed = null;
  try {
    feed = await getJson(NEWS_URL);
  } catch (e) {
    console.warn(e);
  }
  const items = feed?.items || [];
  const fresh = feed?.generatedAt && Date.now() - Date.parse(feed.generatedAt) < STALE_MS;

  if (items.length && fresh) {
    Object.assign(state, { news: items, newsGeneratedAt: feed.generatedAt, newsSource: "feed" });
    return;
  }

  try {
    const live = await loadLiveNews();
    if (live.length) {
      // Keep anything still useful from an old feed alongside live results.
      const known = new Set(live.map((i) => i.title.toLowerCase()));
      const merged = [...live, ...items.filter((i) => !known.has(i.title.toLowerCase()))].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
      );
      Object.assign(state, { news: merged, newsGeneratedAt: new Date().toISOString(), newsSource: "live" });
      return;
    }
  } catch (e) {
    console.warn(e);
  }
  Object.assign(state, { news: items, newsGeneratedAt: feed?.generatedAt || null, newsSource: "feed" });
}

async function loadJobs() {
  try {
    const feed = await getJson(JOBS_URL);
    state.jobs = feed.items || [];
    state.jobsGeneratedAt = feed.generatedAt || null;
  } catch (e) {
    console.warn(e);
    state.jobs = [];
  }
}

/* ------------------------------------------------------------------ */
/* Rendering — shared bits                                             */
/* ------------------------------------------------------------------ */

const BOOKMARK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

function saveButton(kind, item) {
  const on = state.saved.has(item.id);
  return `<button class="save-btn" type="button" data-save="${esc(item.id)}" data-kind="${kind}" aria-pressed="${on}" aria-label="${on ? "Remove from saved" : "Save"}: ${esc(item.title)}">${BOOKMARK_SVG}</button>`;
}

function topicTags(topics = []) {
  if (!topics.length) return "";
  return `<div class="tags">${topics
    .slice(0, 3)
    .map((t) => `<span class="tag" style="--tag-color:${TOPIC_COLORS[t] || "var(--muted)"}">${esc(topicLabel[t] || t)}</span>`)
    .join("")}</div>`;
}

const isNew = (item) => state.lastVisit && Date.parse(item.publishedAt) > Date.parse(state.lastVisit);

function storyMeta(item) {
  return `<div class="meta">
    <span class="source">${esc(item.source)}</span>
    <time datetime="${esc(item.publishedAt)}" title="${esc(new Date(item.publishedAt).toLocaleString())}">${esc(timeAgo(item.publishedAt))}</time>
    ${isNew(item) ? '<span class="new-flag">New</span>' : ""}
  </div>`;
}

function storyRow(item) {
  return `<article class="story">
    ${storyMeta(item)}
    <h3><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
    ${item.summary ? `<p class="summary">${esc(item.summary)}</p>` : ""}
    ${topicTags(item.topics)}
    ${saveButton("news", item)}
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Masthead                                                            */
/* ------------------------------------------------------------------ */

function renderMasthead(error) {
  $("#today").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const status = $("#sync-status");
  const text = $("#sync-text");
  status.classList.remove("live", "stale", "error");
  if (error && !state.news.length) {
    status.classList.add("error");
    text.textContent = "Couldn't load stories";
  } else if (state.newsSource === "live") {
    status.classList.add("live");
    text.textContent = "Live from Hacker News";
  } else if (state.newsGeneratedAt) {
    const age = Date.now() - Date.parse(state.newsGeneratedAt);
    status.classList.add(age < 6 * 3600000 ? "live" : "stale");
    text.textContent = `Updated ${timeAgo(state.newsGeneratedAt)}`;
  } else {
    status.classList.add("stale");
    text.textContent = "Waiting for first sync";
  }

  const sources = new Set(state.news.map((n) => n.source));
  $("#stat-stories").textContent = state.news.length.toLocaleString();
  $("#stat-sources").textContent = sources.size.toLocaleString();
  $("#stat-jobs").textContent = state.jobs.length.toLocaleString();
  $("#stat-new").textContent = state.lastVisit
    ? state.news.filter(isNew).length.toLocaleString()
    : "First visit";

  const updated = [state.newsGeneratedAt, state.jobsGeneratedAt].filter(Boolean).sort().pop();
  $("#footer-updated").textContent = updated ? `Data refreshed ${timeAgo(updated)}` : "";
}

/* ------------------------------------------------------------------ */
/* Top stories                                                         */
/* ------------------------------------------------------------------ */

function pickTopStories() {
  const recent = state.news.filter((n) => Date.now() - Date.parse(n.publishedAt) < 48 * 3600000);
  const pool = recent.length >= 5 ? recent : state.news.slice(0, 20);
  const score = (n) =>
    n.topics.length * 2 + (n.topics.includes("india") || n.topics.includes("design") ? 2 : 0) +
    (n.summary ? 1 : 0) - (Date.now() - Date.parse(n.publishedAt)) / (12 * 3600000);
  const ranked = [...pool].sort((a, b) => score(b) - score(a));

  const picked = [];
  const usedSources = new Set();
  for (const n of ranked) {
    if (picked.length === 5) break;
    if (usedSources.has(n.source) && ranked.length > 10) continue;
    picked.push(n);
    usedSources.add(n.source);
  }
  return picked;
}

function renderTopStories() {
  const el = $("#top-stories");
  const top = pickTopStories();
  state.topIds = new Set(top.map((t) => t.id));
  if (!top.length) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const [lead, ...rest] = top;
  el.innerHTML = `
    <article class="lead">
      <p class="kicker">Top story${lead.topics[0] ? ` · ${esc(topicLabel[lead.topics[0]])}` : ""}</p>
      <h3><a href="${esc(safeUrl(lead.url))}" target="_blank" rel="noopener noreferrer">${esc(lead.title)}</a></h3>
      ${lead.summary ? `<p class="summary">${esc(lead.summary)}</p>` : ""}
      <div class="meta" style="margin-top:16px">
        <span class="source">${esc(lead.source)}</span>
        <time datetime="${esc(lead.publishedAt)}">${esc(timeAgo(lead.publishedAt))}</time>
        ${topicTags(lead.topics)}
        <span style="margin-left:auto">${saveButton("news", lead)}</span>
      </div>
    </article>
    ${
      rest.length
        ? `<div class="side-stories">${rest
            .map(
              (n) => `<article>
                <p class="kicker">${esc(n.source)} · ${esc(timeAgo(n.publishedAt))}</p>
                <h3><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></h3>
              </article>`
            )
            .join("")}</div>`
        : ""
    }`;
}

/* ------------------------------------------------------------------ */
/* News list                                                           */
/* ------------------------------------------------------------------ */

function filteredNews() {
  const q = state.newsQuery.trim().toLowerCase();
  const unfiltered = state.topic === "all" && !q;
  return state.news.filter((n) => {
    if (unfiltered && state.topIds.has(n.id)) return false;
    if (state.topic !== "all" && !n.topics.includes(state.topic)) return false;
    if (q && !`${n.title} ${n.summary} ${n.source}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTopicChips() {
  const counts = Object.fromEntries(NEWS_TOPICS.map((t) => [t.id, 0]));
  for (const n of state.news) for (const t of n.topics) if (t in counts) counts[t]++;
  const chip = (id, label, count, color) =>
    `<button class="chip" type="button" data-topic="${id}" aria-pressed="${state.topic === id}">
      ${color ? `<span class="swatch" style="background:${color}"></span>` : ""}${esc(label)}
      <span class="count">${count}</span></button>`;
  $("#topic-chips").innerHTML =
    chip("all", "All stories", state.news.length) +
    NEWS_TOPICS.map((t) => chip(t.id, t.label, counts[t.id], TOPIC_COLORS[t.id])).join("");
}

function renderNewsList() {
  const list = $("#news-list");
  const items = filteredNews();
  const shown = items.slice(0, state.newsLimit);

  if (!state.news.length) {
    list.innerHTML = `<div class="empty"><strong>No stories yet</strong>The news feed syncs every three hours. Check back shortly.</div>`;
  } else if (!items.length) {
    list.innerHTML = `<div class="empty"><strong>Nothing matches</strong>Try another topic or clear the search.
      <div style="margin-top:14px"><button class="btn ghost small" type="button" data-clear-news>Clear filters</button></div></div>`;
  } else {
    const groups = [];
    for (const item of shown) {
      const label = dayLabel(item.publishedAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    list.innerHTML = groups
      .map(
        (g) => `<section class="day-group" aria-label="${esc(g.label)}">
          <h3 class="day-label">${esc(g.label)}</h3>
          ${g.items.map(storyRow).join("")}
        </section>`
      )
      .join("");
  }

  const more = $("#news-more");
  more.hidden = items.length <= shown.length;
  more.textContent = `Show more stories (${items.length - shown.length} left)`;
}

function renderSidebar() {
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = state.news.filter((n) => Date.parse(n.publishedAt) > weekAgo);
  const counts = COMPANIES.map((name) => {
    // "Arm" is matched case-sensitively so verbs like "arm" don't count.
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, name === "Arm" ? "" : "i");
    return [name, recent.filter((n) => re.test(n.title)).length];
  })
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  $("#trending").innerHTML = counts.length
    ? counts.map(([name, c]) => `<button type="button" data-company="${esc(name)}">${esc(name)} <span>${c}</span></button>`).join("")
    : `<p class="panel-sub">Not enough headlines yet.</p>`;

  const bySource = new Map();
  for (const n of state.news) bySource.set(n.source, (bySource.get(n.source) || 0) + 1);
  const top = [...bySource].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = top[0]?.[1] || 1;
  $("#source-list").innerHTML = top
    .map(
      ([name, c]) => `<li><span class="name">${esc(name)}</span><span class="n">${c}</span>
        <span class="bar"><i style="width:${Math.max(6, (c / max) * 100)}%"></i></span></li>`
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

const PIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

function jobMatches(job, { ignoreRole = false } = {}) {
  const q = state.jobsQuery.trim().toLowerCase();
  if (state.region !== "all" && job.region !== state.region) return false;
  if (!ignoreRole && state.role !== "all" && !job.categories.includes(state.role)) return false;
  if (q && !`${job.title} ${job.company} ${job.location}`.toLowerCase().includes(q)) return false;
  return true;
}

function renderRoleChips() {
  const base = state.jobs.filter((j) => jobMatches(j, { ignoreRole: true }));
  const counts = Object.fromEntries(JOB_CATEGORIES.map((c) => [c.id, 0]));
  for (const j of base) for (const c of j.categories) if (c in counts) counts[c]++;
  const chip = (id, label, count) =>
    `<button class="chip" type="button" data-role="${id}" aria-pressed="${state.role === id}">${esc(label)}<span class="count">${count}</span></button>`;
  $("#role-chips").innerHTML =
    chip("all", "All roles", base.length) +
    JOB_CATEGORIES.filter((c) => counts[c.id] > 0 || state.role === c.id)
      .map((c) => chip(c.id, c.label, counts[c.id]))
      .join("");

  for (const btn of document.querySelectorAll("#region-filter button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.region === state.region));
  }
}

function jobCard(job) {
  const posted = job.postedAt ? timeAgo(job.postedAt) : "";
  const regionText = { india: "India", remote: "Remote" }[job.region];
  return `<article class="job">
    <div class="job-top">
      <span class="logo-tile" aria-hidden="true">${esc(initials(job.company))}</span>
      <div>
        <h3>${esc(job.title)}</h3>
        <p class="company">${esc(job.company)}</p>
      </div>
      ${saveButton("job", job)}
    </div>
    <div class="meta">
      <span>${PIN_SVG}${esc(job.location)}</span>
      ${posted ? `<span>Posted ${esc(posted)}</span>` : ""}
    </div>
    <div class="tags">
      ${regionText ? `<span class="region-pill">${regionText}</span>` : ""}
      ${job.categories.map((c) => `<span class="tag">${esc(roleLabel[c] || c)}</span>`).join("")}
    </div>
    <div class="job-actions">
      <a class="btn small" href="${esc(safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">View &amp; apply</a>
    </div>
  </article>`;
}

function renderJobs() {
  renderRoleChips();
  const list = $("#jobs-list");
  const items = state.jobs.filter((j) => jobMatches(j));
  const shown = items.slice(0, state.jobsLimit);

  if (!state.jobs.length) {
    list.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>Openings are on their way</strong>
      Job boards sync every three hours. Meanwhile, the one-tap searches below cover LinkedIn, Naukri and more.</div>`;
  } else if (!items.length) {
    list.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>No openings match</strong>
      Try another role or region, or search the big boards below.
      <div style="margin-top:14px"><button class="btn ghost small" type="button" data-clear-jobs>Clear filters</button></div></div>`;
  } else {
    list.innerHTML = shown.map(jobCard).join("");
  }

  const more = $("#jobs-more");
  more.hidden = items.length <= shown.length;
  more.textContent = `Show more openings (${items.length - shown.length} left)`;

  renderBoardLinks();
}

function renderBoardLinks() {
  const q = state.jobsQuery.trim() || ROLE_QUERIES[state.role] || "VLSI";
  const region = state.region;
  const enc = encodeURIComponent;
  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const where = region === "india" ? "India" : region === "remote" ? "Remote" : "";

  const links = [
    {
      name: "LinkedIn",
      hint: where || "Worldwide",
      url: `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}${where === "India" ? "&location=India" : ""}${region === "remote" ? "&f_WT=2" : ""}`,
    },
    { name: "Naukri", hint: "India", url: `https://www.naukri.com/${slug}-jobs` },
    {
      name: "Indeed",
      hint: region === "india" ? "India" : where || "Worldwide",
      url:
        region === "india"
          ? `https://in.indeed.com/jobs?q=${enc(q)}`
          : `https://www.indeed.com/jobs?q=${enc(q)}${region === "remote" ? "&l=Remote" : ""}`,
    },
    {
      name: "Google Jobs",
      hint: where || "Near you",
      url: `https://www.google.com/search?q=${enc(`${q} jobs${where ? ` ${where}` : ""}`)}&ibp=htl;jobs`,
    },
  ];

  $("#board-role").textContent = q;
  $("#board-links").innerHTML = links
    .map(
      (l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(l.name)}<small>${esc(l.hint)}</small></span></a>`
    )
    .join("");
}

function renderStatic() {
  $("#company-links").innerHTML = CAREER_PAGES.map(
    ([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`
  ).join("");

  $("#resources-grid").innerHTML = RESOURCES.map(
    (group) => `<div class="res-group"><h3>${esc(group.title)}</h3><ul>${group.links
      .map(
        ([name, url, desc]) =>
          `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(name)}</strong><span>${esc(desc)}</span></a></li>`
      )
      .join("")}</ul></div>`
  ).join("");
}

/* ------------------------------------------------------------------ */
/* Saved items                                                         */
/* ------------------------------------------------------------------ */

function persistSaved() {
  store.set("vp-saved", [...state.saved]);
  const badge = $("#saved-count");
  badge.textContent = String(state.saved.size);
  badge.hidden = state.saved.size === 0;
}

function toggleSave(id, kind) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
  } else {
    const source = kind === "job" ? state.jobs : state.news;
    const item = source.find((i) => i.id === id);
    if (!item) return;
    state.saved.set(id, { kind, item, savedAt: new Date().toISOString() });
    toast("Saved — find it under the bookmark icon");
  }
  persistSaved();
  for (const btn of document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`)) {
    const on = state.saved.has(id);
    btn.setAttribute("aria-pressed", String(on));
  }
  if ($("#saved-dialog").open) renderSaved();
}

function renderSaved() {
  const entries = [...state.saved.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  $("#saved-list").innerHTML = entries.length
    ? entries
        .map(({ kind, item }) =>
          kind === "job"
            ? `<article class="story">
                <div class="meta"><span class="source">${esc(item.company)}</span><span>${esc(item.location)}</span></div>
                <h3><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
                ${saveButton("job", item)}
              </article>`
            : storyRow(item)
        )
        .join("")
    : `<div class="empty"><strong>Nothing saved yet</strong>Tap the bookmark on any story or job to keep it here.</div>`;
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

let toastTimer;
function toast(message, action) {
  const el = $("#toast");
  const btn = $("#toast-action");
  $("#toast-text").textContent = message;
  btn.hidden = !action;
  btn.onclick = action
    ? () => {
        el.hidden = true;
        action.run();
      }
    : null;
  if (action) btn.textContent = action.label;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 15000 : 2800);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function renderNewsAll() {
  renderTopStories();
  renderTopicChips();
  renderNewsList();
  renderSidebar();
}

function renderAll(error) {
  renderMasthead(error);
  renderNewsAll();
  renderJobs();
}

function bindEvents() {
  const newsSearch = $("#news-search");
  const jobsSearch = $("#jobs-search");
  newsSearch.value = state.newsQuery;

  let newsTimer;
  newsSearch.addEventListener("input", () => {
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => {
      state.newsQuery = newsSearch.value;
      state.newsLimit = NEWS_PAGE;
      syncUrl();
      renderNewsList();
    }, 120);
  });

  let jobsTimer;
  jobsSearch.addEventListener("input", () => {
    clearTimeout(jobsTimer);
    jobsTimer = setTimeout(() => {
      state.jobsQuery = jobsSearch.value;
      state.jobsLimit = JOBS_PAGE;
      renderJobs();
    }, 120);
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;

    if (t.dataset.topic) {
      state.topic = t.dataset.topic;
      state.newsLimit = NEWS_PAGE;
      syncUrl();
      renderTopicChips();
      renderNewsList();
    } else if (t.dataset.role) {
      state.role = t.dataset.role;
      state.jobsLimit = JOBS_PAGE;
      syncUrl();
      renderJobs();
    } else if (t.dataset.region) {
      state.region = t.dataset.region;
      state.jobsLimit = JOBS_PAGE;
      syncUrl();
      renderJobs();
    } else if (t.dataset.save) {
      toggleSave(t.dataset.save, t.dataset.kind);
    } else if (t.dataset.company) {
      newsSearch.value = t.dataset.company;
      state.newsQuery = t.dataset.company;
      state.topic = "all";
      state.newsLimit = NEWS_PAGE;
      syncUrl();
      renderTopicChips();
      renderNewsList();
      $("#news").scrollIntoView();
    } else if ("clearNews" in t.dataset) {
      newsSearch.value = "";
      Object.assign(state, { newsQuery: "", topic: "all", newsLimit: NEWS_PAGE });
      syncUrl();
      renderTopicChips();
      renderNewsList();
    } else if ("clearJobs" in t.dataset) {
      jobsSearch.value = "";
      Object.assign(state, { jobsQuery: "", role: "all", region: "all", jobsLimit: JOBS_PAGE });
      syncUrl();
      renderJobs();
    }
  });

  $("#news-more").addEventListener("click", () => {
    state.newsLimit += NEWS_PAGE;
    renderNewsList();
  });
  $("#jobs-more").addEventListener("click", () => {
    state.jobsLimit += JOBS_PAGE;
    renderJobs();
  });

  const dialog = $("#saved-dialog");
  $("#open-saved").addEventListener("click", () => {
    renderSaved();
    dialog.showModal();
  });
  $("#close-saved").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  $("#theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("vp-theme", next);
    } catch {}
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    newsSearch.focus();
    newsSearch.scrollIntoView({ block: "center" });
  });

  // Remember this visit so the next one can highlight what's new.
  const markVisit = () => store.set("vp-last-visit", new Date().toISOString());
  addEventListener("pagehide", markVisit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markVisit();
    else checkForUpdates();
  });
}

async function checkForUpdates() {
  if (state.newsSource !== "feed") return;
  try {
    const feed = await getJson(NEWS_URL);
    if (feed.generatedAt && feed.generatedAt !== state.newsGeneratedAt) {
      toast("New stories are in", {
        label: "Show",
        run: async () => {
          await Promise.all([loadNews(), loadJobs()]);
          renderAll();
        },
      });
    }
  } catch {
    /* offline — try again later */
  }
}

async function init() {
  renderStatic();
  bindEvents();
  persistSaved();
  renderMasthead();

  let error = false;
  await Promise.all([loadNews(), loadJobs()]).catch(() => (error = true));
  renderAll(error);

  // Refresh relative timestamps and check for a new sync periodically.
  setInterval(() => {
    if (document.visibilityState === "visible") {
      renderMasthead();
      checkForUpdates();
    }
  }, POLL_MS);
}

init();
