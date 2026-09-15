# Changelog

## Unreleased — Localization Workbench

- Replaced the in-game realtime translator with a standalone localization-production workbench.
- Added game-independent portable JSON and JSON-tree adapters, plus an OMORI/OneLoader adapter.
- Added an OpenAI-compatible draft pipeline with credentials stored in the operating-system vault.
- Configured OpenCode Go with GLM-5.3 as the default draft engine and added its required per-session request header.
- Made the published VN Revival game/locale glossary the only terminology source; project creation and refresh validate and fingerprint its complete target layer.
- Separated machine drafts from editorial finals. Anton and Codex perform final review; artifacts cannot be built until every current source entry is approved.
- Added durable project storage, source-change invalidation, editorial bundle export/import, and reproducible static artifact builds.
- Expanded OMORI extraction to player-facing non-`text` YAML fields, RPG Maker event dialogue and choices, map display names, and all supported database fields; test catalogs are excluded and builds now patch exact YAML lines and JSON pointers instead of globally replacing equal strings.
- Removed game launching, browser injection, DOM/canvas hooks, runtime translation, Google translation, provider caches, and the Corruption of Champions II prototype.

Historical realtime-translator release notes remain available in the repository history.
