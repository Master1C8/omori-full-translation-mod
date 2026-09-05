# Карта разработки

Этот файл — короткая точка входа для локальных изменений. Полное устройство
продукта описано в `ARCHITECTURE.md`, пользовательское поведение — в
`USER_GUIDE.md`, а результаты релизной проверки — в `QA_REPORT.md`.

| Задача | Читать и менять сначала | Быстрая проверка |
|---|---|---|
| Разметка, кнопки и CSS панели | `src/runtime-panel.js`, затем нужный controller-код в `src/translator-runtime.js` | `./scripts/test-runtime.sh` |
| Spinner, disabled/busy-состояния | `src/runtime-ui.js` | `./scripts/test-runtime.sh` |
| Слова, ETA, cooldown-текст | `src/runtime-progress.js` | `./scripts/test-runtime.sh` |
| Ключи кеша и защита разметки | `src/translation-core.js`, соответствующий участок `src/translator-runtime.js` | `./scripts/test-runtime.sh` |
| Импорт translation pack | участок import/pack в `src/translator-runtime.js` | `./scripts/test-runtime.sh` |
| Bulk и Test Phrase | участки Bulk/rate-limit в `src/translator-runtime.js`, `src/providers.js` | `./scripts/test-runtime.sh` |
| DOM/canvas OMORI | `src/games/omori/adapter.js`, runtime hooks | `./scripts/test-runtime.sh` |
| Realtime DOM-прототип CoC2 | `src/games/coc2/game.json`, `src/games/coc2/adapter.js`, capability gates runtime/helper | `./scripts/test-coc2.sh` |
| Новый игровой bundle | `scripts/build-game-bundle.sh`, `scripts/generate-game-config.py`, adapter manifest | game-specific test script |
| URL и поля helper API | `src/local_router.py` | `./scripts/test-service.sh` |
| Gemini / LM Studio / OpenAI-compatible | соответствующий provider-участок `src/local_service.py` | `./scripts/test-service.sh` |
| Поиск ассетов `.HERO`, персонажи и глоссарий | asset-index/extraction в `src/local_service.py`, `src/omori-localization-profile.json` | `./scripts/test-service.sh` |
| macOS/Windows запуск | `launcher/`, `src/controller/`, `game.json` | `./scripts/test-omori.sh` |
| Сборка и архивы | `scripts/build*.sh`, `scripts/verify.sh` | `./scripts/test-omori.sh` |

## Производные файлы

`src/languages.js`, `.build/`, собранное приложение и ZIP-архивы являются
производными или релизными артефактами. Не загружайте и не меняйте их для
обычной задачи, если она не относится к генерации языков либо сборке.

## Граница полной проверки

Быстрые сценарии предназначены для локального цикла разработки. Полная
`./scripts/test-omori.sh` обязательна после изменения нескольких слоёв,
лаунчеров, сборки, манифеста или перед распространением релиза.
