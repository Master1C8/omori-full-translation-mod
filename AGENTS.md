# OMORI Translator development guide

Keep task context local. Start from `docs/DEV_MAP.md` and read only the source,
tests, and contract documents named for the current task. The implementation is
authoritative when documentation and code disagree.

## Product invariants

- Story Translation is the stable default and changes only dialogue, speaker
  names, and choices.
- Full Translation is experimental and applies only translations already present
  in an imported pack or the selected provider cache. Gameplay cache misses must
  never start a provider request.
- Do not restore Bergamot, Super Bulk, or hidden character-name dictionaries.
- Character names use the same cache and selected provider as other text.
- Google Bulk and Test Phrase allow at most one fresh request per second.
- HTTP 429 must retain the current operation, show `Rate limited`, persist the
  cooldown, and continue after it expires.
- ETA measures only fresh translations in the current pass. Cache hits, startup,
  model preparation, and rate-limit waiting do not contribute to throughput.
- Changing language, provider, endpoint, or model clears the live view.
- Interrupting translation preserves completed cache entries.
- Imported packs remain isolated in IndexedDB schema 4 and take precedence over
  provider cache without overwriting it.
- Never delete user caches, models, saves, translation history, or credentials
  unless the user explicitly requests that exact operation.

## Module boundaries

- `src/translation-core.js`: source classification and protected-markup integrity.
- `src/providers.js`: browser provider registry and request policies.
- `src/runtime-ui.js`: generic control busy/disabled state.
- `src/runtime-progress.js`: word counting, ETA, and cooldown presentation.
- `src/runtime-panel.js`: Shadow DOM panel markup and CSS only.
- `src/translator-runtime.js`: orchestration, IndexedDB, Bulk, DOM/canvas hooks,
  panel controller, and provider state.
- `src/local_router.py`: declarative local-helper POST routing.
- `src/local_service.py`: remote-provider bridge, asset extraction,
  credentials, logs, updates, and loopback HTTP server.
- `src/games/omori/adapter.js`: OMORI-specific DOM/canvas integration.
- `launcher/` and `src/controller/`: platform startup and injection.

Preserve the public browser globals and HTTP paths when extracting a module.
Prefer cohesive modules over generic utility buckets. Avoid files smaller than a
single responsibility merely to reduce line count.

## Verification

- Browser/runtime-only change: `./scripts/test-runtime.sh`.
- Python helper/provider change: `./scripts/test-service.sh`.
- Cross-layer, launcher, manifest, or release change: `./scripts/test-omori.sh`.
- Release assembly: `./scripts/build-omori.sh`, then verify both archives.

Keep successful command output concise. Inspect detailed output only on failure.
Do not commit, push, tag, publish, or replace release archives without an explicit
request.
