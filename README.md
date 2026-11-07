# VLSI Pulse

Semiconductor and VLSI news plus chip-design job openings, in one static page.

**Live site:** https://shubhamdraveriya.github.io/dailynews/

- **Newsroom.** Headlines from SemiEngineering, SemiWiki, EE Times, Electronics Weekly, EE News Europe and
  targeted Google News searches. They're tagged by topic (India, Design & EDA, Fabs & Foundry, Packaging &
  Memory, AI & Compute, Policy & Business), grouped by day and searchable.
- **Jobs.** Openings pulled from semiconductor companies' public job boards (Greenhouse, Lever, Ashby) and
  Remotive. They're filtered to RTL, verification, physical design, DFT, analog, FPGA, validation and
  architecture roles, and can be narrowed to India, remote or global. One-tap searches cover LinkedIn,
  Naukri, Indeed and Google Jobs.
- **Extras.** Light/dark theme, bookmarks (stored in the browser), "new since your last visit" markers,
  shareable filter URLs (`?topic=india`, `?role=verification&region=india`) and `/` to search.

## How it works

There's no build step. The page is plain HTML, CSS and ES modules served by GitHub Pages from the
`gh-pages` branch.

```
index.html              page markup
assets/styles.css       design system (light + dark)
assets/app.js           rendering, filters, bookmarks
assets/topics.js        topic & job-role rules (shared by the site and the updater)
data/news.json          generated: latest stories (rolling 21 days)
data/jobs.json          generated: current openings
scripts/update-feeds.mjs  fetches feeds + job boards → data/*.json
scripts/sources.json    the list of feeds and company job boards
.github/workflows/update-feeds.yml  runs the updater every 3 hours and commits changes
```

The **Update news & jobs** workflow runs every three hours. You can also start it by hand from the
repository's **Actions** tab (*Run workflow*). It only commits when the data actually changed. If a source
fails, the run logs it and keeps that source's previous items. The run summary lists each source as ✔ or ✖.

If `data/news.json` is empty or more than 48 hours old, the page fetches recent semiconductor stories
directly from the Hacker News search API, so it never shows an empty newsroom.

### Adding sources

Edit `scripts/sources.json`:

- `news.rss`: any RSS or Atom feed URL.
- `news.googleNews`: a Google News search query.
- `jobs.greenhouse` / `jobs.lever` / `jobs.ashby`: the company's board token, i.e. the slug in its
  `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>` or `jobs.ashbyhq.com/<token>` URL.

To change which job titles count as chip-design roles, or how stories are tagged, edit
`assets/topics.js`.

## Local development

Requires Node 20+ (no npm install needed).

```bash
npm test          # parser and classifier tests
npm run update    # fetch live data into data/*.json
npm run serve     # http://localhost:8080
```
