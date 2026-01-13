/* Showmaster Builder
 * 320x240 drag+resize UI builder for the Showmaster touchscreen
 */

(function () {
  const DEVICE_W = 320;
  const DEVICE_H = 240;
  const CONFIG_FILE = 'plugin.showmaster.json';
  const GRID = 10;

  const STATUS_SOURCES = [
  { id: 'player.statusText', label: 'Player: Status text' },
  { id: 'player.mode', label: 'Player: Mode' },
  { id: 'player.volume', label: 'Player: Volume' },
  { id: 'player.uptime', label: 'Player: Uptime' },
  { id: 'player.currentPlaylist', label: 'Player: Current playlist' },
  { id: 'player.currentSequence', label: 'Player: Current sequence' },

  { id: 'system.hostname', label: 'System: Hostname' },
  { id: 'system.ip', label: 'System: IP address' },
  { id: 'system.cpuTemp', label: 'System: CPU temp' },
  { id: 'system.cpuLoad', label: 'System: CPU load' },
  { id: 'system.mem', label: 'System: Memory' },
  { id: 'system.disk', label: 'System: Disk' }
];

  let state = {
    device: { w: DEVICE_W, h: DEVICE_H, bg: '#05070d' },
    snap: true,
    widgets: []
  };

  let selectedId = null;
  let commandsCache = [];
  let playlistsCache = [];

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
    if (w.borderSize === undefined) w.borderSize = 2;
    if (w.radius === undefined) w.radius = 10;
    if (w.fontSize === undefined) w.fontSize = (w.type === 'status') ? 11 : 12;
    if (w.args === undefined) w.args = {};
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
  $canvas.empty().append('<div class="sm-grid"></div>');
  $('.sm-grid', $canvas).toggle(!!state.snap);

  state.widgets.forEach(w => {
    w = normalizeWidget(w);

    const $el = $('<div class="sm-widget"></div>');
    $el.attr('data-id', w.id);
    $el.css({
      left: Math.round(w.x * getScale()),
      top: Math.round(w.y * getScale()),
      width: Math.round(w.w * getScale()),
      height: Math.round(w.h * getScale()),
      background: w.bg,
      color: w.fg,
      borderColor: w.border,
      borderWidth: (w.borderSize ?? 2) + 'px',
      borderStyle: 'solid',
      borderRadius: (w.radius ?? 10) + 'px',
      fontSize: (w.fontSize ?? (w.type === 'status' ? 11 : 12)) + 'px'
    });

    if (w.type === 'action') {
      $el.addClass('sm-action').html(`
        <div class="sm-inner">
          <span class="sm-icon">${w.icon ? `<i class="fas fa-${escapeHtml(w.icon)}" style="font-size:${(w.iconSize ?? 14)}px"></i>` : ''}</span>
          <span class="sm-label">${escapeHtml(w.label || 'Button')}</span>
        </div>
      `);
    } else {
      $el.addClass('sm-status').html(`
        <div class="sm-inner">
          <span class="sm-label">${escapeHtml(prettySourceLabel(w.source) || w.source || 'Status')}</span>
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
        grid: state.snap ? [GRID * getScale(), GRID * getScale()] : false,
        scroll: false,
        start: () => setSelection(w.id),
        drag: (e, ui) => {
          w.x = Math.round(ui.position.left / getScale());
          w.y = Math.round(ui.position.top / getScale());
          syncPropsXYWH(w);
        },
        stop: (e, ui) => {
          let nx = Math.round(ui.position.left / getScale());
          let ny = Math.round(ui.position.top / getScale());
          if (state.snap) {
            nx = Math.round(nx / GRID) * GRID;
            ny = Math.round(ny / GRID) * GRID;
          }
          w.x = clamp(nx, 0, DEVICE_W - w.w);
          w.y = clamp(ny, 0, DEVICE_H - w.h);
          $el.css({ left: Math.round(w.x * getScale()), top: w.y });
          syncPropsXYWH(w);
        }
      });

      $el.resizable({
        containment: 'parent',
        grid: state.snap ? GRID * getScale() : false,
        handles: 'n,e,s,w,ne,se,sw,nw',
        start: () => setSelection(w.id),
        resize: (e, ui) => {
          w.x = Math.round(ui.position.left / getScale());
          w.y = Math.round(ui.position.top / getScale());
          w.w = Math.round(ui.size.width / getScale());
          w.h = Math.round(ui.size.height / getScale());
          syncPropsXYWH(w);
        },
        stop: (e, ui) => {
          let nx = Math.round(ui.position.left / getScale());
          let ny = Math.round(ui.position.top / getScale());
          let nw = Math.round(ui.size.width / getScale());
          let nh = Math.round(ui.size.height / getScale());

          if (state.snap) {
            nx = Math.round(nx / GRID) * GRID;
            ny = Math.round(ny / GRID) * GRID;
            nw = Math.max(10, Math.round(nw / GRID) * GRID);
            nh = Math.max(10, Math.round(nh / GRID) * GRID);
          }

          w.w = clamp(nw, 10, DEVICE_W);
          w.h = clamp(nh, 10, DEVICE_H);
          w.x = clamp(nx, 0, DEVICE_W - w.w);
          w.y = clamp(ny, 0, DEVICE_H - w.h);

          $el.css({ left: Math.round(w.x * getScale()), top: Math.round(w.y * getScale()), width: Math.round(w.w * getScale()), height: w.h });
          syncPropsXYWH(w);
        }
      });
    }
  });

  if (selectedId) {
    $(`[data-id='${selectedId}']`).addClass('sm-selected');
  }
}



  function iconToFaClass(name) {
    name = (name || '').trim();
    if (!name) return '';
    if (name.includes('fa ')) return name;
    if (name.startsWith('fa-')) return `fa ${name}`;
    return `fa fa-${name}`;
  }

  
// --- Icon grid helpers ---
let __iconGridBuilt = false;
function normalizeIconName(x) {
  if (!x) return '';
  if (typeof x === 'string') return x.replace(/^fa[srbld] fa-/, '').replace(/^fa-/, '').trim();
  if (typeof x === 'object') {
    if (x.icon) return normalizeIconName(x.icon);
    if (x.title) return normalizeIconName(x.title);
    if (x.name) return normalizeIconName(x.name);
  }
  return String(x);
}
function getIconList() {
  if (!window.FA_ICONS) return [];
  return window.FA_ICONS.map(normalizeIconName).filter(Boolean);
}
function buildIconGrid() {
  if (__iconGridBuilt) return;
  const icons = getIconList();
  const $g = $('#smIconGrid');
  $g.empty();
  icons.forEach(ic => {
    const safe = escapeHtml(ic);
    $g.append(`<button type="button" class="sm-iconBtn" data-icon="${safe}" title="${safe}"><i class="fas fa-${safe}"></i></button>`);
  });
  __iconGridBuilt = true;
}
function filterIconGrid(q) {
  q = (q || '').toLowerCase().trim();
  $('#smIconGrid .sm-iconBtn').each(function () {
    const ic = String($(this).data('icon') || '').toLowerCase();
    $(this).toggle(!q || ic.includes(q));
  });
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
$('#smFontSize').val(w.fontSize ?? ((w.type === 'status') ? 11 : 12));
$('#smBorderSize').val(w.borderSize ?? 2);
$('#smRadius').val(w.radius ?? 10);

    if (w.type === 'action') {
      $('#smActionFields').show();
      $('#smStatusFields').hide();
      $('#smLabel').val(w.label || '');

      // command select options
      populateCommandsSelect();
      $('#smCommand').val(w.command || '');
      $('#smCommandDisplay').val(prettyCommandLabel(w.command, w.args));
      $('#smCommandArgsJson').val(JSON.stringify(w.args || {}));
      updateCmdArgsUI(w);

      $('#smIconValue').val(w.icon || '');
      $('#smIconSize').val(w.iconSize ?? 14);
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

function prettySourceLabel(id) {
  const f = STATUS_SOURCES.find(x => x.id === id);
  return f ? f.label : id;
}

  function getFaIconList() {
  const raw = Array.isArray(window.faIcons) ? window.faIcons
            : (Array.isArray(window.icons) ? window.icons : []);
  // raw can be ["play", ...] or [{title:"fas fa-play"}, ...]
  return raw.map(x => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
      const t = String(x.title || x.name || '');
      const m = t.match(/fa-([a-z0-9-]+)/i);
      return m ? m[1] : t;
    }
    return String(x || '');
  }).filter(Boolean);
}

  function populateIconPicker() {
    if (!$('#smIconPick').length) return;
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

async function fetchPlaylists() {
  try {
    const resp = await fetch('/api/playlists');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    let list = [];
    if (Array.isArray(json)) list = json;
    else if (Array.isArray(json.playlists)) list = json.playlists;
    else if (Array.isArray(json.data)) list = json.data;
    playlistsCache = list.map(x => (typeof x === 'string' ? x : (x.name || x.playlist || x.id || ''))).filter(Boolean);
    playlistsCache.sort((a,b) => a.localeCompare(b));
  } catch (e) {
    playlistsCache = [];
    console.warn('Showmaster: could not load /api/playlists', e);
  }
}

function populatePlaylistsSelect() {
  const $p = $('#smPlaylist');
  $p.empty();
  $p.append('<option value="">(select)</option>');
  playlistsCache.forEach(name => {
    $p.append(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
  });
}

function updateCmdArgsUI(w) {
  const cmd = (w.command || '').toLowerCase();
  const wantsPlaylist = cmd.includes('startplaylist') || cmd.includes('stopplaylist') || cmd.includes('start_playlist');
  const wantsArg = (!wantsPlaylist && cmd.length > 0);

  $('#smPlaylistField').toggle(wantsPlaylist);
  $('#smArgField').toggle(wantsArg);

  if (wantsPlaylist) {
    populatePlaylistsSelect();
    $('#smPlaylist').val((w.args && (w.args.playlist || w.args.Playlist)) || '');
  } else {
    $('#smPlaylist').val('');
  }

  if (wantsArg) {
    $('#smArg').val((w.args && (w.args.arg || w.args.value)) || '');
  } else {
    $('#smArg').val('');
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
    base.borderSize = 2;
    base.radius = 10;
    base.fontSize = (type === 'status') ? 11 : 12;
    base.args = {};

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
    
// style/property inputs
$('#smBg, #smFg, #smBorder').on('input change', function () {
  const w = getSelected();
  if (!w) return;
  w.bg = $('#smBg').val();
  w.fg = $('#smFg').val();
  w.border = $('#smBorder').val();
  renderCanvas();
  setSelection(w.id);
});

$('#smFontSize').on('input change', function () {
  const w = getSelected();
  if (!w) return;
  w.fontSize = parseInt($(this).val() || '12', 10);
  renderCanvas();
  setSelection(w.id);
});

$('#smBorderSize').on('input change', function () {
  const w = getSelected();
  if (!w) return;
  w.borderSize = parseInt($(this).val() || '2', 10);
  renderCanvas();
  setSelection(w.id);
});

$('#smRadius').on('input change', function () {
  const w = getSelected();
  if (!w) return;
  w.radius = parseInt($(this).val() || '10', 10);
  renderCanvas();
  setSelection(w.id);
});

$('#smGridToggle').prop('checked', !!state.snap);
    renderCanvas();
    renderProps();
  }

  function toExport() {
    // Export format expected by Showmaster (no internal ids)
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
    $('#smGridToggle').prop('checked', !!state.snap);
    renderCanvas();
    renderProps();
  }

  
async function uploadToShowmaster() {
  const ip = ($('#smDeviceIp').val() || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    toast('Enter a valid Showmaster IP address (e.g. 192.168.1.50).', true);
    $('#smDeviceIp').focus();
    return;
  }

  const config = toExport();

  try {
    const resp = await fetch(`plugin.php?plugin=showmaster&file=api/push.php&nopage=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, config })
    });

    const txt = await resp.text();
    let json = null;
    try { json = JSON.parse(txt); } catch (e) {}

    if (!resp.ok) {
      const msg = (json && (json.error || json.message)) ? (json.error || json.message) : `Push failed (HTTP ${resp.status})`;
      toast(msg, true);
      return;
    }

    toast((json && json.message) ? json.message : 'Pushed to Showmaster.', false);
  } catch (e) {
    console.error(e);
    toast('Push failed. Check network/IP.', true);
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
        $el.css({ left: Math.round(w.x * getScale()), top: Math.round(w.y * getScale()), width: Math.round(w.w * getScale()), height: Math.round(w.h * getScale()), background: w.bg, color: w.fg, borderColor: w.border, borderWidth: (w.borderSize??2)+'px', borderRadius: (w.radius??10)+'px', fontSize: (w.fontSize??12)+'px' });
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

    // icon picker (modal)
    $('#smPickIcon').on('click', function (e) {
      e.preventDefault();
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      $('#smIconModalSearch').val(w.icon || '');
      buildIconGrid();
      filterIconGrid(w.icon || '');
      $('#smIconModal').modal('show');
    });

    $('#smIconModalSearch').on('input', function () {
      filterIconGrid($(this).val() || '');
    });

    $('#smIconGrid').on('click', '.sm-iconBtn', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      const icon = $(this).data('icon') || '';
      w.icon = icon;
      $('#smIconValue').val(icon);
      renderCanvas();
      setSelection(w.id);
      $('#smIconModal').modal('hide');
    });

    $('#smIconValue').on('input', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      w.icon = $(this).val().trim();
      renderCanvas();
      setSelection(w.id);
    });

    $('#smIconSize').on('input change', function () {
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      const v = parseInt($(this).val() || '14', 10);
      w.iconSize = Math.max(8, Math.min(64, v));
      renderCanvas();
      setSelection(w.id);
    });

    // command picker (modal)
    $('#smPickCommand').on('click', function (e) {
      e.preventDefault();
      const w = getSelected();
      if (!w || w.type !== 'action') return;
      openCommandModal(w);
    });

$('#smGridToggle').prop('checked', !!state.snap);
  }

  async 
// --- Command modal helpers (BigButtons-like) ---
function openCommandModal(w) {
  // populate command dropdown
  const $sel = $('#smCmdSelect');
  $sel.empty();
  (state.commands || []).forEach(c => {
    const name = c.name || c.command || '';
    if (!name) return;
    const opt = $('<option/>').attr('value', name).text(c.description ? `${c.description}` : name);
    opt.data('cmd', c);
    $sel.append(opt);
  });

  // select current
  if (w.command) $sel.val(w.command);

  rebuildCmdArgsUI(w);

  $sel.off('change').on('change', function () {
    w.command = $(this).val();
    w.args = w.args || {};
    rebuildCmdArgsUI(w);
  });

  $('#smCmdDone').off('click').on('click', function () {
    // read args from ui
    const args = {};
    $('#smCmdArgs [data-arg]').each(function () {
      const key = $(this).data('arg');
      if ($(this).attr('type') === 'checkbox') {
        args[key] = $(this).is(':checked') ? 1 : 0;
      } else {
        args[key] = $(this).val();
      }
    });
    // prune empty
    Object.keys(args).forEach(k => {
      if (args[k] === '' || args[k] === null || typeof args[k] === 'undefined') delete args[k];
    });
    w.args = args;

    // update display + hidden fields
    $('#smCommandDisplay').val(prettyCommandLabel(w.command, w.args));
    $('#smCommand').val(w.command || '');
    $('#smCommandArgsJson').val(JSON.stringify(w.args || {}));

    $('#smCmdModal').modal('hide');
    renderCanvas();
    setSelection(w.id);
  });

  // set display
  $('#smCommandDisplay').val(prettyCommandLabel(w.command, w.args));
  $('#smCmdModal').modal('show');
}

function prettyCommandLabel(cmd, args) {
  if (!cmd) return '';
  if (cmd.toLowerCase().includes('playlist') && args && args.playlist) {
    return `${cmd} (${args.playlist})`;
  }
  return cmd;
}

function rebuildCmdArgsUI(w) {
  const cmd = (w.command || '').toLowerCase();
  const $a = $('#smCmdArgs');
  $a.empty();

  // Start Playlist - mimic FPP modal fields
  if (cmd.includes('start') && cmd.includes('playlist')) {
    const pl = (w.args && w.args.playlist) ? w.args.playlist : '';
    $a.append(`
      <div class="form-group row">
        <label class="col-sm-3 col-form-label">Multisync:</label>
        <div class="col-sm-9"><input type="checkbox" data-arg="multisync" ${w.args && w.args.multisync ? 'checked':''}></div>
      </div>
      <div class="form-group row">
        <label class="col-sm-3 col-form-label">Playlist Name:</label>
        <div class="col-sm-9"><select class="form-control" data-arg="playlist" id="smCmdPlaylist"></select></div>
      </div>
      <div class="form-group row">
        <label class="col-sm-3 col-form-label">Repeat:</label>
        <div class="col-sm-9"><input type="checkbox" data-arg="repeat" ${w.args && w.args.repeat ? 'checked':''}></div>
      </div>
      <div class="form-group row">
        <label class="col-sm-3 col-form-label">If Not Running:</label>
        <div class="col-sm-9"><input type="checkbox" data-arg="ifNotRunning" ${w.args && w.args.ifNotRunning ? 'checked':''}></div>
      </div>
    `);

    // fill playlist list
    const $pl = $('#smCmdPlaylist');
    $pl.empty();
    (state.playlists || []).forEach(p => {
      const name = p.name || p.playlist || p;
      if (!name) return;
      $pl.append($('<option/>').attr('value', name).text(name));
    });
    if (pl) $pl.val(pl);
    return;
  }

  // Generic arg input
  $a.append(`
    <div class="form-group row">
      <label class="col-sm-3 col-form-label">Arg (optional):</label>
      <div class="col-sm-9"><input class="form-control" data-arg="arg" value="${escapeHtml((w.args && w.args.arg) || '')}" placeholder="Optional argument" /></div>
    </div>
  `);
}

async function init() {
    ensureCanvasSizing();

    // snap/grid toggle
    $('#smGridToggle').on('change', function () {
      state.snap = !!$(this).is(':checked');
      $('.sm-grid').toggle(state.snap);
      renderCanvas();
      if (selectedId) setSelection(selectedId);
    });

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
    $('#smUpload').on('click', uploadToShowmaster);

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
    await fetchPlaylists();
    await loadConfig();

    if (!($.fn.draggable && $.fn.resizable)) {
      toast('Note: jQuery UI not found. Drag/resize may not work on this FPP build.', true);
    }
  }

  // boot
  $(function(){ init().catch(function(e){ console.error(e); toast('Init failed: ' + (e && e.message ? e.message : e), true); }); });
})();