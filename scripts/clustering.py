#!/usr/bin/env python3
"""
Cluster 2025 bookmark titles using Ollama embeddings and UMAP.
Outputs cached embeddings and clustering results to ./tmp.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Dict, Tuple

import numpy as np
import requests

try:
    import umap
    from sklearn.cluster import KMeans, AgglomerativeClustering
    from sklearn.metrics import silhouette_score
    import hdbscan
except Exception as exc:  # pragma: no cover
    print("Missing Python dependencies. Install with:")
    print("  pip install -r scripts/cluster_requirements.txt")
    raise


DATA_ROOT = Path("public/data")
TMP_ROOT = Path("tmp")
MODEL_NAME = "snowflake-arctic-embed2:568m"
DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "qwen3:1.7b")


@dataclass
class Record:
    id: int
    title: str
    link: str
    date: str
    source: str
    dup_count: int = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--ollama-url", type=str, default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--model", type=str, default=MODEL_NAME)
    parser.add_argument("--llm-model", type=str, default=DEFAULT_CHAT_MODEL)
    parser.add_argument("--llm-summary", action="store_true", help="Use Ollama to extract cluster keywords")
    parser.add_argument("--limit", type=int, default=0, help="Limit titles for debugging")
    parser.add_argument("--force", action="store_true", help="Recompute embeddings, UMAP, and clustering")
    parser.add_argument("--force-embed", action="store_true", help="Recompute embeddings even if cache exists")
    parser.add_argument("--force-umap", action="store_true", help="Recompute UMAP even if cache exists")
    parser.add_argument("--force-cluster", action="store_true", help="Recompute clustering even if cache exists")
    parser.add_argument(
        "--kmeans-on-embeddings",
        action="store_true",
        help="Run KMeans on raw embeddings instead of UMAP-reduced vectors",
    )
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from cached outputs if possible")
    parser.add_argument("--min-cluster-size", type=int, default=15)
    parser.add_argument("--min-samples", type=int, default=5)
    return parser.parse_args()


def iter_json_files(year: int) -> Iterable[Path]:
    year_dir = DATA_ROOT / str(year)
    if not year_dir.exists():
        return []
    files: List[Path] = []
    for month_dir in sorted(year_dir.glob("[0-1][0-9]")):
        for json_file in sorted(month_dir.glob("*.json")):
            # Skip non-bookmark data
            if json_file.name.endswith(".ai.json") or json_file.name.endswith(".amazon.json"):
                continue
            if json_file.name in {"histogram.json", "histogram_array.json"}:
                continue
            files.append(json_file)
    return files


def load_records(year: int, limit: int = 0) -> List[Record]:
    files = list(iter_json_files(year))
    seen: Dict[str, Record] = {}
    next_id = 0

    total_files = len(files)
    for idx, path in enumerate(files, start=1):
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for item in items:
            title = (item.get("title") or "").strip()
            link = (item.get("link") or "").strip()
            date = (item.get("date") or "").strip()
            if not title:
                continue
            if title in seen:
                seen[title].dup_count += 1
                continue
            rec = Record(
                id=next_id,
                title=title,
                link=link,
                date=date,
                source=str(path),
                dup_count=1,
            )
            seen[title] = rec
            next_id += 1
            if limit and next_id >= limit:
                break
        if limit and next_id >= limit:
            break
        if idx % 50 == 0 or idx == total_files:
            print(f"Loaded {idx}/{total_files} files, titles={next_id}", flush=True)

    return list(seen.values())


def sha256_of_titles(titles: Iterable[str]) -> str:
    h = hashlib.sha256()
    for title in titles:
        h.update(title.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def ollama_embed_batch(ollama_url: str, model: str, texts: List[str]) -> np.ndarray:
    # Try /api/embed for batch; fallback to /api/embeddings per item
    embed_url = f"{ollama_url}/api/embed"
    try:
        resp = requests.post(embed_url, json={"model": model, "input": texts}, timeout=120)
        if resp.ok:
            data = resp.json()
            if isinstance(data, dict) and "embeddings" in data:
                return np.array(data["embeddings"], dtype=np.float32)
    except Exception:
        pass

    # Fallback to /api/embeddings one-by-one
    embeddings: List[List[float]] = []
    for text in texts:
        resp = requests.post(
            f"{ollama_url}/api/embeddings",
            json={"model": model, "prompt": text},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        embeddings.append(data["embedding"])
    return np.array(embeddings, dtype=np.float32)


def get_embeddings(records: List[Record], args: argparse.Namespace) -> Tuple[np.ndarray, Dict[str, str]]:
    TMP_ROOT.mkdir(exist_ok=True)
    titles = [r.title for r in records]
    corpus_hash = sha256_of_titles(titles)

    emb_path = TMP_ROOT / f"embeddings_{args.year}.npy"
    meta_path = TMP_ROOT / f"meta_{args.year}.json"

    meta = {
        "year": args.year,
        "model": args.model,
        "ollama_url": args.ollama_url,
        "corpus_hash": corpus_hash,
        "count": len(titles),
    }

    if emb_path.exists() and meta_path.exists() and not args.force_embed:
        try:
            saved_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if (
                saved_meta.get("corpus_hash") == corpus_hash
                and saved_meta.get("model") == args.model
            ):
                return np.load(emb_path), saved_meta
        except Exception:
            pass

    batch_size = 128
    all_embs: List[np.ndarray] = []
    start_time = time.time()
    for i in range(0, len(titles), batch_size):
        chunk = titles[i : i + batch_size]
        batch_start = time.time()
        print(f"Embedding {i}-{i+len(chunk)-1} / {len(titles)}", flush=True)
        embs = ollama_embed_batch(args.ollama_url, args.model, chunk)
        all_embs.append(embs)
        done = i + len(chunk)
        elapsed = time.time() - start_time
        rate = done / elapsed if elapsed > 0 else 0.0
        remaining = len(titles) - done
        eta = remaining / rate if rate > 0 else 0.0
        print(
            f"  Done {done}/{len(titles)} ({done/len(titles)*100:.1f}%)"
            f" | batch {time.time()-batch_start:.1f}s"
            f" | rate {rate:.1f} items/s"
            f" | ETA {eta/60:.1f} min",
            flush=True,
        )
        time.sleep(0.1)

    embeddings = np.vstack(all_embs)
    np.save(emb_path, embeddings)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return embeddings, meta


def reduce_umap(embeddings: np.ndarray, n_components: int = 2) -> np.ndarray:
    reducer = umap.UMAP(
        n_neighbors=15,
        min_dist=0.05,
        metric="cosine",
        n_components=n_components,
        random_state=42,
    )
    return reducer.fit_transform(embeddings)


def cluster_hdbscan(embeddings: np.ndarray, min_cluster_size: int, min_samples: int) -> np.ndarray:
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
    )
    return clusterer.fit_predict(embeddings)


def pick_kmeans_k(embeddings: np.ndarray, candidates: List[int]) -> int:
    best_k = candidates[0]
    best_score = -1.0
    for k in candidates:
        if k <= 1 or k >= len(embeddings):
            continue
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(embeddings)
        # Silhouette can fail if only 1 cluster
        try:
            score = silhouette_score(embeddings, labels)
        except Exception:
            score = -1.0
        if score > best_score:
            best_score = score
            best_k = k
    return best_k


def cluster_kmeans(embeddings: np.ndarray) -> np.ndarray:
    n = len(embeddings)
    sqrt_n = int(math.sqrt(n))
    candidates = sorted({5, 8, 10, 12, 15, 20, 25, sqrt_n} - {0, 1})
    best_k = pick_kmeans_k(embeddings, candidates)
    km = KMeans(n_clusters=best_k, n_init=20, random_state=42)
    return km.fit_predict(embeddings)


def cluster_agglomerative(embeddings: np.ndarray) -> np.ndarray:
    n = len(embeddings)
    k = max(5, min(20, int(math.sqrt(n))))
    agg = AgglomerativeClustering(n_clusters=k, linkage="ward")
    return agg.fit_predict(embeddings)


def summarize_clusters(records: List[Record], labels: np.ndarray) -> List[Dict[str, object]]:
    cluster_ids = sorted(set(labels))

    summaries: List[Dict[str, object]] = []
    for cid in cluster_ids:
        indices = [i for i, lbl in enumerate(labels) if lbl == cid]
        if not indices:
            continue

        samples = [records[i].title for i in indices[:5]]
        summaries.append(
            {
                "cluster": int(cid),
                "size": len(indices),
                "sample_titles": samples,
            }
        )
    return summaries


def extract_json_array(text: str) -> List[str]:
    # Try ```json block
    match = re.search(r"```json\\s*(\\[.*?\\])\\s*```", text, re.S)
    if match:
        text = match.group(1)
    else:
        match = re.search(r"(\\[[^\\]]*\\])", text, re.S)
        if match:
            text = match.group(1)
    text = re.sub(r"```json|```", "", text).strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, str)]
    except Exception:
        return []
    return []


def ollama_keywords(
    ollama_url: str, model: str, titles: List[str], max_keywords: int = 15
) -> List[str]:
    if not titles:
        return []
    joined = "\n".join(titles)
    prompt = (
        "以下ははてなブックマークのタイトル一覧です。"
        "これらのタイトルから、トピックを代表するキーワードを抽出してください。\n\n"
        "タイトル一覧:\n"
        f"{joined}\n\n"
        "要件:\n"
        "- 5-15個程度のキーワード\n"
        "- 日本語・英語どちらも可\n"
        "- 重複を避ける\n"
        "重要: 回答は必ず有効なJSON配列形式でお答えください。説明文は不要です。\n"
        "出力例: [\"Python\", \"機械学習\", \"Docker\", \"AWS\", \"React\"]"
    )
    resp = requests.post(
        f"{ollama_url}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False, "options": {"temperature": 0.3}},
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data.get("response", "")
    return extract_json_array(text)


def add_llm_summaries(
    summaries: List[Dict[str, object]],
    records: List[Record],
    labels: np.ndarray,
    args: argparse.Namespace,
    summary_path: Path,
) -> None:
    cluster_to_indices: Dict[int, List[int]] = {}
    for i, lbl in enumerate(labels):
        cluster_to_indices.setdefault(int(lbl), []).append(i)

    existing: Dict[int, List[str]] = {}
    if args.resume and summary_path.exists():
        try:
            saved = json.loads(summary_path.read_text(encoding="utf-8"))
            for item in saved:
                if "llm_keywords" in item and item.get("cluster") is not None:
                    existing[int(item["cluster"])] = item["llm_keywords"]
        except Exception:
            existing = {}

    total = len(summaries)
    for idx, summary in enumerate(summaries, start=1):
        cid = summary["cluster"]
        if int(cid) in existing and existing[int(cid)]:
            summary["llm_keywords"] = existing[int(cid)]
            continue
        indices = cluster_to_indices.get(cid, [])
        titles = [records[i].title for i in indices]
        # Keep prompt size reasonable
        titles = titles[:200]
        print(f"LLM summary {idx}/{total} (cluster {cid}, titles={len(titles)})", flush=True)
        try:
            keywords = ollama_keywords(args.ollama_url, args.llm_model, titles)
        except Exception as exc:
            print(f"  LLM summary failed: {exc}", flush=True)
            keywords = []
        summary["llm_keywords"] = keywords
        # Persist after each cluster to allow resume
        summary_path.write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding="utf-8")


def is_summary_complete(summary_path: Path, labels: np.ndarray, require_llm: bool) -> bool:
    if not summary_path.exists():
        return False
    try:
        data = json.loads(summary_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(data, list) or not data:
        return False
    label_set = set(int(x) for x in labels.tolist())
    summary_clusters = set(int(d.get("cluster")) for d in data if d.get("cluster") is not None)
    if summary_clusters != label_set:
        return False
    if require_llm:
        for d in data:
            if not d.get("llm_keywords"):
                return False
    return True


def write_outputs(
    records: List[Record],
    labels: np.ndarray,
    umap_2d: np.ndarray,
    method: str,
    summary: List[Dict[str, object]] | None = None,
) -> None:
    TMP_ROOT.mkdir(exist_ok=True)
    out_items = []
    for r, lbl, xy in zip(records, labels, umap_2d):
        out_items.append(
            {
                "id": r.id,
                "title": r.title,
                "link": r.link,
                "date": r.date,
                "source": r.source,
                "dup_count": r.dup_count,
                "cluster": int(lbl),
                "umap_x": float(xy[0]),
                "umap_y": float(xy[1]),
            }
        )

    (TMP_ROOT / f"clusters_{method}.json").write_text(
        json.dumps(out_items, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    summary = summary or summarize_clusters(records, labels)
    (TMP_ROOT / f"clusters_{method}_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    args = parse_args()
    if args.force:
        args.force_embed = True
        args.force_umap = True
        args.force_cluster = True
        args.resume = False

    records = load_records(args.year, args.limit)
    if not records:
        print("No records found.")
        return

    embeddings, meta = get_embeddings(records, args)
    print(f"Embeddings: {embeddings.shape}")

    umap_2d_path = TMP_ROOT / f"umap_2d_{args.year}.npy"
    umap_10d_path = TMP_ROOT / f"umap_10d_{args.year}.npy"
    if args.resume and umap_2d_path.exists() and not args.force_umap:
        umap_2d = np.load(umap_2d_path)
    else:
        umap_2d = reduce_umap(embeddings, n_components=2)
        np.save(umap_2d_path, umap_2d)

    if args.resume and umap_10d_path.exists() and not args.force_umap:
        umap_10d = np.load(umap_10d_path)
    else:
        # UMAP to 10 dims for clustering stability
        umap_10d = reduce_umap(embeddings, n_components=10)
        np.save(umap_10d_path, umap_10d)

    labels_hdb_path = TMP_ROOT / f"labels_hdbscan_{args.year}.npy"
    if args.resume and labels_hdb_path.exists() and not args.force_cluster:
        labels_hdb = np.load(labels_hdb_path)
    else:
        labels_hdb = cluster_hdbscan(
            umap_10d, min_cluster_size=args.min_cluster_size, min_samples=args.min_samples
        )
        np.save(labels_hdb_path, labels_hdb)
    hdb_summary_path = TMP_ROOT / "clusters_hdbscan_summary.json"
    hdb_clusters_path = TMP_ROOT / "clusters_hdbscan.json"
    if args.resume and hdb_clusters_path.exists() and is_summary_complete(hdb_summary_path, labels_hdb, args.llm_summary):
        print("HDBSCAN outputs complete, skipping.", flush=True)
    else:
        if args.llm_summary:
            summary = summarize_clusters(records, labels_hdb)
            add_llm_summaries(
                summary,
                records,
                labels_hdb,
                args,
                hdb_summary_path,
            )
            write_outputs(records, labels_hdb, umap_2d, "hdbscan", summary=summary)
        else:
            write_outputs(records, labels_hdb, umap_2d, "hdbscan")

    km_method = "kmeans_embed" if args.kmeans_on_embeddings else "kmeans"
    labels_km_path = TMP_ROOT / f"labels_{km_method}_{args.year}.npy"
    if args.resume and labels_km_path.exists() and not args.force_cluster:
        labels_km = np.load(labels_km_path)
    else:
        kmeans_input = embeddings if args.kmeans_on_embeddings else umap_10d
        labels_km = cluster_kmeans(kmeans_input)
        np.save(labels_km_path, labels_km)
    km_summary_path = TMP_ROOT / f"clusters_{km_method}_summary.json"
    km_clusters_path = TMP_ROOT / f"clusters_{km_method}.json"
    if args.resume and km_clusters_path.exists() and is_summary_complete(km_summary_path, labels_km, args.llm_summary):
        print(f"{km_method} outputs complete, skipping.", flush=True)
    else:
        if args.llm_summary:
            summary = summarize_clusters(records, labels_km)
            add_llm_summaries(
                summary,
                records,
                labels_km,
                args,
                km_summary_path,
            )
            write_outputs(records, labels_km, umap_2d, km_method, summary=summary)
        else:
            write_outputs(records, labels_km, umap_2d, km_method)

    labels_agg_path = TMP_ROOT / f"labels_agglomerative_{args.year}.npy"
    if args.resume and labels_agg_path.exists() and not args.force_cluster:
        labels_agg = np.load(labels_agg_path)
    else:
        labels_agg = cluster_agglomerative(umap_10d)
        np.save(labels_agg_path, labels_agg)
    agg_summary_path = TMP_ROOT / "clusters_agglomerative_summary.json"
    agg_clusters_path = TMP_ROOT / "clusters_agglomerative.json"
    if args.resume and agg_clusters_path.exists() and is_summary_complete(agg_summary_path, labels_agg, args.llm_summary):
        print("Agglomerative outputs complete, skipping.", flush=True)
    else:
        if args.llm_summary:
            summary = summarize_clusters(records, labels_agg)
            add_llm_summaries(
                summary,
                records,
                labels_agg,
                args,
                agg_summary_path,
            )
            write_outputs(records, labels_agg, umap_2d, "agglomerative", summary=summary)
        else:
            write_outputs(records, labels_agg, umap_2d, "agglomerative")

    meta_out = TMP_ROOT / f"run_{args.year}_meta.json"
    meta_out.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Done. Outputs in ./tmp")


if __name__ == "__main__":
    main()
