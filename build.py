#!/usr/bin/env python3
"""
Verdant build.

Concatenates src/*.js in filename order into one IIFE bundle, stamps it with a
cache-busting build id, and rewrites index.html to point at the new file. Same
shape as the pipeline it is imitating: one request for the app, one for the
shader bundle, one for the tuning data.

    python build.py                          # site owns its origin
    python build.py --base /verdant/         # mounted under a sub-path
    python build.py --base /verdant/ --out ../site/app/verdant   # + deploy
"""
import argparse
import pathlib
import re
import shutil
import sys
import time

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT_DIR = ROOT / "assets" / "js"
INDEX = ROOT / "index.html"

BANNER = """/*! VERDANT — a season in one scroll
 *  Hand-written WebGL2. No frameworks, no 3D library, no image assets.
 *  build {stamp} · {files} modules · {kb} KB
 */"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/",
                    help="mount path, e.g. /verdant/ (default: /)")
    ap.add_argument("--out", default=None,
                    help="also copy the built site to this directory")
    args = ap.parse_args()

    base = args.base if args.base.endswith("/") else args.base + "/"
    href = "./" if base == "/" else base

    files = sorted(SRC.glob("*.js"))
    if not files:
        print("no sources in src/", file=sys.stderr)
        return 1

    stamp = time.strftime("%Y%m%d%H%M")
    parts = []
    for f in files:
        parts.append(f"\n/* ---- {f.name} " + "-" * max(0, 58 - len(f.name)) + " */\n")
        parts.append(f.read_text(encoding="utf-8"))

    body = "".join(parts)
    bundle = "(function(){\n'use strict';\n" + body + "\n})();\n"

    kb = round(len(bundle.encode("utf-8")) / 1024)
    bundle = BANNER.format(stamp=stamp, files=len(files), kb=kb) + "\n" + bundle

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("verdant.*.js"):
        old.unlink()
    target = OUT_DIR / f"verdant.{stamp}.js"
    target.write_text(bundle, encoding="utf-8")

    html = INDEX.read_text(encoding="utf-8")
    html = re.sub(r"window\._CACHE_ = '[^']*'", f"window._CACHE_ = '{stamp}'", html)
    html = re.sub(r"window\._BASE_ = '[^']*'", f"window._BASE_ = '{base}'", html)
    html = re.sub(r'<base href="[^"]*">', f'<base href="{href}">', html)
    INDEX.write_text(html, encoding="utf-8")

    # A default tuning file so the fetch is a 200 rather than a 404. Anything the
    # ?uil panel exports over the top of this wins.
    tune = ROOT / "assets" / "data" / "tune.json"
    if not tune.exists():
        tune.parent.mkdir(parents=True, exist_ok=True)
        tune.write_text("{}\n", encoding="utf-8")

    favicon = ROOT / "assets" / "meta" / "favicon.svg"
    favicon.parent.mkdir(parents=True, exist_ok=True)
    favicon.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<rect width="32" height="32" fill="#07090a"/>'
        '<path d="M16 27V11" stroke="#5c7a53" stroke-width="1.6" stroke-linecap="round"/>'
        '<path d="M16 17c-4.5 0-7-2.6-7-7 4.6 0 7 2.5 7 7z" fill="#7fae6b"/>'
        '<path d="M16 14c4.5 0 7-2.6 7-7-4.6 0-7 2.5-7 7z" fill="#a8cf8c"/>'
        "</svg>\n",
        encoding="utf-8",
    )

    print(f"built  {target.relative_to(ROOT)}  ({kb} KB, {len(files)} modules)")
    print(f"stamp  {stamp}   base {base}")

    if args.out:
        out = pathlib.Path(args.out).resolve()
        out.mkdir(parents=True, exist_ok=True)
        # Only the runtime ships: no sources, no build scripts, no captures.
        for old in (out / "assets" / "js").glob("verdant.*.js"):
            old.unlink()
        shutil.copy2(INDEX, out / "index.html")
        for sub in ("js", "shaders", "data", "meta"):
            src_dir = ROOT / "assets" / sub
            if not src_dir.exists():
                continue
            dst = out / "assets" / sub
            dst.mkdir(parents=True, exist_ok=True)
            for f in src_dir.iterdir():
                if f.is_file():
                    shutil.copy2(f, dst / f.name)
        print(f"deploy {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
