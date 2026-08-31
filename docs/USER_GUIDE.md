# OMORI Translator — User Guide / Инструкция

## English

### Starting the mod

1. Close OMORI if it is already running.
2. On Windows, fully extract the ZIP and run `OMORI Translator.exe`. On macOS, open `OMORI Translator.app`.
3. The translator starts OMORI for you. If it cannot find the game, choose the main `OMORI.exe` file when asked.
4. Wait for the translator panel to appear in the top-right corner of the game.

Always start the game through OMORI Translator. The panel cannot appear if OMORI was started normally.

If macOS asks you to locate the game, select the real `OMORI.app` inside the Steam library, not the small `OMORI.app` shortcut on the Desktop. The real app contains `Contents/Resources/app.nw`. Version 0.9.18 and newer reject a saved Steam shortcut and automatically recover the installed Steam copy when possible.

On Apple Silicon, keep Steam open. OMORI may appear briefly and restart automatically in the compatible ARM64 runtime. Gameplay, local saves, and translation work in this mode; achievements, Steam Cloud, and the Steam Overlay do not.

### Main controls

- The `Translation / Original` toggle switches between the saved translation and the original English text.
- In `Screen Translation`, press `Translate current screen (Ctrl+Shift+T)` or use `Ctrl+Shift+T` to translate only text visible at that moment. Press the button or shortcut again while running to cancel the current screen pass. The shortcut is ignored while typing in an input field.
- Optional: enable `Automatically translate completed dialogue` inside Screen Translation to translate each dialogue page once it finishes typing. The option is off by default and does not automatically translate menus.
- All settings remain visible while the panel is expanded.
- The single `− / +` button switches between the complete panel and one `+` button. Every new launch starts expanded.
- Drag the expanded panel by its top bar, or drag the collapsed `+` button itself. Its position is remembered.

### Translation modes

- `Story Translation` is the current stable mode. It deliberately translates only dialogue windows, speaker names, and dialogue choices. Menus and other system screens stay original because this boundary is more reliable and keeps OMORI's presentation consistent.
- `Full Translation` is experimental. It additionally applies the existing cache to non-dialogue RPG Maker and OMORI windows, including the main menu, items, skills, equipment, options, save/load, shops, and battle windows. Switching back to Story refreshes those windows with their original text. Cached item and skill descriptions use the game's word wrapping while preserving intentional lines such as `Cost`. Image-based labels, standalone sprite bitmaps, dynamically assembled text, and strings missing from the selected provider/language cache may remain English. Long translations can still need visual tuning in other narrow windows.
- `Screen Translation` does not extract or scan `.HERO` assets. `Translate current screen` approves the exact DOM and canvas strings in currently visible game windows, including values already substituted into template strings, applies cache hits, translates only the misses, saves them, and redraws that screen. A later window redraw or another screen requires another press. The optional `Automatically translate completed dialogue` setting instead approves only a completed `Window_Message` page after its typewriter output ends; menus still require the button. Image-only labels and standalone sprite bitmaps without a `Window_Base` owner are outside this capture.


### Choosing a translation service and language

First choose `Translation service`, then choose `Language` in the expanded panel. These settings are saved as soon as you change them. There is no separate Save button.

OMORI already contains official English, Japanese, Korean, and Simplified Chinese localizations. Selecting any of these languages shows a notice telling you to enable it in OMORI or Steam and disables every translator control except `Language`. No provider request is made and no cache or imported translation pack is deleted. Choose any other target language to restore the full translator panel.

- `Google Translate` works online. Its quality and speed are average. It usually works fine, but Google may temporarily limit requests.
- `Gemini AI` usually gives the best and fastest contextual translation. It needs an internet connection and your own Gemini API key. Free-tier content may be used by Google to improve its products, and some explicit scenes may still be blocked.
- `LM Studio Local AI` uses an OpenAI-compatible model served by LM Studio on this computer. Quality and speed depend on the selected model; game text is not sent online.
- `OpenAI-compatible AI` connects to OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio, or a custom compatible endpoint. Remote endpoints receive the extracted text; a loopback endpoint stays local.


### Using Gemini AI

1. Select `Gemini AI`.
2. Create your own key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste it into `Gemini API key`.
4. Click `Save API key`.

The field is cleared after saving. The key is stored in Windows Credential Manager or macOS Keychain, not in the game settings or translation cache. Use `Remove key` to delete it.

The same input pipeline is used for every provider. Engine keys such as `DW itemBuyingPromptMessage` and floor labels such as `1F` are skipped. Multiple visible pieces around game controls are first translated together with neutral context separators; the controls themselves are never sent. If a weak model changes a separator, the app discards that attempt and safely retries the isolated text pieces. For Cyrillic targets, a result that retains a substantial part of the English source is also left uncached. The context-aware Google path has a new cache identity. On first launch it removes only the old Google segment variant for the currently selected game and language; imported packs, other languages and other provider caches remain separate.

### Using LM Studio Local AI

1. Open LM Studio and start its local server in the Developer page. The default address is `127.0.0.1:1234`.
2. Load a model, or enable Just-In-Time model loading in LM Studio.
3. Select `LM Studio Local AI` in the translator.
4. Click `Refresh models` and select the model to use.
5. Choose the target language and click `Bulk Translate All Assets`.

The translator does not start or stop LM Studio. Keep the server available until the bulk operation finishes. CORS is not required because the authenticated VN Revival helper communicates with LM Studio locally. Changing the selected model creates a separate cache identity, so translations produced by different local models are not mixed.

### Using OpenAI-compatible AI

1. Select `OpenAI-compatible AI`.
2. Choose the `OpenCode Go`, `OpenCode Zen`, `OpenRouter`, `DeepSeek`, `LM Studio`, or `Custom` preset.
3. For a remote service, paste its API key and click `Save API key`. LM Studio on the local loopback address does not require a key.
4. Click `Refresh models`, then select or type the exact model ID.
5. Choose a language and start a bulk operation.

New OpenCode users can sign up through [our referral link](https://opencode.ai/go?ref=SS6M8DKPP0) and receive $5 in Zen credits. OpenCode Go requires a separate $10/month subscription; without it, use the `OpenCode Zen` preset. The same link appears for both OpenCode presets and opens in the system browser.

The built-in Base URLs are filled automatically. A custom remote URL must use HTTPS; HTTP is accepted only for `localhost` or another loopback address. Each API key is stored per Base URL in Windows Credential Manager or macOS Keychain. The integration supports the OpenAI Chat Completions format (`/models` and `/chat/completions`); Responses-only or Anthropic-Messages-only models are not supported. Changing the URL or model creates a separate translation cache identity.

The OpenAI-compatible panel shows an exact lifetime usage summary for the selected preset and Base URL. It records only token counts and `cost` values actually returned in the provider's `usage` object; it never estimates tokens or multiplies them by a pricing table. Missing fields are shown as `not reported`, not as zero. OpenRouter-reported cost is labelled in credits. Other services show a cost only when they return one, using their returned currency or `provider units` when no currency name is supplied. The append-only `openai-compatible-usage.jsonl` audit log contains timestamp, endpoint scope, model, response ID when available, and usage numbers, but no source or translated text. A response rejected later by markup or quality validation is still counted. `Reset all data` deletes this log.

### Creating and using the translation cache

1. Choose a bulk translation service and target language.
2. Click `Bulk Translate All Assets`.
3. Wait for the counter to complete. For an online service, the button starts sending extracted strings immediately. You can cancel and resume later, and completed entries stay cached.

After an update expands asset extraction, run Bulk once again. Existing cache entries are reused, while only newly discovered or previously failed strings are sent to the selected provider. This is how Full Translation receives structured `System.HERO` labels such as `EQUIP` and `OPTIONS`, YAML block messages such as the picnic save prompt, exact Options/save-load labels from `XX_BLUE.HERO`, and static RPG Maker database text such as `HEART:`, item names, and descriptions; ordinary Full gameplay remains cache-only. Asset index schema 4 rebuilds automatically and does not clear translation entries. On the validated Steam installation, the rebuilt index contains 217 files and 14,753 unique strings; runtime filtering produces 14,587 Bulk jobs, 702 more than schema 3 and up to 2,575 more than the previous 12,012-job plan. Three Base64 ROBOHEART lines, one intentionally Latin SNOW ANGEL quote, one French BUTLER MOLE line, and VEGGIE KID's `Yahoo!` are not provider jobs: Full reuses a cached speaker name when available and leaves each opaque or intentionally foreign payload unchanged.

Full can also reuse a compact database name from repeated translated speaker commands. The alias is accepted only when at least two quality-valid entries from the selected provider and language agree, so the cached `HUSH PUPPY → ТИШЕ, ЩЕНОК` evidence can cover `HUSHPUPPY` without another request. A single, conflicting, or unchanged English result is ignored; imported packs still take priority.

The bulk operation continues if OMORI is minimized or another application becomes active. Google Bulk loads the known cache keys once, then groups only missing translations into protected blocks of at most 12 strings, 16 translatable protected-text segments, and 3200 UTF-8 bytes. The segment limit keeps command-heavy OMORI strings from expanding one request into dozens of context markers. One shared start-time pacer waits a random 1.2–1.8 seconds between fresh requests and also controls internal retries. It raises the base delay toward five seconds only after a complete terminal provider/network-failure block; separator, markup, and content-specific quality failures keep the normal randomized interval and cannot trigger the circuit breaker. Four clean blocks reduce an elevated delay again. Valid strings from one response are committed in one IndexedDB transaction and logged through one helper batch. A terminal singleton and the one quality retry translate visible protected-text segments in isolation without repeating a failed contextual request. Google receives all those pieces as separate `q` parameters in one protocol batch and must return an array of the exact same length, so game controls stay local and one complex line no longer creates several HTTP requests. A final rejection becomes `failed` without stopping later assets; recursive splitting is reserved for multi-string blocks with damaged context separators or protected structure. If Google returns `HTTP 429`, Bulk stops sending requests, displays a 15-minute countdown, and retries the same request without increasing `done` or `failed`; repeated limits extend the persisted cooldown to 30 and 60 minutes. The final status includes the real Google request count and accepted strings per request. Bounded source-free performance records are saved to `translation-performance.jsonl`; exact final-failure source text, rejected candidate, code, and validation detail are kept separately in the local `translation-failures.jsonl`. Run Bulk again to continue from entries still missing from the cache.

The bulk button immediately shows a spinner after it is pressed. Once Bulk or Test Phrase starts, the translation workspace fills the entire application: the protected-text word counter with an estimated time remaining (or an explicit `Rate limited by … · retrying in …` provider cooldown), the live translation log, its `Stop scroll` control, and a pinned `Interrupt translation (progress will be saved)` button remain visible. The interrupt button keeps the spinner and color of the operation that was started. Service controls, update information, cache tools, the other log actions, title bar, and collapse control stay hidden during the operation. Every terminal result keeps its final status and log visible without a spinner. After success the button becomes green and reads `Finish`; after a stopped, interrupted, or incomplete run it reads `Back to translator`. Press that button when you are ready to return to the normal panel. The displayed progress remains word-based, while the estimate uses a sliding completed-entry rate and excludes cache hits, provider preparation, and cooldown waits. This prevents a short cluster of unusually long lines from inflating the whole-run estimate. Import and export buttons remain below the blue bulk button outside this active workspace.

At every startup, the local helper checks the VN Revival update manifest. A dedicated line below the main status remains visible and reports `Checking for updates…`, `Up to date`, an available version with either `translation cache will be kept` or `translation cache rebuild required`, or `Could not check for updates`. When an update is available, up to three short change notes are shown below it. Until their source is configured, the panel displays a clear placeholder. A failed check never prevents the game from starting. Version 0.9.44 only checks and reports; it does not download or install an update.

`Live translation log` opens automatically for every result processed by Bulk or Test Phrase. Starting a new operation clears only this live view, so entries from a previous language, provider, or model are not mixed with the current run. Each entry shows its time, provider and language followed by the English source and translated result; reused results carry a `cache` label. Press `Stop scroll` to keep the currently visible entry fixed while you scroll the list manually. Translation and logging continue in the background and new entries still appear in the list. Press `Resume scroll` to jump back to the newest entries and restore normal automatic following. The live view keeps at most 40 newest entries to avoid slowing down the game. The local helper persists each unique provider/language/source/translation pair across launches, including a cached pair if it was missing from history, without adding duplicates on later runs. Use `View saved` to load the latest 200 entries and `Save file` to export the complete history as JSONL. `Clear view` clears only the panel and keeps the saved history; the full `Reset all data` operation deletes it. Normal cache-only gameplay does not add log entries.

`Test Phrase · All Languages` translates only `Hi, OMORI! Cliff-faced as usual…` into the 26 non-official OMORI languages from the 30-language Stardew Valley catalog on VN Revival. English, Japanese, Korean, and Simplified Chinese are skipped. It keeps running when you switch applications and processes languages one at a time. The free Google endpoint accepts one target language per request, so Google mode waits a random 1.2–1.8 seconds between requests and a full unrestricted run usually takes about 39 seconds plus response time. A temporary `HTTP 429` stops all Google requests for 15 minutes, preserves both the deadline and the next backoff step across restarts, and retries the same language instead of creating a failed result. Repeated limits increase the cooldown to 30 and 60 minutes even after restarting the application. Interrupting keeps completed languages, and the next run skips them.


Do not use a successful large cached translation as proof that Google currently accepts new requests. A language such as Russian may already have thousands of cached entries, while the all-language test still needs one fresh request for every missing language. The status line reports `new`, `cached`, and `failed` separately. A visible retry countdown with `0 failed` means the test is safely waiting; do not repeatedly restart it, because the Google cooldown is intentionally preserved. To continue immediately, select another provider; its results use a separate cache identity.

In Story and Full, cached translations are applied automatically as supported game text is drawn. Screen stays manual unless `Automatically translate completed dialogue` is enabled; then only completed dialogue pages may start a fresh request. Menus still require `Translate current screen` or `Ctrl+Shift+T`.

In Story mode, OMORI canvas hooks display cached translations only in dialogue text, speaker names, and dialogue choices. Full mode adds supported non-dialogue `Window_Base` surfaces. Neither path starts background provider requests. `Original` applies to newly drawn dialogue and menu text.

This is a prebuilt-cache translation, not live per-line machine translation. A cache miss remains in English and does not silently contact a provider. Story keeps system UI original. Experimental Full translates cached text drawn by supported menu and system windows, but it does not cover image labels or standalone sprite bitmaps; dynamically assembled text may not match an extracted cache key, and longer translations can overflow layouts designed for English.

### Cache and contacts

Translations are cached automatically. The settings show the number of saved translations and their size. `Export cache backup` saves the complete provider cache. To use a translation made by someone else, press `Load translation file` and choose its JSONL or legacy JSON cache. The app validates the entire file before writing, verifies that it belongs to OMORI, detects its language and translation provider/model variant, and shows a confirmation dialog. Mixed files let you select one language and one source. Press `Import <language>` to install it or `Cancel` to leave all data unchanged.

An imported translation is a reversible overlay: it is displayed before your own provider cache but never overwrites it. The panel shows the active imported language, entry count, source and filename. `Remove imported` removes only that overlay and immediately reveals your own cached translations again. Importing another file for the same language replaces the previous imported overlay only after the new file has been fully validated and stored.

`Reset all data` returns the translator to a freshly downloaded state. It deletes provider and in-memory caches, imported packs, saved history and logs, leftover files from providers available in older releases, provider API keys, settings, cooldowns, the remembered game path, and internal metadata. It does not modify OMORI files or game saves; the launcher will rediscover the game or ask for it on the next start. After confirmation, the button shows a spinner and `Resetting…` until deletion finishes, then asks you to restart the translator; the button cannot be pressed again while reset is running.

The VN Revival project link opens in your default system browser. At the bottom of the panel, use the icons next to it to open:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Email](mailto:master1c8@proton.me)

### Closing and troubleshooting

Close OMORI normally. The translator and its local helper should exit automatically within a few seconds.

If an old panel appears after rebuilding the mod, close OMORI completely, extract the newly built ZIP into a fresh folder, and run the translator from that folder. Rebuilding does not update a panel that is already injected into a running game.

If the panel does not appear, make sure OMORI was closed before launch and that you started it through OMORI Translator.

If `Test Phrase · All Languages` shows a Google retry countdown, leave it running or cancel it and return later. Version 0.9.22 and newer retry the same language after the cooldown instead of recording a false failure; version 0.9.23 also preserves the increasing 15/30/60-minute backoff across application restarts. A result produced by an older build is not evidence that the current build is broken; close OMORI fully and start the application from the current ZIP before retesting.

---

## Русский

### Запуск мода

1. Закройте OMORI, если игра уже запущена.
2. На Windows полностью распакуйте ZIP и запустите `OMORI Translator.exe`. На macOS откройте `OMORI Translator.app`.
3. Переводчик сам запустит OMORI. Если он не найдёт игру, укажите основной файл `OMORI.exe`.
4. Дождитесь появления панели переводчика в правом верхнем углу игры.

Всегда запускайте игру через OMORI Translator. При обычном запуске OMORI панель появиться не сможет.

Если macOS просит найти игру, выберите настоящую `OMORI.app` внутри библиотеки Steam, а не маленький ярлык `OMORI.app` на рабочем столе. В настоящем приложении есть `Contents/Resources/app.nw`. Версия 0.9.18 и новее отбрасывает сохранённый Steam-ярлык и при возможности автоматически восстанавливает путь к установленной копии.

На Apple Silicon держите Steam открытым. OMORI может кратко появиться и автоматически перезапуститься в совместимом ARM64-движке. Игра, локальные сохранения и перевод в этом режиме работают; достижения, Steam Cloud и Steam Overlay — нет.

### Основное управление

- toggle `Translation / Original` переключает сохранённый перевод и оригинальный английский текст.
- В `Screen Translation` кнопка `Translate current screen (Ctrl+Shift+T)` или комбинация `Ctrl+Shift+T` переводит только текст, видимый в этот момент. Повторное нажатие кнопки или комбинации во время работы отменяет текущий экранный проход. Во время ввода текста комбинация игнорируется.
- Необязательно: включите внутри Screen Translation пункт `Automatically translate completed dialogue`, чтобы каждая страница реплики переводилась после завершения печати. По умолчанию опция выключена и не переводит меню автоматически.
- В развёрнутой панели настройки видны постоянно.
- Единственная кнопка `− / +` переключает полную панель и один плюсик. Каждый новый запуск начинается развёрнутым.
- Развёрнутую панель можно перемещать за верхнюю полоску, а свёрнутую — перетаскиванием самого плюсика. Позиция сохраняется.

### Режимы перевода

- `Story Translation` — текущий стабильный режим. Он намеренно переводит только диалоговые окна, имена говорящих и варианты ответа. Меню и остальные системные экраны остаются оригинальными: такая граница надёжнее и сохраняет целостный внешний вид OMORI.
- `Full Translation` — экспериментальный режим. Он дополнительно применяет существующий кэш к недиалоговым окнам RPG Maker и OMORI: главному меню, предметам, навыкам, экипировке, настройкам, сохранению/загрузке, магазинам и боевым окнам. Возврат в Story перерисовывает эти окна исходным текстом. Готовые описания предметов и навыков используют штатный перенос игры, сохраняя намеренные строки вроде `Cost`. Подписи-картинки, отдельные sprite-bitmap, динамически собранные строки и строки, которых нет в кэше выбранного языка/провайдера, могут остаться английскими. Другие длинные переводы в узких окнах всё ещё могут потребовать визуальной подгонки.
- `Screen Translation` не извлекает и не обходит `.HERO`. Кнопка `Translate current screen` одобряет точные DOM- и canvas-строки только видимых сейчас игровых окон, включая уже подставленные значения строк-шаблонов, применяет cache hit, переводит cache miss, сохраняет результат и перерисовывает этот экран. После новой перерисовки окна или перехода на другой экран кнопку нужно нажать снова. Опция `Automatically translate completed dialogue` вместо этого одобряет только завершившую печать страницу `Window_Message`; меню по-прежнему требуют кнопки. Надписи-картинки и отдельные sprite-bitmap без владельца `Window_Base` в снимок не входят.


### Выбор сервиса и языка

В развёрнутой панели сначала выберите `Translation service`, затем `Language`. Сервис и язык сохраняются сразу после изменения. Отдельной кнопки Save нет.

OMORI уже содержит официальные английскую, японскую, корейскую локализации и упрощённый китайский. При выборе одного из этих языков панель предлагает включить его в самой OMORI или Steam и блокирует все элементы переводчика, кроме поля `Language`. Запрос к провайдеру не выполняется, кэш и импортированный пак не удаляются. Выберите любой другой целевой язык, чтобы вернуть всю панель.

- `Google Translate` работает через интернет. Качество и скорость средние. Обычно сервис работает нормально, но Google может временно ограничить запросы.
- `Gemini AI` обычно даёт самый качественный и быстрый контекстный перевод. Нужны интернет и собственный API-ключ Gemini. На бесплатном тарифе Google может использовать отправленный текст для улучшения продуктов, а отдельные откровенные сцены всё равно могут блокироваться.
- `LM Studio Local AI` использует OpenAI-совместимую модель, которую LM Studio обслуживает локально на этом компьютере. Качество и скорость зависят от модели; игровой текст в интернет не отправляется.
- `OpenAI-compatible AI` подключается к OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio или произвольному совместимому endpoint. Удалённый сервис получает извлечённый текст, а loopback-адрес остаётся локальным.


### Использование Gemini AI

1. Выберите `Gemini AI`.
2. Создайте собственный ключ в [Google AI Studio](https://aistudio.google.com/apikey).
3. Вставьте его в поле `Gemini API key`.
4. Нажмите `Save API key`.

После сохранения поле очищается. Ключ хранится в Windows Credential Manager или macOS Keychain, а не в настройках игры или кэше переводов. Кнопка `Remove key` удаляет ключ.

Одинаковый входной конвейер используется для всех провайдеров. Engine keys вроде `DW itemBuyingPromptMessage` и подписи этажей вроде `1F` пропускаются. Несколько видимых частей вокруг игровых команд сначала переводятся вместе с нейтральными контекстными разделителями; сами команды модели никогда не передаются. Если слабая модель изменит разделитель, попытка отбрасывается и приложение безопасно повторяет перевод отдельных текстовых частей. Для кириллических языков результат с существенной долей исходных английских слов также не попадает в кэш. Контекстный Google-путь имеет отдельную cache identity, поэтому его результаты не смешиваются с прежним посегментным вариантом.

### Использование LM Studio Local AI

1. Откройте LM Studio и запустите локальный сервер в разделе Developer. Стандартный адрес — `127.0.0.1:1234`.
2. Загрузите модель или включите Just-In-Time model loading в LM Studio.
3. Выберите в переводчике `LM Studio Local AI`.
4. Нажмите `Refresh models` и выберите модель.
5. Выберите целевой язык и нажмите `Bulk Translate All Assets`.

Переводчик не запускает и не останавливает LM Studio. Сервер должен оставаться доступным до окончания массового перевода. CORS не требуется: с LM Studio общается авторизованный локальный helper. Для каждой выбранной модели используется отдельная cache identity.

### Использование OpenAI-compatible AI

1. Выберите `OpenAI-compatible AI`.
2. Выберите профиль `OpenCode Go`, `OpenCode Zen`, `OpenRouter`, `DeepSeek`, `LM Studio` или `Custom`.
3. Для удалённого сервиса вставьте API-ключ и нажмите `Save API key`. Локальный LM Studio на loopback-адресе не требует ключа.
4. Нажмите `Refresh models`, затем выберите или введите точный ID модели.
5. Выберите язык и запустите массовый перевод.

Новые пользователи OpenCode могут зарегистрироваться по [нашей реферальной ссылке](https://opencode.ai/go?ref=SS6M8DKPP0) и получить $5 на баланс Zen. OpenCode Go требует отдельную подписку $10/месяц; без неё используйте профиль `OpenCode Zen`. Эта же ссылка показывается для обоих профилей OpenCode и открывается в системном браузере.

Встроенные Base URL подставляются автоматически. Произвольный удалённый URL обязан использовать HTTPS; HTTP разрешён только для `localhost` и других loopback-адресов. Каждый ключ хранится отдельно по Base URL в Windows Credential Manager или macOS Keychain. Интеграция поддерживает формат OpenAI Chat Completions (`/models` и `/chat/completions`); модели только для Responses API или Anthropic Messages API не поддерживаются. Смена URL или модели создаёт отдельную область кэша перевода.

В панели OpenAI-compatible показывается точная накопленная статистика выбранных preset и Base URL. Переводчик фиксирует только token counts и `cost`, которые подрядчик действительно вернул в объекте `usage`: токены не оцениваются, а цены не умножаются по локальной таблице. Отсутствующее поле показывается как `not reported`, а не как ноль. Стоимость OpenRouter помечается как credits; для других сервисов она появляется только при наличии в ответе и использует возвращённую currency либо подпись `provider units`, если название единицы не передано. Аудит-журнал `openai-compatible-usage.jsonl` содержит время, scope endpoint, модель, response ID при наличии и usage-числа, но не исходный или переведённый текст. Ответ, позднее отклонённый проверкой разметки или качества, всё равно учитывается. `Reset all data` удаляет журнал.

### Создание и использование кэша переводов

1. Выберите сервис массового перевода и целевой язык.
2. Нажмите `Bulk Translate All Assets`.
3. Дождитесь завершения счётчика. Для онлайн-сервиса кнопка сразу начинает отправлять извлечённые строки. Операцию можно прервать кнопкой `Interrupt translation (progress will be saved)` и продолжить позже: готовые записи останутся в кэше.

После обновления, расширяющего извлечение ассетов, один раз снова запустите Bulk. Готовые записи будут взяты из кэша, а выбранному провайдеру отправятся только новые или ранее неудавшиеся строки. Так Full Translation получает структурированные подписи `System.HERO` вроде `EQUIP` и `OPTIONS`, YAML-блоки вроде сообщения корзинки для пикника, точные поля Options/save-load из `XX_BLUE.HERO`, а также статический текст RPG Maker-баз: `HEART:`, названия и описания предметов; во время обычной игры Full по-прежнему работает только с кэшем. Asset index schema 4 перестраивается автоматически и не очищает переводы. На проверенной Steam-установке новый индекс содержит 217 файлов и 14 753 уникальные строки; runtime-фильтр формирует 14 587 Bulk jobs — на 702 больше schema 3 и до 2 575 новых по сравнению с прежним планом из 12 012 jobs. Три Base64-реплики ROBOHEART, намеренно латинская цитата SNOW ANGEL, французская реплика BUTLER MOLE и возглас `Yahoo!` VEGGIE KID провайдеру не отправляются: Full берёт из кэша имя говорящего, если оно уже есть, и оставляет непрозрачную либо намеренно иноязычную часть без изменений.

Full также может переиспользовать слитное database-имя из повторяющихся переведённых speaker-команд. Alias принимается, только когда минимум две quality-valid записи выбранного provider/language совпадают: поэтому готовые свидетельства `HUSH PUPPY → ТИШЕ, ЩЕНОК` покрывают `HUSHPUPPY` без нового запроса. Одиночный, конфликтующий или неизменённый английский результат игнорируется; импортированный pack сохраняет приоритет.

Массовая операция продолжается, если OMORI свёрнута или активно другое приложение. Google Bulk один раз загружает известные ключи кэша, затем объединяет только отсутствующие переводы в защищённые блоки максимум по 12 строк, 16 переводимым сегментам и 3200 UTF-8 байт. Лимит сегментов не позволяет насыщенным командами OMORI строкам превращать один запрос в десятки контекстных маркеров. Единый pacer выдерживает случайный интервал 1,2–1,8 секунды между свежими запросами и регулирует также внутренние retry. Базовая задержка увеличивается до 5 секунд только после полностью терминального provider/network-failure блока; separator/markup и quality-ошибки сохраняют обычный случайный интервал и не включают circuit breaker. Четыре чистых блока снова уменьшают повышенную задержку. Принятые строки одного ответа записываются общей IndexedDB-транзакцией и одним пакетным запросом к helper. Терминальная одиночная строка и единственный quality-retry переводят видимые сегменты изолированно, не повторяя неудачный контекстный запрос. Google получает все части отдельными параметрами `q` одного протокольного batch и обязан вернуть массив той же длины: игровые команды остаются локально, а сложная строка больше не создаёт несколько HTTP-запросов. Окончательный отказ получает `failed` и не останавливает оставшиеся ассеты; рекурсивное деление применяется только к многострочным блокам с повреждёнными контекстными разделителями или защищённой структурой. При `HTTP 429` Bulk прекращает запросы, показывает 15-минутный обратный отсчёт и повторяет тот же запрос без увеличения `done` или `failed`; повторные ограничения продлевают сохраняемый cooldown до 30 и 60 минут. Итоговый статус показывает реальное число Google-запросов и среднее количество принятых строк на запрос. Ограниченные обезличенные метрики сохраняются в `translation-performance.jsonl`, а точный исходник, отклонённый кандидат, код и конкретная проверка окончательного отказа — отдельно в локальном `translation-failures.jsonl`. Повторный запуск продолжит заполнение отсутствующих записей кэша.

Сразу после нажатия кнопка массового перевода показывает вращающийся индикатор. После запуска Bulk или Test Phrase рабочая область занимает всё окно приложения: остаются счётчик обработанных слов с расчётным оставшимся временем (либо явный статус `Rate limited by … · retrying in …` с обратным отсчётом паузы провайдера), живой журнал, его фиксатор `Stop scroll` и закреплённая кнопка `Interrupt translation (progress will be saved)`. Она сохраняет spinner и цвет запустившей операцию кнопки. Настройки сервисов, обновления, инструменты кэша, остальные действия журнала, заголовок и сворачивание скрыты во время операции. Любой итог оставляет статус и журнал на экране уже без spinner. После успеха нижняя кнопка становится зелёной `Finish`; после остановки, ручного прерывания или неполного результата она называется `Back to translator`. Нажатие этой кнопки возвращает обычную панель. Отображаемый прогресс считается в словах, а ETA — по скользящей скорости только новых переводов, созданных текущей операцией, без cache hit, подготовки провайдера и ожидания cooldown. Попадание в кэш лишь уменьшает число оставшихся jobs. Вне активной операции импорт и экспорт находятся под синей кнопкой.

При каждом запуске локальный helper проверяет манифест обновлений VN Revival. Отдельная постоянная строка под основным статусом показывает `Checking for updates…`, актуальную версию, найденную версию с пояснением `translation cache will be kept`/`translation cache rebuild required` либо `Could not check for updates`. Для найденного обновления ниже выводятся до трёх коротких изменений. Пока их источник не настроен, панель показывает явную заглушку. Неудачная проверка никогда не мешает запуску игры. Версия 0.9.44 только проверяет и сообщает результат — она ещё ничего не скачивает и не устанавливает.

`Live translation log` автоматически раскрывается для каждого результата, обработанного Bulk или Test Phrase. При старте нового прохода очищается только живая область, поэтому записи прежнего языка, провайдера или модели не смешиваются с текущими. Каждая запись показывает время, сервис и язык, затем исходную английскую строку и готовый результат; повторно использованный результат отмечается словом `cache`. Нажмите `Stop scroll`, чтобы зафиксировать текущую видимую запись и свободно листать список вручную. Перевод и журнал продолжают работать, новые пары по-прежнему добавляются. Нажмите `Resume scroll`, чтобы перейти к новейшим строкам и вернуть обычное автоследование. Обычно живой список хранит 40 последних пар; во время Stop он временно удерживает ещё до 40 строк вокруг просматриваемой позиции и снова сокращается после Resume. Локальный helper сохраняет между запусками каждую уникальную пару provider/language/source/translation, включая отсутствовавшую в истории кэш-пару, но не создаёт дубли при следующих проходах. `View saved` загружает последние 200 записей, `Save file` сохраняет полный журнал в JSONL. `Clear view` очищает только панель и оставляет сохранённую историю; полный `Reset all data` удаляет и её. Обычное воспроизведение готовых реплик из кэша журналом не засоряется.

Кнопка `Test Phrase · All Languages` переводит только реплику `Hi, OMORI! Cliff-faced as usual…` в 26 неофициальных для OMORI языков из 30-язычного каталога Stardew Valley на VN Revival. Английский, японский, корейский и упрощённый китайский пропускаются. Управляющие коды OMORI не отправляются провайдеру, готовые языки пропускаются, а повторное нажатие продолжает отсутствующие. Тест продолжает работу при переключении в другое приложение и обрабатывает языки по одному. Бесплатный Google endpoint принимает один целевой язык за запрос, поэтому Google-режим выдерживает случайный интервал 1,2–1,8 секунды, а полный проход без ограничений обычно занимает около 39 секунд плюс время ответов. При `HTTP 429` Google-запросы полностью прекращаются на 15 минут, срок и следующая ступень паузы сохраняются между запусками, затем повторяется тот же язык. Повторные ограничения увеличивают паузу до 30 и 60 минут даже после перезапуска приложения. После завершения оставайтесь на этой реплике и переключайте язык для ручной проверки Canvas.


Успешный большой перевод из кэша не означает, что Google прямо сейчас принимает новые запросы. Например, для русского языка в кэше уже могут находиться тысячи строк, тогда как тесту всё равно нужен отдельный свежий запрос для каждого отсутствующего языка. Строка состояния отдельно показывает `new`, `cached` и `failed`. Обратный отсчёт при `0 failed` означает безопасное ожидание, а не поломку. Не нужно многократно перезапускать тест: срок Google-паузы специально сохраняется. Если продолжить необходимо сразу, выберите другой сервис; его результаты будут храниться в отдельной области кэша.

В Story и Full готовые переводы из кэша применяются автоматически при отрисовке поддерживаемого игрового текста. Screen остаётся ручным, пока не включена опция `Automatically translate completed dialogue`; с ней свежий запрос может запустить только завершившаяся страница реплики. Меню по-прежнему требуют `Translate current screen` или `Ctrl+Shift+T`.

После смены языка дождитесь сообщения `Ready: … cache loaded`. Мод перерисует уже открытую реплику — включая завершённую страницу, ожидающую нажатия — и варианты ответа, поэтому перезапуск игры не требуется.

Если страница уже полностью показана и ожидает нажатия, мод рисует готовый перевод непосредственно в Canvas, сохраняя нормальное действие следующего нажатия `OK`.

Для китайского, японского и корейского Canvas-диалога мод регистрирует CJK-шрифт, уже поставляемый вместе с OMORI, а затем использует системные CJK-шрифты как дополнительные fallback-варианты.

В Story canvas-хуки OMORI показывают готовый перевод только в репликах, именах говорящих и вариантах ответа. Full добавляет поддерживаемые недиалоговые окна `Window_Base`. Ни один из этих путей не запускает фоновые запросы к провайдеру. Режим `Original` распространяется и на заново отрисованный текст диалогов и меню.

Это перевод из заранее построенного кэша, а не машинный перевод каждой строки во время игры. При отсутствии записи в кэше строка остаётся английской, и мод не обращается к провайдеру скрытно. В Story переводятся только реплики, имена говорящих и варианты ответа. В экспериментальном Full тот же кэш применяется также к поддерживаемым системным окнам; изображения и неподдерживаемые sprite-bitmap могут остаться оригинальными.

### Кэш и контакты

Переводы кэшируются автоматически. В настройках показываются количество сохранённых переводов и их размер. `Export cache backup` сохраняет полную резервную копию provider-кэша. Чтобы использовать перевод другого человека, нажмите `Load translation file` и выберите его JSONL- или прежний JSON-кэш. Приложение проверит весь файл до записи, подтвердит принадлежность OMORI, определит язык и provider/model variant и покажет отдельную модалку. Если файл смешанный, в ней можно выбрать один язык и один источник. Нажмите `Import <язык>` для установки либо `Cancel`, чтобы ничего не менять.

Импортированный перевод работает как обратимый слой: показывается раньше собственного provider-кэша, но никогда его не перезаписывает. Панель показывает активный язык, число записей, источник и имя файла. `Remove imported` удаляет только этот слой и сразу возвращает собственные сохранённые переводы. Новый файл того же языка заменяет прежний импортированный слой лишь после полной проверки и успешной записи.

Перед обращением к любому сервису мод отделяет разметку OMORI от переводимого текста. К защищённым токенам относятся команды с обратной косой чертой (`\aub`, `\art`, `\ber`, `\sxbf`, `\itemget`, `\!`, `\N[1]`, `\n<NAME>`), экранированные кавычки (`\"`), теги (`<WordWrap>`, `<br>`), квадратные метаданные (`[TRASH]`) и внутренние контекстные разделители. Все модели получают только обычные текстовые участки; мод вставляет ответы между точными исходными токенами и проверяет собранную строку. Поэтому даже слабая модель не может изменить, удалить или переставить служебную разметку.


`Reset all data` возвращает переводчик к состоянию новой загрузки: удаляет provider- и RAM-кэши, импортированные паки, сохранённую историю и логи, оставшиеся файлы провайдеров из прежних версий, API-ключи, настройки, cooldown, запомненный путь игры и служебные метаданные. Файлы и сохранения OMORI не изменяются; при следующем старте лаунчер снова найдёт игру или попросит выбрать её. После подтверждения кнопка показывает `Resetting…` до завершения удаления, затем просит перезапустить переводчик; во время операции повторное нажатие недоступно.

Ссылка VN Revival открывает сайт проекта в системном браузере. Рядом находятся иконки:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Почта](mailto:master1c8@proton.me)

### Закрытие и решение проблем

Закройте OMORI обычным способом. Переводчик и его локальный помощник должны автоматически завершиться через несколько секунд.

Если после пересборки показывается старая панель, полностью закройте OMORI, распакуйте новый ZIP в отдельную папку и запустите переводчик из неё. Пересборка не обновляет панель, уже внедрённую в работающую игру.

Если панель не появилась, убедитесь, что OMORI была закрыта перед запуском и что игра запущена через OMORI Translator.

Если `Test Phrase · All Languages` показывает обратный отсчёт Google, оставьте тест работать либо отмените его и вернитесь позднее. Начиная с версии 0.9.22 после паузы повторяется тот же язык, ложный `failed` не записывается; версия 0.9.23 также сохраняет нарастающую паузу 15/30/60 минут между перезапусками приложения. Перед повторной проверкой полностью закройте OMORI и запустите приложение из актуального ZIP: пересборка не заменяет код, уже внедрённый в работающее окно игры.
