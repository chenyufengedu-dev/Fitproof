import unittest

from backend.content_router import (
    build_metadata_route_prompt,
    ContentRoutingError,
    metadata_precheck,
    normalize_content_route,
    normalize_metadata_route,
)


class ContentRouterTests(unittest.TestCase):
    def test_metadata_prompt_defines_conservative_fast_gate(self):
        prompt = build_metadata_route_prompt({
            "title": "如何 Vibe Coding 一个有设计感的个人网站",
            "description": "AI 工具教程",
        })
        self.assertIn("continue_deep", prompt)
        self.assertIn("无法确定", prompt)
        self.assertIn("如何 Vibe Coding 一个有设计感的个人网站", prompt)

    def test_metadata_route_stops_grounded_high_confidence_unrelated_content(self):
        result = normalize_metadata_route({
            "decision": "stop",
            "scope": "unrelated",
            "confidence": "high",
            "reason": "网站开发教程",
            "quotes": ["如何 Vibe Coding 一个有设计感的个人网站"],
        }, "如何 Vibe Coding 一个有设计感的个人网站")
        self.assertEqual(result["decision"], "stop")
        self.assertEqual(result["scope"], "unrelated")

    def test_metadata_route_continues_when_health_or_uncertain(self):
        result = normalize_metadata_route({
            "decision": "continue_deep",
            "scope": "potential_health",
            "confidence": "medium",
            "reason": "涉及减脂饮食",
            "quotes": ["减脂期我每天这样吃"],
        }, "减脂期我每天这样吃")
        self.assertIsNone(result)

    def test_metadata_route_rejects_ungrounded_stop(self):
        with self.assertRaises(ContentRoutingError):
            normalize_metadata_route({
                "decision": "stop",
                "scope": "unrelated",
                "confidence": "high",
                "reason": "编程教程",
                "quotes": ["输入中没有的文字"],
            }, "个人网站教程")

    def test_metadata_route_rejects_low_confidence_stop(self):
        with self.assertRaises(ContentRoutingError):
            normalize_metadata_route({
                "decision": "stop",
                "scope": "unrelated",
                "confidence": "medium",
                "reason": "可能无关",
                "quotes": ["个人网站教程"],
            }, "个人网站教程")

    def test_metadata_precheck_stops_explicit_non_health_formats(self):
        result = metadata_precheck({
            "source": "tikhub",
            "title": "世界杯比赛集锦：最后一分钟绝杀",
            "description": "完整赛事回放",
        })
        self.assertEqual(result["scope"], "unrelated")
        self.assertEqual(result["decision"], "stop")

    def test_metadata_precheck_abstains_when_health_goal_is_present(self):
        result = metadata_precheck({
            "source": "tikhub",
            "title": "足球运动员膝盖伤病康复训练",
            "description": "三个恢复动作",
        })
        self.assertIsNone(result)

    def test_metadata_precheck_never_rejects_upload_filename(self):
        self.assertIsNone(metadata_precheck({
            "source": "upload",
            "title": "比赛集锦.mp4",
        }))

    def test_normalizes_implicit_guidance(self):
        result = normalize_content_route({
            "scope": "implicit_guidance",
            "decision": "inspect_visual",
            "need_visual": True,
            "reason": "围绕减脂展示饮食方案",
            "quotes": ["减脂期我每天这样吃"],
        }, source_text="减脂期我每天这样吃")
        self.assertEqual(result["scope"], "implicit_guidance")
        self.assertEqual(result["quotes"], ["减脂期我每天这样吃"])

    def test_rejects_invalid_scope_or_decision_pair(self):
        with self.assertRaises(ContentRoutingError):
            normalize_content_route({
                "scope": "unrelated",
                "decision": "continue",
                "need_visual": False,
                "reason": "冲突结果",
                "quotes": [],
            }, source_text="比赛集锦")

    def test_rejects_quote_that_is_not_in_the_input(self):
        with self.assertRaises(ContentRoutingError):
            normalize_content_route({
                "scope": "explicit_claim",
                "decision": "continue",
                "need_visual": False,
                "reason": "明确健康主张",
                "quotes": ["每天吃三个鸡蛋"],
            }, source_text="每天可以吃一个鸡蛋")

    def test_rejects_non_boolean_visual_flag(self):
        with self.assertRaises(ContentRoutingError):
            normalize_content_route({
                "scope": "pending_visual",
                "decision": "inspect_visual",
                "need_visual": "true",
                "reason": "需查看画面",
                "quotes": [],
            }, source_text="普通文本")


if __name__ == "__main__":
    unittest.main()
