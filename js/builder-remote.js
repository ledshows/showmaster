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

  // ---- Special actions (not standard FPP command presets) ----
  function statusSeqName(st){
    if (!st) return '';
    var v = st.current_sequence;
    if (typeof v === 'string') return v;
    if (v && typeof v.sequence === 'string') return v.sequence;
    if (v && typeof v.name === 'string') return v.name;
    return '';
  }

  function statusSeqPosSeconds(st){
    if (!st) return NaN;
    var cands = [
      st.sequencePosition,
      st.sequence_position,
      st.sequencePos,
      st.sequence_seconds,
      st.secondsElapsed,
      st.elapsedSeconds
    ];
    for (var i=0;i<cands.length;i++) {
      var v = cands[i];
      if (v == null) continue;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        var n = parseFloat(v);
        if (isFinite(n)) return n;
      }
    }
    // Some builds nest it under current_playlist
    try {
      var v2 = st.current_playlist && (st.current_playlist.sequencePosition || st.current_playlist.sequence_position);
      if (typeof v2 === 'number') return v2;
      if (typeof v2 === 'string') {
        var n2 = parseFloat(v2);
        if (isFinite(n2)) return n2;
      }
    } catch(e) {}
    return NaN;
  }

  function doSequenceSeekDelta(deltaSeconds){
    deltaSeconds = parseInt(deltaSeconds, 10);
    if (!isFinite(deltaSeconds) || deltaSeconds === 0) return;

    // Ensure we have status first
    var d = jQuery.Deferred();
    function haveStatus(){
      if (!lastStatus) return false;
      var name = statusSeqName(lastStatus);
      var pos = statusSeqPosSeconds(lastStatus);
      return !!name && isFinite(pos);
    }
    function fetchStatus(){
      jQuery.getJSON('api/fppd/status').done(function(js){ lastStatus = js; d.resolve(); }).fail(function(){
        jQuery.getJSON('/api/fppd/status').done(function(js2){ lastStatus = js2; d.resolve(); }).fail(function(){ d.resolve(); });
      });
    }
    if (haveStatus()) d.resolve(); else fetchStatus();

    d.done(function(){
      var seq = statusSeqName(lastStatus);
      var cur = statusSeqPosSeconds(lastStatus);
      if (!seq || !isFinite(cur)) return;
      var next = Math.max(0, Math.floor(cur + deltaSeconds));
      // Seek by restarting the current sequence at new second.
      // Documented: GET /api/sequence/:SequenceName/start/:startSecond
      // NOTE: builder-remote runs under /plugin/showmaster/, so relative "api/..." would hit
      // /plugin/showmaster/api/... (wrong). We prefer absolute /api/... and fall back.
      var urlAbs = '/api/sequence/' + encodeURIComponent(seq) + '/start/' + encodeURIComponent(String(next));
      var urlRel = 'api/sequence/' + encodeURIComponent(seq) + '/start/' + encodeURIComponent(String(next));
      jQuery.ajax({ url: urlAbs, method: 'GET' }).fail(function(){
        jQuery.ajax({ url: urlRel, method: 'GET' });
      });
    });
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
    zoomPercent: 200
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

            // Special: seek current sequence by delta seconds
            if (w.command === '__SHOWMASTER_SEQ_SEEK__') {
              var d = 10;
              try { if (w.args && typeof w.args.delta !== 'undefined') d = w.args.delta; } catch(ex) {}
              doSequenceSeekDelta(d);
              return;
            }
            // Best-effort FPP command execution
            jQuery.ajax({
              url: 'api/command',
              method: 'POST',
              contentType: 'application/json',
              data: JSON.stringify({ command: w.command, args: w.args || {} })
            });
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

  function clamp(n, a, b){ n = parseInt(n,10); if (isNaN(n)) n = a; return Math.max(a, Math.min(b, n)); }

  function setZoom(p){
    state.zoomPercent = clamp(p, 100, 300);
    try { window.localStorage.setItem('showmaster_remote_zoom', String(state.zoomPercent)); } catch(e) {}
    try { jQuery('#smRZoomLabel').text(state.zoomPercent + '%'); } catch(e2) {}
    renderCanvas();
    // after re-render, refresh status text
    if (lastStatus) updateStatusWidgets();
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
