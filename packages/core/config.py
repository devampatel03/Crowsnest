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
    # Loopback by default: the API has no authentication, so it must not listen on the network
    # unless the operator opts in (the Docker image sets CROWSNEST_API_HOST via its CMD).
    crowsnest_api_host: str = "127.0.0.1"
    crowsnest_api_port: int = 8000
    # Comma-separated browser origins allowed to call the API (the dashboard's origin).
    crowsnest_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Install check: a version must have been public this many days before it is allowed (0 turns it off).
    crowsnest_min_release_age_days: float = 2.0
    # Look up the registry and the malware feed live during an install check. Turn off for offline use.
    crowsnest_live_lookups: bool = True
    # Set by the Docker image: the folder inside the container where the user's projects are shared. The command line
    # reads it from /health to turn a path on the user's machine into a path the container can read.
    crowsnest_projects_root: str = ""
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
