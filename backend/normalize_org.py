# -*- coding: utf-8 -*-
"""机构名归一化：把 registry.csv 和 evidence/entries/*.json 的 org 统一成
house style「中文全称 (英文名/缩写)」，并消除 entries 与 registry 的历史漂移。

规则：
  1. registry.csv 是 org 的唯一权威源；entries 的 org 一律以 registry 同 doc 的值为准。
  2. 数据库不是来源：PubMed / PMC 只是检索库，剥掉外壳，写真正的期刊名。
  3. 无既有中文名的纯品牌刊名（如 Cureus）保留原名，不硬造中文。
  4. 纯中文机构（如 北京市卫生健康委员会）没有英文名，保持纯中文。

用法：python normalize_org.py --apply   （不加 --apply 只预览）
"""
import argparse
import csv
import json
import os
import shutil
import sys
from datetime import datetime

from ingest_evidence import slugify

sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.join(BASE, "evidence", "registry.csv")
ENTRIES_DIR = os.path.join(BASE, "evidence", "entries")
CACHE_DIR = os.path.join(BASE, "evidence", "cache")

# old -> new。未列出的保持原样（已合规）。
ORG_MAP = {
    # —— 顺序反了：英文 (中文) → 中文 (英文)
    "Mayo Clinic (妙佑医疗国际)": "妙佑医疗国际 (Mayo Clinic)",
    "Mayo Clinic (梅奥医疗国际)": "妙佑医疗国际 (Mayo Clinic)",
    "ACOG (美国妇产科医师学会)": "美国妇产科医师学会 (ACOG)",
    "AASM & SRS (美国睡眠医学会与睡眠研究学会)": "美国睡眠医学会与睡眠研究学会 (AASM & SRS)",
    "National Institute on Aging (美国国家衰老研究所 NIA)": "美国国家衰老研究所 (NIA)",
    "FDA (美国食品药品监督管理局) & EPA": "美国食品药品监督管理局与环境保护署 (FDA & EPA)",
    "MotherToBaby (畸胎学信息专家组织)": "畸胎学信息专家组织 (MotherToBaby)",
    # —— 纯英文 → 补中文全称
    "AGA": "美国胃肠病学会 (AGA)",
    "Academy of Nutrition and Dietetics": "美国营养与饮食学会 (AND)",
    "Harvard Health": "哈佛医学院健康出版社 (Harvard Health Publishing)",
    "MSKCC": "纪念斯隆-凯特琳癌症中心 (MSKCC)",
    "NIH / NEI": "美国国家眼科研究所 (NEI)",
    "NIH / ODS": "美国国立卫生研究院膳食补充剂办公室 (NIH ODS)",
    "NIH 膳食补充剂办公室 (ODS)": "美国国立卫生研究院膳食补充剂办公室 (NIH ODS)",
    "NIH 国家糖尿病与消化及肾脏疾病研究所 (NIDDK)": "美国国家糖尿病与消化及肾脏疾病研究所 (NIDDK)",
    # —— 同一机构多种写法 → 合并
    "中华人民共和国国家卫生健康委员会 (NHC)": "国家卫生健康委员会 (NHC)",
    "国家卫生健康委": "国家卫生健康委员会 (NHC)",
    "美国儿科学会 (HealthyChildren)": "美国儿科学会 (AAP)",
    "Cochrane 协作网库 (Cochrane Library)": "Cochrane 协作网",
    "考科蓝文献回顾 (Cochrane Library)": "Cochrane 协作网",
    "Cochrane (考科蓝合作组织)": "Cochrane 协作网",
    "全国爱国卫生运动委员会 (国家卫健委)": "全国爱国卫生运动委员会",
    "CDC (美国疾病控制与预防中心)": "美国疾病控制与预防中心 (CDC)",
    "WHO (世界卫生组织)": "世界卫生组织 (WHO)",
    "FDA": "美国食品药品监督管理局 (FDA)",
    "中国营养学会": "中国营养学会 (CNS)",
    "中华医学会": "中华医学会 (CMA)",
    "American Academy of Sleep Medicine": "美国睡眠医学会 (AASM)",
    # —— 期刊：剥掉 PubMed/PMC 数据库外壳，写真正刊名
    "BMJ (英国医学杂志)": "英国医学杂志 (BMJ)",
    "Pediatrics (美国儿科学会期刊)": "儿科学 (Pediatrics)",
    "Nutrients (PubMed)": "营养素 (Nutrients)",
    "Journal of Affective Disorders": "情感障碍杂志 (Journal of Affective Disorders)",
    "Sleep Medicine Reviews": "睡眠医学评论 (Sleep Medicine Reviews)",
    "Sleep Advances": "睡眠进展 (Sleep Advances)",
    "Nat Sci Sleep (期刊)": "自然与睡眠科学 (Nature and Science of Sleep)",
    "Dermatol Res Pract (PubMed)": "皮肤病学研究与实践 (Dermatology Research and Practice)",
    "PubMed (JAMA Network Open)": "美国医学会杂志·网络开放 (JAMA Network Open)",
    "PubMed (Obesity Reviews)": "肥胖评论 (Obesity Reviews)",
    "PubMed (Advances in Nutrition)": "营养学进展 (Advances in Nutrition)",
    "PubMed (Scand J Med Sci Sports)": "斯堪的纳维亚医学与运动科学杂志 (Scandinavian Journal of Medicine & Science in Sports)",
    "PubMed (期刊研究)": "临床营养 (Clinical Nutrition)",  # 元数据 doi:10.1016/j.clnu.2024.05.034
    "PubMed / Am J Gastroenterol": "美国胃肠病学杂志 (American Journal of Gastroenterology)",
    "PubMed / BMJ Open": "英国医学杂志·开放 (BMJ Open)",
    "PMC": "欧亚医学杂志 (Eurasian Journal of Medicine)",  # DOI 10.5152/eurasianjmed.2019.18457
    "NCI (CDAS) / Frontiers in Nutrition": "营养学前沿 (Frontiers in Nutrition)",
}


def norm(org: str) -> str:
    org = (org or "").strip()
    return ORG_MAP.get(org, org)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真正写盘（默认只预览）")
    args = ap.parse_args()

    with open(REGISTRY, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
        fields = list(rows[0].keys())

    reg_changes = []
    for r in rows:
        old = (r["org"] or "").strip()
        new = norm(old)
        if old != new:
            reg_changes.append((old, new))
        r["org"] = new

    # doc -> 权威 org/url。用 slugify 当键：PDF 抽文本常混入多余空格
    # （见 "Meta- Analysis" vs "Meta-Analysis"），精确匹配会漏。
    doc_org = {slugify(r["doc"].strip()): r["org"] for r in rows}
    doc_url = {slugify(r["doc"].strip()): r["url"].strip() for r in rows}

    ent_changes = []  # (file, old, new)
    url_changes = []  # (file, old, new)
    for fn in sorted(os.listdir(ENTRIES_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(ENTRIES_DIR, fn)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        authoritative = doc_org.get(slugify((data.get("doc") or "").strip())) or norm(data.get("org", ""))
        if not authoritative:
            print(f"  [!] {fn}：registry 无此文档且自身 org 为空，跳过（需人工补 registry 行）")
            continue
        touched = False
        if (data.get("org") or "").strip() != authoritative:
            ent_changes.append((fn, data.get("org"), authoritative))
            data["org"] = authoritative
            touched = True
        for e in data.get("entries", []):
            if (e.get("org") or "").strip() != authoritative:
                e["org"] = authoritative
                touched = True

        # url 同理：registry 修好的溯源链接必须同步进 entries，
        # 否则用户点"查看原文"读的仍是拆条时的旧地址。
        true_url = doc_url.get(slugify((data.get("doc") or "").strip()))
        if true_url and (data.get("url") or "").strip() != true_url:
            url_changes.append((fn, data.get("url"), true_url))
            data["url"] = true_url
            touched = True
        if true_url:
            for e in data.get("entries", []):
                if (e.get("url") or "").strip() != true_url:
                    e["url"] = true_url
                    touched = True
        if touched and args.apply:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"registry.csv 需改 {len(reg_changes)} 行；entries org 需改 {len(ent_changes)} 份；"
          f"entries url 需改 {len(url_changes)} 份")
    for fn, old, new in url_changes:
        print(f"  [url] {fn[:40]}\n        {old}\n     →  {new}")
    for old, new in sorted(set(reg_changes)):
        print(f"  [registry] {old}  →  {new}")
    for fn, old, new in ent_changes[:40]:
        print(f"  [entries ] {old}  →  {new}   ({fn[:40]})")
    if len(ent_changes) > 40:
        print(f"  ... 另有 {len(ent_changes)-40} 份")

    if not args.apply:
        print("\n（预览模式，未写盘。确认后加 --apply）")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(REGISTRY, f"{REGISTRY}.bak-org-{stamp}")
    with open(REGISTRY, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"\n已写盘。registry 备份 → registry.csv.bak-org-{stamp}")

    # org 参与 _entry_text 但不参与 _fingerprint → 缓存不会自动重建，必须手动删
    for name in ("evidence_vectors.npz", "fulltext_chunk_vectors.npz"):
        p = os.path.join(CACHE_DIR, name)
        if os.path.exists(p):
            os.remove(p)
            print(f"已删向量缓存 {name}（org 参与 embedding，必须重建）")


if __name__ == "__main__":
    main()
