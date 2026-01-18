/* Showmaster Standalone Remote (ES5-safe)
 * Renders the saved Builder layout and lets you use it directly on FPP.
 */
(function(){
  function esc(s){
    s = (s == null) ? "" : String(s);
    return s.replace(/[&<>\"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
  }

  function toast(msg, isErr){
    // Remote page: no notices/toasts (user asked).
    // Keep as no-op to avoid breaking old calls.
    void(msg); void(isErr);
  }

  // ---- Safe seek (+/- seconds) for current sequence ----
  // FPP does not provide a true "seek" on a running sequence in all modes.
  // The safe method is: read status once -> stop current sequence once -> start same sequence at (elapsed + delta).
  // IMPORTANT: no loops, no retries, and rate-limited to avoid overloading fppd.
  var seekBusy = false;
  var seekLastMs = 0;

  function ajaxGet(url){
    // Returns a jqXHR (jQuery Deferred) with a Promise-like .then/.fail/.always
    return jQuery.ajax({ url: url, method: 'GET', dataType: 'json', cache: false, timeout: 2500 });
  }

  function getStatusOnce(){
    // Prefer absolute paths to avoid /plugin/showmaster/... prefix issues.
    // Use .then(null, fail) (not .catch) for maximum jQuery compatibility.
    return ajaxGet('/api/fppd/status').then(null, function(){
      return ajaxGet('api/fppd/status');
    }).then(null, function(){
      // Legacy status endpoint
      return ajaxGet('/fppjson.php?command=getFPPstatus');
    });
  }

  function parseHms(txt){
    // Accept "MM:SS" or "HH:MM:SS"
    if (!txt) return NaN;
    var s = String(txt).trim();
    if (!s) return NaN;
    var parts = s.split(':');
    if (parts.length < 2 || parts.length > 3) return NaN;
    var h = 0, m = 0, sec = 0;
    if (parts.length === 2) {
      m = parseInt(parts[0], 10);
      sec = parseInt(parts[1], 10);
    } else {
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      sec = parseInt(parts[2], 10);
    }
    if (!isFinite(h) || !isFinite(m) || !isFinite(sec)) return NaN;
    return (h * 3600) + (m * 60) + sec;
  }

  function pickFirst(obj, paths){
    for (var i=0;i<paths.length;i++) {
      var v = getPath(obj, paths[i]);
      if (v === '' || v == null) continue;
      return v;
    }
    return '';
  }

  function parseElapsedSeconds(st){
    // Prefer very specific fields to avoid accidentally reading uptime.
    var candidatesNum = [
      'sequence_seconds_elapsed',
      'current_sequence_seconds_elapsed',
      'current_sequence_elapsed',
      'seconds_elapsed',
      'elapsed_seconds',
      'elapsed',
      'current_sequence.elapsed',
      'current_sequence.seconds_elapsed'
    ];
    for (var i=0;i<candidatesNum.length;i++) {
      var raw = getPath(st, candidatesNum[i]);
      if (raw === '' || raw == null) continue;
      var n = parseFloat(raw);
      if (!isFinite(n) || n < 0) continue;
      // If it looks like milliseconds (common: 20000+), convert.
      if (n > 1000 && n < 1000000000) n = n / 1000.0;
      if (n >= 0 && n < 86400 * 7) return Math.floor(n);
    }
    // Time string fields
    var t = pickFirst(st, [
      'time_elapsed',
      'sequence_time_elapsed',
      'current_sequence_time',
      'current_sequence.time_elapsed'
    ]);
    var sec = parseHms(t);
    if (isFinite(sec) && sec >= 0) return Math.floor(sec);
    return NaN;
  }

  function parseSequenceName(st){
    // Most common: current_sequence
    var name = pickFirst(st, [
      'current_sequence',
      'current_sequence_filename',
      'currentSequence',
      'sequence',
      'sequence_filename',
      'current_sequence.name'
    ]);
    if (name && typeof name === 'string') {
      name = name.trim();
      // Sometimes status returns full path; keep basename.
      name = name.split('/').pop();
    }
    return name || '';
  }

  function stopCurrentSequence(){
    return jQuery.ajax({ url: '/api/sequence/current/stop', method: 'GET', cache: false, timeout: 2500 })
      .then(null, function(){
        return jQuery.ajax({ url: '/fppjson.php?command=stopSequence', method: 'GET', cache: false, timeout: 2500 });
      });
  }

  function startSequenceAt(name, startSec){
    var encName = encodeURIComponent(name);
    var encSec = encodeURIComponent(String(startSec));
    return jQuery.ajax({ url: '/api/sequence/' + encName + '/start/' + encSec, method: 'GET', cache: false, timeout: 2500 })
      .then(null, function(){
        return jQuery.ajax({ url: '/fppjson.php?command=startSequence&sequence=' + encName + '&startSecond=' + encSec, method: 'GET', cache: false, timeout: 2500 });
      });
  }

  function doSeek(delta){
    // Rate limit
    var now = (new Date()).getTime();
    if (seekBusy) return;
    if (now - seekLastMs < 1000) return;
    seekLastMs = now;
    seekBusy = true;

    delta = parseInt(delta, 10);
    if (!isFinite(delta)) delta = 10;

    getStatusOnce().then(function(st){
      var seq = parseSequenceName(st);
      var elapsed = parseElapsedSeconds(st);
      if (!seq || !isFinite(elapsed)) {
        // No-op: we don't show toasts on remote.
        return;
      }
      var target = elapsed + delta;
      if (!isFinite(target) || target < 0) target = 0;
      target = Math.floor(target);

      // Stop once, then start at target.
      return stopCurrentSequence().then(function(){
        return startSequenceAt(seq, target);
      });
    }).always(function(){
      seekBusy = false;
    });
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
      var iconT = w.icon ? ("<i class='fa fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i>") : '';
      if (!label.trim()) return iconT;
      return iconT + '<span>' + esc(label) + '</span>';
    }
    // action
    var label2 = (w.label == null) ? '' : String(w.label);
    var icon = w.icon ? ("<i class='fa fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i>") : '';
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
    var $stage = jQuery('#smRStage');
    var sw = $stage.width() || 320;
    var sh = $stage.height() || 240;
    // On some FPP layouts the stage can report ~0px height until after first paint.
    if (!isFinite(sh) || sh < 80) {
      try { sh = Math.max(240, Math.round((window.innerHeight || 600) * 0.6)); } catch(e) { sh = 360; }
    }

    var $scene = jQuery('#smRScene');

    // use page height (can be taller than the device height)
    var pg = currentPage();
    var ph = (pg && pg.h) ? parseInt(pg.h,10) : state.deviceH;
    if (!isFinite(ph) || ph < state.deviceH) ph = state.deviceH;

    var baseW = state.deviceW;
    var baseH = ph;

    // Fit to stage (no rotation on this page)
    var sFit = Math.min(sw/baseW, sh/baseH);
    if (!isFinite(sFit) || sFit<=0) sFit = 1;
    var z = (state.zoomPercent || 200) / 100.0;
    var s = sFit * z;
    if (!isFinite(s) || s<=0) s = 1;
    s = Math.max(0.2, Math.min(3.0, s));
    state.scale = s;

    var $vp = jQuery('#smRViewport');
    var $canvas = jQuery('#smRCanvas');

    // set base sizes in px (unscaled)
    $vp.css({ width: baseW + 'px', height: baseH + 'px' });

    // canvas height can be taller for scroll pages
    $canvas.css({ width: baseW + 'px', height: baseH + 'px' });

    // apply scale around top-left
    $vp.css({
      transformOrigin: '0 0',
      transform: 'scale(' + s + ')'
    });

    // compute transformed bounding size
    var tw = Math.round(baseW * s);
    var th = Math.round(baseH * s);

    // scene gives scroll area; keep centered when possible
    var sceneW = Math.max(sw, tw + 16);
    var sceneH = Math.max(sh, th + 16);
    $scene.css({ width: sceneW + 'px', height: sceneH + 'px' });

    var left = Math.round((sceneW - tw)/2);
    var top = Math.round((sceneH - th)/2);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    $vp.css({ position:'absolute', left:left+'px', top:top+'px' });
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

            // Special: seek forward/back in the currently playing sequence
            if (String(w.command) === '__SHOWMASTER_SEQ_SEEK__') {
              seekBySeconds((w.args && typeof w.args.delta !== 'undefined') ? w.args.delta : 10);
              return;
            }

            // Normal: send FPP command
            sendFppCommand(w.command, w.args || {});

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
        "<div class='sm-lockTitle'><i class='fa fa-lock'></i> Screen locked</div>" +
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
  function argsToArray(args){
    if (args == null) return [];
    if (Array.isArray(args)) return args.map(function(v){ return String(v); });
    if (typeof args === 'string' || typeof args === 'number' || typeof args === 'boolean') return [String(args)];
    if (typeof args === 'object') {
      var out = [];
      try {
        var ks = Object.keys(args);
        ks.sort();
        for (var i=0;i<ks.length;i++) {
          var k = ks[i];
          out.push(String(args[k]));
        }
      } catch(e) {}
      return out;
    }
    return [];
  }

  function sendFppCommand(cmd, args){
    cmd = (cmd == null) ? '' : String(cmd);
    if (!cmd) return;
    var url = 'api/command/' + encodeURIComponent(cmd);
    var payload = JSON.stringify(argsToArray(args));
    return jQuery.ajax({
      url: url,
      method: 'POST',
      contentType: 'application/json',
      data: payload
    });
  }

  // ---- Seek +10s implementation (Stop Now -> start sequence at second) ----
  function getElapsedSecondsFromStatus(st){
    if (!st) return 0;
    var cand = null;
    // common fields
    if (typeof st.seconds_elapsed !== 'undefined') cand = st.seconds_elapsed;
    else if (typeof st.elapsed !== 'undefined') cand = st.elapsed;
    else if (typeof st.time_elapsed !== 'undefined') cand = st.time_elapsed;
    else if (st.status && typeof st.status.seconds_elapsed !== 'undefined') cand = st.status.seconds_elapsed;

    if (typeof cand === 'string') {
      // try MM:SS or HH:MM:SS
      var m = cand.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        if (m[3] != null) {
          return parseInt(m[1],10)*3600 + parseInt(m[2],10)*60 + parseInt(m[3],10);
        }
        return parseInt(m[1],10)*60 + parseInt(m[2],10);
      }
      // try '123s'
      var ms = cand.match(/(\d+(?:\.\d+)?)\s*s/i);
      if (ms) return Math.floor(parseFloat(ms[1]));
    }
    if (typeof cand === 'number') {
      // if it's ms
      if (cand > 1000*60) return Math.floor(cand/1000);
      return Math.floor(cand);
    }
    return 0;
  }

  function getCurrentSequenceName(st){
    if (!st) return '';
    // FPP status uses current_sequence
    if (st.current_sequence) return String(st.current_sequence);
    // some builds: st.current_playlist.current_sequence
    try {
      if (st.current_playlist && st.current_playlist.current_sequence) return String(st.current_playlist.current_sequence);
    } catch(e) {}
    // fallback
    return '';
  }

  function seekBySeconds(delta){
    delta = parseInt(delta,10);
    if (!isFinite(delta)) delta = 10;

    // single-shot: read status once, then Stop Now, then start sequence at target second
    return jQuery.getJSON('api/fppd/status').then(function(st){
      var seq = getCurrentSequenceName(st);
      var cur = getElapsedSecondsFromStatus(st);
      var target = cur + delta;
      if (target < 0) target = 0;
      try { console.log('Showmaster seek:', seq, 'cur=', cur, 'target=', target); } catch(e) {}

      if (!seq) return;
      // Stop everything first (playlist/schedule)
      return sendFppCommand('Stop Now', []).always(function(){
        // small delay so fppd can settle
        return jQuery.Deferred(function(d){ setTimeout(function(){ d.resolve(); }, 250); }).promise();
      }).then(function(){
        // /api/sequence/:name/start/:sec
        var url = 'api/sequence/' + encodeURIComponent(seq) + '/start/' + encodeURIComponent(String(target));
        return jQuery.ajax({ url: url, method: 'GET' });
      });
    });
  }
  function clamp(n, a, b){ n = parseInt(n,10); if (isNaN(n)) n = a; return Math.max(a, Math.min(b, n)); }

  function setZoom(p){
    state.zoomPercent = clamp(p, 100, 300);
    try { window.localStorage.setItem('showmaster_remote_zoom', String(state.zoomPercent)); } catch(e) {}
    try { jQuery('#smRZoomLabel').text(state.zoomPercent + '%'); } catch(e2) {}
    // only update transform (no full re-render, keeps handlers stable)
    computeScaleAndTransform();
  }

  function boot(){
    if (!window.jQuery) { try { alert('jQuery missing'); } catch(e){} return; }
    // stage needs positioning for centering
    try { jQuery('#smRStage').css('position','relative'); } catch(e){}
    // restore zoom
    try {
      var z = parseInt(window.localStorage.getItem('showmaster_remote_zoom')||'200', 10);
      if (isFinite(z)) state.zoomPercent = z;
    } catch(eZ) {}
    try { jQuery('#smRZoomLabel').text((state.zoomPercent||200) + '%'); } catch(eLbl) {}

    jQuery('#smRZoomOut').off('click').on('click', function(e){ e.preventDefault(); setZoom((state.zoomPercent||200) - 25); });
    jQuery('#smRZoomIn').off('click').on('click', function(e){ e.preventDefault(); setZoom((state.zoomPercent||200) + 25); });
    loadConfig();
    jQuery(window).on('resize', function(){ renderCanvas(); });
  }

  jQuery(boot);
})();
