import { useEffect, useState } from "react";
import "./App.css";
import HistogramView from "./view/HistogramView";
import BookmarksView from "./view/BookmarksView";

function App() {
  const [hash, setHash] = useState<string>(window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  if (hash === "#histogram") {
    return <HistogramView />;
  }

  const dateMatch = hash.match(/^#(\d{4}-\d{2}-\d{2})$/);
  const date = dateMatch ? dateMatch[1] : undefined;
  return <BookmarksView initialDate={date} />;
}

export default App;
