# Development map

| Task | Start here | Check |
|---|---|---|
| Project states, merging, review gate | `src/workbench/core.py` | `tests/test_workbench.py` |
| OpenAI-compatible drafts and token safety | `src/workbench/openai_provider.py`, `src/workbench/integrity.py` | `tests/test_workbench.py` |
| VN Revival glossary synchronization | `src/workbench/site_glossary.py`, `src/workbench/core.py` | `tests/test_workbench.py` |
| Source or output formats | `src/workbench/adapters.py` | adapter fixture plus `tests/test_workbench.py` |
| HTTP routes and downloads | `src/workbench_service.py` | `./scripts/test-workbench.sh` |
| Workbench UI | `src/workbench_ui/` | JS syntax plus local smoke |
| macOS / Windows startup | `launcher/` | `./scripts/test-workbench.sh` |
| Release assembly | `scripts/build.sh`, `scripts/build-windows.sh`, `scripts/verify.sh` | explicit release build only |

Legacy runtime-translator sources are not part of the new product and must not be added to release archives.
