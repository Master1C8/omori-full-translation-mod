# Architecture

```text
game files / portable source
            │
            ▼
      game adapter.extract
            │
            ▼
project.json: source + context + locator
            │
            ├── VN Revival glossary API ─► validated, fingerprinted glossary cache
            │
            ├── OpenAI-compatible batch ──► draft
            │
            └── Anton + Codex review ─────► final + reviewed
                                               │
                                    all entries reviewed?
                                       no ─┤ ├─ yes
                                           │   ▼
                                      build blocked
                                               adapter.build
                                                    │
                                                    ▼
                                      static localization artifact
```

## Project model

A project owns one VN Revival game slug, one source language, one target language, one adapter, optional style rules, a synchronized site-glossary snapshot, current extracted entries, and a bounded build history. Every entry contains:

- immutable adapter-derived `id`;
- exact `source`;
- translator-facing `context`;
- adapter-only `locator`;
- provider-produced `draft` and its metadata;
- editor-owned `final`;
- one state: `new`, `draft`, `needs-review`, or `reviewed`.

Re-extraction merges only entries whose ID and source are unchanged. Changed source resets draft, final, and review state. Draft regeneration also clears final and approval.

Project updates use same-directory temporary files and atomic replacement. Source game files are read-only, while output artifacts live under the workbench data directory.

## Provider boundary

`openai_provider.py` is deliberately named for its role: it can only create drafts. It knows nothing about game output formats and cannot mark entries reviewed. It uses endpoint-scoped operating-system credentials, structured batch output, usage logging without source text, and generic protected-token validation. It receives glossary entries only from the synchronized VN Revival snapshot and selects terms relevant to each batch.

## Glossary boundary

`site_glossary.py` reads the public VN Revival endpoint for the project's exact game slug and target locale. It requires a complete translated layer, validates every entry, computes a deterministic SHA-256 fingerprint, and stores the result as a local offline cache. Users and providers cannot create an alternative local glossary. Draft generation and artifact builds are blocked until synchronization succeeds.

## Editorial boundary

The UI can save a final string as unreviewed or explicitly approve it. For larger work, `review-bundle` exports source, context, draft, final, and issues. Import checks the project ID plus every entry ID/source pair before applying editorial state.

`WorkbenchStore.build()` enforces the gate below the UI. An adapter never receives an incomplete project.

## Adapter boundary

The adapter boundary is text-only. Visual assets are neither extraction inputs nor localization outputs, even when an image or video contains text. They remain byte-for-byte outside the artifact, and their contents do not participate in completeness calculations.

An adapter exposes metadata plus:

```python
extract(project) -> list[{source, context, locator, id?}]
build(project, destination) -> artifact metadata
```

Adapters must not call AI services, approve translations, modify game files, or write outside the supplied destination. A new game means a new adapter, not a new application mode.

The OMORI adapter owns its read-only pure-Python asset decoder in `workbench/omori_assets.py`. No runtime injection path exists.

## Application shell

The platform launcher starts an authenticated loopback service and opens its standalone HTML interface. The random token is placed in the URL fragment and sent only in a custom request header. API keys remain in the OS vault. The application never starts or attaches to a game process.
