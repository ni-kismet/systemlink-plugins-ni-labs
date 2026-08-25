/*
 * MultiSelectControl — a reusable multi-select dropdown (checkbox list) filter.
 * ---------------------------------------------------------------------------
 * A self-contained drop-in you can copy into any SystemLink / Nimble webapp.
 * It renders a compact trigger button (Nimble outline-select style, with the
 * field label above the control) that opens a popover containing an optional
 * search box, a select-all sentinel, and a scrollable list of checkbox options.
 * It injects its own CSS once (class prefix `msc-`), themes itself from NI
 * Nimble design tokens (with sensible fallbacks), and works inside or outside a
 * <nimble-theme-provider>.
 *
 * "All" semantics: an EMPTY selection means "All" (i.e. no filter applied).
 * Selecting every option is treated the same as selecting none.
 *
 * Dependency: uses <nimble-checkbox> when it is registered (standard in
 * SystemLink apps). Falls back to native checkboxes when it is not.
 *
 * Usage
 * -----
 *   <script src="multi-select-control.js"></script>
 *
 *   const control = MultiSelectControl.create({
 *     mount: '#toolbar',                 // Element or selector to append into
 *     label: 'Workspace',                // field label rendered above the control
 *     placeholder: 'All',                // shown when nothing is selected
 *     options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
 *     selected: [],                      // initial selected values (empty = All)
 *     onChange: (values, detail) => {
 *       // values = string[] of selected values ([] means "All")
 *       // detail = { values: Set, isAll: boolean }
 *       reloadData();
 *     },
 *   });
 *
 *   control.getSelected();               // -> string[]  ([] = All)
 *   control.setSelected(['a']);
 *   control.setOptions(newOptions);      // rebuild list; keeps valid selections
 *   control.clear();                     // back to "All"
 *   control.element;                     // the wrapper element
 *   control.destroy();
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'msc-styles';

  const CSS = `
.msc-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}
.msc-field-label {
  font: var(--ni-nimble-control-label-font, 400 12px/16px "Source Sans Pro", sans-serif);
  color: var(--ni-nimble-body-font-color, #202020);
  line-height: 1.2;
  padding-left: 2px;
}
.msc-btn {
  appearance: none;
  box-sizing: border-box;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 30%, transparent);
  background: transparent;
  border-radius: 0;
  padding: 0 10px;
  color: var(--ni-nimble-body-font-color, #202020);
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 190px;
  max-width: 240px;
  width: 220px;
  text-align: left;
  font: var(--ni-nimble-body-font, 400 14px/20px "Source Sans Pro", sans-serif);
  transition: border-color 120ms ease;
}
.msc-value {
  flex: 1 1 auto;
  color: var(--ni-nimble-body-font-color, #202020);
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.msc-btn.has-selection .msc-value { font-weight: 600; }
.msc-caret {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-right: 1.5px solid var(--ni-nimble-body-font-color, #202020);
  border-bottom: 1.5px solid var(--ni-nimble-body-font-color, #202020);
  transform: translateY(-2px) rotate(45deg);
  transition: transform 120ms ease;
  opacity: 0.7;
}
.msc-btn:hover { border-color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 60%, transparent); }
.msc-btn:focus-visible { outline: none; border-color: var(--ni-nimble-button-fill-accent-color, #009fdf); }
.msc-btn[aria-expanded="true"] {
  border-bottom-color: var(--ni-nimble-button-fill-accent-color, #009fdf);
  box-shadow: inset 0 -2px 0 0 var(--ni-nimble-button-fill-accent-color, #009fdf);
}
.msc-btn[aria-expanded="true"] .msc-caret { transform: translateY(1px) rotate(-135deg); }

.msc-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  background: var(--ni-nimble-application-background-color, #ffffff);
  border: 1px solid var(--ni-nimble-divider-background-color, rgba(0,0,0,.1));
  border-radius: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  padding: 0;
  min-width: 180px;
  max-width: 280px;
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msc-panel.msc-theme-dark { background-color: #2a2b2d; }
.msc-panel[hidden] { display: none; }

.msc-search-wrap {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  width: 100%;
  border-bottom: 1px solid var(--ni-nimble-divider-background-color, rgba(0,0,0,.1));
  background: var(--ni-nimble-application-background-color, #ffffff);
}
.msc-panel.msc-theme-dark .msc-search-wrap { background: #2a2b2d; }
.msc-search-icon {
  flex: 0 0 auto;
  margin-left: 10px;
  width: 16px;
  height: 16px;
  color: var(--ni-nimble-placeholder-font-color, #6b6b6b);
  pointer-events: none;
}
.msc-search {
  flex: 1 1 auto;
  width: 100%;
  padding: 7px 10px 7px 8px;
  border: none;
  background: transparent;
  color: var(--ni-nimble-body-font-color, #202020);
  font: var(--ni-nimble-body-font, 400 14px/20px "Source Sans Pro", sans-serif);
  outline: none;
  box-sizing: border-box;
}
.msc-search:focus { outline: none; }

.msc-all-option-row {
  display: block;
  width: 100%;
  padding: 2px 0 0;
  border-bottom: 1px solid var(--ni-nimble-divider-background-color, rgba(0,0,0,.1));
}
.msc-all-option-row nimble-checkbox,
.msc-all-option-row .msc-native-check {
  display: block;
  margin: 0;
  padding: 2px 12px 0;
  font-weight: 600;
}
.msc-panel nimble-checkbox.msc-option:first-of-type,
.msc-panel .msc-native-check.msc-option:first-of-type { margin-top: 4px; }
.msc-panel nimble-checkbox.msc-option:last-of-type,
.msc-panel .msc-native-check.msc-option:last-of-type { margin-bottom: 4px; }
.msc-panel nimble-checkbox,
.msc-panel .msc-native-check {
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 0;
  display: block;
  max-width: 100%;
}
.msc-panel nimble-checkbox:hover,
.msc-panel .msc-native-check:hover { background: var(--ni-nimble-header-background-color, rgba(0,0,0,.06)); }
.msc-option-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.msc-native-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ni-nimble-body-font-color, #202020);
  font: var(--ni-nimble-body-font, 400 14px/20px "Source Sans Pro", sans-serif);
}
.msc-native-check input { flex: 0 0 auto; margin: 0; accent-color: var(--ni-nimble-button-fill-accent-color, #009fdf); }

@media (max-width: 980px) {
  .msc-btn { width: 190px; min-width: 170px; }
}
`;

  const SEARCH_SVG = '<svg class="msc-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function elem(tag, props, html) {
    const n = document.createElement(tag);
    if (props) for (const k in props) n.setAttribute(k, props[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  const hasNimbleCheckbox = () => typeof customElements !== 'undefined' && !!customElements.get('nimble-checkbox');

  // Create a checkbox that exposes `.checked` / `.indeterminate` and emits a
  // bubbling `change` event, whether backed by nimble-checkbox or a native input.
  function createCheckbox(className, labelText, useLabelSpan) {
    if (hasNimbleCheckbox()) {
      const cb = document.createElement('nimble-checkbox');
      cb.className = className;
      if (useLabelSpan) {
        const span = document.createElement('span');
        span.className = 'msc-option-label';
        span.textContent = labelText;
        cb.appendChild(span);
      } else if (labelText != null) {
        cb.textContent = labelText;
      }
      return cb;
    }
    const lbl = document.createElement('label');
    lbl.className = className + ' msc-native-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    lbl.appendChild(input);
    if (labelText != null) {
      const span = document.createElement('span');
      span.className = 'msc-option-label';
      span.textContent = labelText;
      lbl.appendChild(span);
    }
    Object.defineProperty(lbl, 'checked', { get: () => input.checked, set: (v) => { input.checked = !!v; } });
    Object.defineProperty(lbl, 'indeterminate', { get: () => input.indeterminate, set: (v) => { input.indeterminate = !!v; } });
    return lbl;
  }

  function create(options) {
    options = options || {};
    injectStyles();

    const placeholder = options.placeholder != null ? options.placeholder : 'All';
    const allLabel = options.allLabel != null ? options.allLabel : 'All';
    const searchable = options.searchable !== false;
    const searchPlaceholder = options.searchPlaceholder || 'Search...';
    const ariaLabel = options.label || placeholder;
    const onChange = typeof options.onChange === 'function' ? options.onChange : function () {};

    const selected = new Set(options.selected || []);
    const labels = new Map(); // value -> label

    // ----- structure -----
    const wrap = elem('div', { class: 'msc-wrap' });
    if (options.label) {
      const lbl = elem('span', { class: 'msc-field-label' });
      lbl.textContent = options.label;
      wrap.appendChild(lbl);
    }
    const btn = elem('button', { type: 'button', class: 'msc-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': ariaLabel });
    btn.innerHTML = '<span class="msc-value"></span><span class="msc-caret" aria-hidden="true"></span>';
    const valueEl = btn.querySelector('.msc-value');
    wrap.appendChild(btn);
    const panel = elem('div', { class: 'msc-panel' });
    panel.hidden = true;
    wrap.appendChild(panel);

    if (typeof options.width === 'string') btn.style.width = options.width;
    if (typeof options.minWidth === 'string') btn.style.minWidth = options.minWidth;

    let searchInput = null;

    function ensureSearch() {
      if (!searchable || panel.querySelector('.msc-search')) return;
      const sw = elem('div', { class: 'msc-search-wrap' }, SEARCH_SVG);
      searchInput = elem('input', { type: 'text', class: 'msc-search', placeholder: searchPlaceholder });
      searchInput.addEventListener('input', () => filterOptions(searchInput.value));
      searchInput.addEventListener('click', (e) => e.stopPropagation());
      sw.appendChild(searchInput);
      panel.prepend(sw);
    }

    let allCheckbox = null;
    function ensureAllOption() {
      if (panel.querySelector('.msc-all-option-row')) return;
      const row = elem('label', { class: 'msc-all-option-row' });
      allCheckbox = createCheckbox('msc-all-option', allLabel, false);
      allCheckbox.addEventListener('change', () => {
        if (allCheckbox.checked) {
          selectAllSentinel();
        } else if (selected.size === 0) {
          updateAllOption();
        }
      });
      row.appendChild(allCheckbox);
      panel.appendChild(row);
    }

    function selectAllSentinel() {
      selected.clear();
      for (const cb of panel.querySelectorAll('.msc-option')) cb.checked = false;
      if (allCheckbox) {
        allCheckbox.checked = true;
        allCheckbox.indeterminate = false;
      }
      updateButton();
      emit();
    }

    function updateAllOption() {
      if (!allCheckbox) return;
      allCheckbox.checked = selected.size === 0;
      allCheckbox.indeterminate = false;
    }

    function filterOptions(query) {
      const q = (query || '').trim().toLowerCase();
      for (const cb of panel.querySelectorAll('.msc-option')) {
        const label = (cb.getAttribute('data-label') || '').toLowerCase();
        cb.style.display = (!q || label.includes(q)) ? '' : 'none';
      }
    }

    function addOption(value, label) {
      labels.set(value, label);
      ensureSearch();
      ensureAllOption();
      const cb = createCheckbox('msc-option', label, true);
      cb.setAttribute('data-value', value);
      cb.setAttribute('data-label', label);
      cb.title = label;
      cb.checked = selected.has(value);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(value);
        else selected.delete(value);
        updateAllOption();
        updateButton();
        emit();
      });
      panel.appendChild(cb);
      updateAllOption();
    }

    function updateButton() {
      const total = labels.size;
      const count = selected.size;
      if (count === 0 || (total > 0 && count === total)) {
        valueEl.textContent = placeholder;
        valueEl.removeAttribute('title');
        btn.classList.remove('has-selection');
        updateAllOption();
        return;
      }
      const text = [...selected].map((v) => labels.get(v) || v).join(', ');
      valueEl.textContent = text;
      valueEl.title = text;
      btn.classList.add('has-selection');
      updateAllOption();
    }

    function applyThemeClass() {
      const tp = wrap.closest('nimble-theme-provider');
      const theme = tp && tp.getAttribute('theme');
      panel.classList.toggle('msc-theme-dark', theme === 'dark' || theme === 'color');
    }

    function isOpen() { return !panel.hidden; }

    function open() {
      applyThemeClass();
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (searchable) setTimeout(() => searchInput && searchInput.focus(), 50);
    }

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
      if (isOpen()) close();
      else open();
    }

    function emit() {
      onChange(getSelected(), { values: new Set(selected), isAll: selected.size === 0 });
    }

    function getSelected() { return [...selected]; }

    function setSelected(values) {
      selected.clear();
      (values || []).forEach((v) => { if (labels.has(v)) selected.add(v); });
      for (const cb of panel.querySelectorAll('.msc-option')) {
        cb.checked = selected.has(cb.getAttribute('data-value'));
      }
      updateButton();
    }

    function clearOptionEls() {
      for (const cb of panel.querySelectorAll('.msc-option')) cb.remove();
    }

    // Rebuild the option list. By default, selections that are still present in
    // the new option set are preserved.
    function setOptions(nextOptions, opts) {
      const preserve = !opts || opts.preserveSelection !== false;
      const prev = new Set(selected);
      clearOptionEls();
      labels.clear();
      selected.clear();
      (nextOptions || []).forEach((o) => {
        const value = o && typeof o === 'object' ? o.value : o;
        const label = o && typeof o === 'object' ? (o.label != null ? o.label : String(o.value)) : String(o);
        if (preserve && prev.has(value)) selected.add(value);
        addOption(value, label);
      });
      updateButton();
      if (searchInput) filterOptions(searchInput.value);
    }

    function clear() {
      selected.clear();
      for (const cb of panel.querySelectorAll('.msc-option')) cb.checked = false;
      updateButton();
    }

    // ----- wiring -----
    const onBtnClick = (e) => { e.stopPropagation(); toggle(); };
    const onPanelClick = (e) => e.stopPropagation();
    const onDocClick = (e) => {
      const t = e.target;
      if (t instanceof Element && wrap.contains(t)) return;
      if (isOpen()) close();
    };
    const onKeydown = (e) => { if (e.key === 'Escape' && isOpen()) { close(); btn.focus(); } };

    btn.addEventListener('click', onBtnClick);
    panel.addEventListener('click', onPanelClick);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown);

    // ----- mount -----
    let mount = options.mount;
    if (typeof mount === 'string') mount = document.querySelector(mount);
    if (mount) mount.appendChild(wrap);

    setOptions(options.options || [], { preserveSelection: false });
    if (options.selected && options.selected.length) setSelected(options.selected);
    updateButton();

    return {
      element: wrap,
      button: btn,
      panel,
      getSelected,
      setSelected,
      setOptions,
      addOption: (value, label) => { addOption(value, label); updateButton(); },
      clear,
      open,
      close,
      isOpen,
      destroy: () => {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeydown);
        wrap.remove();
      },
    };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MultiSelectControl = api;
})(typeof window !== 'undefined' ? window : this);
