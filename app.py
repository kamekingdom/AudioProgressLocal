import argparse
from pathlib import Path

import eel

AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}
BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "audio"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audio progress demo with spatial motion modes (A/B/No Motion)."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind Eel webserver")
    parser.add_argument("--port", default=8080, type=int, help="Port to bind Eel webserver")
    parser.add_argument(
        "--size",
        nargs=2,
        type=int,
        default=[1280, 800],
        metavar=("WIDTH", "HEIGHT"),
        help="Window size",
    )
    return parser.parse_args()


@eel.expose
def list_audio_files() -> list[str]:
    if not AUDIO_DIR.exists():
        return []

    files = [
        path.name
        for path in AUDIO_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    ]
    files.sort()
    return files


def main() -> None:
    args = parse_args()
    AUDIO_DIR.mkdir(exist_ok=True)
    eel.init(str(BASE_DIR))
    eel.start(
        "web/index.html",
        mode="chrome-app",
        host=args.host,
        port=args.port,
        size=tuple(args.size),
        block=True,
    )


if __name__ == "__main__":
    main()
