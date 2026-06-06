from cryptography.fernet import Fernet


class Crypto:
    def __init__(self, key: str | None) -> None:
        self._fernet: Fernet | None = Fernet(key.encode()) if key else None

    def encrypt(self, value: str | None) -> str | None:
        if not value or self._fernet is None:
            return None
        return self._fernet.encrypt(value.encode()).decode()

    def decrypt(self, token: str | None) -> str | None:
        if not token or self._fernet is None:
            return None
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except Exception:
            return None
