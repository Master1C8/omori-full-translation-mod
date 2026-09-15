(() => {
  "use strict";
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  const $ = (selector) => document.querySelector(selector);
  const state = { adapters: [], projects: [], project: null, entries: [] };
  let toastTimer;

  async function api(path, options = {}) {
    const headers = { "X-Workbench-Token": token, ...(options.headers || {}) };
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    const value = type.includes("json") ? await response.json() : await response.blob();
    if (!response.ok) throw new Error(value.message || `Request failed (${response.status})`);
    return value;
  }

  function toast(message, error = false) {
    const element = $("#toast");
    element.textContent = message;
    element.className = `show${error ? " error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.className = ""; }, 5000);
  }

  async function busy(button, action) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Working…";
    try { return await action(); }
    catch (error) { toast(error.message, true); throw error; }
    finally { button.disabled = false; button.textContent = original; }
  }

  function renderProjects() {
    const host = $("#projects");
    host.replaceChildren(...state.projects.map((project) => {
      const button = document.createElement("button");
      button.className = `project-link${state.project?.id === project.id ? " active" : ""}`;
      const strong = document.createElement("strong");
      strong.textContent = project.title;
      const detail = document.createElement("span");
      detail.textContent = `${project.targetLanguage} · ${project.counts.reviewed || 0}/${project.total} reviewed`;
      button.append(strong, detail);
      button.addEventListener("click", () => selectProject(project.id));
      return button;
    }));
  }

  function renderStats(summary) {
    const values = [
      [summary.total, "Total"], [summary.glossaryCount || 0, "Site glossary"], [summary.counts.new || 0, "New"], [summary.counts.draft || 0, "AI drafts"],
      [summary.counts["needs-review"] || 0, "Needs review"], [summary.counts.reviewed || 0, "Reviewed"],
    ];
    $("#stats").innerHTML = values.map(([number, label]) => `<div class="stat"><b>${number}</b><span>${label}</span></div>`).join("");
    $("#build").disabled = !summary.readyToBuild;
  }

  function entryCard(entry) {
    const article = document.createElement("article");
    article.className = "entry";
    const head = document.createElement("div"); head.className = "entry-head";
    const context = document.createElement("span");
    context.textContent = [entry.context?.kind, entry.context?.asset, entry.context?.messageId].filter(Boolean).join(" · ") || entry.id;
    const badge = document.createElement("span"); badge.className = `badge ${entry.state}`; badge.textContent = entry.state.replace("-", " ");
    head.append(context, badge);
    const grid = document.createElement("div"); grid.className = "entry-grid";
    const source = column("Source", entry.source, "source-text");
    const draft = column("OpenAI-compatible draft", entry.draft || "No draft yet", "draft-text");
    const finalColumn = document.createElement("div"); finalColumn.className = "entry-column";
    const title = document.createElement("h3"); title.textContent = "Editorial final";
    const textarea = document.createElement("textarea"); textarea.value = entry.final || entry.draft || ""; textarea.spellcheck = true;
    finalColumn.append(title, textarea); grid.append(source, draft, finalColumn);
    const actions = document.createElement("div"); actions.className = "entry-actions";
    const save = document.createElement("button"); save.textContent = "Save, keep unreviewed";
    const approve = document.createElement("button"); approve.className = "approve"; approve.textContent = "Approve final";
    save.addEventListener("click", () => saveEntry(entry, textarea.value, false, save));
    approve.addEventListener("click", () => saveEntry(entry, textarea.value, true, approve));
    actions.append(save, approve); article.append(head, grid, actions); return article;
  }

  function column(title, text, className) {
    const host = document.createElement("div"); host.className = "entry-column";
    const heading = document.createElement("h3"); heading.textContent = title;
    const content = document.createElement("div"); content.className = className; content.textContent = text;
    host.append(heading, content); return host;
  }

  async function loadEntries() {
    const params = new URLSearchParams({ limit: "100", state: $("#state-filter").value, q: $("#search").value });
    const result = await api(`/api/projects/${encodeURIComponent(state.project.id)}/entries?${params}`);
    state.entries = result.entries;
    $("#entries").replaceChildren(...state.entries.map(entryCard));
    $("#result-count").textContent = `${result.total} matching entries${result.total > 100 ? " · first 100 shown" : ""}`;
  }

  async function refreshProject() {
    if (!state.project) return;
    const result = await api(`/api/projects/${encodeURIComponent(state.project.id)}`);
    state.project = result.project;
    renderStats(result.project.summary);
    await loadEntries();
    const fresh = await api("/api/state"); state.projects = fresh.projects; renderProjects();
  }

  async function selectProject(id) {
    const result = await api(`/api/projects/${encodeURIComponent(id)}`);
    state.project = result.project;
    $("#empty").hidden = true; $("#workspace").hidden = false;
    $("#project-title").textContent = state.project.title;
    $("#project-adapter").textContent = state.adapters.find((value) => value.id === state.project.adapter)?.title || state.project.adapter;
    $("#project-path").textContent = state.project.sourcePath;
    const glossary = state.project.glossary || {};
    $("#glossary-status").textContent = glossary.entries?.length
      ? `VN Revival glossary · ${glossary.entries.length} terms · synced ${glossary.syncedAt} · ${glossary.fingerprint.slice(0, 12)}`
      : `VN Revival glossary for ${state.project.gameSlug}/${state.project.targetLanguage} has not been synchronized.`;
    renderProjects(); renderStats(state.project.summary); await loadEntries();
  }

  async function saveEntry(entry, final, reviewed, button) {
    await busy(button, async () => {
      await api(`/api/projects/${encodeURIComponent(state.project.id)}/entries/${encodeURIComponent(entry.id)}`, { method: "PATCH", body: { final, reviewed } });
      toast(reviewed ? "Final translation approved." : "Final text saved for further review.");
      await refreshProject();
    }).catch(() => {});
  }

  function download(url, filename) {
    api(url).then((blob) => {
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }).catch((error) => toast(error.message, true));
  }

  async function initialize() {
    if (!token) { toast("Launch the workbench from its application so the local security token is available.", true); return; }
    const result = await api("/api/state"); state.adapters = result.adapters; state.projects = result.projects;
    const select = $("#adapter-select");
    select.replaceChildren();
    state.adapters.forEach((adapter) => { const option = document.createElement("option"); option.value = adapter.id; option.textContent = adapter.title; select.append(option); });
    select.value = state.adapters.some((value) => value.id === "omori-oneloader") ? "omori-oneloader" : state.adapters[0]?.id;
    updateAdapterHelp(); renderProjects();
    if (state.projects[0]) await selectProject(state.projects[0].id);
  }

  function updateAdapterHelp() { $("#adapter-help").textContent = state.adapters.find((item) => item.id === $("#adapter-select").value)?.description || ""; }

  $("#new-project").addEventListener("click", () => $("#project-dialog").showModal());
  $("#adapter-select").addEventListener("change", updateAdapterHelp);
  $("#project-form").addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload = Object.fromEntries(values.entries());
    payload.profile = { style: String(payload.style || "").split("\n").map((value) => value.trim()).filter(Boolean) };
    delete payload.style;
    await busy($("#create-project"), async () => {
      const result = await api("/api/projects", { method: "POST", body: payload });
      $("#project-dialog").close(); await initialize(); await selectProject(result.project.id); toast("Project and VN Revival glossary created. Extract its source catalog next.");
    }).catch(() => {});
  });
  $("#save-key").addEventListener("click", () => busy($("#save-key"), async () => {
    const result = await api("/api/openai/key", { method: "POST", body: { baseURL: $("#base-url").value, apiKey: $("#api-key").value } });
    $("#api-key").value = ""; $("#provider-status").textContent = `Key stored in ${result.credentialStorage}.`; toast("API key saved securely.");
  }).catch(() => {}));
  $("#connect").addEventListener("click", () => busy($("#connect"), async () => {
    const result = await api("/api/openai/status", { method: "POST", body: { baseURL: $("#base-url").value } });
    $("#models").replaceChildren(...result.models.map((id) => { const option = document.createElement("option"); option.value = id; return option; }));
    $("#provider-status").textContent = `Connected · ${result.models.length} models · key ${result.configured ? "configured" : "not configured"}`;
  }).catch(() => {}));
  $("#extract").addEventListener("click", () => busy($("#extract"), async () => { await api(`/api/projects/${state.project.id}/extract`, { method: "POST", body: {} }); await refreshProject(); toast("Source catalog refreshed."); }).catch(() => {}));
  $("#sync-glossary").addEventListener("click", () => busy($("#sync-glossary"), async () => { await api(`/api/projects/${state.project.id}/sync-glossary`, { method: "POST", body: {} }); await refreshProject(); toast("Canonical glossary refreshed from VN Revival."); }).catch(() => {}));
  $("#draft").addEventListener("click", () => busy($("#draft"), async () => { await api(`/api/projects/${state.project.id}/draft`, { method: "POST", body: { baseURL: $("#base-url").value, model: $("#model").value, limit: 40 } }); await refreshProject(); toast("Draft batch saved. It still needs editorial review."); }).catch(() => {}));
  $("#export-review").addEventListener("click", () => download(`/api/projects/${state.project.id}/review-bundle`, `${state.project.id}-editorial-review.json`));
  $("#import-review").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { const bundle = JSON.parse(await file.text()); await api(`/api/projects/${state.project.id}/import-review`, { method: "POST", body: { bundle } }); await refreshProject(); toast("Editorial review imported."); } catch (error) { toast(error.message, true); } finally { event.target.value = ""; } });
  $("#build").addEventListener("click", () => busy($("#build"), async () => { const result = await api(`/api/projects/${state.project.id}/build`, { method: "POST", body: {} }); download(`/api/projects/${state.project.id}/artifacts/${encodeURIComponent(result.artifact.name)}`, result.artifact.name); toast("Reviewed localization built."); }).catch(() => {}));
  let searchTimer; $("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadEntries, 250); });
  $("#state-filter").addEventListener("change", loadEntries);
  initialize().catch((error) => toast(error.message, true));
})();
