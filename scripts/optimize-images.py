"""Create responsive WebP copies without modifying or deleting original images.

Run: python3 scripts/optimize-images.py (requires Pillow >= 12).
The generated manifest and copies are committed; production needs no Python.
"""
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "optimized"
MANIFEST = ROOT / "src/lib/image-manifest.json"


def generate():
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    manifest = {}
    original_bytes = 0
    largest_bytes = 0
    # Only assets displayed by the site need derivatives. Keep all other source
    # images too, but don't add unused copies to the production artifact.
    sources = [PUBLIC / "images/hero-om.jpg"]
    for folder in ["images/instructors", "images/programs", "images/reviews", "yoga-poses"]:
        sources.extend(sorted((PUBLIC / folder).rglob("*")))
    for source in sources:
        if source.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        relative = source.relative_to(PUBLIC)
        raw = source.read_bytes()
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original)
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            width, height = image.size
            if "yoga-poses" in relative.parts:
                # 64px UI thumbnails (including high-DPI), 240px exports.
                targets = [128, 320]
            elif "instructors" in relative.parts:
                targets = [320, 640, 960]
            elif "reviews" in relative.parts:
                targets = [640]
            else:
                targets = [480, 960, 2000]
            variants = []
            for size in sorted({min(width, target) for target in targets}):
                resized = image.resize((size, round(height * size / width)), Image.Resampling.LANCZOS)
                encoded = io.BytesIO()
                resized.save(encoded, "WEBP", quality=86, method=6)
                data = encoded.getvalue()
                digest = hashlib.sha256(data).hexdigest()[:12]
                destination = OUTPUT / relative.parent / f"{source.stem}-{size}-{digest}.webp"
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
                variants.append({
                    "src": "/" + destination.relative_to(PUBLIC).as_posix(),
                    "width": size, "bytes": len(data),
                })
            manifest["/" + relative.as_posix()] = {
                "width": width, "height": height,
                "originalSha256": hashlib.sha256(raw).hexdigest(),
                "variants": variants,
            }
            original_bytes += len(raw)
            largest_bytes += variants[-1]["bytes"]
    current_paths = {variant["src"] for entry in manifest.values() for variant in entry["variants"]}
    # Remove only obsolete, previously generated copies, never source images.
    for entry in previous.values():
        for variant in entry["variants"]:
            if variant["src"] not in current_paths:
                obsolete = PUBLIC / variant["src"].lstrip("/")
                if obsolete.is_relative_to(OUTPUT):
                    obsolete.unlink(missing_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(manifest)} originals preserved: {original_bytes:,} bytes")
    print(f"Largest WebP copies: {largest_bytes:,} bytes ({1 - largest_bytes / original_bytes:.1%} smaller)")


if __name__ == "__main__":
    generate()
