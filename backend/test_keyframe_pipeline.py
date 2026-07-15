import os
import time
import unittest
from unittest.mock import patch


class KeyframePipelineTests(unittest.TestCase):
    def test_pick_keyframe_times_uses_timed_sampling_without_llm(self):
        from backend import main

        segments = [
            {"start": 0.3, "text": "开场"},
            {"start": 11.8, "text": "展示图表"},
            {"start": 14.2, "text": "结尾"},
        ]

        with patch.object(main, "llm_chat") as llm:
            picks = main.pick_keyframe_times(segments, interval=5, sample_limit=120)

        llm.assert_not_called()
        self.assertEqual([p["time"] for p in picks], [0, 5, 10])

    def test_extract_keyframes_dedupes_caps_and_discards_none_descriptions(self):
        from backend import main

        grabbed = {
            0: "frame-a.jpg",
            5: "frame-b-same.jpg",
            10: "frame-c.jpg",
            15: "frame-d.jpg",
        }
        hashes = {
            "frame-a.jpg": 0b00000000,
            "frame-b-same.jpg": 0b00000001,
            "frame-c.jpg": 0b11110000,
            "frame-d.jpg": 0b00110011,
        }
        descriptions = {
            "frame-a.jpg": "无",
            "frame-c.jpg": "画面展示一张血糖趋势图，餐后曲线升高。",
            "frame-d.jpg": "表格列出孕期运动频率和注意事项。",
        }

        with patch.object(main, "pick_keyframe_times", return_value=[
                {"time": 0}, {"time": 5}, {"time": 10}, {"time": 15},
            ]), \
                patch.object(main, "grab_frame", side_effect=lambda _url, t: grabbed[t]), \
                patch.object(main, "image_phash", side_effect=lambda path: hashes[path]), \
                patch.object(main, "describe_frame", side_effect=lambda path: descriptions.get(path, "无")), \
                patch.object(main, "remove_file_quietly"):
            frames = main.extract_keyframes("https://example.test/video.mp4", [], max_frames=3, phash_threshold=2)

        self.assertEqual(frames, [
            {"time": 10, "screen_text": "画面展示一张血糖趋势图，餐后曲线升高。"},
            {"time": 15, "screen_text": "表格列出孕期运动频率和注意事项。"},
        ])

    def test_extract_one_video_runs_asr_and_keyframes_in_parallel(self):
        from backend import main

        detail = {
            "source": "tikhub",
            "title": "测试视频",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_path": "local-video.mp4",
            "cleanup_paths": [],
        }

        def slow_transcribe(_path, audio_url=None):
            time.sleep(0.25)
            return "原始文本", [{"start": 10.0, "text": "原始文本"}]

        def slow_sampling(_video_url, _segments):
            time.sleep(0.25)
            return [{"time": 10, "path": "frame.jpg"}]

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=detail), \
                patch.object(main, "transcribe", side_effect=slow_transcribe), \
                patch.object(main, "sample_keyframes", side_effect=slow_sampling), \
                patch.object(main, "should_describe_keyframes", return_value=(True, "图表线索")), \
                patch.object(main, "_describe_frames_parallel", return_value=[{"time": 10, "screen_text": "图表"}]):
            start = time.perf_counter()
            video = main.extract_one_video(1, "https://v.douyin.com/test/")
            elapsed = time.perf_counter() - start

        self.assertLess(elapsed, 0.45)
        self.assertEqual(video["clean_text"], "原始文本")
        self.assertEqual(video["keyframes"], [{"time": 10, "screen_text": "图表"}])

    def test_extract_one_video_downloads_video_url_before_keyframes(self):
        from backend import main

        detail = {
            "source": "tikhub",
            "title": "测试视频",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_url": "https://example.test/video.mp4",
            "duration": 20.0,
            "cleanup_paths": [],
        }

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=detail), \
                patch.object(main, "transcribe", return_value=("原始文本", [
                    {"start": 1.0, "text": "原始文本"}
                ])), \
                patch.object(main, "download_video", return_value="local-video.mp4") as download_video, \
                patch.object(main, "sample_keyframes", return_value=[{"time": 5, "path": "frame.jpg"}]) as keyframes, \
                patch.object(main, "should_describe_keyframes", return_value=(True, "表格线索")), \
                patch.object(main, "_describe_frames_parallel", return_value=[{"time": 5, "screen_text": "表格"}]), \
                patch.object(main, "remove_file_quietly") as remove_file:
            video = main.extract_one_video(1, "https://v.douyin.com/test/")

        download_video.assert_called_once_with("https://example.test/video.mp4")
        keyframes.assert_called_once_with("local-video.mp4", [{"start": 20.0}])
        self.assertIn("local-video.mp4", [call.args[0] for call in remove_file.call_args_list])
        self.assertEqual(video["keyframes"], [{"time": 5, "screen_text": "表格"}])

    def test_extract_one_video_skips_visual_line_when_video_download_fails(self):
        from backend import main

        detail = {
            "source": "tikhub",
            "title": "测试视频",
            "author": "作者",
            "audio_url": "https://example.test/audio.mp3",
            "video_url": "https://example.test/video.mp4",
            "duration": 20.0,
            "cleanup_paths": [],
        }

        with patch.dict(os.environ, {"ASR_PROVIDER": "dashscope"}, clear=False), \
                patch.object(main, "resolve_url", return_value="https://www.douyin.com/video/123456"), \
                patch.object(main, "fetch_media", return_value=detail), \
                patch.object(main, "transcribe", return_value=("原始文本", [
                    {"start": 1.0, "text": "原始文本"}
                ])), \
                patch.object(main, "download_video", side_effect=RuntimeError("CDN拒绝")), \
                patch.object(main, "sample_keyframes") as keyframes:
            video = main.extract_one_video(1, "https://v.douyin.com/test/")

        keyframes.assert_not_called()
        self.assertEqual(video["clean_text"], "原始文本")
        self.assertEqual(video["keyframes"], [])


if __name__ == "__main__":
    unittest.main()
