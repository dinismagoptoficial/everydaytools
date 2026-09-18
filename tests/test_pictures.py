"""The editor lifts a picture off the page: proof that the saved PDF follows."""

import base64
import io

import numpy as np
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.processors import render_page
from conftest import upload
from test_jobs import finish

CYAN = (0, 170, 200)


def picture_pdf():
    """A 595x842 page with one unmistakable cyan block at 120,480, 240x160."""
    image = Image.new("RGB", (240, 160), CYAN)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(595, 842))
    c.drawString(70, 770, "Relatorio da familia")
    c.drawImage(ImageReader(image), 120, 480, 240, 160)
    c.save()
    return buf.getvalue()


def cyan_data_url():
    image = Image.new("RGB", (240, 160), CYAN)
    raw = io.BytesIO()
    image.save(raw, "PNG")
    return "data:image/png;base64," + base64.b64encode(raw.getvalue()).decode()


def cyan_at(page, left, top, width, height):
    """Share of the given patch that is the picture's colour, 0 to 1."""
    box = page.crop(
        (
            int(left * page.width),
            int(top * page.height),
            int((left + width) * page.width),
            int((top + height) * page.height),
        )
    )
    pixels = np.asarray(box.convert("RGB"), dtype=int)
    close = np.all(np.abs(pixels - np.array(CYAN)) < 40, axis=-1)
    return float(close.mean()) if close.size else 0.0


def edit(admin_client, annotations):
    jid = upload(admin_client, picture_pdf(), "relatorio.pdf")
    admin_client.post(
        f"/api/jobs/{jid}/run",
        json={"operation": "pdf_edit", "options": {"annotations": annotations}},
    )
    folder = finish(jid)
    return render_page(folder / "output" / "edited.pdf", 0, scale=1.5)


def test_original_page_holds_the_picture_where_it_was_drawn(admin_client):
    """The fixture itself, so a later failure cannot be blamed on the fixture."""
    page = edit(admin_client, [])
    assert cyan_at(page, 0.202, 0.240, 0.403, 0.190) > 0.95
    assert cyan_at(page, 0.500, 0.500, 0.300, 0.150) < 0.02


def test_a_picture_can_be_moved_across_the_page(admin_client):
    """Cover the old spot, draw the bitmap lower down: the page follows exactly."""
    page = edit(
        admin_client,
        [
            {
                "page": 1,
                "type": "replace",
                "x": 0.202,
                "y": 0.240,
                "w": 0.403,
                "h": 0.190,
                "text": "",
                "size": 10,
                "background": "#ffffff",
                "color": "#111114",
            },
            {
                "page": 1,
                "type": "image",
                "x": 0.500,
                "y": 0.560,
                "w": 0.403,
                "h": 0.190,
                "text": "",
                "size": 12,
                "color": "#111114",
                "data": cyan_data_url(),
            },
        ],
    )
    assert cyan_at(page, 0.500, 0.560, 0.403, 0.190) > 0.95, "not at its new spot"
    assert cyan_at(page, 0.202, 0.240, 0.403, 0.190) < 0.02, "old spot not covered"


def test_a_picture_can_be_stretched(admin_client):
    """Resizing sends a bigger box; the bitmap fills it instead of being cropped."""
    page = edit(
        admin_client,
        [
            {
                "page": 1,
                "type": "replace",
                "x": 0.202,
                "y": 0.240,
                "w": 0.403,
                "h": 0.190,
                "text": "",
                "size": 10,
                "background": "#ffffff",
                "color": "#111114",
            },
            {
                "page": 1,
                "type": "image",
                "x": 0.202,
                "y": 0.240,
                "w": 0.700,
                "h": 0.330,
                "text": "",
                "size": 12,
                "color": "#111114",
                "data": cyan_data_url(),
            },
        ],
    )
    assert cyan_at(page, 0.210, 0.250, 0.680, 0.310) > 0.95
    # Nothing spilled past the box it was given.
    assert cyan_at(page, 0.920, 0.250, 0.070, 0.310) < 0.02


def test_removing_a_picture_leaves_the_page_colour(admin_client):
    """Remove sends only the cover, so the bitmap is gone and nothing replaces it."""
    page = edit(
        admin_client,
        [
            {
                "page": 1,
                "type": "replace",
                "x": 0.202,
                "y": 0.240,
                "w": 0.403,
                "h": 0.190,
                "text": "",
                "size": 10,
                "background": "#ffffff",
                "color": "#111114",
            }
        ],
    )
    assert cyan_at(page, 0.202, 0.240, 0.403, 0.190) < 0.02
    patch = page.crop(
        (
            int(0.25 * page.width),
            int(0.28 * page.height),
            int(0.55 * page.width),
            int(0.40 * page.height),
        )
    )
    assert patch.convert("RGB").getpixel((3, 3)) == (255, 255, 255)
