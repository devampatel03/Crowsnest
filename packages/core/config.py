from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    github_token: str = ""
    github_org: str = ""
    socket_api_key: str = ""
    npm_token: str = ""
    crowsnest_db_path: str = "./crowsnest.duckdb"
    crowsnest_snapshot_dir: str = "./snapshots"
    crowsnest_api_host: str = "0.0.0.0"
    crowsnest_api_port: int = 8000
    # Accept both DEMO_MODE=true and CROWSNEST_DEMO_MODE=true
    crowsnest_demo_mode: bool = Field(default=False, validation_alias="DEMO_MODE")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "populate_by_name": True,
    }



@lru_cache
def get_settings() -> Settings:
    return Settings()
