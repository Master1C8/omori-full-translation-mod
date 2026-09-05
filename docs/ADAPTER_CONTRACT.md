# Контракт игрового адаптера

Универсальное ядро VN Revival не должно знать название игры, её DOM-классы, Steam AppID, имя процесса или каталог установки. Эти данные принадлежат адаптеру игры.

Адаптер не имеет права вызывать сетевой провайдер напрямую. Его сетевое поведение задаёт обязательная `translationStrategy` в манифесте. `asset-cache` оставляет обычный gameplay cache-only и разрешает свежие запросы только явным Bulk/Screen-действиям. `realtime-dom` разрешает runtime переводить видимый и вновь изменившийся DOM-текст, но полностью запрещает asset endpoint, Bulk, Super Bulk и Test Phrase. Во втором режиме переключатели Story/Full скрыты, единственным scope становится Realtime Translation.

Для текста, отрисованного через canvas и игровые API, `asset-cache`-адаптер может использовать только cache-only методы `window.__vnRevivalTranslator`: `queryMemoryCache()` для мгновенного RAM-hit, `registerAdapterText()` для отложенного поиска в IndexedDB и `translateAdapterText()` для прямого асинхронного поиска. Все три пути читают только RAM/IndexedDB и не создают сетевой запрос. Для Screen адаптер может реализовать `collectVisibleTexts()`, который только возвращает исходные строки видимых активных окон, и сообщить runtime о завершившейся странице через `registerCompletedScreenText()`.

Предварительный рекурсивный обход языковых таблиц внутри адаптера запрещён. Полный набор `.HERO` разрешено извлекать только локальному helper после нажатия `Bulk Translate All Assets`; эта кнопка сразу запускает выбранный провайдер. Режим `Original` соответствует значению runtime `source`, и canvas-хуки обязаны немедленно вернуть исходный текст.

## Состав адаптера

Каждая игра получает каталог `src/games/<game-id>/`:

```text
src/games/example/
├── game.json       метаданные сборки и запуска
├── adapter.js      правила работы с DOM игры
└── tests/
    └── adapter.test.js  обязательные игровые проверки
```

`game.json` — единственный источник идентичности игры и используется runtime, а также сборщиками Windows и macOS. Общий `src/games/catalog.json` содержит упорядоченный список доступных игр для стартового выбора; он не дублирует их метаданные. Обязательные поля схемы 1:

| Поле | Назначение |
|---|---|
| `id` | стабильный идентификатор игры и пространство кэша |
| `title`, `shortTitle` | полное и короткое названия |
| `translatorName` | имя приложения и панели |
| `sourceLanguage` | исходный язык текста; в текущем контракте только `en` |
| `officialLocalizations` | непустой уникальный список встроенных языков игры; обязан включать `sourceLanguage` |
| `translationStrategy` | `asset-cache` для извлекаемых ассетов и cache-only gameplay либо `realtime-dom` для перевода только видимого DOM |
| `releaseStatus` | `production` для основной публичной оболочки либо `prototype`; прототип нельзя собирать как самостоятельный релиз, а в общем выборе он обязан иметь явную пометку |
| `supportedVersions` | проверенные версии игры |
| `launchStrategy` | способ запуска и внедрения; сейчас реализован `electron-cdp` |
| `debugTargetTitleContains`, `debugTargetUrlContains` | строгий выбор страницы Electron |
| `storageNamespace` | ключи настроек и метаданных |
| `cacheDatabase` | отдельная IndexedDB игры |
| `steamAppId` | Steam AppID |
| `windowsExecutable` | имя основного Windows-процесса и автоматического поиска; у пользователя остаётся выбор другого `.exe` |
| `crossOverBottle`, `crossOverGamePath` | запуск macOS через CrossOver |
| `bundleIdentifier` | идентификатор macOS-приложения |
| `iconPng`, `iconIcns` | безопасные относительные пути к ресурсам продукта |
| `archivePrefix`, `windowsDistributionName` | имена релизных файлов |
| `updateManifestUrl`, `updateProduct` | game-specific HTTPS endpoint и ожидаемая identity update-манифеста |

`localizationProfileFile` и `testPhraseSource` обязательны только для `asset-cache`. У `realtime-dom` их может не быть: helper создаёт пустой game-specific профиль и не открывает каталоги игры. Необязательный объект `legacyCompatibility` принадлежит только конкретной игре. Он объявляет старые форматы кэша и JavaScript-глобальные имена, которые надо сохранить для пользователей предыдущих версий. Новая игра не должна добавлять этот объект без реально существующего старого релиза.

Сборка преобразует манифест в неизменяемый `window.VNRevivalGameConfig`. Поэтому идентификатор, название, исходный язык, официальные локализации, версии и namespace больше не дублируются в JavaScript. Runtime использует `officialLocalizations`, чтобы оставить только выбор языка и не запускать переводчик для уже встроенного в игру варианта.

`adapter.js` публикует `window.VNRevivalGameAdapter` с `contractVersion: 2`. Его обязательная декларативная часть содержит:

- селекторы приватных областей;
- селекторы категорий `story`, `control`, `tooltip`;
- список контейнеров контекстного перевода;
- `getGameVersion(window)`;
- `hasSourceText(text, core)`.

Адаптер может дополнительно реализовать `isPrivateElement(element)`, `classifyNode(node)`, `findContextContainer(node)` и `collectVisibleTexts()`. Первые три функции имеют приоритет над декларативными селекторами. `collectVisibleTexts()` возвращает дедуплицируемый список фактически видимых исходных строк и не выполняет перевод. Жизненный цикл canvas-адаптера может дополняться callback-методами `onModeChanged(mode)`, `onLanguageChanged(language, provider)`, `onTranslationScopeChanged(scope)` и `onTranslationsChanged()`: они нужны для безопасной перерисовки открытых окон при смене состояния или после загрузки записи IndexedDB. Runtime публикует `getMode()` со значениями `source`/`translated` и `getTranslationScope()` со значениями `story`/`full`/`screen`; Full остаётся cache-only, а Screen до явного захвата не должен применять даже cache hit.

## Инварианты ядра

- Интерфейс переводчика всегда английский.
- Для `asset-cache` безопасным значением по умолчанию остаётся `Story Translation`; игра без Full-адаптера не должна активировать непроверенный общий canvas-перехват.
- Для `realtime-dom` значение всегда принудительно равно `screen`, автоматический перевод видимого DOM включён по умолчанию, а запрос `/v1/game/strings` завершается `asset_extraction_disabled` до чтения пути игры.
- `Screen Translation` не должен обходить игровые ресурсы: кнопка получает только строки видимых активных окон, а автоматическая опция — только точную завершившуюся страницу диалога. В обоих случаях provider request принадлежит runtime.
- Ключ кэша версии 3 содержит `game-id`; переводы разных игр не смешиваются.
- Старые ключи и форматы мигрируют только у игры, которая объявила собственный `legacyCompatibility`.
- Bundle-сборка обязана завершаться ошибкой, если `id` манифеста не совпадает с выбранным каталогом игры или обязательные DOM-правила не соответствуют контракту 2. Релизная сборка дополнительно требует `releaseStatus: production`.
- Названия безопасно экранируются для XML, C и Windows Resources; абсолютные пути и `..` в каталогах запрещены.
- `windowsExecutable` должен быть именем файла `.exe`, но при неудачном поиске лаунчер показывает системный выбор файла и сохраняет пользовательский путь.

## Добавление новой игры

1. Создать каталог адаптера и заполнить `game.json`; исходный язык указать `en`, выбрать `translationStrategy`, а `launchStrategy` — `electron-cdp`.
2. Описать приватные элементы, категории текста и контекстные контейнеры в `adapter.js`.
3. Добавить обязательные игровые тесты в `src/games/<game-id>/tests/` и DOM-fixture при необходимости.
4. Добавить `game-id` в `src/games/catalog.json`; порядок в нём определяет порядок стартового выбора на обеих платформах.
5. Для прототипа создать `scripts/test-<game-id>.sh`, который фиксирует `VNREVIVAL_GAME`, и собрать проверяемый JS bundle через `scripts/build-game-bundle.sh`.
6. Запустить `scripts/test-<game-id>.sh` и общую launcher-проверку.
7. Только после перевода манифеста в `releaseStatus: production` и добавления собственных release-ресурсов разрешать отдельную публичную оболочку этой игры.

Единый лаунчер использует одно ядро и отдельный bundle выбранной игры. Настройки, кэш, история, диагностика, сохранённый путь и helper identity остаются раздельными.

Новая технология внедрения добавляется как новая `launchStrategy`; неизвестная стратегия отклоняется сборкой, а не молча запускается через Electron.
