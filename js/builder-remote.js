/* Showmaster Standalone Remote (ES5-safe)
 * Renders the saved Builder layout and lets you use it directly on FPP.
 */
(function(){
  function esc(s){
    s = (s == null) ? "" : String(s);
    return s.replace(/[&<>\"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
  }

  // Font Awesome class helper (FA5 + FA6 compatible)
  // - FA5 expects:  fas / far / fab
  // - FA6 expects:  fa-solid / fa-regular / fa-brands
  // We output BOTH so whichever version is available will render icons.
  function _smFaStyleMap(){
    if (window.smFaStyleMap) return window.smFaStyleMap;
    var m = {};
    if (window.faIcons && window.faIcons.length) {
      for (var i=0;i<window.faIcons.length;i++) {
        var it = window.faIcons[i];
        if (!it || typeof it !== 'object') continue;
        var t = String(it.title || '').trim();
        if (!t) continue;
        var parts = t.split(/\s+/);
        var style = parts[0] || 'fas';
        var nm = (parts[1] || '').replace(/^fa-/, '').trim();
        if (nm) m[nm] = style;
      }
    }
    window.smFaStyleMap = m;
    return m;
  }

  function smFaClassFor(name){
    var m = _smFaStyleMap();
    var style = (m && m[name]) ? m[name] : 'fas';

    if (style.indexOf('fa-') === 0) {
      if (style === 'fa-brands') return 'fa-brands fab';
      if (style === 'fa-regular') return 'fa-regular far';
      return 'fa-solid fas';
    }

    if (style === 'fab') return 'fa-brands fab';
    if (style === 'far') return 'fa-regular far';
    return 'fa-solid ' + style;
  }
  try { window.smFaClassFor = window.smFaClassFor || smFaClassFor; } catch(e) {}

  function toast(msg, isErr){
    // Remote page: no notices/toasts (user asked).
    // Keep as no-op to avoid breaking old calls.
    void(msg); void(isErr);
  }

  // Remote page should NOT auto-rotate based on saved builder meta.

  function prettySource(id){
    // same labels as builder (kept short)
    var map = {
      'player.statusText':'Player: Status text',
      'player.playlist':'Player: Playlist',
      'player.sequence':'Player: Sequence',
      'player.volume':'Player: Volume',
      'system.time':'System: Time',
      'system.ip':'System: IP address'
      ,
      // FPP status JSON extras
      'fpp.host_name':'FPP: Host name',
      'fpp.host_description':'FPP: Host description',
      'fpp.platform':'FPP: Platform',
      'fpp.version':'FPP: Version',
      'fpp.branch':'FPP: Branch',
      'fpp.uuid':'FPP: UUID',
      'fpp.mode_name':'FPP: Mode name',
      'fpp.status_name':'FPP: Status name',
      'fpp.fppd':'FPPD: State',
      'fpp.current_playlist.playlist':'Playlist: Current playlist',
      'fpp.current_sequence':'Playlist: Current sequence',
      'fpp.volume':'Audio: Volume',
      'fpp.uptimeStr':'System: Uptime',
      'fpp.dateStr':'System: Date',
      'fpp.timeStrFull':'System: Time (full)',
      'fpp.scheduler.status':'Scheduler: Status',
      'fpp.MQTT.configured':'MQTT: Configured',
      'fpp.MQTT.connected':'MQTT: Connected',
      'fpp.sensors[0].formatted':'Sensor: CPU temp',
      'fpp.powerBad':'System: Power bad'
    };
    return map[id] || (id || '');
  }

  function widgetHtml(w){
    if (w.type === 'status') {
      // will be updated by polling
      return '<span class="sm-statusText">--</span>';
    }
    if (w.type === 'tab') {
      var label = (w.label == null) ? '' : String(w.label);
      var iconT = w.icon ? ("<i class='" + (window.smFaClassFor ? window.smFaClassFor(w.icon) : 'fa fa-solid fas') + " fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i>") : '';
      if (!label.trim()) return iconT;
      return iconT + '<span>' + esc(label) + '</span>';
    }
    // action
    var label2 = (w.label == null) ? '' : String(w.label);
    var icon = w.icon ? ("<i class='" + (window.smFaClassFor ? window.smFaClassFor(w.icon) : 'fa fa-solid fas') + " fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i>") : '';
    if (!label2.trim()) return icon;
    return icon + '<span>' + esc(label2) + '</span>';
  }

  function applyCss($el, w){
    $el.css({
      left: Math.round(w.x) + 'px',
      top: Math.round(w.y) + 'px',
      width: Math.round(w.w) + 'px',
      height: Math.round(w.h) + 'px',
      background: w.bg,
      color: w.text,
      borderColor: w.border,
      borderWidth: (w.borderSize||0) + 'px',
      borderRadius: (w.radius||0) + 'px'
    });
    try { $el.find('.sm-inner').css('font-size', (w.textSize||12) + 'px'); } catch(e){}
  }

  function normalizeWidget(w, pageH, deviceW){
    w = w || {};
    w.x = Math.max(0, Math.min((w.x||0), deviceW-1));
    w.y = Math.max(0, Math.min((w.y||0), pageH-1));
    w.w = Math.max(10, Math.min((w.w||80), deviceW));
    w.h = Math.max(10, Math.min((w.h||36), pageH));
    if (!w.bg) w.bg = (w.type==='action') ? '#6d2cff' : 'rgba(255,255,255,0.06)';
    if (!w.text) w.text = '#eaf2ff';
    if (!w.border) w.border = 'rgba(255,255,255,0.14)';
    if (typeof w.borderSize === 'undefined') w.borderSize = 2;
    if (typeof w.radius === 'undefined') w.radius = 10;
    if (typeof w.textSize === 'undefined') w.textSize = 12;
    if (typeof w.iconSize === 'undefined') w.iconSize = 14;
    if (typeof w.label === 'undefined' && (w.type==='action' || w.type==='tab')) w.label = '';
    if (w.type==='status' && !w.source) w.source='player.statusText';
    if (w.type==='action' && !w.command) w.command='';
    if (w.type==='action' && !w.args) w.args={};
    return w;
  }

  var state = {
    cfg: null,
    pages: [],
    activePageId: null,
    deviceW: 320,
    deviceH: 240,
    scale: 1,
    zoomPercent: 200,
    fitMode: false,
    canvasOnly: false,
    locked: false
  };

  function currentPage(){
    for (var i=0;i<state.pages.length;i++) if (state.pages[i].id===state.activePageId) return state.pages[i];
    return state.pages[0] || null;
  }

  function setActivePage(id){
    state.activePageId = id;
    renderCanvas();
  }

  function computeScaleAndTransform(){
    // Two modes:
    //  - Zoom: fixed zoom percentage
    //  - Fit:  auto-scale to fill the available stage (best for phones/tablets)

    var $stage = jQuery('#smRStage');
    var $scene = jQuery('#smRScene');
    var $vp = jQuery('#smRViewport');
    var $canvas = jQuery('#smRCanvas');

    // Base size = device width + current page height
    var pg = currentPage();
    var baseW = state.deviceW || 320;
    var ph = (pg && pg.h) ? parseInt(pg.h, 10) : state.deviceH;
    if (!isFinite(ph) || ph < (state.deviceH || 240)) ph = (state.deviceH || 240);
    var baseH = ph;

    var z;
    if (state.fitMode) {
      // Fit inside the stage (minus padding)
      var cw = $stage.innerWidth ? $stage.innerWidth() : $stage.width();
      var ch = $stage.innerHeight ? $stage.innerHeight() : $stage.height();
      if (!isFinite(cw) || cw <= 0) cw = baseW;
      if (!isFinite(ch) || ch <= 0) ch = baseH;
      var maxW = Math.max(100, cw - 16);
      var maxH = Math.max(100, ch - 16);
      z = Math.min(maxW / baseW, maxH / baseH);
      if (!isFinite(z) || z <= 0) z = 1;
    } else {
      z = (state.zoomPercent || 200) / 100.0;
      if (!isFinite(z) || z <= 0) z = 2;
    }
    z = Math.max(0.5, Math.min(3.0, z));
    state.scale = z;

    // Set unscaled base sizes
    $vp.css({ width: baseW + 'px', height: baseH + 'px' });
    $canvas.css({ width: baseW + 'px', height: baseH + 'px' });

    // Apply scale
    $vp.css({
      transformOrigin: '0 0',
      transform: 'scale(' + z + ')',
      position: 'absolute'
    });

    // Fit mode: center inside the visible stage and remove scroll
    if (state.fitMode) {
      var cw2 = $stage.innerWidth ? $stage.innerWidth() : $stage.width();
      var ch2 = $stage.innerHeight ? $stage.innerHeight() : $stage.height();
      if (!isFinite(cw2) || cw2 <= 0) cw2 = Math.round(baseW * z) + 16;
      if (!isFinite(ch2) || ch2 <= 0) ch2 = Math.round(baseH * z) + 16;
      var left = Math.max(8, Math.floor((cw2 - (baseW * z)) / 2));
      var top  = Math.max(8, Math.floor((ch2 - (baseH * z)) / 2));
      $vp.css({ left: left + 'px', top: top + 'px' });
      $scene.css({ width: cw2 + 'px', height: ch2 + 'px', position: 'relative' });
      $stage.css({ overflow: 'hidden' });
    } else {
      // Zoom mode: keep the viewport pinned in the scrollable scene
      $vp.css({ left: '8px', top: '8px' });
      var tw = Math.round(baseW * z) + 16;
      var th = Math.round(baseH * z) + 16;
      $scene.css({ width: tw + 'px', height: th + 'px', position: 'relative' });
      $stage.css({ overflow: 'auto' });
    }
  }

  function renderCanvas(){
    var $c = jQuery('#smRCanvas');
    $c.empty();

    computeScaleAndTransform();

    var pg = currentPage();
    if (!pg) return;

    // background (per page)
    try {
      var bg = (pg.bg || (state.cfg && state.cfg.device && state.cfg.device.bg) || '#070a12');
      $c.css('background', bg);
    } catch(e){}

    var ws = pg.widgets || [];
    for (var i=0;i<ws.length;i++) {
      (function(w0){
        var w = normalizeWidget(jQuery.extend(true, {}, w0), (pg.h || state.deviceH), state.deviceW);
        var $el = jQuery("<div class='sm-widget sm-remoteWidget'><div class='sm-inner'></div></div>");
        $el.attr('data-type', w.type);
        $el.attr('data-id', w.id);
        $el.find('.sm-inner').html(widgetHtml(w));
        applyCss($el, w);

        // click actions
        if (w.type==='action') {
          $el.css('cursor','pointer');

          // Better press feedback (mouse + touch)
          var pressOn = function(){
            try { $el.addClass('sm-pressed'); } catch(e) {}
            try { if (navigator && navigator.vibrate) navigator.vibrate(12); } catch(e2) {}
          };
          var pressOff = function(){
            try { $el.removeClass('sm-pressed'); } catch(e) {}
          };
          $el.on('mousedown touchstart pointerdown', function(){ pressOn(); });
          $el.on('mouseup mouseleave touchend touchcancel pointerup pointercancel', function(){ pressOff(); });

          $el.on('click', function(e){
            e.preventDefault();
            if (!w.command) { return; }
            // Local lock (no FPP call)
            if (isLockCommand(w.command)) {
              toggleLocked();
              return;
            }
            // When locked, ignore all other actions
            if (state.locked) { return; }

            // Normal: send FPP command
            var req = sendFppCommand(w.command, w.args || {});
            // Visual feedback: flash green on success, red on failure
            if (req && req.done && req.fail) {
              req.done(function(){
                try { $el.removeClass('sm-error').addClass('sm-fired'); } catch(e3) {}
                setTimeout(function(){ try { $el.removeClass('sm-fired'); } catch(e4) {} }, 220);
              }).fail(function(){
                try { $el.removeClass('sm-fired').addClass('sm-error'); } catch(e5) {}
                setTimeout(function(){ try { $el.removeClass('sm-error'); } catch(e6) {} }, 320);
              });
            }
          });
        }

        if (w.type==='tab') {
          $el.css('cursor','pointer');
          $el.on('click', function(e){
            e.preventDefault();
            if (w.targetPageId) setActivePage(w.targetPageId);
          });
        }

        $c.append($el);
      })(ws[i]);
    }
  }

  function loadConfig(){
    jQuery.getJSON('api/configfile/plugin.showmaster.json?plugin=showmaster').done(function(r){
      var cfg = (r && r.data) ? r.data : r;
      if (!cfg) { toast('No config found.', true); return; }

      state.cfg = cfg;
      state.deviceW = (cfg.device && cfg.device.w) ? parseInt(cfg.device.w,10) : 320;
      state.deviceH = (cfg.device && cfg.device.h) ? parseInt(cfg.device.h,10) : 240;
      if (!isFinite(state.deviceW) || state.deviceW<=0) state.deviceW=320;
      if (!isFinite(state.deviceH) || state.deviceH<=0) state.deviceH=240;

      state.pages = (cfg.pages && cfg.pages.length) ? cfg.pages : [{id:'p1', name:'Page 1', h: state.deviceH, widgets: (cfg.widgets||[])}];
      state.activePageId = cfg.activePageId || (state.pages[0] ? state.pages[0].id : 'p1');
      renderCanvas();

      startStatusPolling();
    }).fail(function(){
      toast('Failed to load config.', true);
    });
  }

  // ---- Status polling (uses FPP API) ----
  var lastStatus = null;
  var pollTimer = null;

  function getPath(obj, path){
    if (!obj || !path) return '';
    // support brackets: sensors[0].formatted
    var p = String(path).replace(/\[(\d+)\]/g, '.$1').split('.');
    var cur = obj;
    for (var i=0;i<p.length;i++) {
      var key = p[i];
      if (key === '') continue;
      if (cur == null) return '';
      cur = cur[key];
    }
    if (cur == null) return '';
    if (typeof cur === 'boolean') return cur ? 'Yes' : 'No';
    if (typeof cur === 'number') return String(cur);
    if (typeof cur === 'string') return cur;
    try { return JSON.stringify(cur); } catch(e) { return String(cur); }
  }

  function valueForSource(sourceId){
    if (!sourceId) return '';
    // New sources: fpp.* are read from /api/fppd/status
    if (sourceId.indexOf('fpp.') === 0) {
      return getPath(lastStatus, sourceId.substring(4));
    }

    // Backward-compatible mapping for older sources
    var map = {
      'player.statusText': 'status_name',
      'player.uptime': 'uptimeStr',
      'player.currentPlaylist': 'current_playlist.playlist',
      'player.currentSequence': 'current_sequence',
      'player.volume': 'volume',
      'player.mode': 'mode_name',
      'system.hostname': 'host_name',
      'system.cpuTemp': 'sensors[0].formatted',
      'system.time': 'timeStrFull'
    };
    if (map[sourceId]) return getPath(lastStatus, map[sourceId]);

    if (sourceId === 'system.ip') {
      // Best-effort: if you opened FPP by IP, use it.
      return (window.location && window.location.hostname) ? String(window.location.hostname) : '';
    }

    return '';
  }

  function updateStatusWidgets(){
    var pg = currentPage();
    if (!pg || !pg.widgets) return;
    // update all status widgets on current page
    for (var i=0;i<pg.widgets.length;i++) {
      var w = pg.widgets[i];
      if (!w || w.type !== 'status') continue;
      var val = valueForSource(w.source);
      var $w = jQuery(".sm-remoteWidget[data-id='" + esc(w.id) + "']");
      if ($w.length) {
        $w.find('.sm-inner').text(val || '');
      }
    }
  }

  function startStatusPolling(){
    if (pollTimer) { try { clearInterval(pollTimer); } catch(e){} pollTimer = null; }
    // Poll FPP status. This endpoint matches the JSON structure you shared.
    function poll(){
      // Prefer relative URL (works if FPP runs under a sub-path), fallback to absolute.
      jQuery.getJSON('api/fppd/status').done(function(js){
        lastStatus = js;
        updateStatusWidgets();
      }).fail(function(){
        jQuery.getJSON('/api/fppd/status').done(function(js2){
          lastStatus = js2;
          updateStatusWidgets();
        });
      });
    }
    poll();
    pollTimer = setInterval(poll, 1000);
  }



  // ---- Local lock (no FPP call) ----
  function isLockCommand(cmd){
    cmd = (cmd == null) ? '' : String(cmd);
    cmd = cmd.replace(/\s+/g, '').toLowerCase();
    return (cmd === 'screen.lock' || cmd === 'lockscreen' || cmd === 'lock-screen' || cmd === 'lock');
  }

  function ensureLockOverlay(){
    if (jQuery('#smRLockOverlay').length) return;
    var $ov = jQuery("<div id=\'smRLockOverlay\' class=\'sm-lockOverlay\' style=\'display:none;\'>" +
      "<div class='sm-lockCard'>" +
        "<div class='sm-lockTitle'><i class='fa fa-solid fas fa-lock'></i> Screen locked</div>" +
        "<button type='button' id='smRUnlockBtn' class='sm-unlockBtn'>Unlock</button>" +
      "</div>" +
    "</div>");
    jQuery('body').append($ov);
    jQuery('#smRUnlockBtn').on('click', function(e){ e.preventDefault(); setLocked(false); });
    // also allow tap anywhere on overlay to unlock
    $ov.on('click', function(e){ e.preventDefault(); setLocked(false); });
  }

  function setLocked(on){
    ensureLockOverlay();
    state.locked = !!on;
    if (state.locked) jQuery('#smRLockOverlay').show();
    else jQuery('#smRLockOverlay').hide();
  }

  function toggleLocked(){ setLocked(!state.locked); }

  // ---- FPP command helper ----
  var cmdInFlight = false;
  var cmdLastAt = 0;
  var CMD_DEBOUNCE_MS = 250;

  function argsToArray(args){
    if (args == null) return [];
    if (Array.isArray(args)) return args.map(function(v){ return String(v); });
    if (typeof args === 'string' || typeof args === 'number' || typeof args === 'boolean') return [String(args)];
    if (typeof args === 'object') {
      var out = [];
      try {
        // IMPORTANT: Do NOT sort keys.
        // FPP's CommandToJSON (and BigButtons-style configs) rely on argument order.
        // Sorting breaks commands like "Start Playlist" where args are ordered.
        var ks = Object.keys(args);
        for (var i=0;i<ks.length;i++) out.push(String(args[ks[i]]));
      } catch(e) {}
      return out;
    }
    return [];
  }

  function sendFppCommand(cmd, args){
    cmd = (cmd == null) ? "" : String(cmd);
    cmd = cmd.replace(/^\s+|\s+$/g, "");
    if (!cmd) return;

    // Never call /api/command/ with an empty/invalid command.
    // FPP command names often contain SPACES and sometimes slashes.
    // We allow a wide printable set and rely on safe URL encoding of each segment.
    if (/[\0-\x1F\x7F]/.test(cmd) || cmd.indexOf('..') !== -1 || cmd.indexOf('\\') !== -1) {
      try { console.warn("Showmaster: blocked invalid command", cmd); } catch(e) {}
      return;
    }

    // Debounce + single-flight to avoid hammering fppd (32322)
    var now = Date.now ? Date.now() : (new Date()).getTime();
    if ((now - cmdLastAt) < CMD_DEBOUNCE_MS) return;
    if (cmdInFlight) return;
    cmdLastAt = now;
    cmdInFlight = true;

    // FPP's /api/command/ endpoint is most reliable with GET + args as URL segments.
    // Example: /api/command/StartPlaylist/MyPlaylist
    // Some builds also accept POST(JSON array), so we fallback to POST if GET fails.

    // Build URL safely: encode each path segment, keep slashes as separators.
    // This supports commands like "Start Playlist" (space) and "playlist/start" (slash).
    var clean = cmd.replace(/^\/+/, "");
    var segs = clean.split('/');
    var encCmd = [];
    for (var i=0;i<segs.length;i++) {
      if (segs[i] === '') continue;
      encCmd.push(encodeURIComponent(segs[i]));
    }
    var cmdPath = encCmd.join('/');
    var url = "/api/command/" + cmdPath;

    var arr = [];
    try { arr = argsToArray(args); } catch(eA) { arr = []; }
    for (var j=0;j<arr.length;j++) {
      url += "/" + encodeURIComponent(String(arr[j]));
    }

    function done(){ cmdInFlight = false; }

    // Resolve on success of either GET or POST fallback
    var dfd = jQuery.Deferred ? jQuery.Deferred() : null;

    function resolveOk(data){
      try { if (dfd) dfd.resolve(data); } catch(e) {}
    }
    function rejectErr(err){
      try { if (dfd) dfd.reject(err); } catch(e) {}
    }

    // 1) Try GET first
    jQuery.ajax({
      url: url,
      method: "GET",
      cache: false,
      timeout: 5000
    }).done(function(r){
      resolveOk(r);
    }).fail(function(err){
      // 2) Fallback: POST JSON array (command path MUST be encoded)
      var payload = "[]";
      try { payload = JSON.stringify(argsToArray(args)); } catch(ex) { payload = "[]"; }
      var postUrl = "/api/command/" + cmdPath;
      jQuery.ajax({
        url: postUrl,
        method: "POST",
        contentType: "application/json",
        processData: false,
        data: payload,
        timeout: 5000
      }).done(function(r2){
        resolveOk(r2);
      }).fail(function(err2){
        rejectErr(err2);
      }).always(done);
    }).always(function(){
      // If GET succeeded, clear inFlight here
      // If GET failed, POST handler clears it
      if (!dfd) done();
      else {
        // Avoid double-clear: if POST started, it will clear in .always(done)
        // If GET succeeded, clear now.
        try {
          if (dfd.state && dfd.state() === 'resolved') done();
        } catch(e3){ done(); }
      }
    });

    return dfd ? dfd.promise() : null;
  }

  function clamp(n, a, b){ n = parseInt(n,10); if (isNaN(n)) n = a; return Math.max(a, Math.min(b, n)); }

  function setZoom(p){
    // Switching zoom disables fit mode
    setFit(false);
    state.zoomPercent = clamp(p, 100, 300);
    try { window.localStorage.setItem('showmaster_remote_zoom', String(state.zoomPercent)); } catch(e) {}
    updateZoomReadout();
    // only update transform (no full re-render, keeps handlers stable)
    computeScaleAndTransform();
  }

  function updateZoomReadout(){
    try {
      if (state.fitMode) jQuery('#smRZoomLabel').text('FIT');
      else jQuery('#smRZoomLabel').text((state.zoomPercent||200) + '%');
    } catch(e) {}
  }

  function setFit(on, persist){
    state.fitMode = !!on;
    try { jQuery('body').toggleClass('sm-remoteFit', state.fitMode); } catch(e) {}
    if (persist !== false) {
      try { window.localStorage.setItem('showmaster_remote_fit', state.fitMode ? '1' : '0'); } catch(e2) {}
    }
    updateZoomReadout();
    computeScaleAndTransform();
  }

  // ---- Canvas-only fullscreen (no browser fullscreen / no F11 behavior) ----
  function setCanvasOnly(on, persist){
    state.canvasOnly = !!on;
    try { jQuery('body').toggleClass('sm-remoteCanvasOnly', state.canvasOnly); } catch(e) {}

    // Physically move the stage to <body> so "fixed" truly covers the viewport
    // even if FPP wraps plugin pages in transformed containers (mobile Safari / some themes).
    try {
      var $stage = jQuery('#smRStage');
      var $holder = jQuery('#smRStageHolder');
      if ($stage.length && $holder.length) {
        if (state.canvasOnly) {
          // Detach and append to body (top-most stacking context)
          if (!$stage.data('sm-home')) $stage.data('sm-home', '1');
          jQuery('body').append($stage);
        } else {
          // Put it back where it belongs
          $holder.append($stage);
        }
      }
    } catch(eMove) {}
    if (persist !== false) {
      try { window.localStorage.setItem('showmaster_remote_canvasOnly', state.canvasOnly ? '1' : '0'); } catch(e2) {}
    }
    // In canvas-only mode we always want fit for phones/tablets
    if (state.canvasOnly) setFit(true, false);
    updateFsButton();
    renderCanvas();
  }

  function updateFsButton(){
    try {
      var on = !!state.canvasOnly;
      var $b = jQuery('#smRFullscreen');
      if ($b.length) {
        $b.find('i').attr('class', on ? 'fas fa-compress' : 'fas fa-expand');
        $b.attr('title', on ? 'Exit canvas fullscreen' : 'Canvas fullscreen');
      }
    } catch(e) {}
  }

  // Try to rename the FPP page heading (FPP uses plugin name for all plugin pages).
  // This keeps the Remote page from showing "Showmaster Builder" at the top.
  function setFppPageHeading(txt){
    try {
      txt = (txt == null) ? '' : String(txt);
      if (!txt) return;
      var $cands = jQuery('.pageTitle, #pageTitle, .contentTitle, #contentTitle, h1, h2');
      if (!$cands || !$cands.length) return;
      $cands.each(function(){
        var $el = jQuery(this);
        var t = ($el.text() || '').trim();
        if (t === 'Showmaster Builder' || t === 'Showmaster') {
          $el.text(txt);
        }
      });
    } catch(e) {}
  }

  function boot(){
    if (!window.jQuery) { try { alert('jQuery missing'); } catch(e){} return; }
    // Ensure the FPP page heading matches the Remote page
    setFppPageHeading('Showmaster');
    // restore zoom
    try {
      var z = parseInt(window.localStorage.getItem('showmaster_remote_zoom')||'200', 10);
      if (isFinite(z)) state.zoomPercent = z;
    } catch(eZ) {}
    // restore fit mode (best for phones/tablets)
    try {
      var f = window.localStorage.getItem('showmaster_remote_fit')||'0';
      state.fitMode = (String(f) === '1');
    } catch(eF) { state.fitMode = false; }
    try { jQuery('body').toggleClass('sm-remoteFit', state.fitMode); } catch(eF2) {}

    // restore canvas-only mode (also moves stage to <body> if enabled)
    try {
      var co = window.localStorage.getItem('showmaster_remote_canvasOnly')||'0';
      state.canvasOnly = (String(co) === '1');
    } catch(eCO) { state.canvasOnly = false; }
    setCanvasOnly(state.canvasOnly, false);

    updateZoomReadout();
    updateFsButton();

    // Canvas-only fullscreen toggle button (no browser fullscreen)
    jQuery('#smRFullscreen').off('click').on('click', function(e){
      e.preventDefault();
      setCanvasOnly(!state.canvasOnly);
    });

    // Exit button (shown only in canvas-only mode)
    jQuery('#smRCanvasExit').off('click').on('click', function(e){
      e.preventDefault();
      setCanvasOnly(false);
    });

    // ESC exits canvas-only mode
    jQuery(document).off('keydown.smCanvasOnly').on('keydown.smCanvasOnly', function(e){
      try {
        if (!state.canvasOnly) return;
        var k = e.key || e.keyCode;
        if (k === 'Escape' || k === 'Esc' || k === 27) {
          setCanvasOnly(false);
        }
      } catch(eK) {}
    });

    jQuery('#smRZoomOut').off('click').on('click', function(e){ e.preventDefault(); setZoom((state.zoomPercent||200) - 25); });
    jQuery('#smRZoomIn').off('click').on('click', function(e){ e.preventDefault(); setZoom((state.zoomPercent||200) + 25); });
    loadConfig();
    jQuery(window).on('resize', function(){ renderCanvas(); });
  }

  jQuery(boot);
})();
