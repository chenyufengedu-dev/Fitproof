import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class EvidenceSummaryLabelTests(unittest.TestCase):
    def test_summary_uses_real_document_metadata_and_deduplicates_documents(self):
        from backend import main

        label = main.format_evidence_summary_label([
            {
                "source_doc": "中国居民膳食指南（2022）",
                "org": "中国营养学会",
            },
            {
                "source_doc": "中国居民膳食指南（2022）",
                "org": "中国营养学会",
            },
            {
                "source_doc": "成人高血压食养指南（2023年版）",
                "org": "国家卫生健康委员会",
            },
        ])

        # 文献名已移到 sources 胶囊；label 只给去重后的总数（3 条 → 2 篇）。
        self.assertEqual(label, "检索到 2 篇相关文献")

    def test_summary_reports_no_match_without_inventing_a_document(self):
        from backend import main

        self.assertEqual(main.format_evidence_summary_label([]), "未命中已收录权威依据")

    def test_summary_uses_a_real_document_even_when_org_is_missing(self):
        from backend import main

        label = main.format_evidence_summary_label([
            {"source_doc": "真实文献", "org": ""},
        ])

        self.assertEqual(label, "检索到 1 篇相关文献")
        self.assertEqual(
            main.evidence_source_names([{"source_doc": "真实文献", "org": ""}]),
            ["《真实文献》"],
        )

    def test_summary_does_not_treat_an_org_as_a_document(self):
        from backend import main

        label = main.format_evidence_summary_label([
            {"source_doc": "", "org": "真实机构"},
        ])

        self.assertEqual(label, "检索到 1 条相关依据，未提供可展示的文献名")


class RetrievalTraceTests(unittest.TestCase):
    def test_conclusion_hit_explains_why_retrieval_stops(self):
        from backend import main

        evidence = [{"id": "E-1", "claim": "真实结论"}]
        emitted = []
        with (
            patch.object(main.evidence_store, "search", return_value=evidence),
            patch.object(main.evidence_store, "search_fulltext") as search_fulltext,
        ):
            hits, status, tier, trace = main.search_evidence_for_claim(
                "测试主张",
                topic="膳食营养",
                on_event=emitted.append,
            )

        self.assertEqual((hits, status, tier), (evidence, "matched", "结论"))
        self.assertEqual(trace[-1]["label"], "结论库命中，无需继续向下检索")
        self.assertEqual(trace[-1]["step"], "retrieval_stop")
        self.assertEqual(emitted, trace)
        search_fulltext.assert_not_called()

    def test_fulltext_hit_explains_why_retrieval_stops(self):
        from backend import main

        evidence = [{"id": "F-1", "claim": "真实原文段落"}]
        with (
            patch.object(main.evidence_store, "search", side_effect=[[], []]),
            patch.object(main.evidence_store, "search_fulltext", side_effect=[[], evidence]),
        ):
            hits, status, tier, trace = main.search_evidence_for_claim(
                "测试主张",
                topic="膳食营养",
            )

        self.assertEqual((hits, status, tier), (evidence, "matched", "全文"))
        self.assertEqual(trace[-1]["label"], "全文库命中，无需继续向下检索")
        self.assertEqual(trace[-1]["step"], "retrieval_stop")

    def test_total_miss_keeps_all_four_levels_visible_in_order(self):
        from backend import main

        with (
            patch.object(main.evidence_store, "search", side_effect=[[], []]),
            patch.object(main.evidence_store, "search_fulltext", side_effect=[[], []]),
        ):
            hits, status, tier, trace = main.search_evidence_for_claim(
                "完全无关的测试主张",
                topic="膳食营养",
            )

        self.assertEqual((hits, status, tier), ([], "not_found", "无"))
        self.assertEqual([event["step"] for event in trace], [
            "retrieve_conclusion_topic",
            "retrieve_conclusion_all",
            "retrieve_fulltext_topic",
            "retrieve_fulltext_all",
        ])
        self.assertTrue(all(event["tone"] == "miss" for event in trace))
        self.assertNotIn("retrieval_stop", [event["step"] for event in trace])


class VerifyTraceIntegrationTests(unittest.TestCase):
    @staticmethod
    def _verify_json() -> str:
        return (
            '{"verdict":"可信","risk_level":"低","confidence":"高",'
            '"strength":"高","correction":"测试结论",'
            '"cited_evidence_ids":[]}'
        )

    @staticmethod
    def _store_with_entries():
        store = MagicMock()
        store._ensure_index.return_value = ([{"id": "E-1"}], None)
        return store

    def test_verify_summary_is_built_from_the_actual_retrieval_hits(self):
        from backend import main

        evidence = [{
            "id": "E-1",
            "claim": "真实结论",
            "source_doc": "中国居民膳食指南（2022）",
            "org": "中国营养学会",
        }]
        with (
            patch.object(main.evidence_store, "search", return_value=evidence),
            patch.object(main.evidence_store, "search_fulltext") as search_fulltext,
            patch.object(main.evidence_store, "get_store", return_value=self._store_with_entries()),
            patch.object(main, "llm_chat", return_value=self._verify_json()),
            patch("knowledge.load_library", return_value={"stats": {"docs": 1, "orgs": 1}}),
        ):
            result = main.verify_single_claim(
                "测试主张",
                topic="膳食营养",
                include_claim_origin=False,
            )

        summary = next(event for event in result["trace"] if event["step"] == "evidence_summary")
        self.assertEqual(summary["label"], "检索到 1 篇相关文献")
        # 文献名进 sources 胶囊，且必须来自真实命中的 evidence（防伪核心断言）。
        self.assertEqual(summary["sources"], ["中国营养学会《中国居民膳食指南（2022）》"])
        self.assertEqual(result["evidence"], evidence)
        search_fulltext.assert_not_called()

    def test_verify_total_miss_keeps_four_levels_before_common_sense_downgrade(self):
        from backend import main

        with (
            patch.object(main.evidence_store, "search", side_effect=[[], []]),
            patch.object(main.evidence_store, "search_fulltext", side_effect=[[], []]),
            patch.object(main.evidence_store, "get_store", return_value=self._store_with_entries()),
            patch.object(main, "llm_chat", return_value=self._verify_json()),
            patch("knowledge.load_library", return_value={"stats": {"docs": 1, "orgs": 1}}),
        ):
            result = main.verify_single_claim(
                "完全无关的测试主张",
                topic="膳食营养",
                include_claim_origin=False,
            )

        steps = [event["step"] for event in result["trace"]]
        self.assertEqual(steps[:4], [
            "retrieve_conclusion_topic",
            "retrieve_conclusion_all",
            "retrieve_fulltext_topic",
            "retrieve_fulltext_all",
        ])
        self.assertTrue(all(event["tone"] == "miss" for event in result["trace"][:4]))
        self.assertLess(steps.index("retrieve_fulltext_all"), steps.index("evidence_summary"))
        self.assertLess(steps.index("evidence_summary"), steps.index("downgrade_common_sense"))


if __name__ == "__main__":
    unittest.main()
