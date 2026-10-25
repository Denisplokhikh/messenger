import base64
import os
import re
import secrets
from collections.abc import Iterator
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

# Формат файла на диске:
#   заголовок: MAGIC (4) + VERSION (1) + nonce_prefix (8, свой у каждого файла)
#   дальше куски: AES-GCM от CHUNK_SIZE байт исходника, у каждого свой тег (16 байт).
# Шифруем кусками, а не Fernet целиком: файл никогда не лежит в памяти полностью
# и отдаётся клиенту потоком по мере расшифровки
MAGIC = b"MSGA"
VERSION = b"\x01"
NONCE_PREFIX_SIZE = 8
HEADER_SIZE = len(MAGIC) + len(VERSION) + NONCE_PREFIX_SIZE
CHUNK_SIZE = 64 * 1024
TAG_SIZE = 16
ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + TAG_SIZE

# Ключ хранилища генерирует сервер (new_storage_key), но проверяем всё равно:
# это имя файла на диске, и «../» в нём недопустимо
_STORAGE_KEY_RE = re.compile(r"^[0-9a-f]{64}$")


class CorruptedFileError(Exception):
    """Файл повреждён, подменён или зашифрован другим ключом."""


def _load_cipher(raw_key: str) -> AESGCM:
    key = base64.urlsafe_b64decode(raw_key)
    if len(key) != 32:
        raise ValueError("ATTACHMENT_ENCRYPTION_KEY must be 32 bytes encoded in urlsafe base64")
    return AESGCM(key)


# Создаётся при импорте: неверный ключ в .env сразу роняет старт приложения
_aesgcm = _load_cipher(settings.ATTACHMENT_ENCRYPTION_KEY)


def _nonce(prefix: bytes, index: int) -> bytes:
    # Префикс уникален для файла, счётчик — для куска: пара (ключ, nonce) никогда не повторяется
    return prefix + index.to_bytes(4, "big")


def _aad(header: bytes, index: int, last: bool) -> bytes:
    # Номер куска и флаг «последний» не дают переставить куски или обрезать файл незаметно,
    # заголовок — подменить версию формата
    return header + index.to_bytes(4, "big") + (b"\x01" if last else b"\x00")


def new_storage_key() -> str:
    return secrets.token_hex(32)


def path_for(storage_key: str, thumb: bool = False) -> Path:
    if not _STORAGE_KEY_RE.fullmatch(storage_key):
        raise ValueError("invalid storage key")
    # Раскладываем по подпапкам из первых двух символов, чтобы в одной папке не копились сотни тысяч файлов
    name = f"{storage_key}_thumb" if thumb else storage_key
    return settings.ATTACHMENTS_DIR / storage_key[:2] / name


class EncryptedWriter:
    """Пишет файл на диск зашифрованным, принимая данные порциями любого размера.

        with EncryptedWriter(key) as w:
            w.write(chunk)

    Пишет во временный .part и переименовывает его, только если блок with завершился без ошибок:
    недописанный файл никогда не окажется под настоящим именем.
    Синхронный — из async-кода вызывать через run_in_threadpool.
    """

    def __init__(self, storage_key: str, thumb: bool = False):
        self._final = path_for(storage_key, thumb)
        self._part = self._final.with_name(self._final.name + ".part")
        self._buffer = bytearray()
        self._index = 0
        self.size = 0  # Байт исходника, записанных на данный момент

    def __enter__(self) -> "EncryptedWriter":
        self._final.parent.mkdir(parents=True, exist_ok=True)
        self._prefix = os.urandom(NONCE_PREFIX_SIZE)
        self._header = MAGIC + VERSION + self._prefix
        self._file = open(self._part, "wb")
        self._file.write(self._header)
        return self

    def write(self, data: bytes) -> None:
        self._buffer += data
        self.size += len(data)
        # Строго больше: кусок, после которого данных пока нет, может оказаться последним,
        # а это станет известно только в __exit__
        offset = 0
        while len(self._buffer) - offset > CHUNK_SIZE:
            self._write_chunk(bytes(self._buffer[offset:offset + CHUNK_SIZE]), last=False)
            offset += CHUNK_SIZE
        del self._buffer[:offset]

    def _write_chunk(self, chunk: bytes, last: bool) -> None:
        nonce = _nonce(self._prefix, self._index)
        self._file.write(_aesgcm.encrypt(nonce, chunk, _aad(self._header, self._index, last)))
        self._index += 1

    def __exit__(self, exc_type, exc, tb) -> None:
        done = False
        try:
            if exc_type is None:
                # У пустого файла это единственный кусок: без него файл из одного заголовка
                # было бы не отличить от обрезанного
                self._write_chunk(bytes(self._buffer), last=True)
                self._file.flush()
                os.fsync(self._file.fileno())
                self._file.close()
                os.replace(self._part, self._final)
                done = True
        finally:
            if not done:
                self._file.close()
                self._part.unlink(missing_ok=True)


def write_encrypted(storage_key: str, data: bytes, thumb: bool = False) -> None:
    """Для данных, которые и так целиком в памяти, например пережатой картинки и превью."""
    with EncryptedWriter(storage_key, thumb) as writer:
        writer.write(data)


def iter_decrypted(storage_key: str, thumb: bool = False) -> Iterator[bytes]:
    """Отдаёт расшифрованный файл кусками по CHUNK_SIZE.

    Нет файла — FileNotFoundError, повреждён или подменён — CorruptedFileError.
    Ошибка может вылететь посреди файла, когда часть кусков уже отдана: при потоковой отдаче
    клиент получит оборванный ответ, а не испорченные данные.
    Синхронный генератор: StreamingResponse сам перебирает такие в threadpool.
    """
    with open(path_for(storage_key, thumb), "rb") as f:
        header = f.read(HEADER_SIZE)
        if len(header) != HEADER_SIZE or not header.startswith(MAGIC + VERSION):
            raise CorruptedFileError("bad header")
        prefix = header[len(MAGIC) + len(VERSION):]

        index = 0
        current = f.read(ENCRYPTED_CHUNK_SIZE)
        while True:
            # Читаем на кусок вперёд: последний он или нет, видно только по концу файла
            following = f.read(ENCRYPTED_CHUNK_SIZE)
            last = not following
            try:
                plain = _aesgcm.decrypt(_nonce(prefix, index), current, _aad(header, index, last))
            except InvalidTag as e:
                raise CorruptedFileError(f"chunk {index} failed authentication") from e
            yield plain
            if last:
                return
            current = following
            index += 1


def delete_files(storage_key: str) -> None:
    path_for(storage_key).unlink(missing_ok=True)
    path_for(storage_key, thumb=True).unlink(missing_ok=True)
