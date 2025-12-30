import { useEffect, useMemo, useRef, useState } from "react";
import "../App.css";

interface ClusterPoint {
  id: number;
  title: string;
  link: string;
  date: string;
  source: string;
  dup_count?: number;
  cluster: number;
  umap_x: number;
  umap_y: number;
}

interface ClusterSummary {
  cluster: number;
  size: number;
  sample_titles: string[];
  llm_keywords?: string[];
}

const DATA_DIR = "./data/2025";

const toColor = (cluster: number) => {
  const hue = ((cluster * 37) % 360 + 360) % 360;
  return `hsl(${hue}, 65%, 45%)`;
};

function ClusteringView() {
  const [points, setPoints] = useState<ClusterPoint[]>([]);
  const [summaries, setSummaries] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointMapRef = useRef<
    Array<{ x: number; y: number; cluster: number; id: number }>
  >([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [pointsRes, summaryRes] = await Promise.all([
          fetch(`${DATA_DIR}/clusters_kmeans.json`),
          fetch(`${DATA_DIR}/clusters_kmeans_summary.json`),
        ]);
        if (!pointsRes.ok || !summaryRes.ok) {
          throw new Error("クラスターデータの取得に失敗しました");
        }
        const pointsData = (await pointsRes.json()) as ClusterPoint[];
        const summaryData = (await summaryRes.json()) as ClusterSummary[];
        setPoints(pointsData);
        setSummaries(summaryData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "未知のエラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const summaryByCluster = useMemo(() => {
    const map = new Map<number, ClusterSummary>();
    for (const s of summaries) {
      map.set(s.cluster, s);
    }
    return map;
  }, [summaries]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.umap_x < minX) minX = p.umap_x;
      if (p.umap_x > maxX) maxX = p.umap_x;
      if (p.umap_y < minY) minY = p.umap_y;
      if (p.umap_y > maxY) maxY = p.umap_y;
    }
    return { minX, maxX, minY, maxY };
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = 16;
    const width = cssWidth - pad * 2;
    const height = cssHeight - pad * 2;
    const rangeX = bounds.maxX - bounds.minX || 1;
    const rangeY = bounds.maxY - bounds.minY || 1;

    pointMapRef.current = [];

    const drawPoint = (p: ClusterPoint, alpha: number) => {
      const x = pad + ((p.umap_x - bounds.minX) / rangeX) * width;
      const y = pad + (1 - (p.umap_y - bounds.minY) / rangeY) * height;
      pointMapRef.current.push({ x, y, cluster: p.cluster, id: p.id });
      ctx.fillStyle = `${toColor(p.cluster).replace("hsl", "hsla").replace(")", `, ${alpha})`)}`;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    // Draw background points first
    for (const p of points) {
      if (selectedCluster === null || p.cluster !== selectedCluster) {
        drawPoint(p, selectedCluster === null ? 0.35 : 0.08);
      }
    }
    // Draw selected cluster last
    if (selectedCluster !== null) {
      for (const p of points) {
        if (p.cluster === selectedCluster) {
          drawPoint(p, 0.9);
        }
      }
    }
  }, [points, bounds, selectedCluster]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pointsMap = pointMapRef.current;
    let bestId: number | null = null;
    let bestCluster: number | null = null;
    let bestDist = Infinity;
    const radius = 6;
    for (const p of pointsMap) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius && d2 < bestDist) {
        bestDist = d2;
        bestId = p.id;
        bestCluster = p.cluster;
      }
    }
    if (bestId === null) {
      setSelectedCluster(null);
    } else {
      setSelectedCluster(bestCluster);
    }
  };

  const selectedSummary =
    selectedCluster === null ? null : summaryByCluster.get(selectedCluster) || null;
  const selectedItems = useMemo(() => {
    if (selectedCluster === null) return [];
    return points
      .filter((p) => p.cluster === selectedCluster)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [points, selectedCluster]);

  return (
    <div className="app-container clustering-container">
      <h1>ゆいせきのブックマーク 埋め込みベクトルのクラスタリング</h1>
      {loading && <p>データを読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      {!loading && !error && (
        <div className="clustering-layout">
          <div className="scatter-card">
            <div className="scatter-header">
              <div>UMAP散布図（KMeans）</div>
              <div className="scatter-meta">
                {points.length.toLocaleString()} points / {summaries.length} clusters
              </div>
            </div>
            <canvas
              ref={canvasRef}
              className="scatter-canvas"
              onClick={handleCanvasClick}
            />
            <div className="scatter-hint">
              点をクリックするとクラスタを選択できます
            </div>
          </div>

          <div className="cluster-panel">
            <div className="cluster-detail">
              {selectedSummary ? (
                <>
                  <h2>クラスタ #{selectedSummary.cluster}</h2>
                  <div className="cluster-detail-meta">
                    {selectedSummary.size} items
                  </div>
                  <ul className="cluster-items">
                    {selectedItems.map((item) => (
                      <li key={item.id}>
                        <a href={item.link} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="cluster-empty">クラスタを選択すると詳細が表示されます。</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClusteringView;
