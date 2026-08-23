# OMORI Translator — User Guide / Инструкция

## English

### Starting the mod

1. Close OMORI if it is already running.
2. On Windows, fully extract the ZIP and run `OMORI Translator.exe`. On macOS, open `OMORI Translator.app`.
3. The translator starts OMORI for you. If it cannot find the game, choose the main `OMORI.exe` file when asked.
4. Wait for the translator panel to appear in the top-right corner of the game.

Always start the game through OMORI Translator. The panel cannot appear if OMORI was started normally.

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
- `LM Studio Local AI` uses an OpenAI-compatible model served by LM Studio on this computer. Quality and speed depend on the selected model; game text is not sent online.
- `OpenAI-compatible AI` connects to OpenCode Go, OpenRouter, DeepSeek, LM Studio, or a custom compatible endpoint. Remote endpoints receive the extracted text; a loopback endpoint stays local.

`Bulk Translate All Assets` sends all extracted `.HERO` dialogue strings to the selected remote provider after explicit confirmation. Normal gameplay uses only the resulting local cache and does not send visible text to a provider. Argos, LM Studio, and loopback OpenAI-compatible endpoints process the bulk set locally.

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

The first installation may take several minutes. A language model usually needs about 80–250 MB. Use `Remove model` if you no longer need the selected model.

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

The bulk operation continues if OMORI is minimized or another application becomes active. If it cannot finish, the status line reports why it stopped (manual cancellation, changed settings, network failure, provider limit, or another service error). Run it again to continue from the entries missing from the cache.

The bulk button immediately shows a spinner after it is pressed. While translation is running, every control except panel collapse and `Cancel translation` is disabled. After about 30 seconds, the progress line adds an estimated number of minutes remaining. Import and export buttons are placed below the blue bulk button.

`Live translation log` opens automatically when a new translation is created. Each entry shows the provider and language followed by the English source and translated result. Newest entries appear first. The list is session-only, keeps at most 40 entries to avoid slowing down the game, and can be emptied with `Clear`. Cache hits are not repeated in this log.

### Super Bulk Translation

The purple `Super Bulk Translation · 17 languages` button translates the extracted assets into this fixed order: Spanish (`es`), German (`de`), Polish (`pl`), Vietnamese (`vi`), Russian (`ru`), Arabic (`ar`), Persian (`fa`), Hebrew (`iw`), Chinese Simplified (`zh-CN`), Chinese Traditional (`zh-TW`), Japanese (`ja`), Korean (`ko`), Hindi (`hi`), Bengali (`bn`), Thai (`th`), Myanmar (`my`), and Georgian (`ka`). Languages are processed one at a time with the currently selected service and, for LM Studio, the currently selected model.

Confirm the operation, keep the provider available, and expect a full run to take hours. The button becomes `Cancel Super Bulk`; cancelling keeps all completed cache entries. Press it again later to resume from missing entries. Online providers use the same bulk-upload consent as the normal bulk operation. Argos is unavailable for Super Bulk because its model catalogue does not cover all 17 languages.

Cached translations are always applied automatically as new dialogue appears. There is no separate apply button or auto-apply setting, and normal gameplay does not send text over the network.

OMORI canvas hooks display cached translations only in dialogue text, speaker names, and dialogue choices. They never start background provider requests. `Original` also applies to newly drawn dialogue text.

This is a prebuilt-cache translation, not live per-line machine translation. A cache miss remains in English and does not silently contact a provider. For every target language, all system UI stays original: the title screen, `SAVE/LOAD`, `YES/NO` confirmations, equipment, skills, settings, and descriptions are not translated. Only dialogue text, speaker names, and choices inside conversations are translated.

### Cache and contacts

Translations are cached automatically. The settings show the number of saved translations and their size. `Import cache` and `Export cache` transfer the cache between installations.

The VN Revival project link opens in your default system browser. At the bottom of the panel, use the icons next to it to open:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Email](mailto:master1c8@proton.me)

### Closing and troubleshooting

Close OMORI normally. The translator and its local helper should exit automatically within a few seconds.

If an old panel appears after rebuilding the mod, close OMORI completely, extract the newly built ZIP into a fresh folder, and run the translator from that folder. Rebuilding does not update a panel that is already injected into a running game.

If the panel does not appear, make sure OMORI was closed before launch and that you started it through OMORI Translator.

---

## Русский

### Запуск мода

1. Закройте OMORI, если игра уже запущена.
2. На Windows полностью распакуйте ZIP и запустите `OMORI Translator.exe`. На macOS откройте `OMORI Translator.app`.
3. Переводчик сам запустит OMORI. Если он не найдёт игру, укажите основной файл `OMORI.exe`.
4. Дождитесь появления панели переводчика в правом верхнем углу игры.

Всегда запускайте игру через OMORI Translator. При обычном запуске OMORI панель появиться не сможет.

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
- `LM Studio Local AI` использует OpenAI-совместимую модель, которую LM Studio обслуживает локально на этом компьютере. Качество и скорость зависят от модели; игровой текст в интернет не отправляется.
- `OpenAI-compatible AI` подключается к OpenCode Go, OpenRouter, DeepSeek, LM Studio или произвольному совместимому endpoint. Удалённый сервис получает извлечённый текст, а loopback-адрес остаётся локальным.

Кнопка `Bulk Translate All Assets` после явного подтверждения отправляет выбранному удалённому провайдеру все извлечённые строки диалогов `.HERO`. Обычный игровой процесс использует только созданный локальный кэш и не отправляет видимый текст провайдеру. Argos, LM Studio и OpenAI-compatible endpoint на loopback-адресе обрабатывают массовый набор локально.

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

Первая установка может занять несколько минут. Языковая модель обычно занимает около 80–250 МБ. Кнопка `Remove model` удаляет выбранную модель.

### Создание и использование полного кэша

1. Выберите сервис массового перевода и целевой язык.
2. Нажмите `Bulk Translate All Assets`.
3. Для онлайн-сервиса прочитайте предупреждение, нажмите `Allow bulk upload`, затем снова нажмите кнопку массового перевода.
4. Дождитесь завершения счётчика. Операцию можно отменить и продолжить позже: готовые записи останутся в кэше.

Массовая операция продолжается, если OMORI свёрнута или активно другое приложение. Если завершить её не удалось, строка состояния показывает причину: ручная отмена, смена настроек, проблема сети, лимит или другая ошибка сервиса. Повторный запуск продолжит заполнение отсутствующих записей кэша.

Сразу после нажатия кнопка массового перевода показывает вращающийся индикатор. Во время перевода все элементы управления, кроме сворачивания панели и `Cancel translation`, заблокированы. Примерно через 30 секунд строка прогресса начинает показывать расчётное оставшееся время в минутах. Импорт и экспорт находятся под синей кнопкой.

`Live translation log` автоматически раскрывается при создании нового перевода. Каждая запись показывает сервис и язык, затем исходную английскую строку и готовый результат. Новые записи находятся сверху. Журнал существует только в текущем запуске, хранит не более 40 пар, чтобы не замедлять игру, и очищается кнопкой `Clear`. Готовые попадания из кэша повторно в журнал не добавляются.

### Super Bulk Translation

Фиолетовая кнопка `Super Bulk Translation · 17 languages` переводит извлечённые ассеты в фиксированном порядке: Spanish (`es`), German (`de`), Polish (`pl`), Vietnamese (`vi`), Russian (`ru`), Arabic (`ar`), Persian (`fa`), Hebrew (`iw`), Chinese Simplified (`zh-CN`), Chinese Traditional (`zh-TW`), Japanese (`ja`), Korean (`ko`), Hindi (`hi`), Bengali (`bn`), Thai (`th`), Myanmar (`my`) и Georgian (`ka`). Языки обрабатываются по одному выбранным сервисом, а для LM Studio — выбранной моделью.

Подтвердите запуск и не отключайте сервис до окончания работы. Полный проход может занять много часов. Во время работы кнопка превращается в `Cancel Super Bulk`; отмена сохраняет все готовые записи, а повторный запуск продолжает с отсутствующих. Для онлайн-сервисов действует то же согласие на массовую отправку, что и для обычного bulk-перевода. Argos недоступен в этом режиме, потому что его каталог моделей не покрывает все 17 языков.

Кнопка `Test Phrase · All Languages` переводит только реплику `Hi, OMORI! Cliff-faced as usual…` во все языки, доступные выбранному сервису. Управляющие коды OMORI не отправляются провайдеру, готовые языки пропускаются, а повторное нажатие продолжает отсутствующие. После завершения оставайтесь на этой реплике и переключайте язык для ручной проверки Canvas.

Готовые переводы из кэша всегда применяются автоматически при появлении новых реплик. Отдельной кнопки применения и настройки автоприменения нет; обычный игровой процесс не отправляет текст в сеть.

После смены языка дождитесь сообщения `Ready: … cache loaded`. Мод перерисует уже открытую реплику — включая завершённую страницу, ожидающую нажатия — и варианты ответа, поэтому перезапуск игры не требуется.

Если страница уже полностью показана и ожидает нажатия, мод рисует готовый перевод непосредственно в Canvas, сохраняя нормальное действие следующего нажатия `OK`.

Для китайского, японского и корейского Canvas-диалога мод регистрирует CJK-шрифт, уже поставляемый вместе с OMORI, а затем использует системные CJK-шрифты как дополнительные fallback-варианты.

Canvas-хуки OMORI показывают готовый перевод только в репликах, именах говорящих и вариантах ответа внутри диалога. Они никогда не запускают фоновые запросы к провайдеру. Режим `Original` распространяется и на заново отрисованный текст диалога.

Это перевод из заранее построенного кэша, а не машинный перевод каждой реплики во время игры. При отсутствии записи в кэше строка остаётся английской, и мод не обращается к провайдеру скрытно. Для всех целевых языков системный интерфейс остаётся оригинальным: титульный экран, `SAVE/LOAD`, подтверждения `YES/NO`, экипировка, навыки, параметры и описания не переводятся. Переводятся только реплики, имена говорящих и варианты ответа внутри разговора.

### Кэш и контакты

Переводы кэшируются автоматически. В настройках показываются количество сохранённых переводов и их размер. `Import cache` и `Export cache` переносят кэш между установками.

Ссылка VN Revival открывает сайт проекта в системном браузере. Рядом находятся иконки:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Почта](mailto:master1c8@proton.me)

### Закрытие и решение проблем

Закройте OMORI обычным способом. Переводчик и его локальный помощник должны автоматически завершиться через несколько секунд.

Если после пересборки показывается старая панель, полностью закройте OMORI, распакуйте новый ZIP в отдельную папку и запустите переводчик из неё. Пересборка не обновляет панель, уже внедрённую в работающую игру.

Если панель не появилась, убедитесь, что OMORI была закрыта перед запуском и что игра запущена через OMORI Translator.
