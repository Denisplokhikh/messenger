import os

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings
from app.services import attachment_storage as storage
from app.services.attachment_storage import (
    CHUNK_SIZE,
    ENCRYPTED_CHUNK_SIZE,
    HEADER_SIZE,
    MAGIC,
    CorruptedFileError,
)


@pytest.fixture(autouse=True)
def storage_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ATTACHMENTS_DIR", tmp_path)
    return tmp_path


def _store(data: bytes, portion: int | None = None) -> str:
    key = storage.new_storage_key()
    with storage.EncryptedWriter(key) as writer:
        if portion is None:
            writer.write(data)
        else:
            for i in range(0, len(data), portion):
                writer.write(data[i:i + portion])
    return key


def _read(key: str, thumb: bool = False) -> bytes:
    return b"".join(storage.iter_decrypted(key, thumb))


# Размеры вокруг границы куска: ошибки на единицу прячутся именно там
@pytest.mark.parametrize(
    "size", [0, 1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 3 * CHUNK_SIZE + 5]
)
def test_roundtrip(size):
    data = os.urandom(size)
    assert _read(_store(data)) == data


def test_roundtrip_with_small_portions():
    data = os.urandom(2 * CHUNK_SIZE + 123)
    assert _read(_store(data, portion=1000)) == data


def test_writer_counts_size():
    key = storage.new_storage_key()
    with storage.EncryptedWriter(key) as writer:
        writer.write(b"a" * 10)
        writer.write(b"b" * 5)
    assert writer.size == 15


def test_file_on_disk_is_encrypted():
    data = b"top secret " * 1000
    raw = storage.path_for(_store(data)).read_bytes()
    assert b"top secret" not in raw


def test_thumb_is_separate_file_and_delete_removes_both():
    key = storage.new_storage_key()
    storage.write_encrypted(key, b"full image")
    storage.write_encrypted(key, b"thumbnail", thumb=True)

    assert _read(key) == b"full image"
    assert _read(key, thumb=True) == b"thumbnail"

    storage.delete_files(key)
    assert not storage.path_for(key).exists()
    assert not storage.path_for(key, thumb=True).exists()


def _swap_chunks(header, chunks):
    chunks[0], chunks[1] = chunks[1], chunks[0]
    return header, chunks


def _drop_last_chunk(header, chunks):
    return header, chunks[:-1]


def _append_garbage(header, chunks):
    return header, chunks + [os.urandom(16)]


def _flip_byte(header, chunks):
    chunks[1] = bytes([chunks[1][0] ^ 1]) + chunks[1][1:]
    return header, chunks


def _change_version(header, chunks):
    return MAGIC + b"\x02" + header[len(MAGIC) + 1:], chunks


def _change_nonce_prefix(header, chunks):
    return header[:-1] + bytes([header[-1] ^ 1]), chunks


@pytest.mark.parametrize(
    "tamper",
    [_swap_chunks, _drop_last_chunk, _append_garbage, _flip_byte, _change_version, _change_nonce_prefix],
)
def test_tampered_file_is_rejected(tamper):
    key = _store(os.urandom(3 * CHUNK_SIZE + 5))  # 4 куска
    path = storage.path_for(key)
    raw = path.read_bytes()
    body = raw[HEADER_SIZE:]
    chunks = [body[i:i + ENCRYPTED_CHUNK_SIZE] for i in range(0, len(body), ENCRYPTED_CHUNK_SIZE)]

    header, chunks = tamper(raw[:HEADER_SIZE], chunks)
    path.write_bytes(header + b"".join(chunks))

    with pytest.raises(CorruptedFileError):
        _read(key)


def test_empty_file_truncated_to_header_is_rejected():
    key = _store(b"")
    path = storage.path_for(key)
    path.write_bytes(path.read_bytes()[:HEADER_SIZE])

    with pytest.raises(CorruptedFileError):
        _read(key)


def test_wrong_key_is_rejected(monkeypatch):
    key = _store(b"hello")
    monkeypatch.setattr(storage, "_aesgcm", AESGCM(AESGCM.generate_key(bit_length=256)))

    with pytest.raises(CorruptedFileError):
        _read(key)


def test_failed_write_leaves_no_files(storage_dir):
    key = storage.new_storage_key()
    with pytest.raises(RuntimeError):
        with storage.EncryptedWriter(key) as writer:
            writer.write(os.urandom(2 * CHUNK_SIZE))
            raise RuntimeError("upload aborted")

    assert [p for p in storage_dir.rglob("*") if p.is_file()] == []


@pytest.mark.parametrize("bad_key", ["../../etc/passwd", "ABC", "a" * 63, "g" * 64])
def test_invalid_storage_key_is_rejected(bad_key):
    with pytest.raises(ValueError):
        storage.path_for(bad_key)
