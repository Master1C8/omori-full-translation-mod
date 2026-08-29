(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VNRevivalRuntimeUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function setButtonState(button, options = {}) {
    if (!button || !button.classList) throw new TypeError("A button element is required");
    const working = options.working === true;
    button.classList.toggle("working", working);
    if (typeof options.label === "string") button.textContent = options.label;
    if (typeof options.disabled === "boolean") button.disabled = options.disabled;
  }

  function setBusyGroup(controls, busy, activeControl = null) {
    for (const control of controls || []) {
      if (!control || !control.classList) continue;
      control.classList.toggle("working", busy === true && control === activeControl);
      control.disabled = busy === true;
    }
  }

  function setDisabled(controls, disabled) {
    for (const control of controls || []) {
      if (control) control.disabled = disabled === true;
    }
  }

  return Object.freeze({
    contractVersion: 1,
    setButtonState,
    setBusyGroup,
    setDisabled
  });
});
