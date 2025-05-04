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

  // データを年代順にソート
  const sortedYears = histogramData
    ? Object.keys(histogramData).sort((a, b) => parseInt(a) - parseInt(b))
    : [];

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

  return (
    <div className="app-container">
      <h1>はてなブックマーク 投稿数ヒストグラム</h1>

      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      {histogramData && (
        <div className="histogram-container">
          <table className="histogram-table">
            <thead>
              <tr>
                <th>年</th>
                <th>総投稿数</th>
                <th>記録日数</th>
                <th>日平均投稿数</th>
              </tr>
            </thead>
            <tbody>
              {sortedYears.map((year) => {
                const totalUploads = getYearTotal(year);
                const totalDays = getYearDays(year);
                const average =
                  totalDays > 0 ? (totalUploads / totalDays).toFixed(1) : "0";

                return (
                  <tr key={year}>
                    <td>{year}</td>
                    <td>{totalUploads.toLocaleString()}</td>
                    <td>{totalDays}日</td>
                    <td>{average}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>年ごとの投稿数分布</h2>
          <div className="year-details">
            {sortedYears.map((year) => (
              <div key={year} className="year-card">
                <h3>{year}年</h3>
                <div className="histogram-bars">
                  {histogramData[year] &&
                    Object.entries(histogramData[year])
                      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                      .filter(([uploads, _]) => parseInt(uploads) > 0) // 投稿数が0のものは除外
                      .map(([uploads, days]) => (
                        <div key={uploads} className="histogram-bar-container">
                          <div
                            className="histogram-bar"
                            style={{
                              height: `${Math.min(
                                100,
                                Math.max(5, days * 2)
                              )}px`,
                            }}
                            title={`${uploads}件の投稿: ${days}日`}
                          ></div>
                          <div className="uploads-label">{uploads}</div>
                        </div>
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
