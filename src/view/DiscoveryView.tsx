import { useEffect, useState } from "react";
import "../App.css";
import { GlobalNav } from "../components/GlobalNav";

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

const MAX_DISPLAY = 40;

function ScoreBadge({ value }: { value: number }) {
  const bg = value >= 5 ? "#e8f5e9" : value >= 3 ? "#fff8e1" : "#fce4e4";
  const color = value >= 5 ? "#2e7d32" : value >= 3 ? "#f57f17" : "#c62828";
  return (
    <span className="discovery-badge" style={{ background: bg, color }}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function NoveltyPips({ bonus }: { bonus: number }) {
  return (
    <span className="discovery-pips" title={`novelty +${bonus}`}>
      {bonus >= 1 && <span className="pip pip-year" title="過去1年未登場">Y</span>}
      {bonus >= 3 && <span className="pip pip-6mo" title="過去半年未登場">6M</span>}
      {bonus >= 6 && <span className="pip pip-3mo" title="過去3ヶ月未登場">3M</span>}
    </span>
  );
}

function DiscoveryView() {
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("./data/latest_discovery.json")
      .then((r) => {
        if (!r.ok) throw new Error("データの取得に失敗しました");
        return r.json() as Promise<DiscoveryData>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "未知のエラー"))
      .finally(() => setLoading(false));
  }, []);

  const maxScore = data?.discoveries[0]?.score ?? 1;

  return (
    <div className="app-container">
      <h1>
        <a className="bookmarks-title" href="./">
          ゆいせきのブックマーク
        </a>
      </h1>
      <GlobalNav />
      <h2>新規発見キーワード</h2>
      {data && (
        <p className="interests-generated">
          生成日: {data.generated_at} &nbsp;|&nbsp; 対象期間: {data.window.from} 〜 {data.window.to}
        </p>
      )}
      <p className="discovery-legend">
        スコア = 新規性ボーナス（3ヶ月未登場+3 / 半年+2 / 1年+1）－ 馴染みペナルティ（前週×1 / 前月×2）
      </p>

      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      {data && (
        <ul className="discovery-list">
          {data.discoveries.slice(0, MAX_DISPLAY).map((entry, i) => (
            <li key={entry.keyword} className="discovery-item">
              <span className="discovery-rank">{i + 1}</span>
              <ScoreBadge value={entry.score} />
              <NoveltyPips bonus={entry.novelty_bonus} />
              <span className="discovery-keyword">{entry.keyword}</span>
              <div className="discovery-bar-wrap">
                <div
                  className="discovery-bar"
                  style={{ width: `${Math.max(0, (entry.score / maxScore)) * 100}%` }}
                />
              </div>
              <span className="discovery-meta">
                {entry.recent_days}日
                {entry.last_seen && (
                  <span className="discovery-last-seen"> · 前回 {entry.last_seen}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DiscoveryView;
