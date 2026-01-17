/* Showmaster Standalone Remote (ES5-safe)
 * Renders the saved Builder layout and lets you use it directly on FPP.
 */
(function(){
  function esc(s){
    s = (s == null) ? "" : String(s);
    return s.replace(/[&<>\"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
  }

  function toast(msg, isErr){
    var $t = window.jQuery ? window.jQuery('#smRToast') : null;
    if (!$t || !$t.length) { try { alert(msg); } catch(e){} return; }
    $t.text(msg).toggleClass('err', !!isErr).fadeIn(120);
    setTimeout(function(){ $t.fadeOut(250); }, 2600);
  }

  function normalizeRotation(deg){
    deg = parseInt(deg,10); if (isNaN(deg)) deg = 0;
    deg = ((deg % 360) + 360) % 360;
    if (deg===360) deg=0;
    if (deg!==0 && deg!==90 && deg!==180 && deg!==270) deg=0;
    return deg;
  }

  function prettySource(id){
    // same labels as builder (kept short)
    var map = {
      'player.statusText':'Player: Status text',
      'player.playlist':'Player: Playlist',
      'player.sequence':'Player: Sequence',
      'player.volume':'Player: Volume',
      'system.time':'System: Time',
      'system.ip':'System: IP address'
    };
    return map[id] || (id || '');
  }

  function widgetHtml(w){
    if (w.type === 'status') return esc(prettySource(w.source));
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
    rotation: 0,
    scale: 1
  };

  function currentPage(){
    for (var i=0;i<state.pages.length;i++) if (state.pages[i].id===state.activePageId) return state.pages[i];
    return state.pages[0] || null;
  }

  function setActivePage(id){
    state.activePageId = id;
    renderTabs();
    renderCanvas();
  }

  function renderTabs(){
    var $t = jQuery('#smRPageTabs');
    $t.empty();
    for (var i=0;i<state.pages.length;i++) {
      (function(pg, idx){
        var $b = jQuery("<div class='sm-pageTab'></div>");
        $b.append("<span class='sm-pageName'>" + esc(pg.name || ('Page '+(idx+1))) + "</span>");
        if (pg.id===state.activePageId) $b.addClass('active');
        $b.on('click', function(){ setActivePage(pg.id); });
        $t.append($b);
      })(state.pages[i], i);
    }
  }

  function computeScaleAndTransform(){
    var $stage = jQuery('#smRStage');
    var sw = $stage.width() || 320;
    var sh = $stage.height() || 240;

    var baseW = state.deviceW;
    var baseH = state.deviceH;
    var rot = state.rotation;
    var effW = (rot===90||rot===270) ? baseH : baseW;
    var effH = (rot===90||rot===270) ? baseW : baseH;

    var s = Math.min(sw/effW, sh/effH);
    if (!isFinite(s) || s<=0) s = 1;
    s = Math.max(0.2, Math.min(3.0, s));
    state.scale = s;

    var $vp = jQuery('#smRViewport');
    var $canvas = jQuery('#smRCanvas');

    // set base sizes in px (unscaled)
    $vp.css({ width: baseW + 'px', height: baseH + 'px' });

    // apply rotate + scale around top-left, then center in stage
    $vp.css({
      transformOrigin: '0 0',
      transform: 'scale(' + s + ') rotate(' + rot + 'deg)'
    });

    // center the transformed viewport in stage
    var tw = effW * s;
    var th = effH * s;
    var left = Math.max(0, Math.round((sw - tw)/2));
    var top = Math.max(0, Math.round((sh - th)/2));
    $vp.css({ position:'absolute', left:left+'px', top:top+'px' });

    // canvas height can be taller for scroll pages
    var pg = currentPage();
    var ph = (pg && pg.h) ? parseInt(pg.h,10) : baseH;
    if (!isFinite(ph) || ph < baseH) ph = baseH;
    $canvas.css({ width: baseW + 'px', height: ph + 'px' });
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
        $el.find('.sm-inner').html(widgetHtml(w));
        applyCss($el, w);

        // click actions
        if (w.type==='action') {
          $el.css('cursor','pointer');
          $el.on('click', function(e){
            e.preventDefault();
            if (!w.command) { toast('No command set for this button.', true); return; }
            // Best-effort FPP command execution
            jQuery.ajax({
              url: 'api/command',
              method: 'POST',
              contentType: 'application/json',
              data: JSON.stringify({ command: w.command, args: w.args || {} })
            }).done(function(){
              toast('Command sent: ' + w.command, false);
            }).fail(function(xhr){
              var t = '';
              try { t = (xhr && xhr.responseText) ? String(xhr.responseText) : ''; } catch(ex){}
              toast('Command failed: ' + w.command, true);
              if (t) { /* keep silent */ }
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
      state.rotation = normalizeRotation(cfg.meta && cfg.meta.rotation);
      state.deviceW = (cfg.device && cfg.device.w) ? parseInt(cfg.device.w,10) : 320;
      state.deviceH = (cfg.device && cfg.device.h) ? parseInt(cfg.device.h,10) : 240;
      if (!isFinite(state.deviceW) || state.deviceW<=0) state.deviceW=320;
      if (!isFinite(state.deviceH) || state.deviceH<=0) state.deviceH=240;

      state.pages = (cfg.pages && cfg.pages.length) ? cfg.pages : [{id:'p1', name:'Page 1', h: state.deviceH, widgets: (cfg.widgets||[])}];
      state.activePageId = cfg.activePageId || (state.pages[0] ? state.pages[0].id : 'p1');

      renderTabs();
      renderCanvas();
    }).fail(function(){
      toast('Failed to load config.', true);
    });
  }

  function boot(){
    if (!window.jQuery) { try { alert('jQuery missing'); } catch(e){} return; }
    // stage needs positioning for centering
    try { jQuery('#smRStage').css('position','relative'); } catch(e){}
    loadConfig();
    jQuery(window).on('resize', function(){ renderCanvas(); });
  }

  jQuery(boot);
})();
