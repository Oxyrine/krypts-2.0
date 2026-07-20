"""
Server-side watermarking for images and PDF pages.
Embeds user identity (email/user_id) into content before streaming.
"""
import io
import math
from typing import Optional

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color


def embed_microdelta(img: Image.Image, text: str, delta: int = 3) -> Image.Image:
    """Shift every pixel under the rendered text by exactly +/-delta RGB steps.
    Invisible to the eye; recoverable via high-pass + contrast analysis.
    `img` must already be in RGB mode.
    """
    width, height = img.size

    # Text mask: black background, text drawn in white where the forensic
    # identity string should be embedded.
    mask = Image.new("L", (width, height), 0)
    mask_draw = ImageDraw.Draw(mask)

    try:
        font = ImageFont.truetype("arial.ttf", size=max(14, width // 60))
    except (IOError, OSError):
        font = ImageFont.load_default()

    bbox = mask_draw.textbbox((0, 0), text, font=font)
    text_w = max(1, bbox[2] - bbox[0])
    text_h = max(1, bbox[3] - bbox[1])

    # Generous gaps between repetitions -- packing rows/columns tight makes
    # adjacent instances bleed into each other once the scanner's blur-based
    # detection smears everything, turning legible repeated text into an
    # undifferentiated block. A full text-height/width of blank space keeps
    # each repetition visually distinct after that processing.
    row_step = text_h * 3
    col_step = text_w * 2

    row_i = 0
    for y in range(0, height, row_step):
        # Brick-pattern offset on alternating rows so a vertical crop can't
        # slip between two columns and miss every repetition.
        x_offset = (text_w // 2) if (row_i % 2) else 0
        for x in range(-col_step, width + col_step, col_step):
            mask_draw.text((x + x_offset, y), text, font=font, fill=255)
        row_i += 1

    # PIL antialiases glyph edges, leaving intermediate mask values (not
    # just 0/255) along strokes. Image.composite blends proportionally at
    # those values, giving edge pixels a fractional shift instead of the
    # full delta. Force the mask to hard binary so every covered pixel -
    # edges included - gets the complete +/-delta shift.
    mask = mask.point(lambda v: 255 if v > 0 else 0)

    # Per-channel point transform: shift every pixel by exactly `delta`.
    # Pixels already below `delta` can't go negative, so they shift up
    # instead -- every covered pixel must carry a nonzero delta or that
    # region becomes untraceable.
    shifted = img.point(lambda v: v + delta if v < delta else v - delta)

    return Image.composite(shifted, img, mask)


def watermark_image(
    image_bytes: bytes,
    text: str,
    opacity: float = 0.12,
    invisible_text: Optional[str] = None,
) -> bytes:
    """
    Overlay a repeating diagonal watermark text grid on an image.
    Automatically picks dark or light text based on image brightness.

    If `invisible_text` is given, an invisible forensic layer (micro-delta
    pixel shifts, imperceptible to the eye) is embedded UNDER the visible
    watermark first, so the visible overlay doesn't sit on top of shifted
    pixels' original values.

    Returns PNG bytes. Must stay PNG (lossless) -- JPEG quantization would
    destroy the micro-delta shifts.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    if invisible_text:
        img = embed_microdelta(img, invisible_text, delta=3)

    img = img.convert("RGBA")
    width, height = img.size

    # --- Auto-detect background brightness ---
    # Downsample to a tiny thumbnail for fast mean luminance calculation
    thumb = img.convert("L").resize((64, 64), Image.LANCZOS)
    mean_brightness = sum(thumb.getdata()) / (64 * 64)  # 0–255

    # Dark text on light backgrounds, light text on dark backgrounds
    if mean_brightness > 140:
        # Light image → use dark charcoal watermark
        r, g, b = 40, 40, 40
        actual_opacity = max(opacity, 0.18)  # slightly more visible on white
    else:
        # Dark image → use light gray watermark
        r, g, b = 210, 210, 210
        actual_opacity = opacity

    # Create transparent overlay
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Try to get a font, fall back to default — smaller font size
    try:
        font = ImageFont.truetype("arial.ttf", size=max(12, width // 50))
    except (IOError, OSError):
        font = ImageFont.load_default()

    alpha = int(255 * actual_opacity)
    fill_color = (r, g, b, alpha)

    # Widely spaced diagonal grid — only 2-3 watermarks visible at once
    step_x = max(width // 2, 300)
    step_y = max(height // 3, 200)
    for y in range(0, height * 2, step_y):
        for x in range(-width // 2, width * 2, step_x):
            draw.text((x, y), text, font=font, fill=fill_color)

    # Rotate 30 degrees
    overlay = overlay.rotate(30, expand=False)

    # Composite
    watermarked = Image.alpha_composite(img, overlay).convert("RGB")
    buf = io.BytesIO()
    watermarked.save(buf, format="PNG")
    return buf.getvalue()


def watermark_pdf_page(
    pdf_bytes: bytes,
    page_number: int,
    watermark_text: str,
) -> bytes:
    """
    Extract a single page from a PDF and overlay a watermark.
    Returns single-page PDF bytes.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)

    # Clamp page_number to valid range (1-indexed)
    page_idx = max(0, min(page_number - 1, total_pages - 1))
    page = reader.pages[page_idx]

    # Get page dimensions
    media_box = page.mediabox
    page_width = float(media_box.width)
    page_height = float(media_box.height)

    # Build watermark PDF with reportlab
    wm_buf = io.BytesIO()
    c = rl_canvas.Canvas(wm_buf, pagesize=(page_width, page_height))

    # Subtle watermark — light gray, low opacity
    c.setFillColor(Color(0.5, 0.5, 0.5, alpha=0.15))
    font_size = max(12, int(page_width / 30))
    c.setFont("Helvetica", font_size)

    # Widely spaced diagonal pattern — only 2-3 instances visible
    c.saveState()
    c.translate(page_width / 2, page_height / 2)
    c.rotate(30)
    step_x = max(page_width * 0.6, 300)
    step_y = max(page_height * 0.4, 200)
    for xi in range(-2, 3):
        for yi in range(-3, 4):
            c.drawCentredString(xi * step_x, yi * step_y, watermark_text)
    c.restoreState()
    c.save()

    # Merge watermark onto original page
    wm_buf.seek(0)
    wm_reader = PdfReader(wm_buf)
    wm_page = wm_reader.pages[0]
    page.merge_page(wm_page)

    # Write single page to output
    writer = PdfWriter()
    writer.add_page(page)
    out_buf = io.BytesIO()
    writer.write(out_buf)
    return out_buf.getvalue()
