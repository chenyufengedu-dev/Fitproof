import unittest


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


if __name__ == "__main__":
    unittest.main()
