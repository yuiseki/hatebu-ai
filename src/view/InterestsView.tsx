import { useEffect, useState } from "react";
import "../App.css";
import { GlobalNav } from "../components/GlobalNav";

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

const PERIOD_LABELS: Record<keyof InterestsData["periods"], string> = {
  week: "過去1週間",
  month: "過去1ヶ月",
  three_months: "過去3ヶ月",
};

const MAX_DISPLAY = 30;

function PeriodCard({ label, period }: { label: string; period: PeriodResult }) {
  const maxCount = period.keywords[0]?.count ?? 1;

  return (
    <div className="interests-period-card">
      <h2 className="interests-period-title">{label}</h2>
      <p className="interests-period-meta">
        {period.from} 〜 {period.to}
        <span className="interests-period-days">（{period.total_days_with_data}日分）</span>
      </p>
      <ul className="interests-keyword-list">
        {period.keywords.slice(0, MAX_DISPLAY).map((kw, i) => (
          <li key={kw.keyword} className="interests-keyword-item">
            <span className="interests-keyword-rank">{i + 1}</span>
            <span className="interests-keyword-name">{kw.keyword}</span>
            <div className="interests-keyword-bar-wrap">
              <div
                className="interests-keyword-bar"
                style={{ width: `${(kw.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="interests-keyword-count">{kw.count}日</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InterestsView() {
  const [data, setData] = useState<InterestsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("./data/latest_interests.json")
      .then((r) => {
        if (!r.ok) throw new Error("データの取得に失敗しました");
        return r.json() as Promise<InterestsData>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "未知のエラー"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-container">
      <h1>
        <a className="bookmarks-title" href="./">
          ゆいせきのブックマーク
        </a>
      </h1>
      <GlobalNav />
      <h2>興味・関心の傾向</h2>
      {data && (
        <p className="interests-generated">
          生成日: {data.generated_at}
        </p>
      )}
      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}
      {data && (
        <div className="interests-grid">
          {(Object.keys(PERIOD_LABELS) as Array<keyof InterestsData["periods"]>).map((key) => (
            <PeriodCard
              key={key}
              label={PERIOD_LABELS[key]}
              period={data.periods[key]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default InterestsView;
