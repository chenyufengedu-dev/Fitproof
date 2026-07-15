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

    def test_transcribe_routes_dashscope_provider_with_audio_url(self):
        from backend import main

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "transcribe_dashscope", return_value=("云转写", [])) as dashscope:
            text, segments = main.transcribe("audio.mp3", audio_url="https://example.test/audio.mp3")

        dashscope.assert_called_once_with("audio.mp3", audio_url="https://example.test/audio.mp3")
        self.assertEqual(text, "云转写")
        self.assertEqual(segments, [])

    def test_dashscope_recorded_payload_keeps_sentence_timestamps(self):
        from backend import main

        payload = {
            "transcripts": [
                {
                    "sentences": [
                        {"begin_time": 1200, "end_time": 3000, "text": "第一句。"},
                        {"begin_time": 3450, "end_time": 5200, "text": "第二句。"},
                    ]
                }
            ]
        }

        text, segments = main._extract_dashscope_text_and_segments(payload)

        self.assertEqual(text, "第一句。第二句。")
        self.assertEqual(segments, [
            {"start": 1.2, "text": "第一句。"},
            {"start": 3.45, "text": "第二句。"},
        ])

    def test_extract_one_video_uses_dashscope_audio_url_without_downloading(self):
        from backend import main

        detail = {
            "source": "tikhub",
            "title": "测试视频",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_url": None,
            "cleanup_paths": [],
        }

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=detail), \
                patch.object(main, "download_mp3") as download_mp3, \
                patch.object(main, "transcribe", return_value=("原始文本", [
                    {"start": 1.0, "text": "原始文本"}
                ])) as transcribe, \
                patch.object(main, "extract_keyframes", return_value=[]), \
                patch.object(main, "clean_transcript", return_value="清洗文本") as clean_transcript:
            video = main.extract_one_video(1, "https://v.douyin.com/test/")

        download_mp3.assert_not_called()
        transcribe.assert_called_once_with("", audio_url="https://example.test/audio.mp3")
        clean_transcript.assert_not_called()
        self.assertEqual(video["clean_text"], "原始文本")
        self.assertEqual(video["segments"], [{"start": 1.0, "text": "原始文本"}])

    def test_extract_one_video_downloads_for_local_provider(self):
        from backend import main

        detail = {
            "source": "tikhub",
            "title": "测试视频",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_url": None,
            "cleanup_paths": [],
        }

        with patch.dict(os.environ, {"ASR_PROVIDER": "local"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=detail), \
                patch.object(main, "download_mp3", return_value="local.mp3") as download_mp3, \
                patch.object(main, "transcribe", return_value=("原始文本", [])) as transcribe, \
                patch.object(main, "clean_transcript", return_value="清洗文本"), \
                patch.object(os, "remove"):
            main.extract_one_video(1, "https://v.douyin.com/test/")

        download_mp3.assert_called_once_with("https://example.test/audio.mp3")
        transcribe.assert_called_once_with("local.mp3")

    def test_dashscope_task_output_downloads_transcription_url(self):
        from backend import main

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "transcripts": [
                        {
                            "sentences": [
                                {"begin_time": 0, "text": "下载结果。"}
                            ]
                        }
                    ]
                }

        output = {
            "results": [
                {
                    "subtask_status": "SUCCEEDED",
                    "transcription_url": "https://example.test/result.json",
                }
            ]
        }

        with patch.object(main.requests, "get", return_value=FakeResponse()) as get:
            payload = main._dashscope_transcription_payload(output)

        get.assert_called_once_with("https://example.test/result.json", timeout=30)
        self.assertEqual(payload["transcripts"][0]["sentences"][0]["text"], "下载结果。")

    def test_dashscope_plain_text_gracefully_has_no_segments(self):
        from backend import main

        text, segments = main._extract_dashscope_text_and_segments({"output": {"text": "只有文本"}})

        self.assertEqual(text, "只有文本")
        self.assertEqual(segments, [])


if __name__ == "__main__":
    unittest.main()
