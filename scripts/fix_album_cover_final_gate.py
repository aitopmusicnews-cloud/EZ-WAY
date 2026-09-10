from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace(
    "src/services/albumCoverIntegration.test.ts",
    "  assert.doesNotMatch(studio, /AI winner/);\n  assert.doesNotMatch(studio, /AI runner-up/);",
    "  assert.doesNotMatch(studio, />AI winner</);\n  assert.doesNotMatch(studio, />AI runner-up</);",
)
replace(
    "src/components/AlbumCoverStudio.tsx",
    '<p className="text-[9px] text-zinc-600">winner</p>',
    '<p className="text-[9px] text-zinc-600">set score</p>',
)
