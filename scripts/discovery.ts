import * as fs from "fs";
import * as path from "path";

interface DiscoveryEntry {
  keyword: string;
  score: number;
  recent_days: number;
  novelty_bonus: number;
  penalty: number;
  last_seen: string | null;
}

interface DiscoveryData {
  generated_at: string;
  window: { from: string; to: string };
  discoveries: DiscoveryEntry[];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateKey(date: Date): string {
  return formatDate(date);
}

function readAiKeywords(date: Date): string[] {
  const dataDir = path.join(process.cwd(), "public/data");
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const aiPath = path.join(dataDir, String(y), m, `${d}.ai.json`);
  if (!fs.existsSync(aiPath)) return [];
  try {
    const kws = JSON.parse(fs.readFileSync(aiPath, "utf-8")) as string[];
    return Array.isArray(kws) ? kws.map((k) => k.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Build a map: keyword → Set of date strings where it appeared, for a date range [from, to]
function buildKeywordDayMap(
  from: Date,
  to: Date
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const cur = new Date(from);
  while (cur <= to) {
    const kws = readAiKeywords(cur);
    const key = dateKey(cur);
    for (const kw of kws) {
      if (!map.has(kw)) map.set(kw, new Set());
      map.get(kw)!.add(key);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return map;
}

function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Time anchors (relative to today)
  const d = (n: number) => addDays(today, n);

  const recentFrom  = d(-7);   // 7 days ago
  const recentTo    = d(-1);   // yesterday

  const prevWeekFrom  = d(-14); // 8-14 days ago
  const prevWeekTo    = d(-8);

  const prevMonthFrom = d(-37); // 15-37 days ago
  const prevMonthTo   = d(-15);

  const hist90From  = d(-90);
  const hist90To    = d(-8);

  const hist180From = d(-180);
  const hist180To   = d(-8);

  const hist365From = d(-365);
  const hist365To   = d(-8);

  console.log("Loading keyword maps...");

  const recentMap    = buildKeywordDayMap(recentFrom,    recentTo);
  const prevWeekMap  = buildKeywordDayMap(prevWeekFrom,  prevWeekTo);
  const prevMonthMap = buildKeywordDayMap(prevMonthFrom, prevMonthTo);
  const hist90Map    = buildKeywordDayMap(hist90From,    hist90To);
  const hist180Map   = buildKeywordDayMap(hist180From,   hist180To);
  const hist365Map   = buildKeywordDayMap(hist365From,   hist365To);

  // Find last-seen date for each candidate keyword
  function findLastSeen(kw: string): string | null {
    // scan from yesterday backwards up to 365 days
    for (let i = 1; i <= 365; i++) {
      const day = d(-i);
      const kws = readAiKeywords(day);
      if (kws.includes(kw)) return dateKey(day);
    }
    return null;
  }

  const candidates = Array.from(recentMap.keys());
  console.log(`Scoring ${candidates.length} candidate keywords...`);

  const entries: DiscoveryEntry[] = [];

  for (const kw of candidates) {
    const recent_days = recentMap.get(kw)?.size ?? 0;

    // Novelty bonuses
    const not_in_90  = !(hist90Map.has(kw)  && hist90Map.get(kw)!.size  > 0);
    const not_in_180 = !(hist180Map.has(kw) && hist180Map.get(kw)!.size > 0);
    const not_in_365 = !(hist365Map.has(kw) && hist365Map.get(kw)!.size > 0);

    const novelty_bonus =
      (not_in_90  ? 3 : 0) +
      (not_in_180 ? 2 : 0) +
      (not_in_365 ? 1 : 0);

    // Familiarity penalties
    const prev_week_days  = prevWeekMap.get(kw)?.size  ?? 0;
    const prev_month_days = prevMonthMap.get(kw)?.size ?? 0;
    const penalty = 1 * prev_week_days + 2 * prev_month_days;

    const score = novelty_bonus - penalty;

    // Only include keywords with a positive novelty signal
    if (novelty_bonus === 0) continue;

    const last_seen = findLastSeen(kw);

    entries.push({ keyword: kw, score, recent_days, novelty_bonus, penalty, last_seen });
  }

  entries.sort((a, b) => b.score - a.score || b.recent_days - a.recent_days || a.keyword.localeCompare(b.keyword));

  const data: DiscoveryData = {
    generated_at: formatDate(today),
    window: { from: formatDate(recentFrom), to: formatDate(recentTo) },
    discoveries: entries,
  };

  const outputPath = path.join(process.cwd(), "public/data/latest_discovery.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");

  console.log(`Wrote ${outputPath}`);
  console.log(`  ${entries.length} discoveries (out of ${candidates.length} candidates)`);
  if (entries.length > 0) {
    console.log("  Top 5:");
    entries.slice(0, 5).forEach((e, i) =>
      console.log(`    ${i + 1}. ${e.keyword}  score=${e.score}  (novelty=${e.novelty_bonus}, penalty=${e.penalty}, last_seen=${e.last_seen ?? "never"})`)
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
