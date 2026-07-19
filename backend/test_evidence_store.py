import json
import tempfile
import unittest
from pathlib import Path


class FakeEmbedder:
    def encode(self, texts):
        vectors = []
        for text in texts:
            if "蛋黄" in text or "鸡蛋" in text or "胆固醇" in text:
                vectors.append([1.0, 0.0])
            elif "运动" in text or "孕妇" in text or "孕期" in text:
                vectors.append([0.0, 1.0])
            else:
                vectors.append([0.0, 0.0])
        return vectors


class EvidenceStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.entries_dir = Path(self.tmp.name) / "entries"
        self.cache_dir = Path(self.tmp.name) / "cache"
        self.entries_dir.mkdir()

        data = {
            "entries": [
                {
                    "id": "E-egg-001",
                    "claim": "健康成年人可以每天吃一个鸡蛋，蛋黄无需丢弃。",
                    "section": "蛋类摄入",
                    "strength": "指南推荐",
                    "topics": ["膳食营养", "鸡蛋", "胆固醇"],
                    "source_doc": "中国居民膳食指南（2022）",
                    "org": "中国营养学会",
                    "year": "2022",
                    "url": "https://example.test/guide",
                    "page": "10-11",
                },
                {
                    "id": "E-sport-001",
                    "claim": "成年人每周应累计进行至少150分钟中等强度有氧运动。",
                    "section": "身体活动",
                    "strength": "指南推荐",
                    "topics": ["膳食营养", "身体活动", "运动"],
                    "source_doc": "中国居民膳食指南（2022）",
                    "org": "中国营养学会",
                    "year": "2022",
                    "url": "https://example.test/guide",
                    "page": "48-50",
                },
            ]
        }
        (self.entries_dir / "guide.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_search_returns_traceable_evidence_fields(self):
        from backend.evidence_store import EvidenceStore

        store = EvidenceStore(
            entries_dir=self.entries_dir,
            cache_path=self.cache_dir / "vectors.npz",
            embedder=FakeEmbedder(),
            threshold=0.35,
        )

        results = store.search("孕妇能吃蛋黄吗", top_k=3)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "E-egg-001")
        self.assertEqual(results[0]["source_doc"], "中国居民膳食指南（2022）")
        self.assertEqual(results[0]["url"], "https://example.test/guide")
        self.assertIn("score", results[0])

    def test_search_filters_by_topic_before_scoring(self):
        from backend.evidence_store import EvidenceStore

        store = EvidenceStore(
            entries_dir=self.entries_dir,
            cache_path=self.cache_dir / "vectors.npz",
            embedder=FakeEmbedder(),
            threshold=0.35,
        )

        results = store.search("鸡蛋和蛋黄", topic="身体活动", top_k=3)

        self.assertEqual(results, [])

    def test_search_returns_empty_for_low_similarity(self):
        from backend.evidence_store import EvidenceStore

        store = EvidenceStore(
            entries_dir=self.entries_dir,
            cache_path=self.cache_dir / "vectors.npz",
            embedder=FakeEmbedder(),
            threshold=0.35,
        )

        results = store.search("今天天气怎么样", top_k=3)

        self.assertEqual(results, [])


class FulltextChunkStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fulltext_dir = Path(self.tmp.name) / "fulltext"
        self.cache_dir = Path(self.tmp.name) / "cache"
        self.fulltext_dir.mkdir()
        text = (
            "第一段介绍健康背景。" * 15
            + "孕期轻度到中等强度身体活动通常是安全的，指南鼓励无禁忌孕妇规律运动。"
            + "结尾补充说明。" * 15
        )
        (self.fulltext_dir / "pregnancy-guide.txt").write_text(text, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_split_text_chunks_uses_overlap(self):
        from backend.evidence_store import split_text_chunks

        chunks = split_text_chunks("abcdefghij", chunk_size=4, overlap=2)

        self.assertEqual(chunks, [("abcd", 0), ("cdef", 2), ("efgh", 4), ("ghij", 6)])

    def test_fulltext_search_returns_traceable_chunk_metadata(self):
        from backend.evidence_store import FulltextChunkStore

        store = FulltextChunkStore(
            fulltext_dir=self.fulltext_dir,
            cache_path=self.cache_dir / "chunks.npz",
            embedder=FakeEmbedder(),
            threshold=0.35,
            chunk_size=80,
            overlap=20,
            metadata_by_doc={
                "pregnancy-guide": {
                    "source_doc": "ACOG指南",
                    "org": "ACOG",
                    "year": "2020",
                    "url": "https://example.test/acog",
                }
            },
        )

        results = store.search("孕妇运动安全吗", top_k=1)

        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["id"].startswith("F-pregnancy-guide-"))
        self.assertEqual(results[0]["source_doc"], "ACOG指南")
        self.assertEqual(results[0]["org"], "ACOG")
        self.assertEqual(results[0]["url"], "https://example.test/acog")
        self.assertEqual(results[0]["strength"], "原文段落")
        self.assertIn("孕妇规律运动", results[0]["claim"])


if __name__ == "__main__":
    unittest.main()
