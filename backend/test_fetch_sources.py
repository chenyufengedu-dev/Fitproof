import csv
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

import openpyxl


class FetchSourcesTests(unittest.TestCase):
    def test_registry_output_uses_utf8_bom_for_excel(self):
        import fetch_sources

        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            xlsx_path = os.path.join(temp_dir, "sources.xlsx")
            registry_path = os.path.join(temp_dir, "registry.csv")
            output_path = os.path.join(temp_dir, "registry_new.csv")
            raw_dir = os.path.join(temp_dir, "raw-codex")

            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.append(["topic", "doc", "org", "year", "url"])
            sheet.append(["孕期", "孕期运动指南", "测试机构", "2026", "https://example.test/guide"])
            workbook.save(xlsx_path)
            with open(registry_path, "w", encoding="utf-8", newline="") as f:
                csv.writer(f).writerow(["id", "filename", "url"])

            with patch.object(fetch_sources, "try_download_pdf", return_value=("html", "Content-Type=text/html")), \
                    patch.object(sys, "argv", [
                        "fetch_sources.py", "--xlsx", xlsx_path, "--registry", registry_path,
                        "--out", output_path, "--out-dir", raw_dir,
                    ]):
                fetch_sources.main()

            with open(output_path, "rb") as f:
                self.assertEqual(f.read(3), b"\xef\xbb\xbf")


if __name__ == "__main__":
    unittest.main()
