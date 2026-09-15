# Localization adapter contract

Adapters are the only game-specific layer. Their localization contract is text-only: images, textures, video, and other visual assets are not extracted, edited, copied into artifacts, or counted as untranslated content. Text baked into graphics remains out of scope.

`extract(project)` reads the configured source and returns entries containing exact source text, translator-facing context, and an opaque locator. It must be deterministic for unchanged input. Stable locators are essential because the workbench uses them to preserve existing editorial work across extraction.

`build(project, destination)` receives a project only after the core has verified that every current entry is reviewed and has a final translation. It writes a static artifact beneath `destination` and returns its name, path, format, and byte size.

Adapters do not own glossaries. Every adapter project identifies the matching published VN Revival game slug; the shared workbench core synchronizes that game's canonical glossary independently of extraction and packaging.

Adapters must never:

- invoke a provider or generate translated wording;
- copy drafts into final fields;
- mark entries reviewed;
- alter the source game or its saves;
- launch or attach to the game;
- treat visual assets as localization entries or package modified visual assets;
- write outside the supplied artifact directory;
- include API credentials or private workbench metadata in output.

The portable source schema is a JSON object with `schemaVersion: 1` and an `entries` array. Each entry has `source` and may include `id`, `context`, and `locator`. This is the preferred boundary for external extractors.
