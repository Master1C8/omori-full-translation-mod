# User guide

Launch Localization Workbench, then create a project with its published VN Revival game slug, title, adapter, source location, source language, and target language.

The workbench localizes text resources only. Images, textures, video, and any text baked into them stay unchanged; they are outside the reviewed-entry total and the build gate. Here, a completed localization therefore means a completed text localization, not a multimedia localization.

1. Select `Extract / refresh source`. Existing reviewed work is preserved only where both the stable entry identity and source text remain unchanged.
2. Project creation downloads the complete English and target-language glossary for the exact game slug, validates it, and records its fingerprint. There is no editable local glossary. Use `Refresh site glossary` whenever the published terminology changes.
3. Enter an OpenAI-compatible Base URL, store its API key, load or enter a model ID, and select `Draft next 40`. The result is visibly marked `AI draft` and cannot be packaged. Only site-glossary entries relevant to that batch are sent, avoiding repeated transmission of the entire glossary.
4. Review each entry in the workbench, or select `Export for Codex review` and finish the editorial review JSON with Codex. Saving text without approval leaves it in `needs-review`; `Approve final` creates the release-eligible state.
5. When the glossary is synchronized and the reviewed count equals the total, select `Build localization`. The adapter writes a static artifact and the browser downloads it.

For an OMORI project, point the source to the installed application, its `app.nw` directory, or the Windows `www` directory. The output is a OneLoader ZIP containing plaintext text/data patches only. The workbench reads the original encrypted text assets but never changes them; OMORI image localization is not included.

Closing or refreshing the browser does not lose work. Projects and artifacts live in the application data directory. API keys live separately in the operating-system credential vault.
