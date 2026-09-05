(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VNRevivalRuntimePanel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function render(options = {}) {
    const {
      productName = "",
      version = "",
      interruptTranslationLabel = "Interrupt translation (progress will be saved)",
      openCodeGoReferralUrl = "",
      siteUrl = "",
      siteName = ""
    } = options;
    const PRODUCT_NAME = String(productName);
    const VERSION = String(version);
    const INTERRUPT_TRANSLATION_LABEL = String(interruptTranslationLabel);
    const OPENCODE_GO_REFERRAL_URL = String(openCodeGoReferralUrl);
    const SITE_URL = String(siteUrl);
    const SITE_NAME = String(siteName);
    return `
    <style>
      :host{all:initial!important;display:block!important;position:fixed!important;z-index:9999999!important;left:var(--vr-left,auto)!important;top:var(--vr-top,14px)!important;right:var(--vr-right,14px)!important}*{box-sizing:border-box}.panel{width:306px!important;color:#fff!important;background:rgba(32,19,28,.97)!important;border:1px solid #c69b55!important;border-radius:9px!important;box-shadow:0 5px 24px rgba(0,0,0,0.95)!important;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;overflow:hidden!important;position:relative!important;z-index:9999999!important}.bar{cursor:move;padding:7px 9px;color:#f4d18f;background:#412436;font-weight:700;user-select:none}.row{display:flex;gap:6px;padding:7px}.primary,.secondary,.gear,.danger{border:1px solid #c69b55;border-radius:6px;background:#6b344f;color:#fff;padding:7px 9px;cursor:pointer;font:inherit}.primary{flex:1;font-weight:700}.secondary{background:#442b39}.gear{width:38px}.status{min-height:23px;padding:0 9px 3px;color:#ddd;font-size:12px}.hotkey{padding:0 9px 7px;color:#f4d18f;font-size:11px}.retry{margin:0 8px 7px;width:calc(100% - 16px)}.settings{display:none;padding:0 8px 9px;border-top:1px solid #6e4d56}.settings.open{display:block}.settings label.title{display:block;margin:7px 0 3px}.settings select,.settings input{width:100%;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:6px}.check{display:flex;gap:7px;align-items:center;margin:8px 0}.hint,.providerHint,.cacheStats,.geminiStatus,.geminiNotice,.lmStudioStatus,.lmStudioNotice,.openAICompatibleStatus,.openAICompatibleUsage,.openAICompatibleNotice{color:#bdaeb6;font-size:11px;line-height:1.3}.openAICompatibleUsage{margin-top:5px;color:#f4d18f}.providerHint{margin-top:4px}.geminiBox,.lmStudioBox,.openAICompatibleBox,.cacheBox{margin-top:8px;padding:7px;border:1px solid #6e4d56;border-radius:6px}.geminiKey,.lmStudioModel,.openAICompatiblePreset,.openAICompatibleBaseURL,.openAICompatibleModel,.openAICompatibleKey{margin-top:6px}.geminiActions,.lmStudioActions,.openAICompatibleActions,.privacyActions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.geminiActions button,.lmStudioActions button,.openAICompatibleActions button,.privacyActions button{flex:1;min-width:82px}.primary:disabled,.secondary:disabled,.danger:disabled{opacity:.55;cursor:default}.danger{background:#71313a}.privacy{margin:0 8px 8px;padding:8px;border:1px solid #d19a44;border-radius:6px;background:#38291f;color:#f8e5bf;font-size:12px}.compat{margin:0 8px 7px;padding:6px;border-radius:5px;background:#71431f;color:#ffe6be;font-size:11px}.site{padding:7px 9px;border-top:1px solid #6e4d56;text-align:center;color:#bdaeb6;font-size:11px}.site a,.geminiNotice a,.openAICompatibleNotice a{color:#f4d18f;font-weight:700;text-decoration:none}.site a:hover,.geminiNotice a:hover,.openAICompatibleNotice a:hover{text-decoration:underline}.hidden{display:none!important}
      .settings{display:block!important;max-height:calc(100vh - 92px);overflow-y:auto}.bar{display:flex;align-items:center;gap:8px;min-height:34px;touch-action:none}.barTitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.collapseToggle{width:24px;height:22px;padding:0;border:1px solid #c69b55;border-radius:5px;background:#6b344f;color:#fff;cursor:pointer;font:700 16px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.collapseToggle:hover{background:#7b405d}.panel.collapsed{width:30px!important;border:0!important;border-radius:5px!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}.panel.collapsed>:not(.bar){display:none!important}.panel.collapsed .bar{min-height:0!important;padding:0!important;background:transparent!important;cursor:move!important}.panel.collapsed .barTitle{display:none!important}.panel.collapsed .collapseToggle{width:30px;height:30px;line-height:26px;cursor:grab}.modeToggle{display:grid!important;grid-template-columns:1fr 1fr;gap:3px;width:100%;padding:3px!important;border-radius:8px!important}.modeChoice{padding:5px 8px;border-radius:5px;color:#bdaeb6;font-weight:600;text-align:center}.modeChoice.active{background:#6b344f;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}.translationScope{margin-top:7px;padding:7px;border:1px solid #6e4d56;border-radius:6px}.translationScopeLabel{margin-bottom:5px;color:#f4d18f;font-weight:700}.scopeChoices{display:grid;grid-template-columns:1fr 1fr;gap:5px}.scopeChoice{min-width:0;padding:6px;border:1px solid #6e4d56;border-radius:5px;background:#241720;color:#bdaeb6;cursor:pointer;font:inherit;text-align:left}.scopeChoice.screenTranslationScope{grid-column:1/-1}.scopeChoice.active{border-color:#c69b55;background:#4b2d3f;color:#fff}.scopeName,.scopeState{display:block}.scopeName{font-size:11px;font-weight:700}.scopeState{margin-top:2px;font-size:9px;line-height:1.2}.scopeHint{margin-top:5px;color:#bdaeb6;font-size:10px;line-height:1.3}.screenActionRow{padding:7px 0 0}.screenActionRow[hidden]{display:none!important}.screenTranslate{display:flex!important;align-items:center;justify-content:center;gap:8px;width:100%}.screenTranslate.working::before{content:"";width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:vr-spin .75s linear infinite}.screenAutoOption{margin:7px 1px 0!important;color:#ddd;font-size:11px}.screenAutoOption input{width:auto!important}.screenAutoHint{margin:3px 1px 0;color:#9d9098;font-size:9px;line-height:1.3}.updateStatus{padding:0 9px 5px;color:#9d9098;font-size:11px;line-height:1.25}.updateStatus.available{color:#f4d18f}.updateStatus.error{color:#d9a0a0}.updateChanges{margin:-1px 9px 6px;padding-left:16px;color:#c9bdc4;font-size:10px;line-height:1.35}.updateChanges li+li{margin-top:2px}.bulkTranslate,.superBulkTranslate,.testPhraseTranslate,.bulkCancel,.reset{display:flex;align-items:center;justify-content:center;gap:8px}.bulkTranslate.working::before,.superBulkTranslate.working::before,.testPhraseTranslate.working::before,.bulkCancel.working::before,.reset.working::before{content:"";width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:vr-spin .75s linear infinite}.translationLogBox{margin-top:7px;border:1px solid #6e4d56;border-radius:5px;background:#1b1218;color:#ddd;font-size:11px}.translationLogBox summary{padding:6px;cursor:pointer;color:#f4d18f;font-weight:700}.translationLogToolbar{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:0 6px 5px;color:#8f8189;flex-wrap:wrap}.translationLogNote{flex:1;min-width:120px}.translationLogActions{display:flex;gap:4px;flex-wrap:wrap}.translationLogActions button{padding:3px 6px!important;font-size:10px!important}.translationLogHold[aria-pressed="true"]{border-color:#f4d18f!important;background:#71313a!important;color:#fff!important}.translationLogEmpty{padding:4px 6px 7px;color:#8f8189}.translationLogEntries{max-height:170px;overflow:auto;overflow-anchor:none}.translationLogEntry{padding:6px;border-top:1px solid #49333f;overflow-wrap:anywhere}.translationLogMeta{margin-bottom:3px;color:#c69b55}.translationLogSource,.translationLogTarget{white-space:pre-wrap}.translationLogSource{color:#aaa}.translationLogArrow{color:#8f8189;padding:2px 0}@keyframes vr-spin{to{transform:rotate(360deg)}}
      .bulkCancelBar{display:none}.panel.bulkBusy>.bulkCancelBar{display:flex!important;flex:0 0 auto!important;padding:10px 12px!important;background:#241720!important}.panel.bulkBusy>.bulkCancelBar>.bulkCancel{display:flex!important;width:100%!important;min-height:48px!important;align-items:center!important;justify-content:center!important;font-size:16px!important}.bulkCancel.finished{border-color:#69b77f!important;background:#2f7d4a!important;color:#fff!important}
      :host(.bulkBusyHost){left:0!important;top:0!important;right:0!important;width:100vw!important;height:100vh!important}.panel.bulkBusy{display:flex!important;flex-direction:column!important;width:100vw!important;height:100vh!important;border-radius:0!important}.panel.bulkBusy>*{display:none!important}.panel.bulkBusy>.status{display:block!important;flex:0 0 auto!important;min-height:0!important;padding:10px 12px!important;background:#412436!important;color:#f4d18f!important;font-size:14px!important;font-weight:700!important;text-align:center!important}.panel.bulkBusy>.settings{display:flex!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important;padding:0!important;border:0!important}.panel.bulkBusy .settings>*{display:none!important}.panel.bulkBusy .settings>.cacheBox{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important}.panel.bulkBusy .cacheBox>*{display:none!important}.panel.bulkBusy .cacheBox>.translationLogBox{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important}.panel.bulkBusy .translationLogBox summary{flex:0 0 auto!important;padding:10px 12px!important;font-size:14px!important}.panel.bulkBusy .translationLogToolbar{display:flex!important;flex:0 0 auto!important;justify-content:flex-end!important;padding:6px 10px!important;background:#241720!important}.panel.bulkBusy .translationLogToolbar>*{display:none!important}.panel.bulkBusy .translationLogToolbar>.translationLogActions{display:flex!important}.panel.bulkBusy .translationLogActions>*{display:none!important}.panel.bulkBusy .translationLogActions>.translationLogHold{display:inline-flex!important;min-width:110px;justify-content:center}.panel.bulkBusy .translationLogEmpty{flex:0 0 auto!important;padding:10px 12px!important}.panel.bulkBusy .translationLogEntries{display:block!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;font-size:13px!important}
      :host(.bulkBusyHost) .panel.bulkBusy>.settings{flex:1 1 0%!important;height:0!important}:host(.bulkBusyHost) .panel.bulkBusy .settings>.cacheBox{flex:1 1 0%!important;height:100%!important}:host(.bulkBusyHost) .panel.bulkBusy .cacheBox>.translationLogBox[open]{display:flex!important;flex:1 1 0%!important;height:100%!important;position:relative!important}.panel.bulkBusy .translationLogBox>.translationLogEmpty,.panel.bulkBusy .translationLogBox>.translationLogEntries{position:absolute!important;inset:82px 0 0!important;min-height:0!important}.panel.bulkBusy .translationLogBox>.translationLogEmpty{overflow:hidden!important}
      .site{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}.siteLabel{white-space:nowrap}.contacts{display:inline-flex;align-items:center;gap:5px}.site .contactIcon{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;border:1px solid #6e4d56;border-radius:6px;background:#2c1b26;text-decoration:none}.site .contactIcon:hover{border-color:#c69b55;background:#412436;text-decoration:none}.contactIcon svg{display:block;width:15px;height:15px;fill:currentColor}.site .discord{color:#8c9eff}.site .telegram{color:#55bde9}.site .email{color:#9b87f5}
      .importCache.working{display:flex;align-items:center;justify-content:center;gap:8px}.importCache.working::before{content:"";width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:vr-spin .75s linear infinite}.translationPackStatus{margin-top:6px;padding:6px;border:1px solid #49333f;border-radius:5px;color:#bdaeb6;font-size:10px;line-height:1.3}.translationPackActions{display:flex;gap:5px;margin-top:5px}.translationPackActions button{flex:1;padding:5px}.packModal[hidden]{display:none!important}.packModal{position:absolute;z-index:30;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(14,8,12,.88)}.packDialog{width:100%;max-height:100%;overflow:auto;padding:12px;border:1px solid #c69b55;border-radius:8px;background:#241720;box-shadow:0 8px 30px rgba(0,0,0,.8)}.packDialogTitle{color:#f4d18f;font-size:16px;font-weight:700}.packDialogFile{margin-top:5px;color:#9d9098;font-size:10px;overflow-wrap:anywhere}.packDialog label{display:block;margin-top:9px;color:#d7c8cf;font-size:11px}.packDialog select{width:100%;margin-top:3px;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:6px}.packSummary{margin-top:9px;padding:7px;border:1px solid #49333f;border-radius:5px;color:#ddd;font-size:11px;line-height:1.45}.packWarning{margin-top:7px;color:#f4d18f;font-size:10px;line-height:1.35}.packDialogActions{display:flex;gap:6px;margin-top:10px}.packDialogActions button{flex:1}
      .officialLocalizationNotice[hidden]{display:none!important}.officialLocalizationNotice{margin-top:7px;padding:9px;border:1px solid #c69b55;border-radius:6px;background:#38291f;color:#f8e5bf;font-size:12px;line-height:1.4}.panel.officialLocalization>.row,.panel.officialLocalization>.updateStatus,.panel.officialLocalization>.updateChanges,.panel.officialLocalization>.retry,.panel.officialLocalization>.compat,.panel.officialLocalization>.site,.panel.officialLocalization>.packModal{display:none!important}.panel.officialLocalization>.bar .collapseToggle{display:none!important}.panel.officialLocalization>.settings{display:block!important;max-height:none!important;padding:4px 8px 10px!important;border-top:1px solid #6e4d56!important;overflow:visible!important}.panel.officialLocalization>.settings>*:not(.languageControl){display:none!important}.panel.officialLocalization>.settings>.languageControl{display:block!important}
    </style>
    <div class="panel">
      <div class="bar"><span class="barTitle">${PRODUCT_NAME} ${VERSION}</span><button class="collapseToggle" type="button" title="Collapse translator" aria-label="Collapse translator">−</button></div>
      <div class="row"><button class="secondary mode modeToggle" type="button" aria-label="Dialogue display"><span class="modeChoice translationChoice">Translation</span><span class="modeChoice originalChoice">Original</span></button></div>
      <div class="status">Ready</div>
      <div class="bulkCancelBar"><button class="primary bulkCancel working" type="button">${INTERRUPT_TRANSLATION_LABEL}</button></div>
      <div class="updateStatus">Checking for updates…</div>
      <ul class="updateChanges" hidden></ul>
      <button class="secondary retry" hidden>Retry failed</button>
      <div class="compat" hidden></div>
      <div class="settings open">
        <div class="translationScope" role="group" aria-label="Translation mode">
          <div class="translationScopeLabel">Translation mode</div>
          <div class="scopeChoices">
            <button class="scopeChoice storyTranslationScope active" type="button" aria-pressed="true"><span class="scopeName">Story Translation</span><span class="scopeState">Stable · dialogue windows</span></button>
            <button class="scopeChoice fullTranslationScope" type="button" aria-pressed="false"><span class="scopeName">Full Translation</span><span class="scopeState">Experimental · menus + dialogue</span></button>
            <button class="scopeChoice screenTranslationScope" type="button" aria-pressed="false"><span class="scopeName">Screen Translation</span><span class="scopeState">Manual · visible text only</span></button>
          </div>
          <div class="scopeHint">Story Translation changes dialogue windows only. Full Translation also applies cached translations to menus and other game windows.</div>
        </div>
        <div class="screenActionRow" hidden>
          <button class="primary screenTranslate" type="button" aria-keyshortcuts="Control+Shift+T">Translate current screen (Ctrl+Shift+T)</button>
          <label class="check screenAutoOption"><input class="screenAuto" type="checkbox"> Automatically translate completed dialogue</label>
          <div class="screenAutoHint">Runs only after the current dialogue page finishes typing. Menus still require the button.</div>
        </div>
        <label class="title">Translation service</label><select class="provider"></select>
        <div class="providerHint"></div>
        <div class="languageControl">
          <label class="title" for="vnrevival-target-language">Target Language</label><select class="language" id="vnrevival-target-language"></select>
          <div class="officialLocalizationNotice" role="status" hidden></div>
        </div>
        <div class="geminiBox" hidden>
          <div class="geminiStatus">Checking Gemini…</div>
          <input class="geminiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Gemini API key">
          <div class="geminiActions"><button class="primary geminiSave">Save API key</button><button class="danger geminiRemove" hidden>Remove key</button></div>
          <div class="geminiNotice">Use your own key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Free-tier content may be used by Google to improve its products. Explicit text can still be blocked.</div>
        </div>
        <div class="lmStudioBox" hidden>
          <div class="lmStudioStatus">Checking LM Studio…</div>
          <select class="lmStudioModel" aria-label="LM Studio model" disabled></select>
          <div class="lmStudioActions"><button class="secondary lmStudioRefresh" type="button">Refresh models</button></div>
          <div class="lmStudioNotice">Start the local server in LM Studio Developer settings. Translation text stays on this computer.</div>
        </div>
        <div class="openAICompatibleBox" hidden>
          <div class="openAICompatibleStatus">Configure an OpenAI-compatible provider…</div>
          <div class="openAICompatibleUsage">Exact usage: no provider responses recorded.</div>
          <select class="openAICompatiblePreset" aria-label="OpenAI-compatible preset">
            <option value="opencode-go">OpenCode Go</option>
            <option value="opencode-zen">OpenCode Zen</option>
            <option value="openrouter">OpenRouter</option>
            <option value="deepseek">DeepSeek</option>
            <option value="lmstudio">LM Studio</option>
            <option value="custom">Custom</option>
          </select>
          <input class="openAICompatibleBaseURL" type="url" autocomplete="off" spellcheck="false" placeholder="https://provider.example/v1">
          <input class="openAICompatibleModel" type="text" list="openAICompatibleModels" autocomplete="off" spellcheck="false" placeholder="Model ID">
          <datalist id="openAICompatibleModels"></datalist>
          <input class="openAICompatibleKey" type="password" autocomplete="off" spellcheck="false" placeholder="API key (stored securely)">
          <div class="openAICompatibleActions">
            <button class="primary openAICompatibleSave" type="button">Save API key</button>
            <button class="secondary openAICompatibleRefresh" type="button">Refresh models</button>
            <button class="danger openAICompatibleRemove" type="button" hidden>Remove key</button>
          </div>
          <div class="openAICompatibleNotice"><a class="openCodeGoReferral" href="${OPENCODE_GO_REFERRAL_URL}" target="_blank" rel="noopener noreferrer">Create an OpenCode account with our referral link and receive $5 in Zen credits. OpenCode Go requires a separate $10/month subscription.</a><span class="openAICompatibleProtocol"> Uses OpenAI Chat Completions. Remote text is sent to the selected provider. Custom remote URLs must use HTTPS.</span></div>
        </div>
        <div class="cacheBox">
          <div class="cacheStats">Calculating cache…</div>
          <div class="translationPackStatus">No imported translation for this language.</div>
          <input type="file" class="cacheFile" accept=".jsonl,.json" style="display:none">
          <div class="row bulkActionRow" style="padding:7px 0 0">
            <button class="primary bulkTranslate" style="background:#4a69bd">Bulk Translate All Assets</button>
          </div>
          <div class="row bulkActionRow" style="padding:5px 0 0">
            <button class="primary superBulkTranslate" style="background:#7651a8">Super Bulk Translation</button>
          </div>
          <div class="row bulkActionRow" style="padding:5px 0 0">
            <button class="primary testPhraseTranslate" style="background:#287c68">Test Phrase · All Languages</button>
          </div>
          <details class="translationLogBox">
            <summary>Live translation log</summary>
            <div class="translationLogToolbar">
              <span class="translationLogNote">Saved locally · newest first</span>
              <span class="translationLogActions"><button class="secondary translationLogHold" type="button" aria-pressed="false" title="Pause automatic scrolling while you inspect the log">Stop scroll</button><button class="secondary translationLogView" type="button">View saved</button><button class="secondary translationLogSave" type="button">Save file</button><button class="secondary translationLogClear" type="button">Clear view</button></span>
            </div>
            <div class="translationLogEmpty">New translations will appear here. Use View saved to load earlier entries.</div>
            <div class="translationLogEntries" aria-live="polite"></div>
          </details>
          <div class="translationPackActions">
            <button class="secondary importCache">Load translation file</button>
            <button class="danger removeTranslationPack" hidden>Remove imported</button>
          </div>
          <div class="row" style="padding:5px 0 0;gap:5px">
            <button class="secondary exportCache" style="flex:1;padding:5px">Export cache backup</button>
          </div>
          <button class="danger reset" style="margin-top:7px;width:100%">Reset all data</button>
        </div>
        <div class="hint">Mod works OFFLINE during gameplay using your generated cache.</div>
      </div>
      <div class="site">
        <span class="siteLabel">Project website: <a class="projectSite" href="${SITE_URL}" target="_blank" rel="noopener noreferrer">${SITE_NAME}</a></span>
        <span class="contacts" aria-label="VN Revival contacts">
          <a class="contactIcon discord" href="https://discord.gg/QgyeWW3Jg" target="_blank" rel="noopener noreferrer" title="Discord" aria-label="VN Revival on Discord">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 6.2A15 15 0 0 1 10 5.3l.4.8a10 10 0 0 1 3.2 0l.4-.8a15 15 0 0 1 2.9.9c1.8 2.5 2.3 4.9 2 7.2a12 12 0 0 1-3.6 1.8l-.9-1.2c.7-.3 1.3-.6 1.8-1.1-3.4 1.6-7.2 1.6-10.5 0 .5.5 1.1.8 1.8 1.1l-.9 1.2A12 12 0 0 1 3 13.4c-.3-2.3.2-4.7 2-7.2.7-.3 1.4-.6 2.1-.8v.8Zm2.1 6.1c.8 0 1.4-.8 1.4-1.8S10 8.7 9.2 8.7s-1.4.8-1.4 1.8.6 1.8 1.4 1.8Zm5.6 0c.8 0 1.4-.8 1.4-1.8s-.6-1.8-1.4-1.8-1.4.8-1.4 1.8.6 1.8 1.4 1.8Z"/></svg>
          </a>
          <a class="contactIcon telegram" href="https://t.me/VnRevival" target="_blank" rel="noopener noreferrer" title="Telegram" aria-label="VN Revival on Telegram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.4 18.3 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8.9 11.3c-1.1-.3-1.1-1 .2-1.5L20 2.5c.9-.3 1.7.2 1.5.9Z"/></svg>
          </a>
          <a class="contactIcon email" href="mailto:master1c8@proton.me" target="_blank" rel="noopener noreferrer" title="master1c8@proton.me" aria-label="Email master1c8@proton.me">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.1L20.2 7H3.8l8.2 5.1Zm0 2.3L3 8.8V17h18V8.8l-9 5.6Z"/></svg>
          </a>
        </span>
      </div>
      <div class="packModal" role="dialog" aria-modal="true" aria-labelledby="packDialogTitle" hidden>
        <div class="packDialog">
          <div class="packDialogTitle" id="packDialogTitle">Import translation</div>
          <div class="packDialogFile"></div>
          <label>Language<select class="packLanguage"></select></label>
          <label class="packProviderRow">Translation source<select class="packProvider"></select></label>
          <div class="packSummary"></div>
          <div class="packWarning">The imported translation will be shown before your own provider cache. Your existing translations will not be overwritten.</div>
          <div class="packDialogActions"><button class="secondary packCancel" type="button">Cancel</button><button class="primary packConfirm" type="button">Import</button></div>
        </div>
      </div>
    </div>`;
  }

  return Object.freeze({
    contractVersion: 1,
    render
  });
});
