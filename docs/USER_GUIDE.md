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
- All settings remain visible while the panel is expanded.
- The single `− / +` button switches between the complete panel and one `+` button. Every new launch starts expanded.
- Drag the expanded panel by its top bar, or drag the collapsed `+` button itself. Its position is remembered.

### Choosing a translation service and language

First choose `Translation service`, then choose `Language` in the expanded panel. These settings are saved as soon as you change them. There is no separate Save button.

- `Google Translate` works online. Its quality and speed are average. It usually works fine, but Google may temporarily limit requests.
- `Gemini AI` usually gives the best and fastest contextual translation. It needs an internet connection and your own Gemini API key. Free-tier content may be used by Google to improve its products, and some explicit scenes may still be blocked.
- `MyMemory` is a fast online service, but its quality can be poor. The mod lists 249 language codes, but MyMemory does not guarantee machine translation for every pair.
- `Argos Offline` runs on your computer and does not send game text online. It is slower, its quality is lower, and it supports fewer languages. Internet is needed to install the engine or a language model; translation works offline after installation.
- `Bergamot Offline` runs a bundled BrowserMT WebAssembly engine with seven compact TranslateLocally models. It is fast and private, but language coverage is deliberately small.
- `CTranslate2 + OPUS-MT` downloads an official Helsinki-NLP model and converts it to an optimized local INT8 model. The first conversion can take several minutes and use substantial disk space.
- `LM Studio Local AI` uses an OpenAI-compatible model served by LM Studio on this computer. Quality and speed depend on the selected model; game text is not sent online.
- `OpenAI-compatible AI` connects to OpenCode Go, OpenRouter, DeepSeek, LM Studio, or a custom compatible endpoint. Remote endpoints receive the extracted text; a loopback endpoint stays local.

`Bulk Translate All Assets` sends all extracted `.HERO` dialogue strings to the selected remote provider after explicit confirmation. The first Bulk stores the extracted source catalogue in a separate local asset index. Later Bulk and Super Bulk runs reuse it immediately; adding, removing, resizing, or changing the modification time of a `.HERO` file rebuilds the index automatically. A missing or damaged index is also rebuilt, without affecting translations, models, saves, keys, or the translation log. Normal gameplay uses only the resulting translation cache and does not send visible text to a provider. Argos, Bergamot, CTranslate2, LM Studio, and loopback OpenAI-compatible endpoints process the bulk set locally.

### Using Gemini AI

1. Select `Gemini AI`.
2. Create your own key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste it into `Gemini API key`.
4. Click `Save API key`.

The field is cleared after saving. The key is stored in Windows Credential Manager or macOS Keychain, not in the game settings or translation cache. Use `Remove key` to delete it.

### Using Argos Offline

1. Select `Argos Offline`.
2. Choose a supported language.
3. Click `Install Argos and model` or `Download model`.
4. Wait until the status says that offline translation is ready.

The first installation may take several minutes. A language model usually needs about 80–250 MB. Use `Remove model` if you no longer need the selected model. Bulk sends independently protected strings through the sequential Argos path. Live-log measurements showed that grouping strings into CTranslate2 batches was slower with the unchanged beam size `4`, so the normal provider returned to one request at a time and a measured conservative cap of four CPU threads. Existing cache entries remain compatible.

### Using Bergamot or CTranslate2 + OPUS-MT

1. Select `Bergamot Offline` or `CTranslate2 + OPUS-MT`.
2. Choose a language offered by that engine.
3. Click `Download model`, `Install CTranslate2 + OPUS-MT and model`, or `Download and convert model`.
4. Keep the application open until the status says that offline translation is ready.

Bergamot bundles its WASM engine; only the selected checksum-pinned model is downloaded. CTranslate2 is bundled in the Windows archive and installed into the local offline runtime on macOS when needed. OPUS-MT archives come from the official Helsinki-NLP catalog and are converted on this computer. `Remove model` removes only the selected engine's model. No model is downloaded during ordinary gameplay.

### Using LM Studio Local AI

1. Open LM Studio and start its local server in the Developer page. The default address is `127.0.0.1:1234`.
2. Load a model, or enable Just-In-Time model loading in LM Studio.
3. Select `LM Studio Local AI` in the translator.
4. Click `Refresh models` and select the model to use.
5. Choose the target language and click `Bulk Translate All Assets`.

The translator does not start or stop LM Studio. Keep the server available until the bulk operation finishes. CORS is not required because the authenticated VN Revival helper communicates with LM Studio locally. Changing the selected model creates a separate cache identity, so translations produced by different local models are not mixed.

### Using OpenAI-compatible AI

1. Select `OpenAI-compatible AI`.
2. Choose the `OpenCode Go`, `OpenRouter`, `DeepSeek`, `LM Studio`, or `Custom` preset.
3. For a remote service, paste its API key and click `Save API key`. LM Studio on the local loopback address does not require a key.
4. Click `Refresh models`, then select or type the exact model ID.
5. Choose a language and start a bulk operation.

New OpenCode Go users can sign up through [our referral link](https://opencode.ai/go?ref=SS6M8DKPP0) and receive $5 in credits. The same link appears in the OpenCode Go settings panel and opens in the system browser.

The built-in Base URLs are filled automatically. A custom remote URL must use HTTPS; HTTP is accepted only for `localhost` or another loopback address. Each API key is stored per Base URL in Windows Credential Manager or macOS Keychain. The integration supports the OpenAI Chat Completions format (`/models` and `/chat/completions`); Responses-only or Anthropic-Messages-only models are not supported. Changing the URL or model creates a separate translation cache identity.

### Creating and using the full cache

1. Choose a bulk translation service and target language.
2. Click `Bulk Translate All Assets`.
3. For an online service, review the notice and click `Allow bulk upload`, then click the bulk button again.
4. Wait for the counter to complete. You can cancel and resume later; completed entries stay cached.

The bulk operation continues if OMORI is minimized or another application becomes active. Google Bulk sends one fresh request every 5 seconds. If Google returns `HTTP 429`, Bulk stops sending requests, displays a 15-minute countdown, and retries the same string without increasing `done` or `failed`; repeated limits extend the persisted cooldown to 30 and 60 minutes. The progress line also shows its live failed count. Other terminal errors are summarized when the run ends. Run it again to continue from entries missing from the cache.

The bulk button immediately shows a spinner after it is pressed. Once Bulk, Super Bulk, or Test Phrase starts, the translation workspace fills the entire application: only the protected-text word counter with an estimated time remaining (or a provider cooldown countdown), the live translation log, and the button that started the operation—now acting as Cancel—remain visible. Service controls, update information, cache tools, log toolbar, title bar, and collapse control stay hidden until the operation finishes or is cancelled. The log uses all remaining space and the normal panel is restored automatically afterward. The displayed progress remains word-based, while the estimate uses a sliding completed-entry rate and excludes model startup, model installation, and provider cooldown waits. This prevents a short cluster of unusually long lines from inflating the whole-run estimate. Import and export buttons remain below the blue bulk button outside this active workspace.

At every startup, the local helper checks the VN Revival update manifest. A dedicated line below the main status remains visible and reports `Checking for updates…`, `Up to date`, an available version with either `translation cache will be kept` or `translation cache rebuild required`, or `Could not check for updates`. When an update is available, up to three short change notes are shown below it. Until their source is configured, the panel displays a clear placeholder. A failed check never prevents the game from starting. Version 0.9.38 only checks and reports; it does not download or install an update.

`Live translation log` opens automatically for every result processed by Bulk, Super Bulk, or Test Phrase. Each entry shows its time, provider and language followed by the English source and translated result; reused results carry a `cache` label. This makes the log move immediately when a resumed operation begins with cached entries. The live view keeps at most 40 newest entries to avoid slowing down the game. The local helper persists each unique provider/language/source/translation pair across launches, including a cached pair if it was missing from history, without adding duplicates on later runs. Use `View saved` to load the latest 200 entries and `Save file` to export the complete history as JSONL. `Clear view` clears only the panel; it does not delete the saved history, and neither does `Reset all data`. Normal cache-only gameplay does not add log entries.

### Super Bulk Translation

The purple `Super Bulk Translation · 17 languages` button translates the extracted assets into this fixed order: Spanish (`es`), German (`de`), Polish (`pl`), Vietnamese (`vi`), Russian (`ru`), Arabic (`ar`), Persian (`fa`), Hebrew (`iw`), Chinese Simplified (`zh-CN`), Chinese Traditional (`zh-TW`), Japanese (`ja`), Korean (`ko`), Hindi (`hi`), Bengali (`bn`), Thai (`th`), Myanmar (`my`), and Georgian (`ka`). Languages are processed one at a time with the currently selected service and, for LM Studio, the currently selected model.

Confirm the operation, keep the provider available, and expect a full run to take hours. The button becomes `Cancel Super Bulk`; cancelling keeps all completed cache entries. Press it again later to resume from missing entries. Online providers use the same bulk-upload consent as the normal bulk operation. Argos, Bergamot, and CTranslate2 are unavailable for Super Bulk because their model catalogues do not guarantee all 17 languages.

`Test Phrase · All Languages` translates only `Hi, OMORI! Cliff-faced as usual…` into every language available through the selected service. It keeps running when you switch applications and processes languages one at a time. The free Google endpoint accepts one target language per request, so Google mode sends one request every 5 seconds and a full unrestricted run takes about 20 minutes. A temporary `HTTP 429` stops all Google requests for 15 minutes, preserves both the deadline and the next backoff step across restarts, and retries the same language instead of creating a failed result. Repeated limits increase the cooldown to 30 and 60 minutes even after restarting the application. Cancelling keeps completed languages, and the next run skips them.

With Argos, Bergamot, or CTranslate2 + OPUS-MT, the test automatically prepares the engine and each missing English → target model before translating an uncached language. Cached languages are skipped without installing their models. The confirmation warns that the run can download several gigabytes, take a long time, and retain installed models on disk. Normal one-language Bulk still requires only the selected model.

Do not use a successful large cached translation as proof that Google currently accepts new requests. A language such as Russian may already have thousands of cached entries, while the all-language test still needs one fresh request for every missing language. The status line reports `new`, `cached`, and `failed` separately. A visible retry countdown with `0 failed` means the test is safely waiting; do not repeatedly restart it, because the Google cooldown is intentionally preserved. To continue immediately, select another provider; its results use a separate cache identity.

Cached translations are always applied automatically as new dialogue appears. There is no separate apply button or auto-apply setting, and normal gameplay does not send text over the network.

OMORI canvas hooks display cached translations only in dialogue text, speaker names, and dialogue choices. They never start background provider requests. `Original` also applies to newly drawn dialogue text.

This is a prebuilt-cache translation, not live per-line machine translation. A cache miss remains in English and does not silently contact a provider. For every target language, all system UI stays original: the title screen, `SAVE/LOAD`, `YES/NO` confirmations, equipment, skills, settings, and descriptions are not translated. Only dialogue text, speaker names, and choices inside conversations are translated.

### Cache and contacts

Translations are cached automatically. The settings show the number of saved translations and their size. `Import cache` and `Export cache` transfer the cache between installations.

After you confirm `Reset all data`, its button shows a spinner and `Resetting…` until cache deletion and the settings reset have finished. The button cannot be pressed again while the reset is running.

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
- В развёрнутой панели настройки видны постоянно.
- Единственная кнопка `− / +` переключает полную панель и один плюсик. Каждый новый запуск начинается развёрнутым.
- Развёрнутую панель можно перемещать за верхнюю полоску, а свёрнутую — перетаскиванием самого плюсика. Позиция сохраняется.

### Выбор сервиса и языка

В развёрнутой панели сначала выберите `Translation service`, затем `Language`. Сервис и язык сохраняются сразу после изменения. Отдельной кнопки Save нет.

- `Google Translate` работает через интернет. Качество и скорость средние. Обычно сервис работает нормально, но Google может временно ограничить запросы.
- `Gemini AI` обычно даёт самый качественный и быстрый контекстный перевод. Нужны интернет и собственный API-ключ Gemini. На бесплатном тарифе Google может использовать отправленный текст для улучшения продуктов, а отдельные откровенные сцены всё равно могут блокироваться.
- `MyMemory` — быстрый онлайн-сервис, но качество может быть низким. Мод показывает 249 языковых кодов, однако MyMemory не гарантирует машинный перевод для каждой пары.
- `Argos Offline` работает на компьютере и не отправляет игровой текст в интернет. Он медленнее, качество ниже, а языков доступно меньше. Для установки движка или языковой модели нужен интернет; после установки перевод работает офлайн.
- `Bergamot Offline` использует комплектный WebAssembly-движок BrowserMT и семь компактных моделей TranslateLocally. Он быстрый и приватный, но поддерживает мало языков.
- `CTranslate2 + OPUS-MT` скачивает официальную модель Helsinki-NLP и преобразует её в оптимизированный локальный INT8-формат. Первая конвертация может занять несколько минут и потребовать заметного места на диске.
- `LM Studio Local AI` использует OpenAI-совместимую модель, которую LM Studio обслуживает локально на этом компьютере. Качество и скорость зависят от модели; игровой текст в интернет не отправляется.
- `OpenAI-compatible AI` подключается к OpenCode Go, OpenRouter, DeepSeek, LM Studio или произвольному совместимому endpoint. Удалённый сервис получает извлечённый текст, а loopback-адрес остаётся локальным.

Кнопка `Bulk Translate All Assets` после явного подтверждения отправляет выбранному удалённому провайдеру все извлечённые строки диалогов `.HERO`. Первый Bulk сохраняет извлечённый исходный каталог в отдельный локальный asset index. Следующие Bulk и Super Bulk используют его сразу; добавление/удаление `.HERO`, изменение размера или времени модификации автоматически перестраивает индекс. Отсутствующий или повреждённый индекс также перестраивается, не затрагивая переводы, модели, сохранения, ключи и журнал. Обычный игровой процесс использует только созданный translation cache и не отправляет видимый текст провайдеру. Argos, Bergamot, CTranslate2, LM Studio и OpenAI-compatible endpoint на loopback-адресе обрабатывают массовый набор локально.

### Использование Gemini AI

1. Выберите `Gemini AI`.
2. Создайте собственный ключ в [Google AI Studio](https://aistudio.google.com/apikey).
3. Вставьте его в поле `Gemini API key`.
4. Нажмите `Save API key`.

После сохранения поле очищается. Ключ хранится в Windows Credential Manager или macOS Keychain, а не в настройках игры или кэше переводов. Кнопка `Remove key` удаляет ключ.

### Использование OpenAI-compatible AI

1. Выберите `OpenAI-compatible AI`.
2. Выберите профиль `OpenCode Go`, `OpenRouter`, `DeepSeek`, `LM Studio` или `Custom`.
3. Для удалённого сервиса вставьте API-ключ и нажмите `Save API key`. Локальный LM Studio на loopback-адресе не требует ключа.
4. Нажмите `Refresh models`, затем выберите или введите точный ID модели.
5. Выберите язык и запустите массовый перевод.

Новые пользователи OpenCode Go могут зарегистрироваться по [нашей реферальной ссылке](https://opencode.ai/go?ref=SS6M8DKPP0) и получить $5 на баланс. Эта же ссылка показывается в настройках OpenCode Go и открывается в системном браузере.

Встроенные Base URL подставляются автоматически. Произвольный удалённый URL обязан использовать HTTPS; HTTP разрешён только для `localhost` и других loopback-адресов. Каждый ключ хранится отдельно по Base URL в Windows Credential Manager или macOS Keychain. Интеграция поддерживает формат OpenAI Chat Completions (`/models` и `/chat/completions`); модели только для Responses API или Anthropic Messages API не поддерживаются. Смена URL или модели создаёт отдельную область кэша перевода.

### Использование Argos Offline

1. Выберите `Argos Offline`.
2. Выберите поддерживаемый язык.
3. Нажмите `Install Argos and model` или `Download model`.
4. Дождитесь сообщения о готовности офлайн-перевода.

Первая установка может занять несколько минут. Языковая модель обычно занимает около 80–250 МБ. Кнопка `Remove model` удаляет выбранную модель. Bulk передаёт независимо защищённые строки последовательному пути Argos. Измерения живого журнала показали, что группировка строк в CTranslate2 batch при неизменном beam size `4` работает медленнее, поэтому штатный provider снова делает по одному запросу и использует проверенный консервативный предел в четыре CPU-потока. Существующий кэш остаётся совместимым.

### Использование Bergamot и CTranslate2 + OPUS-MT

1. Выберите `Bergamot Offline` или `CTranslate2 + OPUS-MT`.
2. Выберите язык из каталога движка.
3. Нажмите `Download model`, `Install CTranslate2 + OPUS-MT and model` или `Download and convert model`.
4. Не закрывайте приложение, пока статус не сообщит о готовности офлайн-перевода.

Движок Bergamot WASM уже входит в приложение; скачивается только выбранная модель с закреплённой контрольной суммой. CTranslate2 входит в Windows-архив, а на macOS при необходимости устанавливается в локальный offline-runtime. Архив OPUS-MT загружается из официального каталога Helsinki-NLP и конвертируется на этом компьютере. `Remove model` удаляет только выбранную модель соответствующего движка. Во время обычной игры модели не скачиваются.

### Создание и использование полного кэша

1. Выберите сервис массового перевода и целевой язык.
2. Нажмите `Bulk Translate All Assets`.
3. Для онлайн-сервиса прочитайте предупреждение, нажмите `Allow bulk upload`, затем снова нажмите кнопку массового перевода.
4. Дождитесь завершения счётчика. Операцию можно отменить и продолжить позже: готовые записи останутся в кэше.

Массовая операция продолжается, если OMORI свёрнута или активно другое приложение. Google Bulk отправляет по одному свежему запросу раз в 5 секунд. При `HTTP 429` Bulk прекращает запросы, показывает 15-минутный обратный отсчёт и повторяет ту же строку без увеличения `done` или `failed`; повторные ограничения продлевают сохраняемый cooldown до 30 и 60 минут. Во время обычного прогресса также виден актуальный счётчик `failed`. Остальные конечные ошибки суммируются после прохода. Повторный запуск продолжит заполнение отсутствующих записей кэша.

Сразу после нажатия кнопка массового перевода показывает вращающийся индикатор. После запуска Bulk, Super Bulk или Test Phrase рабочая область занимает всё окно приложения: остаются только счётчик обработанных слов с расчётным оставшимся временем (или обратным отсчётом паузы провайдера), живой журнал и запустившая операцию кнопка, которая становится кнопкой отмены. Настройки сервисов, обновления, инструменты кэша, панель действий журнала, заголовок и сворачивание скрыты до завершения или отмены. Журнал занимает всё свободное место, после окончания обычная панель восстанавливается автоматически. Отображаемый прогресс считается в словах, а ETA — по скользящей скорости завершённых реплик без запуска/установки модели и ожидания cooldown. Поэтому короткая группа особенно длинных строк не раздувает оценку всего прохода. Вне активной операции импорт и экспорт находятся под синей кнопкой.

При каждом запуске локальный helper проверяет манифест обновлений VN Revival. Отдельная постоянная строка под основным статусом показывает `Checking for updates…`, актуальную версию, найденную версию с пояснением `translation cache will be kept`/`translation cache rebuild required` либо `Could not check for updates`. Для найденного обновления ниже выводятся до трёх коротких изменений. Пока их источник не настроен, панель показывает явную заглушку. Неудачная проверка никогда не мешает запуску игры. Версия 0.9.38 только проверяет и сообщает результат — она ещё ничего не скачивает и не устанавливает.

`Live translation log` автоматически раскрывается для каждого результата, обработанного Bulk, Super Bulk или Test Phrase. Каждая запись показывает время, сервис и язык, затем исходную английскую строку и готовый результат; повторно использованный результат отмечается словом `cache`. Поэтому при продолжении операции журнал движется сразу, даже если первые строки уже готовы. Живой список хранит не более 40 последних пар, чтобы не замедлять игру. Локальный helper сохраняет между запусками каждую уникальную пару provider/language/source/translation, включая отсутствовавшую в истории кэш-пару, но не создаёт дубли при следующих проходах. `View saved` загружает последние 200 записей, `Save file` сохраняет полный журнал в JSONL. `Clear view` очищает только панель; сохранённая история остаётся на диске и также не удаляется кнопкой `Reset all data`. Обычное воспроизведение готовых реплик из кэша журналом не засоряется.

### Super Bulk Translation

Фиолетовая кнопка `Super Bulk Translation · 17 languages` переводит извлечённые ассеты в фиксированном порядке: Spanish (`es`), German (`de`), Polish (`pl`), Vietnamese (`vi`), Russian (`ru`), Arabic (`ar`), Persian (`fa`), Hebrew (`iw`), Chinese Simplified (`zh-CN`), Chinese Traditional (`zh-TW`), Japanese (`ja`), Korean (`ko`), Hindi (`hi`), Bengali (`bn`), Thai (`th`), Myanmar (`my`) и Georgian (`ka`). Языки обрабатываются по одному выбранным сервисом, а для LM Studio — выбранной моделью.

Подтвердите запуск и не отключайте сервис до окончания работы. Полный проход может занять много часов. Во время работы кнопка превращается в `Cancel Super Bulk`; отмена сохраняет все готовые записи, а повторный запуск продолжает с отсутствующих. Для онлайн-сервисов действует то же согласие на массовую отправку, что и для обычного bulk-перевода. Argos, Bergamot и CTranslate2 недоступны в этом режиме, потому что их каталоги моделей не гарантируют все 17 языков.

Кнопка `Test Phrase · All Languages` переводит только реплику `Hi, OMORI! Cliff-faced as usual…` во все языки, доступные выбранному сервису. Управляющие коды OMORI не отправляются провайдеру, готовые языки пропускаются, а повторное нажатие продолжает отсутствующие. Тест продолжает работу при переключении в другое приложение и обрабатывает языки по одному. Бесплатный Google endpoint принимает один целевой язык за запрос, поэтому Google-режим делает запрос раз в 5 секунд, а полный проход без ограничений занимает около 20 минут. При `HTTP 429` Google-запросы полностью прекращаются на 15 минут, срок и следующая ступень паузы сохраняются между запусками, затем повторяется тот же язык. Повторные ограничения увеличивают паузу до 30 и 60 минут даже после перезапуска приложения. После завершения оставайтесь на этой реплике и переключайте язык для ручной проверки Canvas.

С Argos, Bergamot или CTranslate2 + OPUS-MT тест автоматически подготавливает движок и каждую отсутствующую модель English → target перед переводом языка без готового кэша. Закэшированные языки пропускаются без установки их моделей. Подтверждение предупреждает, что проход может скачать несколько гигабайт, занять много времени и оставить установленные модели на диске. Обычный Bulk одного языка по-прежнему требует только выбранную модель.

Успешный большой перевод из кэша не означает, что Google прямо сейчас принимает новые запросы. Например, для русского языка в кэше уже могут находиться тысячи строк, тогда как тесту всё равно нужен отдельный свежий запрос для каждого отсутствующего языка. Строка состояния отдельно показывает `new`, `cached` и `failed`. Обратный отсчёт при `0 failed` означает безопасное ожидание, а не поломку. Не нужно многократно перезапускать тест: срок Google-паузы специально сохраняется. Если продолжить необходимо сразу, выберите другой сервис; его результаты будут храниться в отдельной области кэша.

Готовые переводы из кэша всегда применяются автоматически при появлении новых реплик. Отдельной кнопки применения и настройки автоприменения нет; обычный игровой процесс не отправляет текст в сеть.

После смены языка дождитесь сообщения `Ready: … cache loaded`. Мод перерисует уже открытую реплику — включая завершённую страницу, ожидающую нажатия — и варианты ответа, поэтому перезапуск игры не требуется.

Если страница уже полностью показана и ожидает нажатия, мод рисует готовый перевод непосредственно в Canvas, сохраняя нормальное действие следующего нажатия `OK`.

Для китайского, японского и корейского Canvas-диалога мод регистрирует CJK-шрифт, уже поставляемый вместе с OMORI, а затем использует системные CJK-шрифты как дополнительные fallback-варианты.

Canvas-хуки OMORI показывают готовый перевод только в репликах, именах говорящих и вариантах ответа внутри диалога. Они никогда не запускают фоновые запросы к провайдеру. Режим `Original` распространяется и на заново отрисованный текст диалога.

Это перевод из заранее построенного кэша, а не машинный перевод каждой реплики во время игры. При отсутствии записи в кэше строка остаётся английской, и мод не обращается к провайдеру скрытно. Для всех целевых языков системный интерфейс остаётся оригинальным: титульный экран, `SAVE/LOAD`, подтверждения `YES/NO`, экипировка, навыки, параметры и описания не переводятся. Переводятся только реплики, имена говорящих и варианты ответа внутри разговора.

### Кэш и контакты

Переводы кэшируются автоматически. В настройках показываются количество сохранённых переводов и их размер. `Import cache` и `Export cache` переносят кэш между установками.

Начиная с 0.9.29 перед обращением к любому сервису мод отделяет разметку OMORI от переводимого текста. К защищённым токенам относятся команды с обратной косой чертой (`\aub`, `\sxbf`, `\itemget`, `\!`, `\N[1]`, `\n<NAME>`), экранированные кавычки (`\"`), теги (`<WordWrap>`, `<br>`), квадратные метаданные (`[TRASH]`) и внутренние контекстные разделители. Сначала они заменяются уникальными временными маркерами. После ответа мод убирает добавленные сервисом пробелы перед паузами и после переносов, возвращает граничные команды на начало или конец и разрешает подвижность цветовых/переменных команд для естественного порядка русских слов. Если модель портит маркер или переносит текст за конечную команду, мод автоматически переводит обычные текстовые участки отдельно и вставляет между ними точный исходный skeleton.

При первом запуске 0.9.29 прежний кэш переводов очищается как несовместимый: старые результаты невозможно надёжно отличить от строк с изменёнными кавычками и расположением команд. Установленные модели Argos/Bergamot/CTranslate2, сохранения игры, защищённые API-ключи и `translation-history.jsonl` при этой миграции не удаляются. После обновления снова запустите нужный Bulk или Test Phrase.

После подтверждения `Reset all data` кнопка показывает вращающийся индикатор и надпись `Resetting…` до завершения очистки кэша и сброса настроек. Во время операции повторное нажатие недоступно.

Ссылка VN Revival открывает сайт проекта в системном браузере. Рядом находятся иконки:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Почта](mailto:master1c8@proton.me)

### Закрытие и решение проблем

Закройте OMORI обычным способом. Переводчик и его локальный помощник должны автоматически завершиться через несколько секунд.

Если после пересборки показывается старая панель, полностью закройте OMORI, распакуйте новый ZIP в отдельную папку и запустите переводчик из неё. Пересборка не обновляет панель, уже внедрённую в работающую игру.

Если панель не появилась, убедитесь, что OMORI была закрыта перед запуском и что игра запущена через OMORI Translator.

Если `Test Phrase · All Languages` показывает обратный отсчёт Google, оставьте тест работать либо отмените его и вернитесь позднее. Начиная с версии 0.9.22 после паузы повторяется тот же язык, ложный `failed` не записывается; версия 0.9.23 также сохраняет нарастающую паузу 15/30/60 минут между перезапусками приложения. Перед повторной проверкой полностью закройте OMORI и запустите приложение из актуального ZIP: пересборка не заменяет код, уже внедрённый в работающее окно игры.
