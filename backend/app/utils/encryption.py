"""
AES-256 envelope encryption utilities.

Architecture:
  - Each file gets a unique Data Encryption Key (DEK)
  - DEK is encrypted by the master Key Encryption Key (KEK) stored in env
  - Only encrypted DEKs are stored in the database
  - KEK never leaves the application process
"""
import os
import secrets
from base64 import b64encode, b64decode

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

from app.config import settings


def _get_kek() -> bytes:
    """Derive a 32-byte KEK from settings. Pad/truncate to exactly 32 bytes."""
    raw = settings.master_kek.encode("utf-8")
    if len(raw) < 32:
        raw = raw.ljust(32, b"\x00")
    return raw[:32]


def generate_dek() -> bytes:
    """Generate a random 256-bit Data Encryption Key."""
    return os.urandom(32)


def generate_iv() -> bytes:
    """Generate a random 128-bit AES initialization vector."""
    return os.urandom(16)


def _aes_encrypt(data: bytes, key: bytes, iv: bytes) -> bytes:
    """Raw AES-256-CBC encrypt with PKCS7 padding."""
    padder = padding.PKCS7(128).padder()
    padded = padder.update(data) + padder.finalize()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    enc = cipher.encryptor()
    return enc.update(padded) + enc.finalize()


def _aes_decrypt(ciphertext: bytes, key: bytes, iv: bytes) -> bytes:
    """Raw AES-256-CBC decrypt with PKCS7 unpadding."""
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    dec = cipher.decryptor()
    padded = dec.update(ciphertext) + dec.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(padded) + unpadder.finalize()


def encrypt_dek(dek: bytes) -> str:
    """Wrap DEK with master KEK. Returns base64-encoded '{iv_hex}:{ciphertext_b64}'."""
    kek = _get_kek()
    iv = generate_iv()
    encrypted = _aes_encrypt(dek, kek, iv)
    return f"{b64encode(iv).decode()}:{b64encode(encrypted).decode()}"


def decrypt_dek(encrypted_dek: str) -> bytes:
    """Unwrap a DEK that was encrypted by the master KEK."""
    kek = _get_kek()
    iv_b64, ct_b64 = encrypted_dek.split(":", 1)
    iv = b64decode(iv_b64)
    ciphertext = b64decode(ct_b64)
    return _aes_decrypt(ciphertext, kek, iv)


def encrypt_file_bytes(data: bytes, dek: bytes, iv: bytes) -> bytes:
    """Encrypt file content with AES-256-CBC using the provided DEK and IV."""
    return _aes_encrypt(data, dek, iv)


def decrypt_file_bytes(ciphertext: bytes, dek: bytes, iv: bytes) -> bytes:
    """Decrypt file content encrypted with encrypt_file_bytes."""
    return _aes_decrypt(ciphertext, dek, iv)
