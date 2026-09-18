"""Real Docker integration checks. Run against a disposable, configured test installation."""
import io
import os
import subprocess
import time
import wave
import zipfile
from urllib.parse import urlparse

import httpx
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from pypdf import PdfReader

base = os.getenv('TEST_URL', 'http://127.0.0.1:8087')
assert urlparse(base).hostname in {'127.0.0.1', 'localhost'} and urlparse(base).port == 8087, 'Use the disposable test installation on port 8087.'
client = httpx.Client(base_url=base, headers={'X-Requested-With': 'EverydayTools'}, timeout=60)
response = client.post('/api/login', json={'email': 'family@example.test', 'password': 'test-only-password-123'})
response.raise_for_status()
client.headers['X-CSRF-Token'] = client.get('/api/me').json()['csrf']
prefs = client.get('/api/admin').json()['settings']
prefs.update(upload_limit=100, job_limit=100)
client.put('/api/admin/settings', json=prefs).raise_for_status()


def clear_abuse_counters():
    """This sweep makes more requests than any real person, so the counters are reset."""
    subprocess.run(['docker', 'exec', 'everyday-tools-test-web-1', 'python', '-c',
                    "import sqlite3;db=sqlite3.connect('/data/database/everyday.sqlite3');"
                    "db.execute('DELETE FROM rate_limits');db.commit()"], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def run(name, content, operation, options=None):
    clear_abuse_counters()
    response = client.post('/api/jobs', json={'files': [{'name': name, 'size': len(content)}]})
    response.raise_for_status()
    jid = response.json()['id']
    client.put(f'/api/jobs/{jid}/files/0', content=content).raise_for_status()
    client.post(f'/api/jobs/{jid}/run', json={'operation': operation, 'options': options or {}}).raise_for_status()
    end = time.monotonic() + 120
    while time.monotonic() < end:
        result = client.get('/api/jobs/' + jid).json()
        if result['state'] in {'COMPLETED', 'FAILED', 'CANCELLED'}:
            break
        time.sleep(.4)
    if result['state'] != 'COMPLETED':
        raise AssertionError(f"{operation}: {result['state']} {result.get('error')} (job {jid})")
    outputs = []
    for i, out in enumerate(result['outputs']):
        response = client.get(f'/api/jobs/{jid}/download/{i}')
        response.raise_for_status()
        assert len(response.content) == out['size']
        outputs.append((out['name'], response.content))
    client.delete('/api/jobs/' + jid).raise_for_status()
    assert client.get('/api/jobs/' + jid).status_code == 404
    print('PASS', operation, flush=True)
    return outputs


pdf_buffer = io.BytesIO()
c = canvas.Canvas(pdf_buffer)
c.drawString(40, 700, 'Everyday Tools document test')
c.showPage()
c.drawString(40, 700, 'Second page')
c.save()
pdf = pdf_buffer.getvalue()

image_buffer = io.BytesIO()
image = Image.new('RGB', (320, 240), 'white')
ImageDraw.Draw(image).ellipse((90, 25, 230, 215), fill='red')
image.save(image_buffer, 'PNG')
png = image_buffer.getvalue()

for operation, options in [('pdf_merge', {}), ('pdf_split', {}), ('pdf_pages', {'pages': '2,1'}), ('pdf_rotate', {}),
                           ('pdf_watermark', {'text': 'Local'}), ('pdf_number', {}), ('pdf_text', {}),
                           ('pdf_images', {'format': 'jpg', 'dpi': 96}), ('pdf_word', {}),
                           ('pdf_compress', {}), ('pdf_ocr', {}), ('pdf_archive', {}), ('pdf_repair', {}),
                           ('pdf_edit', {'annotations': [{'type': 'text', 'page': 1, 'x': .1, 'y': .2, 'text': 'Added locally'}, {'type': 'redact', 'page': 2, 'x': 0, 'y': 0, 'w': 1, 'h': .5}]})]:
    run('document.pdf', pdf, operation, options)
protected = run('document.pdf', pdf, 'pdf_protect', {'new_password': 'secret-123'})[0][1]
run('protected.pdf', protected, 'pdf_unlock', {'password': 'secret-123'})
run('protected.pdf', protected, 'pdf_compress', {'password': 'secret-123'})
run('protected.pdf', protected, 'pdf_ocr', {'password': 'secret-123'})
scanned = io.BytesIO()
with pdfium.PdfDocument(pdf) as document:
    page = document[0]
    bitmap = page.render(scale=2)
    c = canvas.Canvas(scanned, pagesize=page.get_size())
    c.drawImage(ImageReader(bitmap.to_pil()), 0, 0, *page.get_size())
    c.showPage()
    c.save()
    bitmap.close()
    page.close()
ocr = run('scanned.pdf', scanned.getvalue(), 'pdf_ocr')[0][1]
assert 'Everyday' in PdfReader(io.BytesIO(ocr)).pages[0].extract_text()
for operation, options in [('image_convert', {'format': 'jpg'}), ('image_resize', {'width': 100, 'height': 100}),
                           ('image_compress', {'quality': 60}), ('image_metadata', {}), ('image_background', {}), ('images_pdf', {})]:
    result = run('photo.png', png, operation, options)
    if operation == 'image_background':
        with Image.open(io.BytesIO(result[0][1])) as output:
            assert output.mode == 'RGBA'
            assert output.getchannel('A').getextrema()[0] < 100
    if operation == 'images_pdf':
        run('images.pdf', result[0][1], 'pdf_extract_images')

docx = io.BytesIO()
with zipfile.ZipFile(docx, 'w') as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Everyday Tools Office test</w:t></w:r></w:p></w:body></w:document>')
run('document.docx', docx.getvalue(), 'office_pdf')
sheet = run('sheet.csv', b'Name,Value\nEveryday Tools,42\n', 'sheet_convert', {'format': 'xlsx'})[0][1]
run('sheet.xlsx', sheet, 'office_pdf')
run('sheet.xlsx', sheet, 'sheet_convert', {'format': 'ods'})
csv = run('sheet.xlsx', sheet, 'sheet_convert', {'format': 'csv'})[0][1]
assert b'Everyday Tools' in csv and b'42' in csv
for fmt in ['png', 'webp', 'avif']:
    converted = run('photo.png', png, 'image_convert', {'format': fmt})[0][1]
    with Image.open(io.BytesIO(converted)) as out:
        assert out.size == (320, 240)
svg = run('drawing.svg', b'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="red"/></svg>', 'image_convert', {'format': 'png'})[0][1]
with Image.open(io.BytesIO(svg)) as out:
    assert out.width == 2 * out.height

wav = io.BytesIO()
with wave.open(wav, 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(8000)
    audio.writeframes(b'\0\0' * 8000)
run('audio.wav', wav.getvalue(), 'audio_convert', {'format': 'mp3'})
run('audio.wav', wav.getvalue(), 'audio_normalize', {'format': 'wav'})
for fmt in ['flac', 'aac', 'm4a', 'ogg']:
    run('audio.wav', wav.getvalue(), 'audio_convert', {'format': fmt})
video = subprocess.run(['docker', 'exec', 'everyday-tools-test-worker-1', 'ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], capture_output=True, check=True).stdout
for operation, options in [('video_convert', {}), ('video_compress', {'preset': 'small'}), ('video_gif', {}), ('video_mute', {}), ('audio_extract', {})]:
    run('clip.mp4', video, operation, options)
run('clip.mp4', video, 'video_convert', {'format': 'webm', 'codec': 'vp9'})
run('clip.mp4', video, 'video_convert', {'format': 'mkv', 'codec': 'h265'})
for fmt in ['zip', 'tar', 'gz', '7z']:
    result = run('document.pdf', pdf, 'archive_create', {'format': fmt})
    run('archive.' + fmt, result[0][1], 'archive_extract')

# Plaintext in a PDF form must survive a real form-fill operation.
buf = io.BytesIO()
c = canvas.Canvas(buf)
c.acroForm.textfield(name='name', x=30, y=700, width=200, height=20)
c.showPage()
c.save()
result = run('form.pdf', buf.getvalue(), 'pdf_forms', {'fields': {'name': 'Everyday'}})
filled = PdfReader(io.BytesIO(result[0][1]))
assert filled.get_fields()['name']['/V'] == 'Everyday'
assert b'Everyday' in filled.pages[0]['/Annots'][0].get_object()['/AP']['/N'].get_data()
print('All Docker converter smoke tests passed.', flush=True)
