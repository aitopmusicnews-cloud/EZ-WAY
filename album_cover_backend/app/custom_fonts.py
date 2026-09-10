from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True, slots=True)
class CustomFont:
    label: str
    filename: str


CUSTOM_FONTS: dict[str, CustomFont] = {
    "armadillo": CustomFont("Armadillo", "Armadillo.ttf"),
    "charles-wright-singapore": CustomFont("Charles Wright Singapore", "CharlesWrightSingapore.otf"),
    "oxidaren": CustomFont("Oxidaren", "Oxidaren.otf"),
    "scapholene": CustomFont("Scapholene", "Scapholene.ttf"),
    "serati": CustomFont("Serati", "Serati-Regular.otf"),
    "trigram": CustomFont("Trigram", "Trigram-Regular.otf"),
    "achtung-bravo": CustomFont("Achtung Bravo", "Achtung Bravo Mac.ttf"),
    "asterisk-mono": CustomFont("Asterisk Mono", "AsteriskMono-Regular.otf"),
    "chainsaw-carnage": CustomFont("Chainsaw Carnage", "ChainsawCarnage.otf"),
    "digit-tech": CustomFont("Digit Tech", "DigitTech16-Regular.otf"),
    "dystopian-canticle": CustomFont("Dystopian Canticle", "Dystopian-Canticle-Regular.otf"),
    "eightgon": CustomFont("Eightgon", "Eightgon-Regular.otf"),
    "goodlookingfont": CustomFont("GoodLookingFont", "GoodLookingFont.otf"),
    "help-me": CustomFont("Help Me", "HelpMe.ttf"),
    "jogrunge": CustomFont("JOGRUNGE", "JOGRUNGE.otf"),
    "london-psycho": CustomFont("London Psycho", "London Psycho B&W Black Outline-COLR.otf"),
    "lumierepolis": CustomFont("Lumierepolis", "Lumierepolis-Regular.otf"),
    "midnight-letters": CustomFont("Midnight Letters", "MidnightLetters-Regular.otf"),
    "moonlit-flow": CustomFont("Moonlit Flow", "MoonlitFlow-Regular.otf"),
    "powderworks": CustomFont("Powderworks", "powdwrk5.ttf"),
}


def font_root() -> Path:
    return Path(os.getenv("ALBUM_COVER_FONT_ROOT", "/data/storage/fonts/custom"))


def resolve_custom_font_path(style: str, *, root: Path | None = None) -> Path | None:
    entry = CUSTOM_FONTS.get(str(style or "").strip().lower())
    if entry is None:
        return None
    candidate = (root or font_root()) / entry.filename
    return candidate if candidate.is_file() else None
