import io
import json
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader, PdfWriter
from docx import Document

from app import config, storage
from app.db import connect
from app.legal import VERSION
from app.main import app
from app.processors import pdf_jobs, write_image
from app.worker import claim
from conftest import fake_job, upload


def test_setup_requires_current_legal_notice(client):
    payload = {"email": "admin@example.test", "password": "good-test-password", "language": "en"}
    assert client.post('/api/setup', json=payload).status_code == 422
    assert client.post('/api/setup', json=payload | {'legal_version': 'old'}).status_code == 422
    notice = client.get('/api/legal').json()
    assert notice['version'] == VERSION
    assert notice['author'] == 'Dinis Mago'
    assert set(notice['documents']) == {'pt-PT', 'en'}
    assert client.post('/api/setup', json=payload | {'legal_version': VERSION}).status_code == 200
    assert client.get('/api/status').json()['language'] == 'en'
    assert client.get('/api/me').json()['language'] == 'en'
    with connect() as db:
        assert json.loads(db.execute("SELECT value FROM settings WHERE key='legal_version'").fetchone()[0]) == VERSION
        assert json.loads(db.execute("SELECT value FROM settings WHERE key='default_language'").fetchone()[0]) == 'en'


def test_account_preferences_and_email_verification(admin_client):
    payload = {'name': 'Dinis', 'email': 'admin@example.test', 'language': 'en', 'role': 'USER'}
    assert admin_client.put('/api/me', json=payload).status_code == 200
    me = admin_client.get('/api/me').json()
    assert (me['name'], me['language'], me['role']) == ('Dinis', 'en', 'ADMIN')
    with TestClient(app, headers={'X-Requested-With': 'EverydayTools'}) as other:
        assert other.post('/api/login', json={'email': payload['email'], 'password': 'good-test-password'}).status_code == 200
        payload['email'] = 'updated@example.test'
        assert admin_client.put('/api/me', json=payload).status_code == 400
        assert admin_client.put('/api/me', json=payload | {'current_password': 'good-test-password'}).status_code == 200
        assert admin_client.get('/api/me').json()['email'] == payload['email']
        assert other.get('/api/me').status_code == 401


def test_delete_timeout_keeps_files_but_revokes_access(admin_client, pdf_bytes, monkeypatch):
    jid = upload(admin_client, pdf_bytes)
    with connect(True) as db:
        db.execute("UPDATE jobs SET running=1,state='PROCESSING' WHERE id=?", (jid,))
    monkeypatch.setattr(storage, 'await_idle', lambda _: False)
    assert admin_client.delete('/api/jobs/' + jid).status_code == 202
    assert storage.job_dir(jid).exists()
    assert admin_client.get(f'/api/jobs/{jid}/original/0').status_code == 404
    with connect(True) as db:
        db.execute('UPDATE jobs SET running=0 WHERE id=?', (jid,))
    monkeypatch.setattr(storage, 'await_idle', lambda _: True)
    storage.cleanup()
    assert not storage.job_dir(jid).exists()


@pytest.mark.parametrize('path', ['../../database/everyday.sqlite3', '/etc/passwd', '..\\database\\everyday.sqlite3'])
def test_download_rejects_tampered_manifest(admin_client, pdf_bytes, path):
    jid = upload(admin_client, pdf_bytes)
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',outputs=? WHERE id=?", (json.dumps([{'path': path, 'name': 'file', 'size': 1}]), jid))
    assert admin_client.get(f'/api/jobs/{jid}/download/0').status_code == 404


@pytest.mark.skipif(os.name == 'nt', reason='Symlinks require special Windows privileges')
def test_download_rejects_symlink(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    output = storage.job_dir(jid) / 'output'
    output.mkdir()
    (output / 'result.txt').symlink_to(config.DB)
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',outputs=? WHERE id=?", (json.dumps([{'path': 'result.txt', 'name': 'file', 'size': 1}]), jid))
    assert admin_client.get(f'/api/jobs/{jid}/download/0').status_code == 404


def test_global_capacity_applies_across_classes(admin_client, monkeypatch):
    monkeypatch.setenv('MAX_ACTIVE_JOBS', '1')
    uid = admin_client.get('/api/me').json()['id']
    first = fake_job(uid, cls='LIGHT')
    fake_job(uid, cls='HEAVY')
    assert claim('LIGHT')['id'] == first
    assert claim('HEAVY') is None
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',running=0 WHERE id=?", (first,))
    assert claim('HEAVY') is not None


def test_palette_image_preserves_color_and_transparency(tmp_path):
    im = Image.new('P', (2, 1))
    im.putpalette([255, 0, 0, 0, 255, 0] + [0] * 762)
    im.putdata([0, 1])
    im.info['transparency'] = 0
    target = tmp_path / 'output.png'
    write_image(im, target, 'png')
    with Image.open(target) as out:
        assert out.convert('RGBA').getpixel((0, 0)) == (255, 0, 0, 0)
        assert out.convert('RGBA').getpixel((1, 0)) == (0, 255, 0, 255)


def test_repeated_pdf_pages_do_not_accumulate_rotation(tmp_path, pdf_bytes):
    path = tmp_path / 'input.pdf'
    path.write_bytes(pdf_bytes)
    output = tmp_path / 'out'
    output.mkdir()
    pdf_jobs([path], output, 'pdf_rotate', {'pages': '1,1', 'angle': 90})
    result = PdfReader(output / 'document.pdf')
    assert [page.rotation for page in result.pages] == [90, 90]


def test_pdf_exports_to_editable_word_and_selected_image_format(tmp_path, pdf_bytes):
    path = tmp_path / 'input.pdf'
    path.write_bytes(pdf_bytes)
    word = tmp_path / 'word'
    word.mkdir()
    pdf_jobs([path], word, 'pdf_word', {})
    document = Document(word / 'document.docx')
    content = '\n'.join(paragraph.text for paragraph in document.paragraphs)
    assert 'Private text on first page' in content
    assert 'Second page' in content

    images = tmp_path / 'images'
    images.mkdir()
    pdf_jobs([path], images, 'pdf_images', {'format': 'jpg', 'dpi': 96, 'pages': '2'})
    assert [item.name for item in images.iterdir()] == ['page-2.jpg']
    with Image.open(images / 'page-2.jpg') as converted:
        assert converted.format == 'JPEG'


def test_cropped_pdf_redaction_uses_visible_page(tmp_path, pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page = reader.pages[0]
    page.cropbox.lower_left = (20, 600)
    page.cropbox.upper_right = (400, 800)
    writer = PdfWriter()
    writer.add_page(page)
    path = tmp_path / 'input.pdf'
    writer.write(path)
    output = tmp_path / 'out'
    output.mkdir()
    pdf_jobs([path], output, 'pdf_edit', {'annotations': [{'type': 'redact', 'page': 1, 'x': 0, 'y': 0, 'w': 1, 'h': .5}]})
    result = PdfReader(output / 'edited.pdf')
    assert tuple(result.pages[0].mediabox) == (0, 0, 380, 200)
    assert not result.pages[0].extract_text()
    from app.processors import render_page
    with render_page(output / 'edited.pdf', 0, scale=1) as im:
        assert im.getpixel((50, 25))[:3] == (0, 0, 0)
        assert im.getpixel((50, 150))[:3] == (255, 255, 255)


@pytest.mark.skipif(sys.platform != 'linux', reason='Landlock requires Linux')
def test_landlock_denies_other_jobs_and_database(tmp_path):
    own = tmp_path / 'own'
    own.mkdir()
    models = tmp_path / 'models'
    models.mkdir(exist_ok=True)
    secret = tmp_path / 'other-private.txt'
    secret.write_text('private')
    program = f'''
from pathlib import Path
from app.isolation import isolate
own = Path({str(own)!r})
isolate(own, Path({str(models)!r}))
(own / 'result.txt').write_text('allowed')
for path in [{str(secret)!r}, {str(config.DB)!r}]:
    try:
        Path(path).read_bytes()
    except PermissionError:
        pass
    else:
        raise AssertionError('Sandbox allowed private data')
try:
    Path('/tmp/forbidden-regular-file').write_text('blocked')
except PermissionError:
    pass
else:
    raise AssertionError('Sandbox allowed a regular file outside the job')
'''
    subprocess.run([sys.executable, '-c', program], check=True, timeout=10)
