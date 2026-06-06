from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    ujin_api_base_url: str = "https://api-uae-test.ujin.tech"
    ujin_referer: str = "https://hackaton2026.ujin.tech/"
    ujin_request_timeout: float = 15.0
    ujin_token: str = "ust-0000000-00000000000000000000000000000001"
    database_url: str = "postgresql://smartlobby:smartlobby@localhost:5432/smartlobby"
    encryption_key: str = ""
    admin_token: str = ""
    demo_mode: bool = True
    ujin_max_retries: int = 2
    ujin_retry_backoff: float = 0.5
    backend_cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")
    poll_interval_fast: int = 300
    poll_interval_medium: int = 1800
    poll_interval_daily: int = 86400
    emergency_auto_reset_sec: int = 1800
    openweather_api_key: str = ""
    openweather_city: str = "Moscow"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
