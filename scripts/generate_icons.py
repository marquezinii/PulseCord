from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
STATIC = ROOT / "static"


def gradient(size: int) -> Image.Image:
    top = (111, 76, 255, 255)
    bottom = (33, 200, 255, 255)
    strip = Image.new("RGBA", (1, size))
    pixels = strip.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        pixels[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return strip.resize((size, size))


def app_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((80, 64, 944, 832), radius=190, fill=255)
    mask_draw.polygon(((550, 790), (785, 790), (535, 960)), fill=255)
    image.alpha_composite(Image.composite(gradient(size), Image.new("RGBA", image.size), mask))

    points = [(205, 500), (340, 500), (410, 330), (530, 680), (625, 415), (680, 500), (820, 500)]
    draw = ImageDraw.Draw(image)
    width = 58
    draw.line(points, fill="white", width=width, joint="curve")
    radius = width // 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="white")
    return image


def tray_icon(color: tuple[int, int, int, int], template: bool = False) -> Image.Image:
    scale = 4
    size = 64 * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    fill = (255, 255, 255, 255) if template else color
    draw.rounded_rectangle((20, 24, 236, 216), radius=52, fill=fill)
    draw.polygon(((145, 198), (205, 198), (140, 240)), fill=fill)
    pulse = (0, 0, 0, 255) if template else (255, 255, 255, 255)
    points = [(48, 124), (85, 124), (105, 78), (137, 171), (163, 100), (181, 124), (218, 124)]
    draw.line(points, fill=pulse, width=13, joint="curve")
    radius = 6
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=pulse)
    return image.resize((64, 64), Image.Resampling.LANCZOS)


def main() -> None:
    (STATIC / "tray").mkdir(parents=True, exist_ok=True)
    icon = app_icon()
    icon_256 = icon.resize((256, 256), Image.Resampling.LANCZOS)
    icon_512 = icon.resize((512, 512), Image.Resampling.LANCZOS)

    icon_256.save(STATIC / "icon.png")
    icon_512.save(STATIC / "tray.png")
    icon_512.save(STATIC / "splash.webp", "WEBP", quality=95)

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_256.save(BUILD / "icon.ico", format="ICO", sizes=ico_sizes)
    icon_256.save(STATIC / "icon.ico", format="ICO", sizes=ico_sizes)
    icon.save(BUILD / "icon.icns", format="ICNS")

    variants = {
        "tray.png": (124, 92, 255, 255),
        "trayUnread.png": (242, 63, 66, 255),
        "speaking.png": (35, 165, 90, 255),
        "idle.png": (240, 178, 50, 255),
        "muted.png": (148, 155, 164, 255),
        "deafened.png": (242, 63, 66, 255),
    }
    for filename, color in variants.items():
        tray_icon(color).save(STATIC / "tray" / filename)
    tray_icon((255, 255, 255, 255), template=True).save(STATIC / "tray" / "trayTemplate.png")


if __name__ == "__main__":
    main()
