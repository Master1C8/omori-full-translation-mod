# VN Revival Localization Workbench

Localization Workbench is a desktop tool for producing static text localizations for games. It does not inject scripts into games and does not translate gameplay in real time.

Graphics localization is deliberately outside the product scope. Images, textures, video, and text baked into visual assets remain unchanged and are not counted by the extraction or build-completeness gates.

The application has one workflow:

1. A game adapter extracts source text and its context.
2. The project synchronizes its complete English and target-language glossary from VN Revival.
3. An OpenAI-compatible model creates first-pass drafts in batches using only relevant synchronized terms.
4. A human editor — in our workflow, Anton and Codex — reviews and rewrites every final string.
5. The adapter builds a distributable localization only after the site glossary is present and every current entry is explicitly reviewed.

Machine output is always stored in `draft`. Release content comes only from the separate `final` field. The build gate cannot be bypassed accidentally: any new, changed, draft-only, or unreviewed entry blocks packaging.

## Adapters

- `OMORI / OneLoader` reads the installed game's encrypted text-bearing `.HERO` and `.KEL` assets without modifying them. It extracts dialogue, choices, visible menu/lore fields, map display names, and supported database text, then builds a targeted text-only OneLoader ZIP.
- `JSON tree` translates human-readable string values while preserving the JSON structure.
- `Portable localization source` is the stable interchange contract for future Unity, Ren'Py, RPG Maker, CSV, subtitle, and custom game adapters.

Adding another game does not add another runtime mode. It adds one adapter with two operations: `extract(project)` and `build(project, destination)`.

## OpenAI-compatible endpoints

The workbench uses the established `GET /models` and `POST /chat/completions` routes. The default draft engine is OpenCode Go at `https://opencode.ai/zen/go/v1` with `glm-5.3`; other HTTPS-compatible endpoints and loopback HTTP endpoints are supported. OpenCode Go requests include a per-launch `x-opencode-session` identifier. Keys are stored in macOS Keychain or Windows Credential Manager and never enter localization projects.

The provider returns structured batches keyed by immutable entry IDs. Drafts that lose or reorder protected placeholders and control codes are rejected. Glossaries are never generated or maintained locally: the workbench downloads the published game/locale layer from `https://vnrevival.fun/games/<slug>/glossary` and stores its fingerprint as an offline cache.

## Editorial work with Codex

Use `Export for editorial review` to create a portable review JSON. We can review that file in the game-specific repository, edit `final`, mark genuinely completed entries as `reviewed`, and import it back. The import rejects changed source identities and bundles from another project.

## Development

```bash
./scripts/test-workbench.sh
PYTHONPATH=src python3 src/workbench_service.py --data-dir /tmp/vnrevival-workbench
```

Release archives are created only on explicit request:

```bash
./scripts/build.sh
```

The project is maintained under the private `Master1C8/omori-full-translation-mod` repository while the product transition is completed. It is not affiliated with OMOCAT, Steam, or OpenAI-compatible service providers.
