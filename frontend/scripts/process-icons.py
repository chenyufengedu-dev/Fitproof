# -*- coding: utf-8 -*-
"""把生图的 1254px PNG 处理成可上线的图标。

生图产物有两个通病：图案在画布里的占比每张都不一样（24%~38%），
以及体积按显示尺寸看大了 30 倍。这里统一裁到 alpha 边界再补等量留白，
让每张图在同一个圆底里看起来一样大；然后缩到 160px 转 webp。

用法: python scripts/process-icons.py <输入目录> <输出目录>
"""
import os
import sys
import glob

from PIL import Image

TARGET = 160          # 显示最大 ~46px，2x 视网膜下 160 足够
PADDING_RATIO = 0.06  # 裁剪后四周补的留白，占目标边长


def process(src_path: str, out_path: str) -> tuple[int, int]:
    image = Image.open(src_path).convert('RGBA')
    bbox = image.split()[-1].getbbox()
    if bbox:
        image = image.crop(bbox)

    # 按长边等比缩放到 TARGET - 2*padding，短边居中，保证所有图视觉重量一致
    pad = int(TARGET * PADDING_RATIO)
    inner = TARGET - pad * 2
    scale = inner / max(image.width, image.height)
    image = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new('RGBA', (TARGET, TARGET), (0, 0, 0, 0))
    canvas.paste(image, ((TARGET - image.width) // 2, (TARGET - image.height) // 2), image)
    canvas.save(out_path, 'WEBP', quality=88, method=6)
    return os.path.getsize(src_path), os.path.getsize(out_path)


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    files = sorted(glob.glob(os.path.join(src_dir, '*.png')))
    before = after = 0
    for index, src in enumerate(files, start=1):
        out = os.path.join(out_dir, f'raw-{index:02d}.webp')
        b, a = process(src, out)
        before += b
        after += a
        print(f'raw-{index:02d}.webp  {b // 1024:>5} KB -> {a // 1024:>3} KB')

    print(f'\n{len(files)} 张: {before / 1024 / 1024:.1f} MB -> {after / 1024:.0f} KB')


if __name__ == '__main__':
    main()
