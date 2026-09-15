# Editorial handoff

OpenAI-compatible models are bulk draft workers, not final editors. Their output belongs only in `draft`.

Editorial review covers extracted text entries only. Localized graphics and text baked into images, textures, or video are outside this application's scope and must not be added to the review bundle or completeness criteria.

The final workflow with Codex is:

1. Synchronize the glossary from VN Revival, then export the project's editorial review bundle. The bundle carries the exact glossary snapshot and fingerprint used for the drafts.
2. Review source, context, draft, glossary, voice, terminology, control codes, length, and cross-entry consistency.
3. Write the selected wording to `final` and mark only genuinely completed entries `reviewed: true`.
4. Import the bundle. Any project mismatch, changed source identity, or newer glossary fingerprint stops the import.
5. Perform full-entry editorial audits before building the localization.

Corrections reset the relevant clean-audit expectation. Structural completeness is not editorial quality.
