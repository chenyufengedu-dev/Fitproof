# -*- coding: utf-8 -*-
"""一次性清理脚本（2026-07-16，用户逐条授权）：

  1. 删 6 行冗余 registry 行：id 146/149/150/151/155/156。
     这 7 个 PDF(含 145) 正文 md5 完全相同、URL 同一个，是同一网页下载 7 次。
     保留 145。拆条当初按 doc 名去重只拆了一遍，所以库里没有重复结论，只需清 registry。
  2. 删 nat-sci-sleep.json：与 different-intensities-*.json 同一篇论文(PubMed 36540196)，
     是 registry id=34 把刊名误填进 doc 字段导致的重复拆条。保留标题正确的那份。
  3. 删 17 行 WHO eLENA 空壳：网页是 JS 渲染，抓取时正文未加载，PDF 只有 397 字导航壳，
     拆条产出 0 条。删 registry 行 + raw PDF + fulltext + entries，当作没收过。

不删：结论「婴幼儿辅食应单独制作。」的两份副本——分属两份不同的真实指南
（7~24月龄婴幼儿喂养指南 / 中国居民膳食指南2022），各有独立页码，是两个独立来源
互相印证，不是冗余。

用法：python cleanup_evidence.py --apply   （不加 --apply 只预览）
"""
import argparse
import csv
import os
import shutil
import sys
from datetime import datetime

from ingest_evidence import slugify

sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
EV = os.path.join(BASE, "evidence")
REGISTRY = os.path.join(EV, "registry.csv")

DUP_CANCER_IDS = {"146", "149", "150", "151", "155", "156"}
SHELL_IDS = {"176", "179", "182", "187", "191", "205", "206", "217", "225",
             "245", "249", "253", "263", "272", "281", "290", "291"}
DUP_ENTRY_FILES = ["nat-sci-sleep.json"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    with open(REGISTRY, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
        fields = list(rows[0].keys())

    drop_ids = DUP_CANCER_IDS | SHELL_IDS
    keep, dropped = [], []
    for r in rows:
        (dropped if r["id"] in drop_ids else keep).append(r)

    print(f"registry: {len(rows)} 行 → 保留 {len(keep)} 行，删 {len(dropped)} 行")
    for r in dropped:
        why = "癌症重复PDF" if r["id"] in DUP_CANCER_IDS else "WHO空壳"
        print(f"  - id {r['id']:>4} [{why}] {r['doc'][:46]}")

    # 空壳的连带文件
    files_to_drop = []
    for r in dropped:
        if r["id"] not in SHELL_IDS:
            continue
        s = slugify(r["doc"])
        for p in (os.path.join(EV, "raw", r["filename"]),
                  os.path.join(EV, "fulltext", f"{s}.txt"),
                  os.path.join(EV, "entries", f"{s}.json")):
            if os.path.exists(p):
                files_to_drop.append(p)
    for fn in DUP_ENTRY_FILES:
        p = os.path.join(EV, "entries", fn)
        if os.path.exists(p):
            files_to_drop.append(p)

    print(f"\n连带删除文件 {len(files_to_drop)} 个：")
    for p in files_to_drop[:6]:
        print("  -", os.path.relpath(p, BASE))
    if len(files_to_drop) > 6:
        print(f"  ... 另有 {len(files_to_drop)-6} 个")

    if not args.apply:
        print("\n（预览模式，未删。确认后加 --apply）")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    trash = os.path.join(EV, f"_trash-{stamp}")
    os.makedirs(trash, exist_ok=True)
    shutil.copy2(REGISTRY, os.path.join(trash, "registry.csv.before"))
    for p in files_to_drop:
        shutil.move(p, os.path.join(trash, os.path.basename(p)))

    with open(REGISTRY, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(keep)

    # org 参与 embedding 与条目集合，删条目后向量必须重建
    for name in ("evidence_vectors.npz", "fulltext_chunk_vectors.npz"):
        p = os.path.join(EV, "cache", name)
        if os.path.exists(p):
            os.remove(p)

    print(f"\n完成。删掉的东西没销毁，全在 {os.path.relpath(trash, BASE)}/ 里，可反悔。")
    print("向量缓存已清，下次检索自动重建。")


if __name__ == "__main__":
    main()
