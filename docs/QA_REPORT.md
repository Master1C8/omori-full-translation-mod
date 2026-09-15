# QA status

The architecture transition currently verifies:

- text-only localization scope; graphical assets remain outside extraction, review, completeness, and packaging;
- JSON source extraction and structurally equivalent rebuilt output;
- durable separation of draft and final values;
- build rejection until every entry is explicitly reviewed;
- approval invalidation when source text changes;
- project/source identity validation for imported editorial bundles;
- exact placeholder/control-token order validation for provider drafts and editorial finals;
- complete translated-glossary validation and deterministic VN Revival snapshot fingerprints;
- live public VN Revival OMORI/ru synchronization (144 of 144 entries);
- HTTPS enforcement for remote endpoints and loopback HTTP support;
- targeted quoted, plain, and block YAML replacement plus exact JSON-pointer replacement used by the OMORI adapter;
- direct RPG Maker event dialogue, choices, map display names, and player-facing non-`text` YAML fields;
- exclusion of OMORI template/test catalogs and all visual assets;
- real installed OMORI extraction (15,244 unique source decisions) and a 289-file semantic round-trip (199 text files and 90 data files) without changing the game.

Run `./scripts/test-workbench.sh` for the maintained automated suite. Public release archives have not been rebuilt as part of this transition.
