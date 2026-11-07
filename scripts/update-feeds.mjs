#!/usr/bin/env node
// Fetches semiconductor news and chip-design job openings and writes
// data/news.json and data/jobs.json for the static site.
//
// Runs on a schedule in .github/workflows/update-feeds.yml; you can also run it
// locally with `node scripts/update-feeds.mjs` (Node 20+, no dependencies).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFeed,
  cleanGoogleNewsItem,
  toNewsItem,
  mergeNews,
  parseGreenhouse,
  parseLever,
  parseAshby,
  parseRemotive,
  sameItems,
} from "./feed-utils.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEWS_FILE = join(ROOT, "data", "news.json");
const JOBS_FILE = join(ROOT, "data", "jobs.json");
const USER_AGENT = "VLSI-Pulse-FeedBot/2.0 (+https://github.com/shubhamdraveriya/dailynews)";
const TIMEOUT_MS = 20000;

const report = [];

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function get(url, as = "text") {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: as === "json" ? "application/json" : "*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

async function attempt(label, fn) {
  try {
    const items = await fn();
    report.push({ label, ok: true, count: items.length });
    return { ok: true, items };
  } catch (error) {
    report.push({ label, ok: false, error: error.message });
    return { ok: false, items: [] };
  }
}

function googleNewsUrl(query) {
  const q = encodeURIComponent(`${query} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

async function updateNews(sources, nowIso) {
  const tasks = [
    ...sources.googleNews.map((g) =>
      attempt(`news · Google News · ${g.label}`, async () =>
        parseFeed(await get(googleNewsUrl(g.query))).map(cleanGoogleNewsItem)
      )
    ),
    ...sources.rss.map((f) =>
      attempt(`news · ${f.name}`, async () =>
        parseFeed(await get(f.url)).map((item) => ({ ...item, source: f.name }))
      )
    ),
  ];
  const results = await Promise.all(tasks);
  const fresh = results.flatMap((r) => r.items).map((raw) => toNewsItem(raw, "Web", nowIso));

  const previous = await readJson(NEWS_FILE, { items: [] });
  const items = mergeNews(fresh, previous.items || []);
  return { previous, items };
}

async function updateJobs(sources) {
  const tasks = [
    ...sources.greenhouse.map((s) => ({
      key: `greenhouse:${s.token}`,
      run: () =>
        attempt(`jobs · ${s.company} (Greenhouse)`, async () =>
          parseGreenhouse(
            await get(`https://boards-api.greenhouse.io/v1/boards/${s.token}/jobs`, "json"),
            s.company,
            s.token
          ).filter(Boolean)
        ),
    })),
    ...sources.lever.map((s) => ({
      key: `lever:${s.token}`,
      run: () =>
        attempt(`jobs · ${s.company} (Lever)`, async () =>
          parseLever(
            await get(`https://api.lever.co/v0/postings/${s.token}?mode=json`, "json"),
            s.company,
            s.token
          ).filter(Boolean)
        ),
    })),
    ...sources.ashby.map((s) => ({
      key: `ashby:${s.token}`,
      run: () =>
        attempt(`jobs · ${s.company} (Ashby)`, async () =>
          parseAshby(
            await get(`https://api.ashbyhq.com/posting-api/job-board/${s.token}`, "json"),
            s.company,
            s.token
          ).filter(Boolean)
        ),
    })),
    ...sources.remotive.map((term) => ({
      key: `remotive:${term}`,
      run: () =>
        attempt(`jobs · Remotive "${term}"`, async () =>
          parseRemotive(
            await get(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}`, "json"),
            term
          ).filter(Boolean)
        ),
    })),
  ];

  const previous = await readJson(JOBS_FILE, { items: [] });
  const results = await Promise.all(tasks.map((t) => t.run()));

  const collected = [];
  results.forEach((result, i) => {
    if (result.ok) {
      collected.push(...result.items);
    } else {
      // Keep last known openings from a source that is temporarily down.
      collected.push(...(previous.items || []).filter((j) => j.sourceKey === tasks[i].key));
    }
  });

  const seen = new Set();
  const items = collected
    .filter((j) => (seen.has(j.id) ? false : seen.add(j.id)))
    .sort((a, b) => (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0))
    .slice(0, 400);
  return { previous, items };
}

async function writeIfChanged(path, previous, items, nowIso) {
  if (previous.generatedAt && sameItems(previous.items, items)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ generatedAt: nowIso, count: items.length, items }, null, 2)}\n`);
  return true;
}

async function main() {
  const sources = await readJson(join(ROOT, "scripts", "sources.json"), null);
  if (!sources) throw new Error("scripts/sources.json is missing or invalid");
  const nowIso = new Date().toISOString();

  const [news, jobs] = await Promise.all([updateNews(sources.news, nowIso), updateJobs(sources.jobs)]);

  for (const r of report) {
    console.log(`${r.ok ? "✔" : "✖"} ${r.label}${r.ok ? ` — ${r.count} items` : ` — ${r.error}`}`);
  }

  if (!report.some((r) => r.ok)) {
    console.error("Every source failed; leaving data files untouched.");
    process.exitCode = 1;
    return;
  }

  const newsChanged = await writeIfChanged(NEWS_FILE, news.previous, news.items, nowIso);
  const jobsChanged = await writeIfChanged(JOBS_FILE, jobs.previous, jobs.items, nowIso);
  console.log(
    `\nnews.json: ${news.items.length} stories (${newsChanged ? "updated" : "unchanged"})` +
      `\njobs.json: ${jobs.items.length} openings (${jobsChanged ? "updated" : "unchanged"})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
