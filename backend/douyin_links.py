from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit


URL_PATTERN = re.compile(r"https?://[^\s\"'<>，。！？、；）】]+", re.IGNORECASE)
CANONICAL_VIDEO_PATH = re.compile(r"/video/\d+/?")
IESDOUYIN_VIDEO_PATH = re.compile(r"/share/video/\d+/?")


def extract_douyin_video_url(text: str) -> str | None:
    """Return the first supported concrete Douyin video URL in user text."""
    for raw in URL_PATTERN.findall(text or ""):
        candidate = raw.rstrip(".,;:!?)]}")
        parsed = urlsplit(candidate)
        host = (parsed.hostname or "").lower()
        path = parsed.path or "/"
        is_video = (
            (host == "v.douyin.com" and bool(path.strip("/")))
            or (
                host in {"douyin.com", "www.douyin.com"}
                and CANONICAL_VIDEO_PATH.fullmatch(path) is not None
            )
            or (
                host in {"iesdouyin.com", "www.iesdouyin.com"}
                and IESDOUYIN_VIDEO_PATH.fullmatch(path) is not None
            )
        )
        if is_video:
            return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
    return None
