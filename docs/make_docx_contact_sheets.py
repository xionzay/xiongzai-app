from pathlib import Path
import sys
from PIL import Image, ImageDraw

root = Path(sys.argv[1]).resolve()
pages = sorted(root.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
thumb_w = 520
thumb_h = 673
gap = 24
for batch_start in range(0, len(pages), 4):
    batch = pages[batch_start:batch_start + 4]
    canvas = Image.new("RGB", (thumb_w * 2 + gap * 3, thumb_h * 2 + gap * 3), "#dce7ef")
    draw = ImageDraw.Draw(canvas)
    for idx, page in enumerate(batch):
        img = Image.open(page).convert("RGB")
        img.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = gap + (idx % 2) * (thumb_w + gap)
        y = gap + (idx // 2) * (thumb_h + gap)
        canvas.paste(img, (x, y))
        draw.rectangle((x, y, x + img.width - 1, y + img.height - 1), outline="#8da3b3", width=1)
    first = batch_start + 1
    last = batch_start + len(batch)
    canvas.save(root / f"contact-{first:02d}-{last:02d}.png", quality=95)
