"""离线灌库脚本：读取 ingest_config.json 里每个话题的真实抖音链接，
跑完整 pipeline（转写 + 关键帧 OCR + DeepSeek 分析），把结果固化成 presets/{id}.json。

用法：
    python ingest.py            # 处理 config 里所有话题
    python ingest.py 1 3        # 只处理 id 为 1、3 的话题

config 格式（backend/ingest_config.json）：
{
  "1": {"topic": "空腹有氧好不好", "links": ["https://v.douyin.com/xxx", "..."]},
  "2": {"topic": "运动前该不该静态拉伸", "links": ["..."]}
}
"""
import os
import sys
import json

# Windows 控制台默认 GBK，编码不了 ✓ 等字符且会让中文日志乱码，强制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import main

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "ingest_config.json")
PRESETS_DIR = os.path.join(os.path.dirname(__file__), "presets")


def ingest_topic(preset_id: str, topic: str, links: list[str]) -> None:
    print(f"\n=== [{preset_id}] {topic}（{len(links)} 条链接）===")
    videos = []
    for i, link in enumerate(links, start=1):
        print(f"-- 处理第 {i} 条: {link}")
        try:
            v = main.extract_one_video(i, link)
            if not v.get("clean_text"):
                print(f"   [skip] 第 {i} 条转写为空，跳过")
                continue
            print(f"   [ok] {v['author']} | 文字 {len(v['clean_text'])} 字 | 关键帧 {len(v['keyframes'])} 个")
            videos.append(v)
        except Exception as e:
            print(f"   [fail] 第 {i} 条失败: {str(e)[:150]}")

    if not videos:
        print(f"   !! 话题 [{preset_id}] 全部失败，跳过写入")
        return

    # 重新连续编号
    for new_id, v in enumerate(videos, start=1):
        v["id"] = new_id

    print(f"-- 调用 DeepSeek 生成分析（{len(videos)} 条有效视频）…")
    analysis = main.run_analysis(topic, videos)

    out = {
        "topic": topic,
        "links": [v["url"] for v in videos],
        "analysis": analysis,
        # 附原始关键帧信息，便于核对/调试（前端不一定用）
        "_keyframes": [
            {"video_id": v["id"], "author": v["author"], "frames": v.get("keyframes") or []}
            for v in videos
            if v.get("keyframes")
        ],
    }
    path = os.path.join(PRESETS_DIR, f"{preset_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    a = analysis
    print(f"   ✓ 已写入 {path}")
    print(
        f"   共识 {len(a.get('consensus', []))} | 分歧 {len(a.get('conflicts', []))} | "
        f"建议 {len(a.get('recommendations', []))} | 可能错误 {len(a.get('misleading', []))} | "
        f"权威 {len(a.get('authorities', []))} | 来源 {len(a.get('references', []))}"
    )


def main_cli() -> None:
    if not os.path.exists(CONFIG_PATH):
        print(f"找不到配置文件 {CONFIG_PATH}，请先创建。")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    wanted = sys.argv[1:]
    ids = wanted if wanted else list(config.keys())
    for pid in ids:
        if pid not in config:
            print(f"配置里没有 id={pid}，跳过")
            continue
        entry = config[pid]
        ingest_topic(pid, entry["topic"], entry["links"])
    print("\n全部处理完成。")


if __name__ == "__main__":
    main_cli()
