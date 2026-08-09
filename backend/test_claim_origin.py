import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class ClaimOriginTests(unittest.TestCase):
    def test_parse_claim_origin_accepts_safe_allowed_origin(self):
        from backend import main

        origin = main.parse_claim_origin({
            "type": "concept_confusion",
            "explanation": "容易把食物中的胆固醇和血脂变化直接画等号。",
        })

        self.assertEqual(origin, {
            "type": "concept_confusion",
            "explanation": "容易把食物中的胆固醇和血脂变化直接画等号。",
        })

    def test_parse_claim_origin_rejects_citation_like_content(self):
        from backend import main

        origin = main.parse_claim_origin({
            "type": "outdated_science",
            "explanation": "某机构在1970年发表研究后，这个说法开始流传。",
        })

        self.assertIsNone(origin)

    def test_only_negative_verdicts_request_claim_origin(self):
        from backend import main

        self.assertFalse(main.should_generate_claim_origin({"verdict": "基本可信", "risk_level": "低"}))
        self.assertFalse(main.should_generate_claim_origin({"verdict": "需加条件", "risk_level": "低"}))
        self.assertFalse(main.should_generate_claim_origin({"verdict": "需要加条件", "risk_level": "中"}))
        self.assertTrue(main.should_generate_claim_origin({"verdict": "不建议采纳", "risk_level": "低"}))


if __name__ == "__main__":
    unittest.main()
