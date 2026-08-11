#!/usr/bin/env python3
"""
Verdant capture rig.

Drives the film in headless Chromium, seeks to a list of scroll positions, waits
for the smoothed scroll and the reveal animations to settle, and writes a still
for each. Also stitches a contact sheet so a whole pass can be judged at once.

    python capture.py                     # default marks
    python capture.py 0.0 0.25 0.6        # specific scroll positions
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "captures"
URL = "http://localhost:8931/"
W, H = 1280, 720

DEFAULT_MARKS = [0.00, 0.08, 0.20, 0.30, 0.42, 0.50, 0.62, 0.72, 0.84, 0.95, 1.00]

# Headless Chromium defaults to SwiftShader, which renders this in minutes
# rather than milliseconds. Ask for the real ANGLE/D3D11 path first.
FLAGS = [
    "--headless=new",
    "--enable-gpu",
    "--use-gl=angle",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--disable-frame-rate-limit",
]


def main() -> int:
    marks = [float(a) for a in sys.argv[1:]] or DEFAULT_MARKS
    OUT.mkdir(exist_ok=True)
    # Only clear this rig's own output — anything prefixed with _ is kept.
    for old in OUT.glob("scroll-*.png"):
        old.unlink()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=FLAGS)
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.on("console", lambda m: print(f"  console[{m.type}] {m.text[:220]}"))
        page.on("pageerror", lambda e: print(f"  PAGEERROR {e}"))

        # tier=2 so the capture shows the quality most desktops actually get,
        # even though SwiftShader would otherwise be graded as tier 0.
        page.goto(URL + "?tier=2&log&noadapt", wait_until="load")
        page.wait_for_function("window.VERDANT && window.VERDANT.Render.FRAME > 4", timeout=120_000)
        print("booted")

        shots = []
        for m in marks:
            page.evaluate(
                """(m) => {
                    const s = document.getElementById('Scroll');
                    s.scrollTop = (s.scrollHeight - window.innerHeight) * m;
                }""",
                m,
            )
            # Let the smoothed scroll converge and the per-character reveals finish.
            page.wait_for_function(
                """(m) => {
                    const V = window.VERDANT;
                    return Math.abs(V.Scroll.value - V.Scroll.raw) < 0.0006;
                }""",
                arg=m,
                timeout=90_000,
            )
            page.wait_for_timeout(1800)
            name = OUT / f"scroll-{round(m * 100):03d}.png"
            page.screenshot(path=str(name), timeout=180_000)
            shots.append((m, name))
            print(f"  captured {m:0.2f} -> {name.name}")

        browser.close()

    contact(shots)
    return 0


def contact(shots):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("Pillow not available; skipping contact sheet")
        return

    cols = 3
    tw, th = 480, 270
    rows = (len(shots) + cols - 1) // cols
    pad, label = 10, 22
    sheet = Image.new("RGB", (cols * tw + pad * (cols + 1), rows * (th + label) + pad * (rows + 1)), (10, 12, 11))
    d = ImageDraw.Draw(sheet)

    for i, (m, path) in enumerate(shots):
        im = Image.open(path).resize((tw, th), Image.LANCZOS)
        c, r = i % cols, i // cols
        x = pad + c * (tw + pad)
        y = pad + r * (th + label + pad)
        sheet.paste(im, (x, y))
        d.text((x + 3, y + th + 5), f"scroll {m:0.2f}", fill=(150, 180, 155))

    out = ROOT / "captures" / "_contact.png"
    sheet.save(out)
    print(f"contact sheet -> {out}")


if __name__ == "__main__":
    raise SystemExit(main())
