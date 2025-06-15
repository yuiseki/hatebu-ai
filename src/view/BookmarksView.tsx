import { useState, useEffect } from "react";
import "../App.css";
import AmazonAssociate from "../components/AmazonAssociate";

interface BookmarkInfo {
  title: string;
  link: string;
  date: string;
}

interface BookmarksProps {
  /** Hash string without leading '#' e.g. '2025-06-13' */
  initialDate?: string;
}

const fetchLatest = async (
  startDate: Date
): Promise<{ list: BookmarkInfo[]; dateStr: string } | null> => {
  const date = new Date(startDate);
  for (let i = 0; i < 365; i++) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    const path = `./data/${y}/${m}/${d}.json`;
    try {
      const res = await fetch(path);
      if (res.ok) {
        const list = (await res.json()) as BookmarkInfo[];
        const dateStr = `${y}-${m}-${d}`;
        return { list, dateStr };
      }
    } catch {
      // ignore
    }
    date.setDate(date.getDate() - 1);
  }
  return null;
};

function BookmarksView({ initialDate }: BookmarksProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkInfo[]>([]);
  const [dateStr, setDateStr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const start = initialDate ? new Date(initialDate) : new Date();
      const result = await fetchLatest(start);
      if (result) {
        setBookmarks(result.list);
        setDateStr(result.dateStr);
      } else {
        setError("データが見つかりません");
      }
      setLoading(false);
    };
    load();
  }, [initialDate]);

  const moveDate = (diff: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + diff);
    const newHash = `#${d.toISOString().slice(0, 10)}`;
    window.location.hash = newHash;
  };

  return (
    <div className="app-container">
      <h1><a className="bookmarks-title" href="./">ゆいせきのブックマーク</a></h1>
      {loading && <p className="bookmarks-loading">データを読み込み中...</p>}
      {error && <p className="bookmarks-error">エラー: {error}</p>}
      {!loading && !error && (
        <div className="bookmarks-content">
          <div style={{ marginBottom: "10px" }}>
            <button onClick={() => moveDate(-1)}>前日</button>
            <span style={{ margin: "0 1em" }}>{dateStr}</span>
            <button onClick={() => moveDate(1)}>翌日</button>
          </div>
          <ul className="bookmark-list">
            {bookmarks.map((b) => (
              <li key={b.link} style={{ textAlign: "left" }}>
                <img
                  className="bookmark-favicon"
                  width={15}
                  height={15}
                  src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=32&url=${(() => { try { return new URL(b.link).origin + '/'; } catch { return ''; } })()}`}
                  alt="favicon"
                />
                <a href={b.link} target="_blank" rel="noopener noreferrer">
                  {b.title}
                </a>
              </li>
            ))}
          </ul>
          <AmazonAssociate date={dateStr} />
        </div>
      )}
    </div>
  );
}

export default BookmarksView;
