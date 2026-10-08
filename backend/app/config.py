from datetime import datetime
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./neralu.db"
    public_base_url: str = "http://localhost:8000"

    # twilio: real calls. browser: calls ring the /phone page instead (demo fallback, same rules).
    telephony_mode: str = "twilio"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    validate_twilio_signature: bool = True
    # simulated: family/neighbour messages are logged only. twilio: registered people's contacts get a
    # real SMS from twilio_from_number (simulated residents never do).
    family_sms: str = "simulated"

    stt_provider: str = "sarvam"
    sarvam_api_key: str = ""
    bhashini_api_key: str = ""
    anthropic_api_key: str = ""
    stt_timeout_s: float = 6
    # "voice": spoken day recorded + transcribed. "keypad": press 1-7 (Twilio trials cannot record).
    orientation_mode: str = "voice"

    demo_speed: int = 60
    max_attempts: int = 2
    ring_timeout_s: int = 15
    retry_gap_min: float = 15
    ack_timeout_min: float = 15
    amber_recall_min: float = 30
    scenario_start: datetime = datetime.fromisoformat("2026-10-09T10:55:00+05:30")

    scheduler_enabled: bool = True

    # Built website to serve on the same port (empty: ../frontend/dist when it exists).
    frontend_dist: str = ""

    kamala_phone: str = ""
    volunteer_demo_token: str = "priya-demo"


@lru_cache
def get_settings() -> Settings:
    return Settings()
