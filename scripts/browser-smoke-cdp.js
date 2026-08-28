#!/usr/bin/env node
"use strict";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Browser smoke received an invalid DevTools port.");
  process.exit(1);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.url.includes("runtime-smoke.html"));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {
      // Chrome may publish its port before the target list is ready.
    }
    await delay(100);
  }
  throw new Error("Browser smoke page did not appear in DevTools.");
}

async function run() {
  const page = await findPage();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools.")), { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "Chrome DevTools command failed."));
    else resolve(message.result || {});
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  let outcome;
  try {
    outcome = await command("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        const started = Date.now();
        const check = () => {
          const result = document.getElementById("result");
          if (document.title === "PASS" || document.title === "FAIL") {
            resolve({ title: document.title, result: result ? result.textContent : "" });
          } else if (Date.now() - started >= 30000) {
            resolve({ title: "TIMEOUT", result: result ? result.textContent : "" });
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
  } finally {
    await command("Browser.close").catch(() => {});
    socket.close();
  }

  const value = outcome && outcome.result ? outcome.result.value : null;
  let result = null;
  try {
    result = value && value.result ? JSON.parse(value.result) : null;
  } catch (_) {
    result = null;
  }
  if (!value || value.title !== "PASS" || !result || result.passed !== true) {
    console.error(`Browser smoke failed: ${JSON.stringify(value || { title: "NO_RESULT" })}`);
    process.exit(1);
  }
  console.log("Browser smoke passed");
}

run().catch((error) => {
  console.error(error && error.message ? error.message : "Browser smoke failed.");
  process.exit(1);
});
