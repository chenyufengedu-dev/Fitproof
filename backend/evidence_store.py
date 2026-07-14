"""Local semantic search over FitProof evidence entries.

This module is intentionally independent from main.py so it can be tested and
validated before being wired into the analysis pipeline.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import numpy as np


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_ENTRIES_DIR = BASE_DIR / "evidence" / "entries"
DEFAULT_CACHE_PATH = BASE_DIR / "evidence" / "cache" / "evidence_vectors.npz"
DEFAULT_MODEL_NAME = "BAAI/bge-small-zh-v1.5"
DEFAULT_THRESHOLD = 0.45

_default_store: "EvidenceStore | None" = None


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str = DEFAULT_MODEL_NAME):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        return np.asarray(
            self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False),
            dtype=np.float32,
        )


class EvidenceStore:
    def __init__(
        self,
        entries_dir: str | Path = DEFAULT_ENTRIES_DIR,
        cache_path: str | Path = DEFAULT_CACHE_PATH,
        embedder: Any | None = None,
        threshold: float = DEFAULT_THRESHOLD,
        model_name: str = DEFAULT_MODEL_NAME,
    ):
        self.entries_dir = Path(entries_dir)
        self.cache_path = Path(cache_path)
        self.threshold = threshold
        self.model_name = model_name
        self._embedder = embedder
        self._entries: list[dict[str, Any]] | None = None
        self._vectors: np.ndarray | None = None

    @property
    def embedder(self):
        if self._embedder is None:
            self._embedder = SentenceTransformerEmbedder(self.model_name)
        return self._embedder

    def search(self, query: str, topic: str = "", top_k: int = 5) -> list[dict[str, Any]]:
        query = query.strip()
        if not query or top_k <= 0:
            return []

        entries, vectors = self._ensure_index()
        candidate_indices = self._candidate_indices(entries, topic.strip())
        if not candidate_indices:
            return []

        query_vector = self._normalize(self._encode([query]))[0]
        candidate_vectors = vectors[candidate_indices]
        scores = candidate_vectors @ query_vector

        ranked = sorted(
            zip(candidate_indices, scores.tolist()),
            key=lambda item: item[1],
            reverse=True,
        )

        results: list[dict[str, Any]] = []
        for idx, score in ranked:
            if score < self.threshold:
                continue
            item = dict(entries[idx])
            item["score"] = round(float(score), 4)
            item.setdefault("source_doc", "")
            item.setdefault("url", "")
            results.append(item)
            if len(results) >= top_k:
                break
        return results

    def _ensure_index(self) -> tuple[list[dict[str, Any]], np.ndarray]:
        if self._entries is not None and self._vectors is not None:
            return self._entries, self._vectors

        entries = self._load_entries()
        fingerprint = self._fingerprint(entries)
        vectors = self._load_cached_vectors(fingerprint, len(entries))
        if vectors is None:
            texts = [self._entry_text(e) for e in entries]
            vectors = self._normalize(self._encode(texts))
            self._save_cached_vectors(vectors, fingerprint)

        self._entries = entries
        self._vectors = vectors
        return entries, vectors

    def _load_entries(self) -> list[dict[str, Any]]:
        if not self.entries_dir.exists():
            raise FileNotFoundError(f"证据条目目录不存在: {self.entries_dir}")

        entries: list[dict[str, Any]] = []
        for path in sorted(self.entries_dir.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            for entry in data.get("entries", []):
                if entry.get("id") and entry.get("claim"):
                    entries.append(entry)

        if not entries:
            raise ValueError(f"未找到可检索的证据条目: {self.entries_dir}")
        return entries

    def _load_cached_vectors(self, fingerprint: str, expected_count: int) -> np.ndarray | None:
        if not self.cache_path.exists():
            return None
        try:
            data = np.load(self.cache_path, allow_pickle=False)
            if str(data["fingerprint"]) != fingerprint:
                return None
            vectors = np.asarray(data["vectors"], dtype=np.float32)
            if vectors.shape[0] != expected_count:
                return None
            return vectors
        except Exception:
            return None

    def _save_cached_vectors(self, vectors: np.ndarray, fingerprint: str) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(self.cache_path, vectors=vectors, fingerprint=fingerprint)

    def _encode(self, texts: list[str]) -> np.ndarray:
        raw = self.embedder.encode(texts)
        return np.asarray(raw, dtype=np.float32)

    @staticmethod
    def _normalize(vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms

    @staticmethod
    def _candidate_indices(entries: list[dict[str, Any]], topic: str) -> list[int]:
        if not topic:
            return list(range(len(entries)))
        topic_lower = topic.lower()
        indices = []
        for i, entry in enumerate(entries):
            topics = [str(t).lower() for t in entry.get("topics", [])]
            if any(topic_lower == t or topic_lower in t or t in topic_lower for t in topics):
                indices.append(i)
        return indices

    @staticmethod
    def _entry_text(entry: dict[str, Any]) -> str:
        topics = " ".join(str(t) for t in entry.get("topics", []))
        return " ".join(
            str(part)
            for part in [
                entry.get("claim", ""),
                entry.get("section", ""),
                topics,
                entry.get("source_doc", ""),
                entry.get("org", ""),
            ]
            if part
        )

    @staticmethod
    def _fingerprint(entries: list[dict[str, Any]]) -> str:
        payload = json.dumps(
            [
                {
                    "id": e.get("id", ""),
                    "claim": e.get("claim", ""),
                    "topics": e.get("topics", []),
                    "source_doc": e.get("source_doc", ""),
                    "url": e.get("url", ""),
                }
                for e in entries
            ],
            ensure_ascii=False,
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_store() -> EvidenceStore:
    global _default_store
    if _default_store is None:
        _default_store = EvidenceStore()
    return _default_store


def search(query: str, topic: str = "", top_k: int = 5) -> list[dict[str, Any]]:
    return get_store().search(query=query, topic=topic, top_k=top_k)


def _print_results(query: str, topic: str = "") -> None:
    start = time.perf_counter()
    results = search(query, topic=topic)
    elapsed = (time.perf_counter() - start) * 1000
    print(f"\nQuery: {query}  topic={topic or '-'}  results={len(results)}  {elapsed:.1f}ms")
    for item in results:
        print(
            f"- {item['id']} score={item['score']} [{item.get('source_doc', '')}] "
            f"{item.get('claim', '')} ({item.get('url', '')})"
        )


if __name__ == "__main__":
    _print_results("孕妇能吃蛋黄吗")
    _print_results("空腹运动会掉肌肉吗", topic="身体活动")
    _print_results("今天天气怎么样")
