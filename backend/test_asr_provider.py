import os
import unittest
from unittest.mock import patch


class AsrProviderTests(unittest.TestCase):
    def test_transcribe_defaults_to_local_whisper_shape(self):
        from backend import main

        class FakeWhisper:
            def transcribe(self, path, language="zh"):
                self.path = path
                self.language = language
                return {
                    "text": "  这是本地转写  ",
                    "segments": [
                        {"start": 1, "text": "  第一段  "},
                        {"start": 2.5, "text": "第二段"},
                    ],
                }

        with patch.dict(os.environ, {"ASR_PROVIDER": "local"}, clear=False), \
                patch.object(main, "get_whisper_model", return_value=FakeWhisper()):
            text, segments = main.transcribe("audio.mp3")

        self.assertEqual(text, "这是本地转写")
        self.assertEqual(segments, [
            {"start": 1.0, "text": "第一段"},
            {"start": 2.5, "text": "第二段"},
        ])

    def test_transcribe_routes_dashscope_provider(self):
        from backend import main

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "transcribe_dashscope", return_value=("云转写", [])) as dashscope:
            text, segments = main.transcribe("audio.mp3")

        dashscope.assert_called_once_with("audio.mp3")
        self.assertEqual(text, "云转写")
        self.assertEqual(segments, [])

    def test_dashscope_sentence_payload_keeps_timestamps(self):
        from backend import main

        payload = {
            "output": {
                "sentence": [
                    {"begin_time": 1200, "text": "第一句。"},
                    {"begin_time": 3450, "text": "第二句。"},
                ]
            }
        }

        text, segments = main._extract_dashscope_text_and_segments(payload)

        self.assertEqual(text, "第一句。第二句。")
        self.assertEqual(segments, [
            {"start": 1.2, "text": "第一句。"},
            {"start": 3.45, "text": "第二句。"},
        ])

    def test_dashscope_plain_text_gracefully_has_no_segments(self):
        from backend import main

        text, segments = main._extract_dashscope_text_and_segments({"output": {"text": "只有文本"}})

        self.assertEqual(text, "只有文本")
        self.assertEqual(segments, [])


if __name__ == "__main__":
    unittest.main()
