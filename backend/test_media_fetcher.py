import os
import unittest
from unittest.mock import patch


class MediaFetcherTests(unittest.TestCase):
    def test_fetch_media_uses_tikhub_first(self):
        from backend import main

        expected = {
            "source": "tikhub",
            "title": "标题",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_url": "https://example.test/video.mp4",
            "duration": 12.0,
            "cleanup_paths": [],
        }

        with patch.object(main, "fetch_media_tikhub", return_value=expected) as tikhub:
            media = main.fetch_media("https://www.douyin.com/video/123456")

        tikhub.assert_called_once_with("https://www.douyin.com/video/123456")
        self.assertEqual(media, expected)

    def test_fetch_media_falls_back_to_upload_when_tikhub_fails(self):
        from backend import main

        fallback = {
            "source": "upload",
            "title": "上传视频",
            "author": "本地文件",
            "audio_path": "uploaded-audio.mp3",
            "video_path": "uploaded-video.mp4",
            "duration": 20.0,
            "cleanup_paths": ["uploaded-audio.mp3", "uploaded-video.mp4"],
        }

        with patch.object(main, "fetch_media_tikhub", side_effect=RuntimeError("TikHub失败")), \
                patch.object(main, "fetch_media_upload_placeholder", return_value=fallback) as upload:
            media = main.fetch_media("https://www.douyin.com/video/123456")

        upload.assert_called_once_with("https://www.douyin.com/video/123456")
        self.assertEqual(media["source"], "upload")
        self.assertEqual(media["audio_path"], "uploaded-audio.mp3")

    def test_extract_one_video_prefers_local_media_paths_and_cleans_them(self):
        from backend import main

        media = {
            "source": "upload",
            "title": "测试视频",
            "author": "作者",
            "audio_path": "local-audio.mp3",
            "video_path": "local-video.mp4",
            "duration": 20.0,
            "cleanup_paths": ["local-audio.mp3", "local-video.mp4"],
        }

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=media), \
                patch.object(main, "transcribe", return_value=("原始文本", [
                    {"start": 1.0, "text": "原始文本"}
                ])) as transcribe, \
                patch.object(main, "sample_keyframes", return_value=[{"time": 5, "path": "frame.jpg"}]) as keyframes, \
                patch.object(main, "should_describe_keyframes", return_value=(True, "表格线索")), \
                patch.object(main, "_describe_frames_parallel", return_value=[{"time": 5, "screen_text": "表格"}]), \
                patch.object(main, "remove_file_quietly") as remove_file:
            video = main.extract_one_video(1, "https://v.douyin.com/test/")

        transcribe.assert_called_once_with("local-audio.mp3")
        keyframes.assert_called_once_with("local-video.mp4", [{"start": 20.0}])
        self.assertEqual([call.args[0] for call in remove_file.call_args_list], [
            "frame.jpg",
            "local-audio.mp3",
            "local-video.mp4",
        ])
        self.assertEqual(video["clean_text"], "原始文本")
        self.assertEqual(video["keyframes"], [{"time": 5, "screen_text": "表格"}])

    def test_ytdlp_fetcher_has_been_removed(self):
        from backend import main

        self.assertFalse(hasattr(main, "fetch_media_ytdlp"))
        self.assertFalse(hasattr(main, "_download_with_ytdlp"))


if __name__ == "__main__":
    unittest.main()
