import unittest

from backend.douyin_links import extract_douyin_video_url


class DouyinLinkTests(unittest.TestCase):
    def test_extracts_short_link_from_share_text(self):
        text = "复制打开抖音 https://v.douyin.com/Dn8_yKgnK2Q/ 立即观看"
        self.assertEqual(
            extract_douyin_video_url(text),
            "https://v.douyin.com/Dn8_yKgnK2Q/",
        )

    def test_accepts_canonical_video_url(self):
        url = "https://www.douyin.com/video/7531234567890123456"
        self.assertEqual(extract_douyin_video_url(url), url)

    def test_accepts_iesdouyin_share_video_url(self):
        url = "https://www.iesdouyin.com/share/video/7531234567890123456/"
        self.assertEqual(extract_douyin_video_url(url), url)

    def test_rejects_home_and_recommendation_pages(self):
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/?recommend=1"))
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/"))

    def test_rejects_search_profile_and_non_douyin_urls(self):
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/search/减脂"))
        self.assertIsNone(extract_douyin_video_url("https://www.douyin.com/user/example"))
        self.assertIsNone(extract_douyin_video_url("https://example.com/video/7531234567890123456"))


if __name__ == "__main__":
    unittest.main()
