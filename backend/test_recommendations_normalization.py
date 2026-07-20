import unittest


class RecommendationNormalizationTests(unittest.TestCase):
    def test_normalizes_legacy_and_structured_steps_with_safe_icons(self):
        from backend.main import normalize_recommendations

        result = normalize_recommendations([
            {
                "condition": "健康成年人",
                "advice": "按自身状态安排运动。",
                "steps": [
                    "  先补水  ",
                    {"text": "慢跑40分钟", "icon": "run"},
                    {"text": "运动后进食", "icon": "unknown"},
                    {"text": "不应保留", "icon": "food"},
                ],
                "methods": ["  快走  ", {"text": "慢跑", "icon": "run"}, {"text": "坏图标", "icon": "unknown"}],
                "cautions": "不是数组",
            },
            {"condition": "老数据", "advice": "只保留原建议。"},
        ])

        self.assertEqual(result[0]["steps"], [
            {"text": "先补水", "icon": "general"},
            {"text": "慢跑40分钟", "icon": "run"},
            {"text": "运动后进食", "icon": "general"},
        ])
        self.assertEqual(result[0]["cautions"], [])
        self.assertEqual(result[0]["methods"], [
            {"text": "快走", "icon": "general"},
            {"text": "慢跑", "icon": "run"},
            {"text": "坏图标", "icon": "general"},
        ])
        self.assertEqual(result[1]["steps"], [])
        self.assertEqual(result[1]["methods"], [])
        self.assertEqual(result[1]["cautions"], [])
