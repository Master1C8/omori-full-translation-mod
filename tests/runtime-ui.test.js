"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const runtimeUI = require("../src/runtime-ui.js");

function control() {
  const classes = new Set();
  return {
    textContent: "",
    disabled: false,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    }
  };
}

test("button state updates label, spinner class, and availability together", () => {
  const button = control();
  runtimeUI.setButtonState(button, { working: true, label: "Working…", disabled: true });
  assert.equal(button.textContent, "Working…");
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains("working"), true);

  runtimeUI.setButtonState(button, { working: false, label: "Ready", disabled: false });
  assert.equal(button.textContent, "Ready");
  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains("working"), false);
});

test("busy group gives the spinner only to the active control", () => {
  const install = control();
  const remove = control();
  runtimeUI.setBusyGroup([install, remove], true, remove);
  assert.equal(install.disabled, true);
  assert.equal(remove.disabled, true);
  assert.equal(install.classList.contains("working"), false);
  assert.equal(remove.classList.contains("working"), true);

  runtimeUI.setBusyGroup([install, remove], false);
  assert.equal(install.disabled, false);
  assert.equal(remove.disabled, false);
  assert.equal(remove.classList.contains("working"), false);
});

test("disabled state can be applied to a related control group", () => {
  const first = control();
  const second = control();
  runtimeUI.setDisabled([first, second], true);
  assert.equal(first.disabled, true);
  assert.equal(second.disabled, true);
});
