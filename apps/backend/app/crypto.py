import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


class Crypto:
    def __init__(self, key: str | None) -> None:
        if not key:
            logger.warning("ENCRYPTION_KEY is not set - encrypted fields will be stored as NULL")
            self._fernet: Fernet | None = None
        else:
            self._fernet = Fernet(key.encode())

    def encrypt(self, value: str | None) -> str | None:
        if value is None:
            return None
        if self._fernet is None:
            logger.warning("Crypto.encrypt called without key - value will not be persisted")
            return None
        return self._fernet.encrypt(value.encode()).decode()

    def decrypt(self, token: str | None) -> str | None:
        if not token or self._fernet is None:
            return None
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except Exception:
            return None
