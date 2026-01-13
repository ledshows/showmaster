/* Showmaster Builder
 * 320x240 drag+resize UI builder for ESP32 remotes
 */

(function () {
  const DEVICE_W = 320;
  const DEVICE_H = 240;
  const CONFIG_FILE = 'plugin.showmaster.json';

  const STATUS_SOURCES = [
    { id: 'player.statusText', label: 'player.statusText' },
    { id: 'player.uptime', label: 'player.uptime' },
    { id: 'player.currentPlaylist', label: 'player.currentPlaylist' },
    { id: 'player.currentSequence', label: 'player.currentSequence' },
    { id: 'player.mode', label: 'player.mode' },
    { id: 'player.volume', label: 'player.volume' }
  ];

  let state = {
    device: { w: DEVICE_W, h: DEVICE_H, bg: '#05070d' },
    widgets: []
  };

  let selectedId = null;
  let commandsCache = [];

  function uid(prefix) {
    const r = Math.random().toString(16).slice(2, 10);
    return `${prefix}_${Date.now().toString(16)}_${r}`;
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function toast(msg, isError) {
    const $t = $('#smToast');
    $t.text(msg);
    $t.css({ borderColor: isError ? 'rgba(239,68,68,0.65)' : '#00e5ff' });
    $t.stop(true, true).fadeIn(120);
    setTimeout(() => $t.fadeOut(250), 2600);
  }

  function getSelected() {
    return state.widgets.find(w => w.id === selectedId) || null;
  }

  function normalizeWidget(w) {
    w.x = clamp(w.x, 0, DEVICE_W - 1);
    w.y = clamp(w.y, 0, DEVICE_H - 1);
    w.w = clamp(w.w, 10, DEVICE_W);
    w.h = clamp(w.h, 10, DEVICE_H);

    // keep inside bounds
    if (w.x + w.w > DEVICE_W) w.x = DEVICE_W - w.w;
    if (w.y + w.h > DEVICE_H) w.y = DEVICE_H - w.h;
    w.x = clamp(w.x, 0, DEVICE_W - 10);
    w.y = clamp(w.y, 0, DEVICE_H - 10);



    // style defaults
    if (w.bg === undefined) w.bg = (w.type === 'action') ? '#0b1220' : '#111827';
    if (w.fg === undefined) w.fg = '#e8f9ff';
    if (w.border === undefined) w.border = '#00e5ff';
    if (w.type === 'action') {
      w.label = (w.label ?? 'Button').toString();
      w.command = (w.command ?? '').toString();
      if (w.icon === undefined) w.icon = '';
    } else if (w.type === 'status') {
      w.source = (w.source ?? 'player.statusText').toString();
    }
    return w;
  }

  function setSelection(id) {
    selectedId = id;
    $('.sm-widget').removeClass('sm-selected');
    if (id) $(`.sm-widget[data-id='${id}']`).addClass('sm-selected');
    renderProps();
  }

  function renderCanvas() {
    const $canvas = $('#smCanvas');
    $canvas.find('.sm-widget').remove();

    state.widgets.forEach(w => {
      const $el = $('<div class="sm-widget" />');
      $el.attr('data-id', w.id);
      $el.attr('data-type', w.type);
      $el.css({ left: w.x, top: w.y, width: w.w, height: w.h, background: w.bg, color: w.fg, borderColor: w.border });

      if (w.type === 'action') {
        const icon = (w.icon || '').trim();
        const iconClass = iconToFaClass(icon);
        const iconHtml = iconClass ? `<i class="${escapeHtml(iconClass)} sm-fa"></i>` : '';
        $el.addClass('sm-action').html(`
          <div class="sm-inner">
            ${iconHtml}
            <span class="sm-label">${escapeHtml(w.label || 'Button')}</span>
          </div>
        `);
      } else {
        $el.addClass('sm-status').html(`
          <div class="sm-inner">
            <span class="sm-label">${escapeHtml(w.source || 'player.statusText')}</span>
          </div>
        `);
      }

      $el.on('mousedown', (e) => {
        e.stopPropagation();
        setSelection(w.id);
      });

      $canvas.append($el);

      if ($.fn.draggable && $.fn.resizable) {
        $el.draggable({
          containment: 'parent',
          scroll: false,
          start: () => setSelection(w.id),
          drag: (e, ui) => {
            w.x = Math.round(ui.position.left);
            w.y = Math.round(ui.position.top);
            syncPropsXYWH(w);

    // widget colors
    $('#smBg').val(w.bg || '#0b1220');
    $('#smFg').val(w.fg || '#e8f9ff');
    $('#smBorder').val(w.border || '#00e5ff');
          },
          stop: (e, ui) => {
            w.x = Math.round(ui.position.left);
            w.y = Math.round(ui.position.top);
            normalizeWidget(w);
            $el.css({ left: w.x, top: w.y, background: w.bg, color: w.fg, borderColor: w.border });
            syncPropsXYWH(w);

    // widget colors
    $('#smBg').val(w.bg || '#0b1220');
    $('#smFg').val(w.fg || '#e8f9ff');
    $('#smBorder').val(w.border || '#00e5ff');
          }
        }).resizable({
          containment: 'parent',
          handles: 'n,e,s,w,ne,se,sw,nw',
          start: () => setSelection(w.id),
          resize: (e, ui) => {
            w.x = Math.round(ui.position.left);
            w.y = Math.round(ui.position.top);
            w.w = Math.round(ui.size.width);
            w.h = Math.round(ui.size.height);
            syncPropsXYWH(w);

    // widget colors
    $('#smBg').val(w.bg || '#0b1220');
    $('#smFg').val(w.fg || '#e8f9ff');
    $('#smBorder').val(w.border || '#00e5ff');
          },
          stop: (e, ui) => {
            w.x = Math.round(ui.position.left);
            w.y = Math.round(ui.position.top);
            w.w = Math.round(ui.size.width);
            w.h = Math.round(ui.size.height);
            normalizeWidget(w);
            $el.css({ left: w.x, top: w.y, width: w.w, height: w.h, background: w.bg, color: w.fg, borderColor: w.border });
            syncPropsXYWH(w);

    // widget colors
    $('#smBg').val(w.bg || '#0b1220');
    $('#smFg').val(w.fg || '#e8f9ff');
    $('#smBorder').val(w.border || '#00e5ff');
          }
        });
      }
    });

    if (selectedId) {
      $(`.sm-widget[data-id='${selectedId}']`).addClass('sm-selected');
    }
  }

  function iconToFaClass(name) {
    name = (name || '').trim();
    if (!name) return '';
    if (name.includes('fa ')) return name;
    if (name.startsWith('fa-')) return `fa ${name}`;
    return `fa fa-${name}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderProps() {
    const w = getSelected();
    if (!w) {
      $('#smPropsForm').hide();
      $('#smNoSelection').show();
      return;
    }

    $('#smNoSelection').hide();
    $('#smPropsForm').show();

    $('#smType').val(w.type);
    $('#smId').val(w.id);

    syncPropsXYWH(w);

    // widget colors
    $('#smBg').val(w.bg || '#0b1220');
    $('#smFg').val(w.fg || '#e8f9ff');
    $('#smBorder').val(w.border || '#00e5ff');

    if (w.type === 'action') {
      $('#smActionFields').show();
      $('#smStatusFields').hide();
      $('#smLabel').val(w.label || '');

      // command select options
      populateCommandsSelect();
      $('#smCommand').val(w.command || '');

      populateIconPicker();
      $('#smIconSearch').val(w.icon || '');
      filterIconPick(w.icon || '');
      syncIconPickSelection(w.icon || '');
    } else {
      $('#smActionFields').hide();
      $('#smStatusFields').show();
      populateSourcesSelect();
      $('#smSource').val(w.source || 'player.statusText');
    }
  }

  function syncPropsXYWH(w) {
    if (!w || w.id !== selectedId) return;
    $('#smX').val(w.x);
    $('#smY').val(w.y);
    $('#smW').val(w.w);
    $('#smH').val(w.h);
  }

  function populateSourcesSelect() {
    const $s = $('#smSource');
    if ($s.children().length) return;
    STATUS_SOURCES.forEach(x => {
      $s.append(`<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`);
    });
  }


  function getFaIconList() {
    if (Array.isArray(window.faIcons)) return window.faIcons;
    if (Array.isArray(window.icons)) return window.icons;
    return [];
  }

  function populateIconPicker() {
    const $pick = $('#smIconPick');
    if ($pick.data('populated')) return;
    const list = getFaIconList();
    $pick.empty();
    $pick.append('<option value="">(none)</option>');
    list.forEach(n => {
      const name = String(n || '').replace(/^fa-/, '');
      $pick.append(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
    });
    $pick.data('populated', true);
  }

  function syncIconPickSelection(iconName) {
    const name = String(iconName || '').replace(/^fa-/, '');
    $('#smIconPick').val(name);
  }

  function filterIconPick(q) {
    q = (q || '').toLowerCase().trim();
    const list = getFaIconList();
    const $pick = $('#smIconPick');
    $pick.empty();
    $pick.append('<option value="">(none)</option>');
    const max = 400;
    let count = 0;
    for (const n of list) {
      const name = String(n || '').replace(/^fa-/, '');
      if (!q || name.includes(q)) {
        $pick.append(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
        count++;
        if (count >= max) break;
      }
    }
  }

  function populateCommandsSelect() {
    const $c = $('#smCommand');
    if ($c.data('populated') && $c.children().length > 0) return;

    $c.empty();
    $c.append('<option value="">(none)</option>');
    commandsCache.forEach(cmd => {
      $c.append(`<option value="${escapeHtml(cmd)}">${escapeHtml(cmd)}</option>`);
    });
    $c.data('populated', true);
  }

  async function fetchCommands() {
    try {
      const resp = await fetch('/api/commands');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      // FPP may return {commands:[...]} or an array; support both
      let list = [];
      if (Array.isArray(json)) list = json;
      else if (Array.isArray(json.commands)) list = json.commands;
      else if (Array.isArray(json.data)) list = json.data;
      else list = [];

      // normalize to names
      commandsCache = list.map(x => (typeof x === 'string' ? x : (x.name || x.command || ''))).filter(Boolean);
      commandsCache.sort((a, b) => a.localeCompare(b));
    } catch (e) {
      commandsCache = [];
      console.warn('Showmaster: could not load /api/commands', e);
      toast('Could not load command list (still usable).', true);
    }
  }

  function addWidget(type) {
    const base = {
      id: uid(type),
      type,
      x: 10,
      y: 10,
      w: type === 'status' ? 170 : 120,
      h: type === 'status' ? 26 : 44
    };

    // style
    base.bg = (type === 'action') ? '#0b1220' : '#111827';
    base.fg = '#e8f9ff';
    base.border = '#00e5ff';

    if (type === 'action') {
      base.label = 'Button';
      base.command = '';
      base.icon = '';
    } else {
      base.source = 'player.statusText';
    }

    state.widgets.push(normalizeWidget(base));
    renderCanvas();
    setSelection(base.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const idx = state.widgets.findIndex(w => w.id === selectedId);
    if (idx >= 0) state.widgets.splice(idx, 1);
    selectedId = null;
    $('#smCanvas').css({ background: state.device.bg || '#05070d' });
    $('#smCanvasBg').val(state.device.bg || '#05070d');
    renderCanvas();
    renderProps();
  }

  function toExport() {
    // Export format expected by ESP32 (no internal ids)
    return {
      device: { w: DEVICE_W, h: DEVICE_H, bg: state.device.bg || '#05070d' },
      widgets: state.widgets.map(w => {
        const out = { ...w };
        delete out.id;
        // keep only relevant fields
        if (out.type === 'action') {
          delete out.source;
        } else {
          delete out.label;
          delete out.command;
          delete out.icon;
        }
        return out;
      })
    };
  }

  async function saveConfig() {
    try {
      const data = JSON.stringify(toExport(), null, 2);
      const resp = await fetch(`api/configfile/${CONFIG_FILE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast('Saved.');
      $('#smSave').addClass('success');
      setTimeout(() => $('#smSave').removeClass('success'), 1500);
    } catch (e) {
      console.error(e);
      toast('Save failed.', true);
    }
  }

  async function loadConfig() {
    // try saved config
    try {
      const resp = await fetch(`api/configfile/${CONFIG_FILE}`);
      if (resp.ok) {
        const json = await resp.json();
        applyLoaded(json);
        toast('Loaded.');
        return;
      }
    } catch (e) {
      // ignore
    }

    // fallback to plugin default
    try {
      const resp2 = await fetch('plugin.php?plugin=showmaster&file=data/default.json&nopage=1');
      if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
      const json2 = await resp2.json();
      applyLoaded(json2);
      toast('Loaded default.');
    } catch (e) {
      console.error(e);
      toast('Load failed.', true);
    }
  }

  function applyLoaded(json) {
    const widgets = Array.isArray(json?.widgets) ? json.widgets : [];
    state = {
      device: { w: DEVICE_W, h: DEVICE_H, bg: state.device.bg || '#05070d' },
      widgets: widgets.map(w => normalizeWidget({ ...w, id: w.id || uid(w.type || 'w') }))
    };
    selectedId = null;
    $('#smCanvas').css({ background: state.device.bg || '#05070d' });
    $('#smCanvasBg').val(state.device.bg || '#05070d');
    renderCanvas();
    renderProps();
  }

  async function uploadToDevice() {
    const ip = ($('#smDeviceIp').val() || '').trim();
    if (!ip) {
      toast('Enter device IP.', true);
      $('#smDeviceIp').focus();
      return;
    }

    try {
      const payload = {
        ip,
        config: toExport()
      };

      const resp = await fetch('plugin.php?plugin=showmaster&file=api/push.php&nopage=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const txt = await resp.text();
      let data = null;
      try { data = JSON.parse(txt); } catch { /* ignore */ }

      if (!resp.ok || (data && data.ok === false)) {
        const msg = (data && data.error) ? data.error : `Upload failed (HTTP ${resp.status})`;
        throw new Error(msg);
      }

      toast('Uploaded to device.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e), true);
    }
  }

  function wirePropsInputs() {
    function applyNumeric(id, key, max) {
      $(id).on('input', function () {
        const w = getSelected();
        if (!w) return;
        w[key] = clamp($(this).val(), 0, max);

        if (key === 'w') w.w = clamp(w.w, 10, DEVICE_W);
        if (key === 'h') w.h = clamp(w.h, 10, DEVICE_H);
        normalizeWidget(w);

        const $el = $(`.sm-widget[data-id='${w.id}']`);
        $el.css({ left: w.x, top: w.y, width: w.w, height: w.h, background: w.bg, color: w.fg, borderColor: w.border });
      });
    }

    applyNumeric('#smX', 'x', DEVICE_W);
    applyNumeric('#smY', 'y', DEVICE_H);
    applyNumeric('#smW', 'w', DEVICE_W);
    applyNumeric('#smH', 'h', DEVICE_H);

    $('#smLabel').on('input', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      w.label = $(this).val();
      $(`.sm-widget[data-id='${w.id}'] .sm-label`).text(w.label);
    });

    // icon picker
    $('#smIconPick').on('change', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      w.icon = $(this).val();
      renderCanvas();
      setSelection(w.id);
    });

    $('#smCommand').on('change', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      w.command = $(this).val();
    });

    $('#smSource').on('change', function () {
      const w = getSelected();
      if (!w || w.type !== 'status') return;
      w.source = $(this).val();
      $(`.sm-widget[data-id='${w.id}'] .sm-label`).text(w.source);
    });


    // widget colors
    function applyColor(id, key) {
      $(id).on('input', function () {
        const w = getSelected();
        if (!w) return;
        w[key] = $(this).val();
        const $el = $(`.sm-widget[data-id='${w.id}']`);
        $el.css({ background: w.bg, color: w.fg, borderColor: w.border });
      });
    }

    applyColor('#smBg', 'bg');
    applyColor('#smFg', 'fg');
    applyColor('#smBorder', 'border');

    // device background
    $('#smCanvasBg').on('input', function () {
      state.device.bg = $(this).val();
      $('#smCanvas').css({ background: state.device.bg || '#05070d' });
    });

    // icon picker
    $('#smIconSearch').on('input', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      const v = $(this).val();
      w.icon = v;
      filterIconPick(v);
      syncIconPickSelection(v);
      renderCanvas();
      setSelection(w.id);
    });

    $('#smIconPick').on('change', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      const v = $(this).val();
      w.icon = v;
      $('#smIconSearch').val(v);
      renderCanvas();
      setSelection(w.id);
    });

  }

  function ensureCanvasSizing() {
    const $c = $('#smCanvas');
    $c.css({ width: DEVICE_W, height: DEVICE_H, background: state.device.bg || '#05070d' });
  }

  async function init() {
    ensureCanvasSizing();

    // click empty canvas clears selection
    $('#smCanvas').on('mousedown', function () {
      setSelection(null);
    });

    // buttons
    $('#smAddAction').on('click', () => addWidget('action'));
    $('#smAddStatus').on('click', () => addWidget('status'));
    $('#smDelete').on('click', deleteSelected);
    $('#smSave').on('click', saveConfig);
    $('#smLoad').on('click', loadConfig);
    $('#smUpload').on('click', uploadToDevice);

    // del key
    $(document).on('keydown', function (e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        // ignore when typing in inputs
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        deleteSelected();
      }
    });

    wirePropsInputs();
    await fetchCommands();
    await loadConfig();

    if (!($.fn.draggable && $.fn.resizable)) {
      toast('Note: jQuery UI not found. Drag/resize may not work on this FPP build.', true);
    }
  }

  // boot
  $(init);
})();
