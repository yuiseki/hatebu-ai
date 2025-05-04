import { useState, useEffect } from "react";
import "./App.css";

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
    // histogram.jsonを読み込む
    const fetchHistogramData = async () => {
      try {
        const response = await fetch("/data/histogram.json");
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

  // 年ごとの日数の集計
  const getYearDays = (year: string) => {
    if (!histogramData || !histogramData[year]) return 0;

    let total = 0;
    for (const days of Object.values(histogramData[year])) {
      total += days;
    }
    return total;
  };

  // 年ごとの最頻値（最も頻度が高い日数）を取得
  const getYearMaxFrequency = (year: string) => {
    if (!histogramData || !histogramData[year]) return 1;

    let maxFreq = 0;
    Object.values(histogramData[year]).forEach((days) => {
      if (days > maxFreq) {
        maxFreq = days;
      }
    });

    return maxFreq || 1; // 0除算を防ぐため
  };

  // 総投稿数が0より大きい年のみをフィルタリングして年代順に降順ソート（新しい順）
  const sortedValidYears = histogramData
    ? Object.keys(histogramData)
        .filter((year) => getYearTotal(year) > 0)
        .sort((a, b) => parseInt(b) - parseInt(a))
    : [];

  return (
    <div className="app-container">
      <h1>はてなブックマーク 投稿数ヒストグラム</h1>

      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      {histogramData && (
        <div className="histogram-container">
          <h2>年ごとの投稿数分布</h2>
          <div className="year-details">
            {sortedValidYears.map((year) => {
              const maxFreq = getYearMaxFrequency(year);
              const maxHeight = 100; // 最大の高さ (px)

              return (
                <div key={year} className="year-card">
                  <h3>{year}年</h3>
                  <div className="histogram-bars">
                    {histogramData[year] &&
                      Object.entries(histogramData[year])
                        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                        .filter(([uploads, _]) => parseInt(uploads) > 0) // 投稿数が0のものは除外
                        .map(([uploads, days]) => {
                          // 最頻値に対する相対的な高さを計算
                          const relativeHeight = (days / maxFreq) * maxHeight;
                          const height = Math.max(5, relativeHeight); // 最小の高さは5px

                          return (
                            <div
                              key={uploads}
                              className="histogram-bar-container"
                            >
                              <div
                                className="histogram-bar"
                                style={{
                                  height: `${height}px`,
                                }}
                                title={`${uploads}件の投稿: ${days}日 (最頻値の${Math.round(
                                  (days / maxFreq) * 100
                                )}%)`}
                              ></div>
                            </div>
                          );
                        })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
