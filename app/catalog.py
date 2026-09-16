import importlib.util
import shutil

from . import config

PDF = {"pdf"}
IMAGES = {"jpg", "jpeg", "png", "heic", "heif", "webp", "avif", "svg", "gif", "tiff", "bmp"}
OFFICE = {"doc", "docx", "odt", "rtf", "txt", "html", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp"}
VIDEO = {"mp4", "mov", "mkv", "webm", "avi"}
AUDIO = {"mp3", "wav", "flac", "aac", "m4a", "ogg"}
ARCHIVES = {"zip", "tar", "gz", "7z"}
ALLOWED = PDF | IMAGES | OFFICE | VIDEO | AUDIO | ARCHIVES

# id, input family, queue, dependency, multi-file
OPERATIONS = {
    "pdf_merge": (PDF, "LIGHT", None, True),
    "pdf_split": (PDF, "LIGHT", None, False),
    "pdf_pages": (PDF, "LIGHT", None, False),
    "pdf_rotate": (PDF, "LIGHT", None, False),
    "pdf_compress": (PDF, "MEDIUM", "gs", False),
    "images_pdf": (IMAGES, "MEDIUM", None, True),
    "pdf_images": (PDF, "MEDIUM", None, False),
    "pdf_watermark": (PDF, "LIGHT", None, False),
    "pdf_number": (PDF, "LIGHT", None, False),
    "pdf_protect": (PDF, "LIGHT", None, False),
    "pdf_unlock": (PDF, "LIGHT", None, False),
    "pdf_ocr": (PDF, "MEDIUM", "ocrmypdf", False),
    "pdf_text": (PDF, "LIGHT", None, False),
    "pdf_extract_images": (PDF, "MEDIUM", None, False),
    "pdf_edit": (PDF, "MEDIUM", None, False),
    "pdf_forms": (PDF, "LIGHT", None, False),
    "pdf_archive": (PDF, "MEDIUM", "ocrmypdf", False),
    "pdf_repair": (PDF, "LIGHT", "qpdf", False),
    "office_pdf": (OFFICE, "MEDIUM", "libreoffice", True),
    "sheet_convert": ({"csv", "xlsx", "ods", "xls"}, "MEDIUM", "libreoffice", True),
    "image_convert": (IMAGES, "MEDIUM", None, True),
    "image_compress": (IMAGES, "MEDIUM", None, True),
    "image_resize": (IMAGES, "MEDIUM", None, True),
    "image_metadata": (IMAGES, "MEDIUM", None, True),
    "image_background": (IMAGES, "MEDIUM", "model", True),
    "video_convert": (VIDEO | {"gif"}, "HEAVY", "ffmpeg", False),
    "video_compress": (VIDEO, "HEAVY", "ffmpeg", False),
    "video_gif": (VIDEO, "HEAVY", "ffmpeg", False),
    "video_mute": (VIDEO, "HEAVY", "ffmpeg", False),
    "audio_extract": (VIDEO, "HEAVY", "ffmpeg", False),
    "audio_convert": (AUDIO, "MEDIUM", "ffmpeg", True),
    "audio_normalize": (AUDIO, "MEDIUM", "ffmpeg", True),
    "archive_create": (ALLOWED, "LIGHT", None, True),
    "archive_extract": (ARCHIVES, "MEDIUM", None, False),
}


def available(dependency):
    if dependency is None:
        return True
    if dependency == "model":
        return (config.MODELS / "u2netp.onnx").is_file() and importlib.util.find_spec("onnxruntime") is not None
    return bool(shutil.which(dependency))


def catalog():
    return [{"id": key, "extensions": sorted(ext), "class": cls, "available": available(dep), "batch": batch}
            for key, (ext, cls, dep, batch) in OPERATIONS.items()]

