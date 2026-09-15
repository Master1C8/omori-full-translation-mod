# Localization Workbench development guide

Start with `docs/DEV_MAP.md` and read only the modules named for the task.

## Product invariants

- This application has one purpose: produce static text-localization artifacts for games.
- Images, textures, video, and all other visual assets are outside the extraction, editorial, completeness, and packaging scope, including text baked into graphics.
- It never launches, attaches to, instruments, or translates a running game.
- Runtime translation products, including Corruption of Champions II, live in separate repositories and applications.
- OpenAI-compatible endpoints may create drafts only. Provider output is never editor-approved automatically.
- Every project glossary is synchronized from the published VN Revival game glossary. Local or provider-generated glossary sources are forbidden.
- Drafting and builds fail until the complete target-language glossary layer has been synchronized and fingerprinted.
- `draft` and `final` are separate durable fields. Changing a source string or regenerating a draft invalidates prior approval.
- A build must fail unless every current source entry has a non-empty `final` value with state `reviewed`.
- Editorial review may happen in the UI or through an exported review bundle. Imports must verify project, entry, and source identity.
- Game-specific extraction and packaging belong in adapters. Project storage, AI drafting, and review must remain game-agnostic.
- Never modify source game files. Build artifacts are written only under the workbench data directory.
- Never store API keys in project files, exports, logs, or command-line arguments. Use the operating-system credential vault.
- Remote OpenAI-compatible endpoints require HTTPS. Plain HTTP is allowed only for loopback endpoints.
- Never delete project data, reviews, artifacts, or credentials without an explicit request for that exact deletion.

## Module boundaries

- `src/workbench/core.py`: durable project lifecycle and editorial gate.
- `src/workbench/openai_provider.py`: OpenAI-compatible connection and draft generation only.
- `src/workbench/site_glossary.py`: validated read-only synchronization from the public VN Revival glossary API.
- `src/workbench/adapters.py`: adapter registry and format-specific extract/build implementations.
- `src/workbench_service.py`: authenticated loopback HTTP API and static UI hosting.
- `src/workbench_ui/`: the standalone workbench interface.
- `launcher/`: platform entry points; launch the workbench, never a game.

## Verification

- Run `./scripts/test-workbench.sh` for every change.
- For adapter changes, test extraction against representative fixtures and verify the built artifact's structure.
- Release assembly is `./scripts/build.sh`, followed by `./scripts/verify.sh`.
- Do not commit, push, tag, publish, replace release archives, or modify an installed application without an explicit request.
