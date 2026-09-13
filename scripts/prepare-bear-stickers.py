"""Deterministically copy supplied GIF bytes and extract frame-zero PNGs. No redraw."""
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "熊崽表情包.zip"
OUT = ROOT / "public/assets/chat-stickers/bear-v1"
REPORT = ROOT / "design-output/bear-chat-stickers"

def main():
    with zipfile.ZipFile(SOURCE) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir() and entry.filename.lower().endswith(".gif")]
        assert len(entries) == 35, "Expected exactly 35 GIF assets"
        manifest, seen = [], set()
        for entry in sorted(entries, key=lambda entry: entry.filename):
            name = entry.filename if entry.flag_bits & 0x800 else entry.filename.encode("cp437").decode("gb18030")
            match = re.fullmatch(r"(\d{2})-(.+)\.gif", Path(name).name, re.I)
            assert match, name
            number, label = match.groups()
            data = archive.read(entry)
            digest = hashlib.sha256(data).hexdigest()
            assert digest not in seen, f"Duplicate GIF: {label}"
            seen.add(digest)
            gif = Image.open(io.BytesIO(data))
            assert gif.size == (320, 320) and gif.info.get("loop") == 0
            poster = gif.convert("RGB")
            duration, transparent = 0, False
            for index in range(gif.n_frames):
                gif.seek(index)
                duration += gif.info.get("duration", 0)
                transparent |= gif.convert("RGBA").getchannel("A").getextrema()[0] != 255
            assert duration == 3000 and not transparent
            filename = f"{int(number):03d}"
            (OUT / "gif").mkdir(parents=True, exist_ok=True)
            (OUT / "thumbnails").mkdir(parents=True, exist_ok=True)
            destination = OUT / "gif" / f"{filename}.gif"
            if destination.exists():
                assert destination.read_bytes() == data, "Refuse to replace a different existing asset"
            else:
                destination.write_bytes(data)
            poster.save(OUT / "thumbnails" / f"{filename}.png", optimize=True)
            manifest.append({"id": f"bear-v1/{filename}", "pack_id": "bear-v1", "version": 1,
                "name": label, "gif_url": f"/assets/chat-stickers/bear-v1/gif/{filename}.gif",
                "thumbnail_url": f"/assets/chat-stickers/bear-v1/thumbnails/{filename}.png",
                "width": 320, "height": 320, "duration_ms": duration,
                "accessibility_description": f"熊崽动态表情：{label}，白底完整画面", "opaque": True,
                "frame_count": gif.n_frames, "source_loop": 0, "source_name": name,
                "sha256": digest})
        assert [item["id"] for item in manifest] == [f"bear-v1/{index:03d}" for index in range(1, 36)]
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        REPORT.mkdir(parents=True, exist_ok=True)
        sheet = Image.new("RGB", (1120, 7 * 184), "#eef5fb")
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 17)
        for index, item in enumerate(manifest):
            x, y = (index % 7) * 160, (index // 7) * 184
            picture = Image.open(ROOT / "public" / item["thumbnail_url"].lstrip("/")).resize((148, 148))
            sheet.paste(picture, (x + 6, y + 4))
            draw.text((x + 8, y + 153), f"{index + 1:02d} {item['name']}", fill="#254863", font=font)
        sheet.crop((0, 0, 1120, 5 * 184)).save(REPORT / "contact-sheet.png")
        print(json.dumps({"count": len(manifest), "gif_bytes": sum(e.file_size for e in entries),
            "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "names": [item["name"] for item in manifest]}, ensure_ascii=False))

if __name__ == "__main__":
    main()
