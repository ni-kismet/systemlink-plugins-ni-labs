/*
 * TimeRangeControl — a reusable "creation-time / date range" filter control.
 * ---------------------------------------------------------------------------
 * A self-contained, dependency-free drop-in you can copy into any workspace.
 * It renders a compact trigger button (Nimble outline-select style) that opens
 * a popover with an absolute From/To range plus quick relative presets
 * (Last hour, Last 24 hours, … Last year). It injects its own CSS once, themes
 * itself from NI Nimble design tokens when present (with sensible fallbacks),
 * and works inside or outside a <nimble-theme-provider>.
 *
 * Usage
 * -----
 *   <script src="components/time-range-control.js"></script>
 *
 *   const control = TimeRangeControl.create({
 *     mount: '#toolbar',            // Element or selector to append the button into (optional)
 *     defaultValue: '90d',          // initial preset key (default '90d')
 *     onChange: (range, detail) => {
 *       // range  = { start: Date, end: Date } | null   (null means "Any time")
 *       // detail = { mode: 'preset'|'custom', value, custom }
 *       reloadData(range);
 *     },
 *   });
 *
 *   control.getRange();   // -> { start, end } | null   (presets recompute "now" each call)
 *   control.getState();   // -> { mode, value, custom }
 *   control.setPreset('30d');
 *   control.setCustomRange(startDate, endDate);
 *   control.element;      // the trigger <button>
 *   control.destroy();    // remove the control + listeners
 *
 * Customizing presets:
 *   TimeRangeControl.create({
 *     presets: { all: 'Any time', '7d': 'Last 7 days', '30d': 'Last 30 days' },
 *     defaultValue: '7d',
 *   });
 * Preset keys are "<amount><unit>" where unit is m|h|d|w|y (minutes/hours/days/
 * weeks/years), or the special key 'all' (no lower bound → returns null range).
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'trc-styles';
  const DEFAULT_PRESETS = {
    all: 'Any time',
    '1h': 'Last hour',
    '24h': 'Last 24 hours',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    '180d': 'Last 6 months',
    '365d': 'Last year',
  };

  const CSS = `
.trc-btn {
  display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;
  height: 32px; padding: 0 8px 0 10px; border-radius: 0;
  border: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 30%, transparent);
  background: transparent; color: var(--ni-nimble-body-font-color, #202020); cursor: pointer;
  font: var(--ni-nimble-body-font, 400 14px/20px "Source Sans Pro", sans-serif);
}
.trc-btn:hover { border-color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 60%, transparent); }
.trc-btn:focus-visible { outline: none; border-color: var(--ni-nimble-button-fill-accent-color, #009fdf); }
.trc-btn[aria-expanded="true"] { border-bottom: 2px solid var(--ni-nimble-button-fill-accent-color, #009fdf); }
.trc-btn .trc-cal { width: 16px; height: 16px; color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 62%, transparent); flex-shrink: 0; }
.trc-label { margin-right: 4px; }
.trc-caret {
  width: 14px; height: 14px; margin-left: auto;
  color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 62%, transparent);
  transition: transform .12s ease; flex-shrink: 0;
}
.trc-btn[aria-expanded="true"] .trc-caret { transform: rotate(180deg); }

.trc-dialog {
  position: fixed; margin: 0; width: fit-content; max-width: min(760px, calc(100vw - 28px));
  border: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 16%, transparent);
  border-radius: 2px; padding: 0;
  background-color: #ffffff; color: var(--ni-nimble-body-font-color, #202020);
  font-family: 'Source Sans Pro', 'Segoe UI', system-ui, -apple-system, sans-serif;
  box-shadow: 0 14px 40px rgba(0, 0, 0, .3); z-index: 9999;
}
nimble-theme-provider[theme="dark"] .trc-dialog,
nimble-theme-provider[theme="color"] .trc-dialog,
.trc-dialog.trc-theme-dark { background-color: #2a2b2d; }
.trc-dialog::backdrop { background: transparent; }
.trc-form { display: flex; flex-direction: column; padding: 14px; }
.trc-layout { display: grid; grid-template-columns: max-content 210px; align-items: start; }
.trc-title { font-size: 12px; font-weight: 700; color: var(--ni-nimble-body-font-color, #202020); margin-bottom: 12px; }
.trc-absolute { display: flex; flex-direction: column; gap: 10px; padding: 6px 14px 6px 0; }
.trc-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 62%, transparent); width: fit-content; max-width: 100%; }
.trc-input-row { display: grid; grid-template-columns: minmax(0, 245px) auto; align-items: end; gap: 6px; width: fit-content; max-width: 100%; }
.trc-text {
  width: min(100%, 245px); height: 30px; box-sizing: border-box;
  padding: 0 8px; border: none; border-bottom: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 40%, transparent);
  background: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 5%, transparent);
  color: var(--ni-nimble-body-font-color, #202020); font-family: inherit; font-size: 13px;
}
.trc-text:focus-visible { outline: none; border-bottom-color: var(--ni-nimble-button-fill-accent-color, #009fdf); }
.trc-pick {
  display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border: none; background: transparent; color: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 62%, transparent);
  cursor: pointer; border-radius: 0;
}
.trc-pick:hover { color: var(--ni-nimble-button-fill-accent-color, #009fdf); }
.trc-pick svg { width: 16px; height: 16px; }
.trc-native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.trc-actions { margin-top: 2px; width: min(100%, 245px); }
.trc-actions nimble-button { width: 100%; }
.trc-apply {
  width: 100%; height: 32px; border: none; border-radius: 0; cursor: pointer;
  background: var(--ni-nimble-button-fill-accent-color, #009fdf); color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 600;
}
.trc-apply:hover { filter: brightness(1.06); }
.trc-quick {
  border-left: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 14%, transparent);
  padding: 6px 0 6px 14px; min-height: 100%;
}
.trc-quick-list { display: flex; flex-direction: column; gap: 4px; }
.trc-quick-btn {
  border: none; background: transparent; color: var(--ni-nimble-body-font-color, #202020);
  font-family: inherit; font-size: 13px; text-align: left; padding: 7px 10px; border-radius: 0; width: 100%; cursor: pointer;
}
.trc-quick-btn:hover { background: color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 8%, transparent); }
.trc-quick-btn.is-active {
  background: color-mix(in srgb, var(--ni-nimble-button-fill-accent-color, #009fdf) 15%, transparent);
  color: color-mix(in srgb, var(--ni-nimble-button-fill-accent-color, #009fdf) 80%, var(--ni-nimble-body-font-color, #202020));
  font-weight: 700;
}
.trc-err { color: var(--ni-nimble-fail-color, #ce2828); font-size: 12px; margin-top: 6px; min-height: 0; }
@media (max-width: 620px) {
  .trc-layout { grid-template-columns: 1fr; }
  .trc-quick { border-left: none; border-top: 1px solid color-mix(in srgb, var(--ni-nimble-body-font-color, #202020) 14%, transparent); padding: 10px 0 0; margin-top: 10px; }
  .trc-field, .trc-input-row, .trc-text { width: 100%; }
  .trc-input-row { grid-template-columns: minmax(0, 1fr) auto; }
}
`;

  const CAL_SVG = '<svg class="trc-cal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>';
  const CARET_SVG = '<svg class="trc-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function formatDateTimeLocal(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function formatFieldValue(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function parseFieldValue(value) {
    const raw = (value || '').trim();
    if (!raw) return null;
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  function formatDisplay(d) {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function relativeStart(value, ref) {
    ref = ref || new Date();
    if (!value || value === 'all') return null;
    const m = String(value).match(/^(\d+)([mhdwy])$/i);
    if (!m) return null;
    const amount = parseInt(m[1], 10);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const per = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5, y: 31536e6 }[m[2].toLowerCase()];
    if (!per) return null;
    return new Date(ref.getTime() - amount * per);
  }
  function openNativePicker(input) {
    if (!input) return;
    if (typeof input.showPicker === 'function') { try { input.showPicker(); return; } catch (e) { /* fall through */ } }
    input.focus(); input.click();
  }
  function elem(tag, props, html) {
    const n = document.createElement(tag);
    if (props) for (const k in props) n.setAttribute(k, props[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function create(options) {
    options = options || {};
    injectStyles();

    const presets = options.presets || DEFAULT_PRESETS;
    const order = options.order || Object.keys(presets);
    const defaultValue = (options.defaultValue && presets[options.defaultValue]) ? options.defaultValue
      : (presets['90d'] ? '90d' : order[0]);
    const onChange = typeof options.onChange === 'function' ? options.onChange : function () {};

    const state = { mode: 'preset', value: defaultValue, custom: null };

    // ----- trigger button -----
    const btn = elem('button', { type: 'button', class: 'trc-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    btn.innerHTML = CAL_SVG + '<span class="trc-label"></span>' + CARET_SVG;
    const label = btn.querySelector('.trc-label');

    // ----- dialog -----
    const dialog = elem('dialog', { class: 'trc-dialog' });
    const quickButtons = order.map((key) =>
      `<button class="trc-quick-btn" data-range="${key}" type="button">${presets[key]}</button>`
    ).join('');
    // The apply button can render as a Nimble outline button (opts.nimble) or a
    // plain styled button. Either way it is type="button" and wired via click;
    // the form's submit handler covers the Enter key inside the text fields.
    const applyBtnHtml = options.nimble
      ? '<nimble-button class="trc-apply-nimble" appearance="outline" type="button">Apply time range</nimble-button>'
      : '<button class="trc-apply" type="button">Apply time range</button>';
    dialog.innerHTML = `
      <form class="trc-form" method="dialog">
        <div class="trc-layout">
          <div class="trc-absolute">
            <div class="trc-title">Absolute time range</div>
            <label class="trc-field">
              <span>From</span>
              <div class="trc-input-row">
                <input class="trc-text trc-start" type="text" placeholder="YYYY-MM-DD HH:mm:ss" required>
                <button class="trc-pick trc-start-pick" type="button" aria-label="Pick start date and time" title="Pick start date and time">${CAL_SVG}</button>
                <input class="trc-native trc-start-native" type="datetime-local" tabindex="-1" aria-hidden="true">
              </div>
            </label>
            <label class="trc-field">
              <span>To</span>
              <div class="trc-input-row">
                <input class="trc-text trc-end" type="text" placeholder="YYYY-MM-DD HH:mm:ss" required>
                <button class="trc-pick trc-end-pick" type="button" aria-label="Pick end date and time" title="Pick end date and time">${CAL_SVG}</button>
                <input class="trc-native trc-end-native" type="datetime-local" tabindex="-1" aria-hidden="true">
              </div>
            </label>
            <div class="trc-actions">
              ${applyBtnHtml}
            </div>
            <div class="trc-err" hidden></div>
          </div>
          <aside class="trc-quick" aria-label="Quick ranges">
            <div class="trc-title">Quick ranges</div>
            <div class="trc-quick-list">${quickButtons}</div>
          </aside>
        </div>
      </form>`;
    // Mount the dialog inside the nearest theme provider (once the button is
    // placed) so it inherits Nimble tokens/fonts; fall back to <body>.

    const form = dialog.querySelector('.trc-form');
    const startText = dialog.querySelector('.trc-start');
    const endText = dialog.querySelector('.trc-end');
    const startNative = dialog.querySelector('.trc-start-native');
    const endNative = dialog.querySelector('.trc-end-native');
    const errBox = dialog.querySelector('.trc-err');

    function applyThemeClass() {
      const tp = btn.closest('nimble-theme-provider');
      const theme = tp && tp.getAttribute('theme');
      dialog.classList.toggle('trc-theme-dark', theme === 'dark' || theme === 'color');
    }
    function updateQuickState() {
      const activeValue = state.mode === 'preset' ? state.value : null;
      dialog.querySelectorAll('.trc-quick-btn').forEach((b) => {
        const isActive = activeValue != null && b.dataset.range === activeValue;
        b.classList.toggle('is-active', isActive);
        if (isActive) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
    function updateButton() {
      updateQuickState();
      if (state.mode === 'custom' && state.custom) {
        label.textContent = `${formatDisplay(state.custom.start)} – ${formatDisplay(state.custom.end)}`;
        btn.title = `${state.custom.start.toLocaleString()} to ${state.custom.end.toLocaleString()}`;
        return;
      }
      label.textContent = presets[state.value] || presets[defaultValue];
      btn.title = options.label || 'Filter by time';
    }
    function position() {
      const margin = 12;
      const triggerRect = btn.getBoundingClientRect();
      dialog.style.maxWidth = `${Math.max(320, window.innerWidth - margin * 2)}px`;
      const rect = dialog.getBoundingClientRect();
      const left = Math.min(Math.max(triggerRect.left, margin), Math.max(margin, window.innerWidth - rect.width - margin));
      const top = Math.min(Math.max(triggerRect.bottom + 6, margin), Math.max(margin, window.innerHeight - rect.height - margin));
      dialog.style.left = `${Math.round(left)}px`;
      dialog.style.top = `${Math.round(top)}px`;
    }
    function open() {
      if (dialog.open) { close(); return; }
      applyThemeClass();
      const now = new Date();
      const fallbackStart = relativeStart(state.value, now) || new Date(now.getTime() - 30 * 864e5);
      const startDate = (state.custom && state.custom.start) || fallbackStart;
      const endDate = (state.custom && state.custom.end) || now;
      startText.value = formatFieldValue(startDate);
      endText.value = formatFieldValue(endDate);
      startNative.value = formatDateTimeLocal(startDate);
      endNative.value = formatDateTimeLocal(endDate);
      errBox.hidden = true;
      updateQuickState();
      dialog.show();
      position();
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      if (dialog.open) dialog.close();
      btn.setAttribute('aria-expanded', 'false');
    }
    function emit() {
      onChange(computeRange(), { mode: state.mode, value: state.value, custom: state.custom });
    }
    function computeRange() {
      if (state.mode === 'custom' && state.custom && state.custom.start && state.custom.end) {
        return { start: state.custom.start, end: state.custom.end };
      }
      const start = relativeStart(state.value);
      if (!start) return null;
      return { start, end: new Date() };
    }
    function applyPreset(value) {
      state.mode = 'preset';
      state.value = (value && presets[value]) ? value : defaultValue;
      state.custom = null;
      updateButton();
      close();
      emit();
    }
    function applyCustom(e) {
      if (e) e.preventDefault();
      const start = parseFieldValue(startText.value);
      const end = parseFieldValue(endText.value);
      if (!start || !end) { errBox.textContent = 'Please enter a valid time range.'; errBox.hidden = false; return; }
      if (end < start) { errBox.textContent = 'The end of the range must be after the start.'; errBox.hidden = false; return; }
      state.mode = 'custom';
      state.custom = { start, end };
      updateButton();
      close();
      emit();
    }

    // ----- wiring -----
    const onPointerDown = (e) => {
      if (!dialog.open) return;
      if (dialog.contains(e.target) || btn.contains(e.target)) return;
      close();
    };
    const onViewport = () => { if (dialog.open) position(); };
    const syncTextFromNative = (native, text) => { const p = parseFieldValue(native.value); if (p) text.value = formatFieldValue(p); };
    const syncNativeFromText = (text, native) => { const p = parseFieldValue(text.value); if (!p) return; native.value = formatDateTimeLocal(p); text.value = formatFieldValue(p); };

    btn.addEventListener('click', open);
    dialog.querySelector('.trc-apply, .trc-apply-nimble').addEventListener('click', applyCustom);
    form.addEventListener('submit', applyCustom);
    dialog.addEventListener('cancel', close);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onViewport, true);
    dialog.querySelector('.trc-start-pick').addEventListener('click', () => openNativePicker(startNative));
    dialog.querySelector('.trc-end-pick').addEventListener('click', () => openNativePicker(endNative));
    startNative.addEventListener('input', () => syncTextFromNative(startNative, startText));
    endNative.addEventListener('input', () => syncTextFromNative(endNative, endText));
    startText.addEventListener('change', () => syncNativeFromText(startText, startNative));
    endText.addEventListener('change', () => syncNativeFromText(endText, endNative));
    dialog.querySelectorAll('.trc-quick-btn').forEach((b) => {
      b.addEventListener('click', () => applyPreset(b.dataset.range || defaultValue));
    });

    // ----- mount -----
    let mount = options.mount;
    if (typeof mount === 'string') mount = document.querySelector(mount);
    if (mount) mount.appendChild(btn);

    const dialogHost = btn.closest('nimble-theme-provider') || document.body;
    dialogHost.appendChild(dialog);

    updateButton();

    return {
      element: btn,
      dialog,
      getRange: computeRange,
      getState: () => ({ mode: state.mode, value: state.value, custom: state.custom ? { start: state.custom.start, end: state.custom.end } : null }),
      setPreset: (value) => applyPreset(value),
      setCustomRange: (start, end) => {
        if (!(start instanceof Date) || !(end instanceof Date)) return;
        state.mode = 'custom'; state.custom = { start, end }; updateButton(); emit();
      },
      open,
      close,
      destroy: () => {
        document.removeEventListener('mousedown', onPointerDown);
        window.removeEventListener('resize', onViewport);
        window.removeEventListener('scroll', onViewport, true);
        dialog.remove();
        btn.remove();
      },
    };
  }

  const api = { create, DEFAULT_PRESETS, relativeStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TimeRangeControl = api;
})(typeof window !== 'undefined' ? window : this);
