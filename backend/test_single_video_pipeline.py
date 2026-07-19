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
                patch.object(main.evidence_store, "search_fulltext", return_value=[]), \
                patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.verify_single_claim("每天一个鸡蛋不用扔蛋黄", topic="不存在的标签")

        self.assertEqual([c["topic"] for c in search_calls], ["不存在的标签", ""])
        self.assertEqual(result["evidence_status"], "matched")
        self.assertEqual(result["evidence_tier"], "结论")
        self.assertEqual(result["cited_evidence_ids"], ["E-egg-001"])
        self.assertEqual(result["evidence"][0]["source_doc"], "中国居民膳食指南（2022）")
        self.assertEqual(result["evidence"][0]["url"], "https://example.test/guide")

    def test_verify_claim_falls_back_to_fulltext_chunks_when_conclusions_miss(self):
        from backend import main

        fulltext_calls = []

        def fake_fulltext(query, topic="", top_k=5):
            fulltext_calls.append({"query": query, "topic": topic, "top_k": top_k})
            if topic:
                return []
            return [
                {
                    "id": "F-acog-001",
                    "claim": "孕期没有禁忌时，可以进行轻到中等强度运动；原文还列出应停止运动的警示症状。",
                    "section": "全文原文段落",
                    "strength": "原文段落",
                    "source_doc": "ACOG Committee Opinion No. 804",
                    "org": "ACOG",
                    "year": "2020",
                    "url": "https://example.test/acog",
                    "page": "",
                    "score": 0.58,
                }
            ]

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            self.assertIn("全文原文段落", prompt)
            self.assertIn("F-acog-001", prompt)
            return json.dumps({
                "verdict": "需加条件",
                "risk_level": "中",
                "confidence": "中",
                "strength": "中",
                "correction": "孕期运动通常需要先排除禁忌，并留意停止运动的警示症状。",
                "cited_evidence_ids": ["F-acog-001", "E-fake-999"],
            }, ensure_ascii=False)

        with patch.object(main.evidence_store, "search", return_value=[]), \
                patch.object(main.evidence_store, "search_fulltext", side_effect=fake_fulltext), \
                patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.verify_single_claim("孕妇运动越多越好", topic="孕产")

        self.assertEqual([c["topic"] for c in fulltext_calls], ["孕产", ""])
        self.assertEqual(result["evidence_status"], "matched")
        self.assertEqual(result["evidence_tier"], "全文")
        self.assertEqual(result["cited_evidence_ids"], ["F-acog-001"])
        self.assertEqual(result["evidence"][0]["strength"], "原文段落")

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
                patch.object(main.evidence_store, "search_fulltext", return_value=[]), \
                patch.object(main, "llm_chat", side_effect=fake_llm):
            result = main.verify_single_claim("今天天气怎么样", topic="天气")

        self.assertEqual(result["evidence_status"], "not_found")
        self.assertEqual(result["evidence_tier"], "无")
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

    def test_keyframe_gate_skips_plain_talking_head_transcript(self):
        from backend import main

        def fake_llm(prompt, max_tokens=8192, json_mode=False, retries=3, model=None):
            self.assertIn("激进", prompt)
            self.assertTrue(json_mode)
            self.assertEqual(model, main.DEEPSEEK_FAST_MODEL)
            return '{"need_visual": false, "reason": "没有明确画面线索"}'

        with patch.object(main, "llm_chat", side_effect=fake_llm):
            need_visual, reason = main.should_describe_keyframes("每天走路半小时有助于心血管健康。")

        self.assertFalse(need_visual)
        self.assertEqual(reason, "没有明确画面线索")

    def test_keyframe_gate_keeps_report_and_numeric_transcript(self):
        from backend import main

        with patch.object(
            main,
            "llm_chat",
            return_value='{"need_visual": true, "reason": "提到血常规报告单和数值"}',
        ):
            need_visual, reason = main.should_describe_keyframes(
                "请看这张血常规报告单，白细胞数值是 12.5。"
            )

        self.assertTrue(need_visual)
        self.assertEqual(reason, "提到血常规报告单和数值")

    def test_keyframe_gate_defaults_to_visual_on_unparseable_response(self):
        from backend import main

        with patch.object(main, "llm_chat", return_value="我认为不需要"):
            need_visual, reason = main.should_describe_keyframes("纯口播文本")

        self.assertTrue(need_visual)
        self.assertIn("解析失败", reason)

    def test_sample_keyframes_removes_frames_over_hard_cap(self):
        from backend import main

        frames = [
            {"time": 0, "path": "keep-0.jpg"},
            {"time": 5, "path": "keep-5.jpg"},
            {"time": 10, "path": "discard-10.jpg"},
        ]
        removed = []

        with patch.object(main, "pick_keyframe_times", return_value=[{"time": 0}]), \
                patch.object(main, "_grab_frames_parallel", return_value=frames), \
                patch.object(main, "dedupe_frames_by_phash", return_value=frames), \
                patch.object(main, "remove_file_quietly", side_effect=removed.append):
            result = main.sample_keyframes("video.mp4", max_frames=2)

        self.assertEqual(result, frames[:2])
        self.assertEqual(removed, ["discard-10.jpg"])


if __name__ == "__main__":
    unittest.main()
