import { useState, useEffect } from "react";
import "./App.css";
import YearCard from "./components/YearCard";

// ヒストグラムの型を定義
type HistogramData = {
  [year: string]: {
    [uploads: string]: number;
  };
};

function App() {
  const [histogramData, setHistogramData] = useState<HistogramData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // public/data/histogram.jsonを読み込む
    const fetchHistogramData = async () => {
      try {
        const response = await fetch("./public/data/histogram.json");
        if (!response.ok) {
          throw new Error("ヒストグラムデータの取得に失敗しました");
        }
        const data = await response.json();
        setHistogramData(data);
      } catch (err) {
        console.error("データ取得エラー:", err);
        setError(
          err instanceof Error ? err.message : "未知のエラーが発生しました"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHistogramData();
  }, []);

  // 年ごとの投稿数の集計
  const getYearTotal = (year: string) => {
    if (!histogramData || !histogramData[year]) return 0;

    let total = 0;
    for (const [uploads, days] of Object.entries(histogramData[year])) {
      total += parseInt(uploads) * days;
    }
    return total;
  };

  // 総投稿数が0より大きい年のみをフィルタリングして年代順に降順ソート（新しい順）
  const sortedValidYears = histogramData
    ? Object.keys(histogramData)
        .filter((year) => getYearTotal(year) > 0)
        .sort((a, b) => parseInt(b) - parseInt(a))
    : [];

  return (
    <div className="app-container">
      <h1>はてなブックマーク ブックマーク数ヒストグラム</h1>

      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      {histogramData && (
        <div className="histogram-container">
          <h2>年ごとのブックマーク数分布</h2>
          <div className="year-details">
            {sortedValidYears.map((year) => (
              <YearCard key={year} year={year} data={histogramData[year]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
