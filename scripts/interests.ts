import * as fs from "fs";
import * as path from "path";

interface KeywordCount {
  keyword: string;
  count: number;
  days: number;
}

interface PeriodResult {
  from: string;
  to: string;
  total_days_with_data: number;
  keywords: KeywordCount[];
}

interface InterestsData {
  generated_at: string;
  periods: {
    week: PeriodResult;
    month: PeriodResult;
    three_months: PeriodResult;
  };
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

function readAiKeywordsForRange(from: Date, to: Date): { keywords: string[]; date: string }[] {
  const dataDir = path.join(process.cwd(), "public/data");
  const results: { keywords: string[]; date: string }[] = [];

  const cur = new Date(from);
  while (cur <= to) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const aiPath = path.join(dataDir, String(y), m, `${d}.ai.json`);

    if (fs.existsSync(aiPath)) {
      try {
        const content = fs.readFileSync(aiPath, "utf-8");
        const keywords = JSON.parse(content) as string[];
        if (Array.isArray(keywords) && keywords.length > 0) {
          results.push({ keywords, date: `${y}-${m}-${d}` });
        }
      } catch {
        // skip malformed files
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  return results;
}

function aggregateKeywords(entries: { keywords: string[]; date: string }[]): KeywordCount[] {
  const countMap = new Map<string, { count: number; days: Set<string> }>();

  for (const { keywords, date } of entries) {
    const seen = new Set<string>();
    for (const kw of keywords) {
      const normalized = kw.trim();
      if (!normalized) continue;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        if (!countMap.has(normalized)) {
          countMap.set(normalized, { count: 0, days: new Set() });
        }
        const entry = countMap.get(normalized)!;
        entry.count += 1;
        entry.days.add(date);
      }
    }
  }

  return Array.from(countMap.entries())
    .map(([keyword, { count, days }]) => ({ keyword, count, days: days.size }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
}

function buildPeriod(from: Date, to: Date): PeriodResult {
  const entries = readAiKeywordsForRange(from, to);
  const keywords = aggregateKeywords(entries);
  return {
    from: formatDate(from),
    to: formatDate(to),
    total_days_with_data: entries.length,
    keywords,
  };
}

function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekFrom = addDays(today, -7);
  const monthFrom = addDays(today, -30);
  const threeMonthsFrom = addDays(today, -90);
  const yesterday = addDays(today, -1);

  console.log(`Generating interests from ${formatDate(threeMonthsFrom)} to ${formatDate(yesterday)}...`);

  const data: InterestsData = {
    generated_at: formatDate(today),
    periods: {
      week: buildPeriod(weekFrom, yesterday),
      month: buildPeriod(monthFrom, yesterday),
      three_months: buildPeriod(threeMonthsFrom, yesterday),
    },
  };

  const outputPath = path.join(process.cwd(), "public/data/latest_interests.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");

  console.log(`Wrote ${outputPath}`);
  console.log(`  Week (${data.periods.week.total_days_with_data} days): top keywords = ${data.periods.week.keywords.slice(0, 5).map(k => k.keyword).join(", ")}`);
  console.log(`  Month (${data.periods.month.total_days_with_data} days): top keywords = ${data.periods.month.keywords.slice(0, 5).map(k => k.keyword).join(", ")}`);
  console.log(`  3 months (${data.periods.three_months.total_days_with_data} days): top keywords = ${data.periods.three_months.keywords.slice(0, 5).map(k => k.keyword).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
