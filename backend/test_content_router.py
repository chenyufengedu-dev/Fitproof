import unittest

from backend.content_router import (
    ContentRoutingError,
    metadata_precheck,
    normalize_content_route,
)


class ContentRouterTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
