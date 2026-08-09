import unittest
from types import SimpleNamespace


class SingleActionNormalizationTests(unittest.TestCase):
    def test_normalizes_actions_without_inventing_missing_values(self):
        from backend.main import normalize_single_actions

        result = normalize_single_actions([
            {
                "level": "unexpected",
                "condition": "  恢复较好者  ",
                "steps": [
                    {"title": " 温水洗浴 ", "note": " 快速完成 ", "icon": "shower"},
                    {"title": "", "note": "忽略", "icon": "general"},
                    {"title": "咨询医生", "note": "", "icon": "invalid"},
                    {"title": "不应保留", "note": "", "icon": "doctor"},
                ],
                "caution": "  出现不适暂停  ",
                "claim_indices": [0, "1", -1, 2],
                "evidence_ids": ["E1", "", 2],
            },
            {"condition": "", "steps": []},
        ])

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["level"], "caution")
        self.assertEqual(result[0]["condition"], "恢复较好者")
        self.assertEqual(result[0]["steps"], [
            {"title": "温水洗浴", "note": "快速完成", "icon": "shower"},
            {"title": "咨询医生", "note": "", "icon": "general"},
            {"title": "不应保留", "note": "", "icon": "doctor"},
        ])
        self.assertEqual(result[0]["claim_indices"], [0, 2])
        self.assertEqual(result[0]["evidence_ids"], ["E1", "2"])

    def test_preserves_every_expanded_action_icon_and_rejects_unknown_values(self):
        from backend.main import normalize_single_actions

        icons = ["elliptical", "firstAid", "glucose", "jog", "snack", "toast"]
        payload = [{
            "level": "normal",
            "condition": f"场景 {group_index}",
            "steps": [
                {"title": f"动作 {step_index}", "note": "", "icon": icon}
                for step_index, icon in enumerate(icons[group_index * 3:(group_index + 1) * 3])
            ],
            "claim_indices": [group_index],
        } for group_index in range(2)]
        payload.append({
            "level": "normal",
            "condition": "未知图标",
            "steps": [{"title": "未知动作", "note": "", "icon": "unknown"}],
            "claim_indices": [2],
        })

        result = normalize_single_actions(payload)

        self.assertEqual(
            [step["icon"] for item in result[:-1] for step in item["steps"]],
            icons,
        )
        self.assertEqual(result[-1]["steps"][0]["icon"], "general")

    def test_prompt_explains_the_expanded_icons_instead_of_encouraging_general(self):
        from backend.main import build_single_actions_prompt

        prompt = build_single_actions_prompt(
            SimpleNamespace(reference={}, topic="测试"),
            [],
        )

        for label in [
            "elliptical（椭圆机）",
            "firstAid（急救处理）",
            "glucose（测血糖）",
            "jog（慢跑）",
            "snack（加餐）",
            "toast（面包/吐司）",
        ]:
            self.assertIn(label, prompt)
        self.assertIn("务必选择语义最贴近的图标", prompt)


if __name__ == "__main__":
    unittest.main()
