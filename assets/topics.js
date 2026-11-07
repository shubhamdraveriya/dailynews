// Shared classification rules for VLSI Pulse.
// Imported by the browser (assets/app.js) and by the feed updater (scripts/update-feeds.mjs),
// so news and jobs are tagged the same way everywhere.

export const NEWS_TOPICS = [
  {
    id: "india",
    label: "India",
    re: /\b(india|indian|ism|semicon ?india|meity|tata electronics|dholera|sanand|assam|bengaluru|bangalore|hyderabad|noida|gujarat|odisha|kaynes|cg semi|hcl[- ]foxconn|dixon|polymatech|isro)\b/i,
  },
  {
    id: "design",
    label: "Design & EDA",
    re: /\b(vlsi|rtl|eda|synopsys|cadence|siemens eda|keysight eda|verilog|systemverilog|vhdl|risc[- ]?v|arm|chip design|tape[- ]?outs?|verification|uvm|asic|fpga|soc design|ip cores?|hls|open[- ]?source silicon|pdk)\b/i,
  },
  {
    id: "manufacturing",
    label: "Fabs & Foundry",
    re: /\b(fabs?|foundry|foundries|tsmc|samsung foundry|intel foundry|globalfoundries|umc|smic|rapidus|wafers?|lithography|euv|high[- ]na|asml|\d+\s?nm|angstrom|18a|14a|gate[- ]all[- ]around|gaa|backside power|yield)\b/i,
  },
  {
    id: "packaging",
    label: "Packaging & Memory",
    re: /\b(packaging|osat|chiplets?|hbm\d?e?|dram|nand|memory|micron|sk hynix|3d[- ]?ic|cowos|interposer|hybrid bonding|glass substrates?|co[- ]packaged optics)\b/i,
  },
  {
    id: "ai",
    label: "AI & Compute",
    re: /\b(ai chips?|ai accelerators?|gpus?|nvidia|amd|accelerators?|npus?|tpus?|data ?cent(er|re)s?|inference|blackwell|rubin|instinct|gaudi|trainium|custom silicon|hyperscalers?)\b/i,
  },
  {
    id: "policy",
    label: "Policy & Business",
    re: /\b(chips act|polic(y|ies)|subsid(y|ies)|export controls?|tariffs?|incentives?|government|ministry|investments?|funding|raises|acqui(re|res|red|sition)|merger|earnings|revenue|ipo|layoffs?)\b/i,
  },
];

export const JOB_CATEGORIES = [
  {
    id: "design",
    label: "RTL & Design",
    re: /\b(rtl|asic|logic design|digital design|front[- ]?end design|hardware design|chip design|silicon design|ip design|cpu design|gpu design|design engineer.*(silicon|asic|hardware))\b/i,
    // Case-sensitive so "SOC Analyst" (security) never matches.
    extra: /\bSoC\b/,
  },
  {
    id: "verification",
    label: "Verification",
    re: /\b(design verification|verification engineer|dv engineer|uvm|formal verification|emulation|pre[- ]?silicon verification|hardware verification|verification lead)\b/i,
  },
  {
    id: "physical",
    label: "Physical Design",
    re: /\b(physical design|physical implementation|static timing|sta engineer|timing (closure|engineer)|place and route|p&r|mask layout|layout (engineer|design)|physical verification|sign[- ]?off|power integrity|package design)\b/i,
  },
  {
    id: "dft",
    label: "DFT & Test",
    re: /\b(dft|design[- ]for[- ]test|atpg|mbist|bist|scan insertion|ate|yield|test engineer.*(silicon|chip|hardware|semiconductor)|(silicon|chip|hardware|production) test)\b/i,
  },
  {
    id: "analog",
    label: "Analog & Mixed-signal",
    re: /\b(analog|mixed[- ]signal|serdes|plls?|rfic|rf ic|pmic|power management ic|ams|high[- ]speed io|phy (design|engineer))\b/i,
  },
  {
    id: "fpga",
    label: "FPGA",
    re: /\bfpga\b/i,
  },
  {
    id: "validation",
    label: "Silicon Validation",
    re: /\b(post[- ]silicon|silicon validation|silicon bring[- ]?up|bring[- ]?up engineer|hardware validation|validation engineer|characteri[sz]ation)\b/i,
  },
  {
    id: "architecture",
    label: "Architecture",
    re: /\b((soc|cpu|gpu|chip|silicon|hardware|computer|memory|interconnect|npu|accelerator)\s+architect(ure)?|micro[- ]?architect(ure)?|performance model(l)?ing)\b/i,
  },
  {
    id: "process",
    label: "Process & Packaging",
    re: /\b(process (engineer|integration)|lithography|etch|cmp|metrology|device engineer|tcad|reliability engineer|failure analysis|packaging engineer|advanced packaging)\b/i,
  },
];

// Titles we never want in the jobs feed, even at chip companies.
export const JOB_EXCLUDE =
  /\b(recruit(er|ing)?|sales|marketing|account (executive|manager)|legal|counsel|finance|accountant|payroll|people partner|talent|office manager|executive assistant|security operations|soc analyst|cyber|customer success|copywriter|social media)\b/i;

const INDIA_LOCATION =
  /\b(india|bengaluru|bangalore|hyderabad|noida|pune|chennai|ahmedabad|gurgaon|gurugram|delhi|mumbai|kochi|trivandrum|dholera|sanand)\b/i;
const REMOTE_LOCATION = /\b(remote|anywhere|worldwide|work from home|wfh)\b/i;

export function classifyNews(text) {
  return NEWS_TOPICS.filter((t) => t.re.test(text)).map((t) => t.id);
}

export function classifyJob(title) {
  if (!title || JOB_EXCLUDE.test(title)) return [];
  return JOB_CATEGORIES.filter((c) => c.re.test(title) || (c.extra && c.extra.test(title))).map(
    (c) => c.id
  );
}

export function jobRegion(location) {
  const loc = location || "";
  if (INDIA_LOCATION.test(loc)) return "india";
  if (REMOTE_LOCATION.test(loc)) return "remote";
  return "global";
}
