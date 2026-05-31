"""Crowsnest API entry point."""

import uvicorn
from .config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "packages.core.api:app",
        host=settings.crowsnest_api_host,
        port=settings.crowsnest_api_port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
