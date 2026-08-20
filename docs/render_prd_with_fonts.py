from __future__ import annotations

import importlib.util
import os
import shutil
from pathlib import Path


def locate_renderer() -> Path:
    configured = os.environ.get("CODEX_DOCUMENT_RENDERER")
    if configured:
        return Path(configured)
    root = Path.home() / ".codex/plugins/cache/openai-primary-runtime/documents"
    candidates = sorted(root.glob("*/skills/documents/render_docx.py"))
    if not candidates:
        raise FileNotFoundError("Set CODEX_DOCUMENT_RENDERER to the bundled render_docx.py path.")
    return candidates[-1]


RENDERER = locate_renderer()
FONT_FILES = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]

spec = importlib.util.spec_from_file_location("codex_render_docx", RENDERER)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

original_build_env = module._build_lo_env


def build_env_with_cjk_fonts(user_profile: str):
    font_dir = Path(user_profile) / "Library" / "Fonts"
    font_dir.mkdir(parents=True, exist_ok=True)
    for source in FONT_FILES:
        if source.exists():
            shutil.copyfile(source, font_dir / source.name)
    cache_dir = Path(user_profile) / "fontconfig-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    fontconfig = Path(user_profile) / "fonts.conf"
    fontconfig.write_text(
        "<?xml version='1.0'?>\n"
        "<!DOCTYPE fontconfig SYSTEM 'fonts.dtd'>\n"
        "<fontconfig>\n"
        f"  <dir>{font_dir}</dir>\n"
        f"  <cachedir>{cache_dir}</cachedir>\n"
        "</fontconfig>\n",
        encoding="utf-8",
    )
    env = original_build_env(user_profile)
    env["SAL_FONTPATH"] = str(font_dir)
    env["FONTCONFIG_FILE"] = str(fontconfig)
    env["FONTCONFIG_PATH"] = str(Path(user_profile))
    return env


module._build_lo_env = build_env_with_cjk_fonts
module.main()
