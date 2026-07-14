import asyncio
import json
import unittest
from unittest.mock import patch


class SingleVideoPipelineTests(unittest.TestCase):
    def test_extract_claims_uses_fast_model_and_returns_claim_list(self):
        from backend import main

        calls = []

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            calls.append({
                "prompt": prompt,
                "max_tokens": max_tokens,
                "json_mode": json_mode,
                "model": model,
            })
            return json.dumps({
                "claims": [
                    {
                        "claim": "每天一个鸡蛋不用扔蛋黄",
                        "video_refs": [{"id": 1, "time": "0:12"}],
                        "signal": "较公认",
                        "why": "涉及蛋黄和胆固醇，适合用指南核验。",
                    }
                ]
            }, ensure_ascii=False)

        video = {
            "id": 1,
            "author": "作者A",
            "title": "鸡蛋科普",
            "url": "https://example.test/video",
            "clean_text": "每天一个鸡蛋不用扔蛋黄。",
            "segments": [{"start": 12.0, "text": "每天一个鸡蛋不用扔蛋黄"}],
            "keyframes": [],
        }

        with patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.extract_claims_from_video(video, topic="鸡蛋")

        self.assertEqual(calls[0]["model"], main.DEEPSEEK_FAST_MODEL)
        self.assertTrue(calls[0]["json_mode"])
        self.assertEqual(result["claims"][0]["claim"], "每天一个鸡蛋不用扔蛋黄")
        self.assertEqual(result["reference"]["url"], "https://example.test/video")

    def test_verify_claim_falls_back_to_full_search_and_filters_cited_ids(self):
        from backend import main

        search_calls = []

        def fake_search(query, topic="", top_k=5):
            search_calls.append({"query": query, "topic": topic, "top_k": top_k})
            if topic:
                return []
            return [
                {
                    "id": "E-egg-001",
                    "claim": "吃鸡蛋不应丢弃蛋黄。",
                    "section": "蛋类",
                    "strength": "指南推荐",
                    "topics": ["鸡蛋"],
                    "source_doc": "中国居民膳食指南（2022）",
                    "org": "中国营养学会",
                    "year": "2022",
                    "url": "https://example.test/guide",
                    "page": "10-11",
                    "score": 0.62,
                }
            ]

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            self.assertIn("E-egg-001", prompt)
            self.assertEqual(model, main.DEEPSEEK_REASONING_MODEL)
            self.assertGreaterEqual(max_tokens, 8192)
            return json.dumps({
                "verdict": "基本可信",
                "risk_level": "低",
                "confidence": "高",
                "strength": "高",
                "correction": "一般人群吃鸡蛋不必丢弃蛋黄，但仍需结合总膳食。",
                "cited_evidence_ids": ["E-egg-001", "E-fake-999"],
            }, ensure_ascii=False)

        with patch.object(main.evidence_store, "search", side_effect=fake_search), \
                patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.verify_single_claim("每天一个鸡蛋不用扔蛋黄", topic="不存在的标签")

        self.assertEqual([c["topic"] for c in search_calls], ["不存在的标签", ""])
        self.assertEqual(result["evidence_status"], "matched")
        self.assertEqual(result["cited_evidence_ids"], ["E-egg-001"])
        self.assertEqual(result["evidence"][0]["source_doc"], "中国居民膳食指南（2022）")
        self.assertEqual(result["evidence"][0]["url"], "https://example.test/guide")

    def test_verify_claim_degrades_when_no_evidence_matches(self):
        from backend import main

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            self.assertIn("未命中已收录权威依据", prompt)
            return json.dumps({
                "verdict": "证据不足",
                "risk_level": "中",
                "confidence": "低",
                "strength": "低",
                "correction": "未命中已收录权威依据，以下为AI常识判断。",
                "cited_evidence_ids": ["E-fake-999"],
            }, ensure_ascii=False)

        with patch.object(main.evidence_store, "search", return_value=[]), \
                patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.verify_single_claim("今天天气怎么样", topic="天气")

        self.assertEqual(result["evidence_status"], "not_found")
        self.assertEqual(result["strength"], "低")
        self.assertEqual(result["cited_evidence_ids"], [])

    def test_followup_uses_8192_tokens(self):
        from backend import main

        calls = []

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            calls.append(max_tokens)
            return "回答"

        req = main.FollowupRequest(analysis={}, question="什么是HIIT", history=[])

        with patch.object(main, "llm_chat", side_effect=fake_llm):
            result = asyncio.run(main.followup(req))

        self.assertEqual(result, {"answer": "回答"})
        self.assertEqual(calls, [8192])


if __name__ == "__main__":
    unittest.main()
