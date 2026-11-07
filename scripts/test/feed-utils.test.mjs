import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseFeed,
  cleanGoogleNewsItem,
  toNewsItem,
  mergeNews,
  parseGreenhouse,
  parseAshby,
  safeUrl,
  decodeEntities,
} from "../feed-utils.mjs";
import { classifyJob, classifyNews, jobRegion } from "../../assets/topics.js";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parses RSS 2.0 items, decoding CDATA, entities and HTML", async () => {
  const items = parseFeed(await fixture("rss.xml"));
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "TSMC ramps 2nm & plans new fab");
  assert.equal(items[0].url, "https://example.com/tsmc-2nm");
  assert.equal(items[0].publishedAt, "2026-11-05T10:00:00.000Z");
  assert.equal(items[0].summary, "The foundry said its N2 process is in volume production.");
  assert.equal(items[1].summary, "UVM & formal tips — part 2");
});

test("parses Atom entries using the alternate link", async () => {
  const [entry] = parseFeed(await fixture("atom.xml"));
  assert.equal(entry.title, "HBM4 and chiplets reshape packaging");
  assert.equal(entry.url, "https://example.org/hbm4");
  assert.equal(entry.publishedAt, "2026-11-06T12:00:00.000Z");
});

test("splits Google News headline and publisher", async () => {
  const [raw] = parseFeed(await fixture("google-news.xml"));
  const item = cleanGoogleNewsItem(raw);
  assert.equal(item.title, "Tata Electronics begins pilot production at Dholera fab");
  assert.equal(item.source, "The Economic Times");
  assert.equal(item.summary, "");
  const news = toNewsItem(item, "Web", "2026-11-07T00:00:00.000Z");
  assert.ok(news.topics.includes("india"));
  assert.ok(news.topics.includes("manufacturing"));
});

test("mergeNews dedupes by title, drops stale items and sorts newest first", () => {
  const now = Date.parse("2026-11-07T00:00:00Z");
  const fresh = [
    { title: "Chip news A", source: "Google News", publishedAt: "2026-11-06T00:00:00Z" },
    { title: "Chip News A!", source: "SemiEngineering", publishedAt: "2026-11-06T00:00:00Z" },
    { title: "Chip news B", source: "EE Times", publishedAt: "2026-11-05T00:00:00Z" },
  ];
  const previous = [
    { title: "Old story", source: "X", publishedAt: "2026-09-01T00:00:00Z" },
    { title: "Kept story", source: "X", publishedAt: "2026-11-01T00:00:00Z" },
  ];
  const merged = mergeNews(fresh, previous, { now });
  assert.deepEqual(
    merged.map((i) => i.title),
    ["Chip News A!", "Chip news B", "Kept story"]
  );
  assert.equal(merged[0].source, "SemiEngineering");
});

test("job classification keeps chip roles and rejects others", () => {
  assert.deepEqual(classifyJob("Senior RTL Design Engineer"), ["design"]);
  assert.ok(classifyJob("SoC Design Verification Engineer").includes("verification"));
  assert.ok(classifyJob("Staff Physical Design Engineer (STA)").includes("physical"));
  assert.ok(classifyJob("Analog Mixed-Signal IC Designer").includes("analog"));
  assert.deepEqual(classifyJob("SOC Analyst - Security Operations"), []);
  assert.deepEqual(classifyJob("Technical Recruiter, ASIC"), []);
  assert.deepEqual(classifyJob("Senior Backend Software Engineer"), []);
  assert.deepEqual(classifyJob("Marketing Manager"), []);
});

test("job regions", () => {
  assert.equal(jobRegion("Bengaluru, Karnataka"), "india");
  assert.equal(jobRegion("Remote · USA"), "remote");
  assert.equal(jobRegion("Santa Clara, CA"), "global");
});

test("news classification", () => {
  assert.deepEqual(classifyNews("Synopsys unveils new RTL signoff flow"), ["design"]);
  assert.ok(classifyNews("NVIDIA ships Rubin GPUs with HBM4").includes("ai"));
  assert.ok(classifyNews("NVIDIA ships Rubin GPUs with HBM4").includes("packaging"));
});

test("job board parsers", () => {
  const gh = parseGreenhouse(
    {
      jobs: [
        {
          title: "Design Verification Engineer",
          location: { name: "Bangalore, India" },
          absolute_url: "https://job-boards.greenhouse.io/x/jobs/1",
          first_published: "2026-11-01T00:00:00Z",
        },
        { title: "Sales Director", location: { name: "Remote" }, absolute_url: "https://x/jobs/2" },
      ],
    },
    "Example",
    "example"
  ).filter(Boolean);
  assert.equal(gh.length, 1);
  assert.equal(gh[0].region, "india");
  assert.equal(gh[0].sourceKey, "greenhouse:example");

  const ashby = parseAshby(
    { jobs: [{ title: "FPGA Engineer", location: "Cupertino", isRemote: true, jobUrl: "javascript:alert(1)" }] },
    "Example",
    "example"
  ).filter(Boolean);
  assert.equal(ashby.length, 0, "unsafe URLs are dropped");
});

test("url and entity helpers", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://ok.example/a"), "https://ok.example/a");
  assert.equal(decodeEntities("&lt;b&gt; &#8217; &unknown;"), "<b> ’ &unknown;");
});
