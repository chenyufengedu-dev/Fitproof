# -*- coding: utf-8 -*-
"""
网页 → PDF 批量抓取（fetch_sources.py 的配套工具）。

用途：把 fetch_sources.py 留下的“待手动下载”网页清单，用无头 Chromium 自动
渲染并打印成 PDF，省掉逐个手动另存的苦力活。付费墙/验证码类页面自动不了，
会留在失败清单里由你人工处理。

依赖（由运行方 Codex 装一次）：
    pip install playwright
    playwright install chromium

用法：
    python fetch_web_pdf.py                 # 读默认清单，逐个渲染成 PDF
    python fetch_web_pdf.py --limit 5       # 只试前 5 个（先验证能跑通）
    python fetch_web_pdf.py --headful       # 显示浏览器窗口，调试用

行为：
  - 读 manual_download_todo.txt（格式：文件名 <TAB> <= <TAB> url <TAB> (info)）
  - 每个 url 用无头 Chromium 打开 → 打印为 PDF → 存到 raw-codex（沿用清单里的文件名）
  - 已存在同名 PDF 的自动跳过（可断点续跑）
  - 渲染失败（超时/付费墙/反爬）记录到 web_pdf_failed.txt，供你人工处理
  - 不碰 registry.csv、不碰 evidence/raw/；只往隔离目录 raw-codex 写
"""
import argparse
import os
import sys
import time

# Windows 控制台默认 GBK，emoji/中文会 UnicodeEncodeError；强制 UTF-8 输出。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def parse_todo(todo_path: str):
    """解析待手动清单，返回 [(filename, url), ...]。只认含 '\\t<=\\t' 的数据行。"""
    items = []
    with open(todo_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) >= 3 and parts[1].strip() == "<=":
                filename = parts[0].strip()
                url = parts[2].strip()
                if filename and url.lower().startswith("http"):
                    items.append((filename, url))
    return items


# 反爬/验证/拦截页的正文特征——命中即视为抓取失败（Cloudflare 验证页等会渲染成
# 30KB 左右的 PDF 蒙混过“文件够大”的检查，必须靠正文内容识破）。
BLOCK_SIGNATURES = [
    "performing security verification",
    "verifies you are not a bot",
    "just a moment",
    "enable javascript and cookies to continue",
    "attention required",
    "access denied",
    "403 forbidden",
    "please verify you are a human",
    "checking your browser",
]


def looks_blocked(body_text: str) -> str | None:
    """返回命中的拦截特征说明；正常内容返回 None。"""
    low = (body_text or "").lower()
    for sig in BLOCK_SIGNATURES:
        if sig in low:
            return f"反爬/验证页(命中 '{sig}')"
    if len(low.strip()) < 200:  # 正文过短，八成是空壳/拦截页
        return f"正文过短({len(low.strip())}字)，疑似空壳/拦截页"
    return None


def render_pdf(page, url: str, dest: str, timeout_ms: int) -> tuple[bool, str]:
    """把单个 url 渲染成 PDF。返回 (是否成功, 说明)。"""
    try:
        # 先等网络基本空闲；超时就退而求其次等 DOM 加载完，尽量抢救慢页面。
        try:
            page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        except Exception:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(1500)  # 给懒加载/字体一点时间
        # 渲染前先看正文：命中反爬/验证/空壳特征就判失败，不生成垃圾 PDF
        try:
            body_text = page.inner_text("body")
        except Exception:
            body_text = ""
        blocked = looks_blocked(body_text)
        if blocked:
            return False, blocked
        # 用屏幕媒体渲染，尽量还原实际可见内容（而非 print 样式隐藏的版本）
        page.emulate_media(media="screen")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        page.pdf(
            path=dest,
            format="A4",
            print_background=True,
            margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"},
        )
        size = os.path.getsize(dest)
        if size < 2048:  # 太小八成是空白/拦截页
            os.remove(dest)
            return False, f"生成过小({size}B)，疑似空白/拦截页"
        return True, f"{round(size/1024, 1)}KB"
    except Exception as e:
        return False, str(e)[:160]


def main():
    ap = argparse.ArgumentParser(description="网页清单 → 无头 Chromium 批量打印 PDF")
    ap.add_argument("--todo", default=os.path.join(os.path.dirname(BASE), "deepresearch", "manual_download_todo.txt"))
    ap.add_argument("--out-dir", default=os.path.join(BASE, "evidence", "raw", "raw-codex"))
    ap.add_argument("--failed", default=os.path.join(os.path.dirname(BASE), "deepresearch", "web_pdf_failed.txt"))
    ap.add_argument("--timeout", type=int, default=45, help="单页加载超时(秒)")
    ap.add_argument("--limit", type=int, default=0, help=">0 时只处理前 N 个(试跑用)")
    ap.add_argument("--headful", action="store_true", help="显示浏览器窗口(调试)")
    args = ap.parse_args()

    if not os.path.exists(args.todo):
        sys.exit(f"找不到清单：{args.todo}（先跑 fetch_sources.py 生成）")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("缺少 playwright，请先运行：pip install playwright && playwright install chromium")

    items = parse_todo(args.todo)
    if args.limit > 0:
        items = items[: args.limit]
    if not items:
        sys.exit("清单里没有可处理的网页条目")

    print(f"待处理网页 {len(items)} 个，输出目录 {args.out_dir}\n")
    ok, skipped, failed = 0, 0, []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headful)
        context = browser.new_context(
            user_agent=BROWSER_UA,
            viewport={"width": 1280, "height": 1600},
            ignore_https_errors=True,
        )
        page = context.new_page()
        for i, (filename, url) in enumerate(items, 1):
            dest = os.path.join(args.out_dir, filename)
            if os.path.exists(dest):
                skipped += 1
                print(f"[{i}/{len(items)}] ⏭ 已存在，跳过 {filename}")
                continue
            success, info = render_pdf(page, url, dest, args.timeout * 1000)
            if success:
                ok += 1
                print(f"[{i}/{len(items)}] ✅ {filename}  ({info})")
            else:
                failed.append((filename, url, info))
                print(f"[{i}/{len(items)}] ❌ {filename}  ({info})")
            time.sleep(0.3)
        browser.close()

    if failed:
        with open(args.failed, "w", encoding="utf-8") as f:
            f.write("以下网页自动渲染失败（付费墙/反爬/超时），请人工处理：\n\n")
            for filename, url, info in failed:
                f.write(f"{filename}\t<=\t{url}\t({info})\n")

    print("\n" + "=" * 50)
    print(f"✅ 成功渲染 : {ok}")
    print(f"⏭  已跳过   : {skipped}（已有同名 PDF）")
    print(f"❌ 失败     : {len(failed)}" + (f"  -> 清单见 {args.failed}" if failed else ""))
    print("提示：这些 PDF 仍是【未核验】资料，核验无误后再自行搬到 evidence/raw/。")


if __name__ == "__main__":
    main()
