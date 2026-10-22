"""
Jana aset logo NIVORA daripada tangkapan skrin sumber.

Penggunaan:
    python scripts/build-logo.py "<path-to-screenshot>" public/img

- Memotong lambang anak panah/N (tanpa teks NIVORA).
- Menjadikan latar belakang gelap lutsinar (alpha ikut kecerahan).
- Menghasilkan nivora-mark.png (512px) dan nivora-favicon.png (128px).
"""
import sys
from pathlib import Path

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/User/OneDrive/Pictures/Screenshots/Screenshot 2026-10-22 123014.png"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "public/img")
OUT.mkdir(parents=True, exist_ok=True)


def luminance(px):
    r, g, b = px[0], px[1], px[2]
    return max(r, g, b)


img = Image.open(SRC).convert("RGBA")
w, h = img.size

# Kotak lambang (tanpa teks) — dikira daripada nisbah imej sumber 744×613.
box = (int(w * 0.10), int(h * 0.035), int(w * 0.905), int(h * 0.775))
mark = img.crop(box)

pixels = mark.load()
for y in range(mark.height):
    for x in range(mark.width):
        r, g, b, a = pixels[x, y]
        lum = luminance((r, g, b))
        chroma = g - b  # lambang hijau/kuning jelas; kabus latar hampir neutral

        if lum <= 42 or chroma <= 20:
            alpha = 0
        else:
            base = min(255, (chroma - 20) * 255 / 70)
            light = min(1.0, max(0.25, (lum - 42) / 60))
            alpha = int(base * light)

        if alpha > 8:
            # Unpremultiply: sumber composited atas hitam, jadi pulihkan warna
            # asal supaya tiada pinggir gelap pada latar hijau.
            scale = 255 / alpha
            r = min(255, int(r * scale))
            g = min(255, int(g * scale))
            b = min(255, int(b * scale))
        pixels[x, y] = (r, g, b, min(a, alpha))

# Potong rapat pada bahagian terang logo supaya kekal jelas pada saiz kecil.
alpha = mark.split()[-1]
strong = alpha.point(lambda v: 255 if v > 170 else 0)
bbox = strong.getbbox() or mark.getbbox()
if bbox:
    pad = 10
    mark = mark.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                      min(mark.width, bbox[2] + pad), min(mark.height, bbox[3] + pad)))

# Kanvas segi empat sama dengan sedikit ruang bernafas.
side = max(mark.width, mark.height)
pad = int(side * 0.05)
canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
canvas.paste(mark, ((canvas.width - mark.width) // 2, (canvas.height - mark.height) // 2), mark)

canvas.resize((512, 512), Image.LANCZOS).save(OUT / "nivora-mark.png")
canvas.resize((128, 128), Image.LANCZOS).save(OUT / "nivora-favicon.png")

# Pratonton di atas latar hijau gelap untuk semakan visual.
preview = Image.new("RGBA", (600, 600), (7, 26, 18, 255))
logo = canvas.resize((480, 480), Image.LANCZOS)
preview.paste(logo, ((600 - 480) // 2, (600 - 480) // 2), logo)
preview.save(OUT / "_preview-logo.png")

print(f"mark: {mark.size}, output: {OUT/'nivora-mark.png'}")
