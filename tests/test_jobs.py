import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from PIL import Image
from pypdf import PdfReader

from app import storage
from app.db import connect
from app.processors import process, page_selection
from app.worker import claim, recover
from conftest import fake_job, upload


def finish(jid):
    with connect() as db:
        row = dict(db.execute('SELECT * FROM jobs WHERE id=?', (jid,)).fetchone())
    folder = storage.job_dir(jid)
    process(row, folder)
    outputs = (folder / 'result.json').read_text()
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',outputs=?,options='{}' WHERE id=?", (outputs, jid))
    return folder


def test_upload_convert_download_delete(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes, '../../Family.pdf')
    assert admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'pdf_text'}).status_code == 200
    folder = finish(jid)
    response = admin_client.get(f'/api/jobs/{jid}/download/0')
    assert response.status_code == 200
    assert b'Private text' in response.content
    assert 'no-store' in response.headers['cache-control']
    assert admin_client.delete(f'/api/jobs/{jid}').status_code == 200
    assert not folder.exists()
    assert admin_client.get(f'/api/jobs/{jid}/download/0').status_code == 404
    with connect() as db:
        assert db.execute('SELECT count(*) FROM jobs').fetchone()[0] == 0


def test_one_hour_from_creation_and_restart_cleanup(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    row = admin_client.get(f'/api/jobs/{jid}').json()
    assert row['expires'] - row['created'] == 3600
    folder = storage.job_dir(jid)
    (folder / 'preview').mkdir()
    (folder / 'preview' / 'secret.png').write_bytes(b'secret')
    (folder / 'work').mkdir()
    with connect(True) as db:
        db.execute('UPDATE jobs SET expires=? WHERE id=?', (time.time() - 180, jid))
    assert admin_client.get('/api/jobs').json() == []
    assert admin_client.get(f'/api/jobs/{jid}/original/0').status_code == 404
    recover()
    assert not folder.exists()
    with connect() as db:
        assert db.execute('SELECT count(*) FROM jobs').fetchone()[0] == 0


def test_five_heavy_jobs_only_one_claimed(admin_client):
    uid = admin_client.get('/api/me').json()['id']
    for _ in range(5):
        fake_job(uid)
    with ThreadPoolExecutor(max_workers=5) as pool:
        claimed = list(pool.map(lambda _: claim('HEAVY'), range(5)))
    assert sum(j is not None for j in claimed) == 1
    with connect() as db:
        assert db.execute("SELECT count(*) FROM jobs WHERE state='PENDING'").fetchone()[0] == 4


def test_cancel_keeps_slot_until_process_exits(admin_client):
    uid = admin_client.get('/api/me').json()['id']
    jid = fake_job(uid)
    fake_job(uid)
    assert claim('HEAVY')['id'] == jid
    assert admin_client.post(f'/api/jobs/{jid}/cancel').status_code == 200
    assert claim('HEAVY') is None
    with connect(True) as db:
        db.execute('UPDATE jobs SET running=0 WHERE id=?', (jid,))
    assert claim('HEAVY') is not None


def test_fair_scheduling(admin_client):
    uid = admin_client.get('/api/me').json()['id']
    with connect(True) as db:
        db.execute("INSERT INTO users VALUES ('other','other@example.test','hash','USER',0,?)", (time.time(),))
    first = fake_job(uid, created=time.time() - 10)
    fake_job(uid, created=time.time() - 9)
    other = fake_job('other')
    assert claim('HEAVY')['id'] == first
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',running=0 WHERE id=?", (first,))
    assert claim('HEAVY')['id'] == other


def test_pending_limit(admin_client, pdf_bytes):
    for _ in range(5):
        upload(admin_client, pdf_bytes)
    assert admin_client.post('/api/jobs', json={'files': [{'name': 'a.pdf', 'size': 100}]}).status_code == 429


def test_page_selection():
    assert page_selection('3,1-2', 3) == [2, 0, 1]
    for value in ('0', '-1', '../2', '9', '3-1', '1;echo bad'):
        with pytest.raises(ValueError):
            page_selection(value, 3)


def test_pdf_redaction_removes_underlying_text(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'pdf_edit', 'options': {'annotations': [{'page': 1, 'type': 'redact', 'x': 0, 'y': 0, 'w': 1, 'h': .5}]}})
    folder = finish(jid)
    pdf = PdfReader(folder / 'output' / 'edited.pdf')
    assert len(pdf.pages) == 2
    assert 'Private text' not in (pdf.pages[0].extract_text() or '')
    assert 'Second page' in pdf.pages[1].extract_text()
    assert len(pdf.pages[0].images) == 1


def test_pdf_protection(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'pdf_protect', 'options': {'new_password': 'secret123'}})
    folder = finish(jid)
    pdf = PdfReader(folder / 'output' / 'document.pdf')
    assert pdf.is_encrypted
    assert pdf.decrypt('wrong') == 0
    assert pdf.decrypt('secret123') > 0
    assert len(pdf.pages) == 2


def test_image_metadata_removed(admin_client):
    image = Image.new('RGB', (64, 32), 'red')
    exif = Image.Exif()
    exif[0x010E] = 'private description'
    buf = io.BytesIO()
    image.save(buf, 'JPEG', exif=exif)
    jid = upload(admin_client, buf.getvalue(), 'photo.jpg')
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'image_metadata', 'options': {'format': 'jpg'}})
    folder = finish(jid)
    with Image.open(folder / 'output' / 'image-1.jpg') as result:
        assert not result.getexif()
        assert result.size == (64, 32)


def test_restart_marks_processing_failed(admin_client):
    uid = admin_client.get('/api/me').json()['id']
    jid = fake_job(uid, state='PROCESSING', running=1)
    folder = storage.job_dir(jid)
    folder.mkdir()
    (folder / 'input').mkdir()
    (folder / 'work').mkdir()
    (folder / 'work' / 'partial').write_bytes(b'secret')
    recover()
    with connect() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (jid,)).fetchone()
        assert row['state'] == 'FAILED' and row['running'] == 0
    assert not (folder / 'work').exists()


def test_delete_now_waits_for_the_converter_to_stop(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    folder = storage.job_dir(jid)
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='PROCESSING',running=1 WHERE id=?", (jid,))
    outcome = []
    thread = threading.Thread(target=lambda: outcome.append(storage.delete_job(jid)))
    thread.start()
    time.sleep(1)
    assert folder.exists(), 'deletion must not remove files while a converter is still running'
    with connect() as db:
        assert db.execute('SELECT deleting FROM jobs WHERE id=?', (jid,)).fetchone()[0] == 1
    # The supervisor terminates the process group and clears the flag.
    with connect(True) as db:
        db.execute('UPDATE jobs SET running=0 WHERE id=?', (jid,))
    thread.join(timeout=30)
    assert outcome == [True]
    assert not folder.exists()
    with connect() as db:
        assert db.execute('SELECT count(*) FROM jobs').fetchone()[0] == 0


def test_expired_job_is_invisible_before_the_sweep(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    with connect(True) as db:
        db.execute('UPDATE jobs SET deleting=1 WHERE id=?', (jid,))
    assert admin_client.get(f'/api/jobs/{jid}').status_code == 404
    assert admin_client.get('/api/jobs').json() == []


def test_page_numbers_follow_the_output_order(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'pdf_number', 'options': {'pages': '2'}})
    folder = finish(jid)
    pdf = PdfReader(folder / 'output' / 'document.pdf')
    assert len(pdf.pages) == 1
    text = pdf.pages[0].extract_text()
    assert 'Second page' in text and '1' in text


def test_metadata_removal_keeps_the_original_format(admin_client):
    buf = io.BytesIO()
    Image.new('RGB', (48, 24), 'blue').save(buf, 'JPEG')
    jid = upload(admin_client, buf.getvalue(), 'photo.jpg')
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'image_metadata'})
    folder = finish(jid)
    assert [p.name for p in folder.glob('output/*')] == ['image-1.jpg']


def test_gzip_extraction_recovers_the_inner_name(admin_client, tmp_path):
    import gzip
    from app.processors import archive_jobs
    source = tmp_path / 'notes.txt.gz'
    with gzip.open(source, 'wb') as out:
        out.write(b'local content')
    output = tmp_path / 'out'
    output.mkdir()
    archive_jobs([source], output, 'archive_extract', {}, [{'name': 'notes.txt.gz'}])
    produced = list(output.iterdir())
    assert len(produced) == 1 and produced[0].name.endswith('notes.txt')
    assert produced[0].read_bytes() == b'local content'


def test_filled_form_values_have_appearance_streams(admin_client):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    form = canvas.Canvas(buf)
    form.acroForm.textfield(name='name', x=30, y=700, width=200, height=20)
    form.showPage()
    form.save()
    jid = upload(admin_client, buf.getvalue(), 'form.pdf')
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'pdf_forms', 'options': {'fields': {'name': 'Everyday'}}})
    folder = finish(jid)
    result = PdfReader(folder / 'output' / 'document.pdf')
    assert result.get_fields()['name']['/V'] == 'Everyday'
    widget = result.pages[0]['/Annots'][0].get_object()
    assert b'Everyday' in widget['/AP']['/N'].get_data()
    assert result.trailer['/Root']['/AcroForm']['/NeedAppearances'].value is False


def test_gzip_archive_keeps_the_original_name(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes, 'Relatorio.pdf')
    admin_client.post(f'/api/jobs/{jid}/run', json={'operation': 'archive_create', 'options': {'format': 'gz'}})
    folder = finish(jid)
    assert [p.name for p in folder.glob('output/*')] == ['Relatorio.pdf.gz']
