"""Local converters. Called only inside a supervised, disposable job process."""
import base64
import gzip
import io
import json
import math
import os
import re
import shutil
import subprocess
import tarfile
import zipfile
from functools import lru_cache
from pathlib import Path, PurePosixPath

from PIL import Image, ImageDraw, ImageOps
import pillow_heif
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from . import config

Image.MAX_IMAGE_PIXELS = 40_000_000
pillow_heif.register_heif_opener()


def number(options, key, default, low, high):
    value = float(options.get(key, default))
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError("invalid_option")
    return value


def choice(options, key, default, allowed):
    value = options.get(key, default)
    if value not in allowed:
        raise ValueError("invalid_option")
    return value


def command(args):
    # Never pass a shell; all callers use allowlisted executables and bounded arguments.
    result = subprocess.run([str(a) for a in args], stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=config.JOB_TIMEOUT)
    if result.returncode not in (0,):
        raise ValueError("conversion_failed")


def open_image(path):
    if path.suffix == ".svg":
        import cairosvg
        from .storage import validate_file
        validate_file(path, "svg")
        width, height = svg_dimensions(path)
        raw = cairosvg.svg2png(bytestring=path.read_bytes(), output_width=width, output_height=height, unsafe=False)
        image = Image.open(io.BytesIO(raw))
    else:
        image = Image.open(path)
    with image:
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("image_too_large")
        return ImageOps.exif_transpose(image)


def svg_dimensions(path):
    from defusedxml import ElementTree
    root = ElementTree.parse(path).getroot()
    viewbox = [float(v) for v in root.get("viewBox", "0 0 300 150").replace(",", " ").split()]
    if len(viewbox) != 4 or any(not math.isfinite(v) for v in viewbox) or min(viewbox[2:]) <= 0:
        raise ValueError("invalid_file")
    units = {"": 1, "px": 1, "pt": 96 / 72, "pc": 16, "mm": 96 / 25.4, "cm": 96 / 2.54, "in": 96}
    def dimension(key, fallback):
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*(px|pt|pc|mm|cm|in)?\s*", root.get(key, ""))
        return float(match[1]) * units[match[2] or ""] if match else fallback
    width, height = dimension("width", viewbox[2]), dimension("height", viewbox[3])
    if not math.isfinite(width + height) or min(width, height) <= 0:
        raise ValueError("invalid_file")
    scale = min(1, 1600 / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def write_image(image, dest, fmt, quality=80):
    if image.mode == "P":
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")
    fmt = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP", "avif": "AVIF"}[fmt]
    if fmt == "JPEG":
        if image.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", image.size, "white")
            bg.paste(image, mask=image.getchannel("A"))
            image = bg
        else:
            image = image.convert("RGB")
    clean = Image.new(image.mode, image.size)
    clean.paste(image)
    clean.save(dest, format=fmt, quality=int(quality), optimize=True)


@lru_cache(maxsize=1)
def background_session():
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = int(os.getenv("PROCESS_THREADS", "2"))
    opts.inter_op_num_threads = 1
    opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
    opts.add_session_config_entry("session.inter_op.allow_spinning", "0")
    model = config.MODELS / "u2netp.onnx"
    return ort.InferenceSession(str(model), sess_options=opts, providers=["CPUExecutionProvider"])


def saliency(rgb):
    import numpy as np
    session = background_session()
    data = np.asarray(rgb.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    data = (data - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    result = session.run(None, {session.get_inputs()[0].name: data.transpose(2, 0, 1)[None]})[0][0, 0]
    return (result - result.min()) / max(float(result.max() - result.min()), 1e-8)


def spread(prob, size):
    import numpy as np
    scaled = Image.fromarray((prob * 255).astype("uint8")).resize(size, Image.Resampling.BILINEAR)
    return np.asarray(scaled, dtype=np.float32) / 255.0


def subject_box(prob, rgb, grow=0.15):
    """Where the subject sits in the full image, with room around it for context."""
    import numpy as np
    ys, xs = np.nonzero(prob > 0.5)
    if len(xs) < 32:
        return None
    sx, sy = rgb.width / 320, rgb.height / 320
    pad = grow * max(xs.max() - xs.min(), ys.max() - ys.min())
    box = (max(0, int((xs.min() - pad) * sx)), max(0, int((ys.min() - pad) * sy)),
           min(rgb.width, int((xs.max() + pad) * sx)), min(rgb.height, int((ys.max() + pad) * sy)))
    width, height = box[2] - box[0], box[3] - box[1]
    if width < 96 or height < 96 or width * height > 0.92 * rgb.width * rgb.height:
        return None
    return box


def background(image):
    """Alpha for the subject. A 320 grid over the whole frame loses thin detail, so the
    subject is measured again on its own before the result is hardened into a matte."""
    import numpy as np
    rgb = image.convert("RGB")
    coarse = saliency(rgb)
    alpha = spread(coarse, image.size)
    box = subject_box(coarse, rgb)
    if box:
        closer = spread(saliency(rgb.crop(box)), (box[2] - box[0], box[3] - box[1]))
        alpha[box[1]:box[3], box[0]:box[2]] = np.maximum(alpha[box[1]:box[3], box[0]:box[2]], closer)
    edge = np.clip((alpha - 0.05) / 0.40, 0, 1)
    matte = edge * edge * (3 - 2 * edge)
    output = rgb.convert("RGBA")
    output.putalpha(Image.fromarray((matte * 255).astype("uint8")))
    return output


def image_jobs(paths, output, op, options):
    default = "png" if op == "image_background" else "original" if op in {"image_compress", "image_metadata"} else "webp"
    selected = choice(options, "format", default, {"original", "jpg", "png", "webp", "avif"})
    if op == "image_background":
        selected = "png"
    for i, path in enumerate(paths):
        fmt = selected
        if fmt == "original":
            # Keep the format the person uploaded whenever it is one we can write back.
            source = {"jpeg": "jpg"}.get(path.suffix.lstrip(".").lower(), path.suffix.lstrip(".").lower())
            fmt = source if source in {"jpg", "png", "webp", "avif"} else "png"
        with open_image(path) as im:
            if op == "image_background":
                im = background(im)
                editor = output.parent / "editor"
                editor.mkdir(exist_ok=True)
                im.getchannel("A").save(editor / f"{i}.mask.png", optimize=True)
                source = im.convert("RGB")
                source.save(editor / f"{i}.source.webp", format="WEBP", quality=95, method=4)
                fill = str(options.get("background_colour", ""))
                if fill:
                    if not re.fullmatch(r"#[0-9a-fA-F]{6}", fill):
                        raise ValueError("invalid_option")
                    plate = Image.new("RGBA", im.size, fill)
                    plate.alpha_composite(im)
                    im = plate
            if op == "image_resize":
                width = int(number(options, "width", 1920, 1, 12000))
                height = int(number(options, "height", 1080, 1, 12000))
                im.thumbnail((width, height), Image.Resampling.LANCZOS)
            # Stripping metadata always re-encodes, so it defaults to a near-transparent quality.
            write_image(im, output / f"image-{i + 1}.{fmt}", fmt,
                        number(options, "quality", 95 if op == "image_metadata" else 80, 1, 100))


def page_selection(value, count):
    if not value:
        return list(range(count))
    if not isinstance(value, str) or len(value) > 4000:
        raise ValueError("invalid_pages")
    result = []
    for part in value.replace(" ", "").split(","):
        if not re.fullmatch(r"\d+(-\d+)?", part):
            raise ValueError("invalid_pages")
        ends = [int(n) for n in part.split("-")]
        if any(n < 1 or n > count for n in ends):
            raise ValueError("invalid_pages")
        result.extend(range(ends[0] - 1, ends[-1]) if len(ends) == 2 else [ends[0] - 1])
        if len(result) > config.MAX_PAGES:
            raise ValueError("too_many_pages")
    if not result:
        raise ValueError("invalid_pages")
    return result


def pdf_reader(path, options):
    reader = PdfReader(path, strict=False)
    if reader.is_encrypted and not reader.decrypt(str(options.get("password", ""))):
        raise ValueError("pdf_password")
    if len(reader.pages) > config.MAX_PAGES:
        raise ValueError("too_many_pages")
    return reader


def render_page(path, index, password="", scale=1.5):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(str(path), password=password or None) as doc:
        page = doc[index]
        try:
            width, height = page.get_size()
            if width * height * scale**2 > Image.MAX_IMAGE_PIXELS:
                raise ValueError("image_too_large")
            bitmap = page.render(scale=scale)
            image = bitmap.to_pil().copy()
            bitmap.close()
            return image
        finally:
            page.close()


def annotation_rect(a, width, height):
    x = number(a, "x", 0, 0, 1) * width
    y = number(a, "y", 0, 0, 1) * height
    w = min(number(a, "w", 0.2, 0.001, 1) * width, width - x)
    h = min(number(a, "h", 0.05, 0.001, 1) * height, height - y)
    return x, y, w, h


def edit_pdf(reader, path, output, options):
    annotations = options.get("annotations", [])
    if not isinstance(annotations, list) or len(annotations) > 300:
        raise ValueError("invalid_option")
    writer = PdfWriter()
    order = page_selection(options.get("pages", ""), len(reader.pages))
    for idx in order:
        page = PdfWriter().add_page(reader.pages[idx])
        page.transfer_rotation_to_content()
        from pypdf import Transformation
        left, bottom = float(page.cropbox.left), float(page.cropbox.bottom)
        width, height = float(page.cropbox.width), float(page.cropbox.height)
        page.add_transformation(Transformation().translate(-left, -bottom))
        page.mediabox.lower_left = page.cropbox.lower_left = (0, 0)
        page.mediabox.upper_right = page.cropbox.upper_right = (width, height)
        items = [a for a in annotations if a.get("page") == idx + 1]
        redactions = [a for a in items if a.get("type") == "redact"]
        if redactions:
            # Rebuild the entire affected page from pixels; no hidden text/objects from that page survive.
            im = render_page(path, idx, str(options.get("password", "")), scale=2)
            draw = ImageDraw.Draw(im)
            for a in redactions:
                x, y, w, h = annotation_rect(a, im.width, im.height)
                draw.rectangle((math.floor(x), math.floor(y), math.ceil(x+w), math.ceil(y+h)), fill="black")
            buf = io.BytesIO()
            pdf = canvas.Canvas(buf, pagesize=(width, height))
            pdf.drawImage(ImageReader(im), 0, 0, width, height)
            pdf.save()
            page = PdfWriter(clone_from=io.BytesIO(buf.getvalue())).pages[0]
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(width, height))
        for a in items:
            kind = a.get("type")
            if kind == "redact":
                continue
            x, top, w, h = annotation_rect(a, width, height)
            y = height - top - h
            c.saveState()
            color = a.get("color", "#9b2737")
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise ValueError("invalid_option")
            c.setFillColor(color)
            c.setStrokeColor(color)
            if kind == "replace":
                # Existing glyphs cannot be rewritten in place, so the original run is
                # covered with the page colour behind it and the new words are drawn on top.
                cover = a.get("background", "#ffffff")
                if not re.fullmatch(r"#[0-9a-fA-F]{6}", cover):
                    raise ValueError("invalid_option")
                c.setFillColor(cover)
                c.rect(x - 0.6, y - 0.6, w + 1.2, h + 1.2, fill=1, stroke=0)
                c.setFillColor(color)
                face = "Helvetica-Bold" if a.get("bold") else "Helvetica-Oblique" if a.get("italic") else "Helvetica"
                body = str(a.get("text", ""))[:1000]
                point_size = number(a, "size", 12, 4, 200)
                if body:
                    room = w if w > 1 else width
                    while point_size > 4 and c.stringWidth(body, face, point_size) > room:
                        point_size -= 0.5
                c.setFont(face, point_size)
                c.drawString(x, y + max(0, (h - point_size * 0.72) / 2), body)
            elif kind in ("text", "signature"):
                c.setFont("Helvetica-Oblique" if kind == "signature" else "Helvetica", number(a, "size", 16, 6, 100))
                c.drawString(x, y, str(a.get("text", ""))[:1000])
            elif kind == "highlight":
                c.setFillColorRGB(1, 0.85, 0)
                c.setFillAlpha(0.3)
                c.rect(x, y, w, h, fill=1, stroke=0)
            elif kind == "underline":
                c.line(x, y, x + w, y)
            elif kind == "rect":
                c.rect(x, y, w, h, fill=0, stroke=1)
            elif kind == "draw":
                points = a.get("points", [])
                if len(points) > 5000:
                    raise ValueError("invalid_option")
                p = c.beginPath()
                for n, point in enumerate(points):
                    px = number({"v": point[0]}, "v", 0, 0, 1) * width
                    py = height - number({"v": point[1]}, "v", 0, 0, 1) * height
                    (p.moveTo if n == 0 else p.lineTo)(px, py)
                c.drawPath(p)
            elif kind == "image":
                raw = base64.b64decode(str(a.get("data", "")).split(",")[-1], validate=True)
                with Image.open(io.BytesIO(raw)) as im:
                    if im.width * im.height > Image.MAX_IMAGE_PIXELS:
                        raise ValueError("image_too_large")
                    c.drawImage(ImageReader(im), x, y, w, h, mask="auto")
            else:
                raise ValueError("invalid_option")
            c.restoreState()
        c.save()
        overlay = PdfReader(io.BytesIO(buf.getvalue()))
        if overlay.pages:
            page.merge_page(overlay.pages[0])
        rotation = options.get("rotations", {}).get(str(idx + 1), 0)
        if rotation not in (0, 90, 180, 270):
            raise ValueError("invalid_option")
        if rotation:
            page.rotate(rotation)
        writer.add_page(page)
    writer.write(output / "edited.pdf")


def pdf_jobs(paths, output, op, options):
    if op == "images_pdf":
        c = canvas.Canvas(str(output / "images.pdf"))
        for path in paths:
            with open_image(path) as im:
                width, height = im.size
                scale = min(1, 14400 / max(width, height))
                width, height = width * scale, height * scale
                c.setPageSize((width, height))
                c.drawImage(ImageReader(im), 0, 0, width, height, mask="auto")
                c.showPage()
        c.save()
        return
    target = output / "document.pdf"
    if op == "pdf_repair":
        password_file = output.parent / "qpdf-password"
        password_file.write_text(str(options.get("password", "")), encoding="utf-8")
        result = subprocess.run(["qpdf", "--password-file=" + str(password_file), str(paths[0]), str(target)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        if result.returncode not in (0, 3):
            raise ValueError("conversion_failed")
        pdf_reader(target, options)
        return
    reader = pdf_reader(paths[0], options)
    source_path = paths[0]
    if reader.is_encrypted and op in {"pdf_compress", "pdf_ocr", "pdf_archive"}:
        source_path = output.parent / "decrypted.pdf"
        decrypted = PdfWriter()
        decrypted.append(reader)
        decrypted.write(source_path)
    if op == "pdf_edit":
        return edit_pdf(reader, paths[0], output, options)
    if op == "pdf_text":
        with (output / "text.txt").open("w", encoding="utf-8") as out:
            for page in reader.pages:
                out.write((page.extract_text() or "") + "\n")
        return
    if op == "pdf_extract_images":
        count = 0
        for pi, page in enumerate(reader.pages):
            for im in page.images:
                count += 1
                if count > 2000:
                    raise ValueError("too_many_files")
                (output / f"page-{pi+1}-image-{count}.{Path(im.name).suffix.lstrip('.') or 'bin'}").write_bytes(im.data)
        if not count:
            raise ValueError("no_images")
        return
    if op == "pdf_images":
        for i in page_selection(options.get("pages"), len(reader.pages)):
            with render_page(paths[0], i, str(options.get("password", ""))) as im:
                im.save(output / f"page-{i+1}.png")
        return
    if op == "pdf_compress":
        preset = choice(options, "preset", "balanced", {"quality", "balanced", "small"})
        command(["gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7",
                 "-dPDFSETTINGS=" + {"quality": "/printer", "balanced": "/ebook", "small": "/screen"}[preset],
                 "-sOutputFile=" + str(target), source_path])
        return
    if op in {"pdf_ocr", "pdf_archive"}:
        args = ["ocrmypdf", "--skip-text", "--jobs", "1", "--output-type", "pdfa-2" if op == "pdf_archive" else "pdf", "-l", "por+eng", source_path, target]
        command(args)
        return
    writer = PdfWriter()
    if op == "pdf_merge":
        count = 0
        for path in paths:
            source = pdf_reader(path, options)
            count += len(source.pages)
            if count > config.MAX_PAGES:
                raise ValueError("too_many_pages")
            for page in source.pages:
                writer.add_page(page)
    elif op == "pdf_split":
        for index in page_selection(options.get("pages"), len(reader.pages)):
            part = PdfWriter()
            part.add_page(reader.pages[index])
            part.write(output / f"page-{index+1}.pdf")
        return
    elif op == "pdf_forms":
        fields = options.get("fields", {})
        if not isinstance(fields, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in fields.items()):
            raise ValueError("invalid_option")
        writer.append(reader)
        if not reader.get_fields():
            raise ValueError("no_forms")
        for page in writer.pages:
            writer.update_page_form_field_values(page, fields, auto_regenerate=False)
    else:
        indices = page_selection(options.get("pages"), len(reader.pages))
        if options.get("exclude"):
            indices = [i for i in range(len(reader.pages)) if i not in indices]
        if not indices:
            raise ValueError("invalid_pages")
        for position, index in enumerate(indices, start=1):
            page = PdfWriter().add_page(reader.pages[index])
            if op == "pdf_rotate":
                page.rotate(int(choice(options, "angle", 90, {90, 180, 270})))
            if op in {"pdf_watermark", "pdf_number"}:
                page.transfer_rotation_to_content()
                w, h = float(page.mediabox.width), float(page.mediabox.height)
                buf = io.BytesIO()
                c = canvas.Canvas(buf, pagesize=(w, h))
                c.setFillColorRGB(0.35, 0.35, 0.35)
                if op == "pdf_watermark":
                    c.setFillAlpha(0.3)
                    c.setFont("Helvetica", 32)
                    c.translate(w / 2, h / 2)
                    c.rotate(35)
                    c.drawCentredString(0, 0, str(options.get("text", "Everyday Tools"))[:150])
                else:
                    c.drawCentredString(w / 2, 20, str(position))
                c.save()
                page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
            writer.add_page(page)
    if op == "pdf_protect":
        password = str(options.get("new_password", ""))
        if not 6 <= len(password) <= 128:
            raise ValueError("pdf_password")
        writer.encrypt(password, algorithm="AES-256")
    writer.write(target)


def office_jobs(paths, output, op, options):
    fmt = "pdf" if op == "office_pdf" else choice(options, "format", "xlsx", {"xlsx", "csv", "ods"})
    profile = output.parent / "office-profile"
    for i, path in enumerate(paths):
        work = output.parent / f"office-{i}"
        work.mkdir()
        command(["libreoffice", "-env:UserInstallation=" + profile.as_uri(), "--headless", "--nologo", "--nodefault", "--nolockcheck", "--convert-to", fmt, "--outdir", work, path])
        produced = list(work.glob("*." + fmt))
        if len(produced) != 1:
            raise ValueError("conversion_failed")
        shutil.move(str(produced[0]), output / f"document-{i+1}.{fmt}")


def media_jobs(paths, output, op, options):
    threads = str(int(os.getenv("PROCESS_THREADS", "2")))
    for i, path in enumerate(paths):
        args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", threads, "-filter_threads", threads, "-filter_complex_threads", threads,
                "-protocol_whitelist", "file,pipe", "-i", path, "-map_metadata", "-1", "-threads", threads]
        if op.startswith("audio"):
            fmt = choice(options, "format", "mp3", {"mp3", "wav", "flac", "aac", "m4a", "ogg"})
            args += ["-vn"]
            bitrate = int(number(options, "bitrate", 192, 32, 320))
            if fmt == "ogg":
                # libvorbis refuses fixed bitrates that its sample rate cannot carry,
                # so low rate sources are encoded on the quality scale instead.
                args += ["-c:a", "libvorbis", "-q:a", str(min(10, max(0, round((bitrate - 64) / 32 + 2))))]
            elif fmt not in {"wav", "flac"}:
                args += ["-b:a", str(bitrate) + "k"]
            if op == "audio_normalize":
                args += ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]
        elif op == "video_gif":
            fmt = "gif"
            args += ["-t", str(int(number(options, "duration", 10, 1, 60))), "-vf", "fps=12,scale=640:-2:flags=lanczos", "-an"]
        else:
            fmt = choice(options, "format", "mp4", {"mp4", "mkv", "webm"})
            preset = choice(options, "preset", "balanced", {"quality", "balanced", "small"})
            codec = choice(options, "codec", "auto", {"auto", "h264", "h265", "vp9"})
            if fmt == "webm":
                codec = "vp9"
            elif codec == "auto":
                codec = "h264"
            args += ["-c:v", {"h264": "libx264", "h265": "libx265", "vp9": "libvpx-vp9"}[codec],
                     "-crf", str({"quality": 20, "balanced": 26, "small": 32}[preset])]
            if codec == "h265":
                args += ["-x265-params", f"pools={threads}:frame-threads=1"]
            if codec == "vp9":
                args += ["-b:v", "0", "-cpu-used", "4"]
            if "resolution" in options and options["resolution"] != "original":
                res = choice(options, "resolution", "720", {"480", "720", "1080", "2160"})
                args += ["-vf", "scale=-2:" + res]
            else:
                args += ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]
            if options.get("fps"):
                args += ["-r", str(int(number(options, "fps", 30, 1, 60)))]
            if options.get("video_bitrate"):
                args += ["-b:v", str(int(number(options, "video_bitrate", 2000, 100, 50000))) + "k"]
            if op == "video_mute":
                args += ["-an"]
            else:
                args += ["-c:a", "libopus" if fmt == "webm" else "aac", "-b:a", "128k"]
            if fmt == "mp4":
                args += ["-movflags", "+faststart", "-pix_fmt", "yuv420p"]
        command(args + [output / f"media-{i+1}.{fmt}"])


def archive_member(name):
    p = PurePosixPath(name.replace("\\", "/"))
    if p.is_absolute() or ".." in p.parts or not p.parts or any(":" in part or "\x00" in part for part in p.parts):
        raise ValueError("unsafe_archive")
    return p


def limited_copy(src, dst, remaining):
    count = 0
    while chunk := src.read(min(1024 * 1024, remaining - count + 1)):
        count += len(chunk)
        if count > remaining:
            raise ValueError("archive_limit")
        dst.write(chunk)
    return count


def archive_jobs(paths, output, op, options, files):
    if op == "archive_create":
        fmt = choice(options, "format", "zip", {"zip", "tar", "gz", "7z"})
        if fmt == "gz" and len(paths) != 1:
            raise ValueError("single_file_required")
        if fmt == "zip":
            with zipfile.ZipFile(output / "files.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
                for i, p in enumerate(paths):
                    z.write(p, f"{i+1}-{files[i]['name']}")
        elif fmt == "tar":
            with tarfile.open(output / "files.tar", "w") as tar:
                for i, p in enumerate(paths):
                    tar.add(p, arcname=f"{i+1}-{files[i]['name']}", recursive=False)
        elif fmt == "gz":
            from .filenames import safe_name
            name = safe_name(files[0]["name"]) if files else "file"
            with paths[0].open("rb") as src, gzip.open(output / (name + ".gz"), "wb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
        else:
            import py7zr
            with py7zr.SevenZipFile(output / "files.7z", "w") as z:
                for i, p in enumerate(paths):
                    z.write(p, arcname=f"{i+1}-{files[i]['name']}")
        return
    path = paths[0]
    total = 0
    count = 0
    def extract(name, size, source):
        nonlocal total, count
        p = archive_member(name)
        count += 1
        if size < 0 or total + size > config.MAX_EXTRACT or count > 2000:
            raise ValueError("archive_limit")
        # Flatten safely with unique internal names; archive paths never reach the filesystem.
        from .filenames import safe_name
        dest = output / (str(count) + "-" + safe_name(p.name))
        with dest.open("xb") as out:
            total += limited_copy(source, out, config.MAX_EXTRACT - total)
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as z:
            if len(z.infolist()) > 2000:
                raise ValueError("archive_limit")
            for info in z.infolist():
                archive_member(info.filename)
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("unsafe_archive")
                if info.is_dir():
                    continue
                if info.file_size > config.MAX_EXTRACT or info.file_size / max(1, info.compress_size) > 1000:
                    raise ValueError("archive_limit")
                with z.open(info) as src:
                    extract(info.filename, info.file_size, src)
    elif path.suffix == ".tar":
        with tarfile.open(path, "r|") as tar:
            for info in tar:
                archive_member(info.name)
                if info.isdir():
                    continue
                if not info.isfile():
                    raise ValueError("unsafe_archive")
                with tar.extractfile(info) as src:
                    extract(info.name, info.size, src)
    elif path.suffix == ".gz":
        # GZIP holds a single stream; recover the inner name from the upload, never from the header.
        inner = files[0]["name"] if files else "file"
        inner = inner[:-3] if inner.lower().endswith(".gz") else inner
        with gzip.open(path, "rb") as src:
            extract(inner or "file", 0, src)
    else:
        import py7zr
        from py7zr.io import WriterFactory, Py7zIO
        class Sink(Py7zIO):
            def __init__(self, name):
                nonlocal count
                count += 1
                from .filenames import safe_name
                self.file = (output / (str(count) + "-" + safe_name(archive_member(name).name))).open("w+b")
            def write(self, data):
                nonlocal total
                total += len(data)
                if total > config.MAX_EXTRACT:
                    raise ValueError("archive_limit")
                return self.file.write(data)
            def read(self, size=None):
                return self.file.read(-1 if size is None else size)
            def seek(self, offset, whence=0):
                return self.file.seek(offset, whence)
            def flush(self):
                self.file.flush()
            def size(self):
                return os.fstat(self.file.fileno()).st_size
        class Factory(WriterFactory):
            def __init__(self):
                self.sinks = []
            def create(self, filename):
                sink = Sink(filename)
                self.sinks.append(sink)
                return sink
        factory = Factory()
        try:
            with py7zr.SevenZipFile(path, "r") as z:
                infos = z.list()
                if len(infos) > 2000 or sum(i.uncompressed for i in infos) > config.MAX_EXTRACT:
                    raise ValueError("archive_limit")
                for info in infos:
                    archive_member(info.filename)
                    if info.is_symlink:
                        raise ValueError("unsafe_archive")
                z.extractall(factory=factory)
        finally:
            for sink in factory.sinks:
                sink.file.close()


def process(row, folder):
    options, files = json.loads(row["options"]), json.loads(row["files"])
    paths = [folder / "input" / f"{i}.{f['ext']}" for i, f in enumerate(files)]
    output = folder / "output"
    output.mkdir(exist_ok=True)
    op = row["operation"]
    if op.startswith("pdf_") or op == "images_pdf":
        pdf_jobs(paths, output, op, options)
    elif op.startswith("image_"):
        image_jobs(paths, output, op, options)
    elif op in {"office_pdf", "sheet_convert"}:
        office_jobs(paths, output, op, options)
    elif op.startswith(("video_", "audio_")):
        media_jobs(paths, output, op, options)
    elif op.startswith("archive_"):
        archive_jobs(paths, output, op, options, files)
    else:
        raise ValueError("unsupported_operation")
    produced = sorted(p for p in output.iterdir() if p.is_file())
    if not produced:
        raise ValueError("conversion_failed")
    if len(produced) > 1:
        with zipfile.ZipFile(output / "all-files.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
            for p in produced:
                z.write(p, p.name)
    outputs = [{"path": p.name, "name": p.name, "size": p.stat().st_size} for p in sorted(output.iterdir()) if p.is_file()]
    (folder / "result.json").write_text(json.dumps(outputs), encoding="utf-8")
