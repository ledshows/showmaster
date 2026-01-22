/* Showmaster Builder (ES5-safe)
 * 320x240 drag+resize UI builder for the Showmaster touchscreen
 */
(function () {
  var DEVICE_W = 320;
  var DEVICE_H = 240;
  var GRID = 10;

  var state = {
    device: { w: DEVICE_W, h: DEVICE_H, bg: "#0b0f14" },
    pages: [],            // [{id,name,h,widgets:[]}]
    activePageId: null,
    commands: [],
    playlists: [],
    selectedId: null,
    snap: true,
    zoom: 200, // percent
    rotation: 0,
    // Display settings (stored in JSON for firmware)
    screenTimeout: 60, // seconds
    brightness: 100    // percent
    // upload target selector removed; push always targets the Showmaster remote UI
  };

  // -------- helpers --------
  function uid(prefix) {
    var r = Math.random().toString(16).slice(2, 10);
    return (prefix || "w") + "_" + (new Date().getTime().toString(16)) + "_" + r;
  }
  function clamp(n, min, max) { n = Number(n); if (isNaN(n)) n = min; return Math.max(min, Math.min(max, n)); }
  function toInt(v, d) { v = parseInt(v, 10); return isNaN(v) ? d : v; }

  function getZoomPercent() {
    var v = toInt($("#smZoom").val(), state.zoom);
    if (v < 100) v = 100;
    return clamp(v, 100, 250);
  }
  function getScale() { return getZoomPercent() / 100.0; }


  function normalizeRotation(deg){
    deg = parseInt(deg,10); if (isNaN(deg)) deg = 0;
    deg = ((deg % 360) + 360) % 360;
    if (deg===360) deg=0;
    if (deg!==0 && deg!==90 && deg!==180 && deg!==270) deg=0;
    return deg;
  }

  function applyRotation(deg, skipRender){
    deg = normalizeRotation(deg);
    state.rotation = deg;

    // remember previous device height so we can shrink the page height when rotating back
    var prevH = (state.device && state.device.h) ? parseInt(state.device.h, 10) : DEVICE_H;

    // Device dimensions (portrait uses swapped base)
    var baseW = 320, baseH = 240;
    if (deg===90 || deg===270) { DEVICE_W = baseH; DEVICE_H = baseW; }
    else { DEVICE_W = baseW; DEVICE_H = baseH; }

    state.device.w = DEVICE_W;
    state.device.h = DEVICE_H;

    // Update page minimum heights
    ensurePages();
    for (var i=0;i<state.pages.length;i++) {
      if (!state.pages[i].h) state.pages[i].h = DEVICE_H;
      // grow when needed
      if (state.pages[i].h < DEVICE_H) state.pages[i].h = DEVICE_H;
      // shrink back when the only reason it was tall was the previous rotation
      if (prevH > DEVICE_H && state.pages[i].h === prevH) state.pages[i].h = DEVICE_H;
    }

    // Update numeric input bounds
    try {
      $('#smX').attr('max', String(DEVICE_W-1));
      $('#smW').attr('max', String(DEVICE_W));
      $('#smPageHeight').attr('min', String(DEVICE_H));
      var ph = toInt((currentPage() && currentPage().h) ? currentPage().h : DEVICE_H, DEVICE_H);
      if (ph < DEVICE_H) ph = DEVICE_H;
      $('#smY').attr('max', String(ph-1));
      $('#smH').attr('max', String(ph));
    } catch(e) {}

    // keep page height input in sync
    try { $('#smPageHeight').val((currentPage() && currentPage().h) ? currentPage().h : DEVICE_H); } catch(ePh) {}

    // UI highlight
    try {
      $('#smRotSeg button').removeClass('active');
      $('#smRotSeg button[data-rot="'+deg+'"]').addClass('active');
    } catch(e2) {}

    if (!skipRender) {
      renderPageTabs();
      renderCanvas();
      renderProps();
    }
  }

  function toast(msg, isErr) {
    var $t = $("#smToast");
    if (!$t.length) return alert(msg);
    $t.text(msg).toggleClass("err", !!isErr).fadeIn(120);
    setTimeout(function(){ $t.fadeOut(250); }, 2600);
  }

  // Debug log (visible when Debug is checked)
  function dbg(msg) {
    try {
      var $t = $("#smDebugToggle");
      if ($t.length && !$t.prop("checked")) return;
      var $l = $("#smDebugLog");
      if (!$l.length) return;
      $l.show();
      var now = new Date();
      var line = "[" + now.toISOString() + "] " + String(msg);
      var cur = $l.val() || "";
      $l.val(cur + line + "\n");
      try { $l.scrollTop($l[0].scrollHeight); } catch(e) {}
    } catch(ex) {}
  }

  
  function currentPage() {
    if (!state.pages || !state.pages.length) return null;
    for (var i=0;i<state.pages.length;i++) if (state.pages[i].id === state.activePageId) return state.pages[i];
    return state.pages[0];
  }
  function currentWidgets() {
    var p = currentPage();
    return p ? (p.widgets || []) : [];
  }
  function setActivePage(id) {
    state.activePageId = id;
    state.selectedId = null;
    highlightSelection(null);
    renderPageTabs();
    ensurePages();
    renderPageTabs();
    try { $('#smPageHeight').val(currentPage().h || DEVICE_H); } catch(e) {}
    // Per-page background
    try {
      var pg = currentPage();
      var bg = (pg && pg.bg) ? pg.bg : (state.device.bg || '#070a12');
      $('#smCanvasBg').val(bg);
      document.getElementById('smCanvas').style.setProperty('--smCanvasBg', bg);
    } catch(e) {}
    renderCanvas();
    renderProps();
  }
  function ensurePages() {
    if (!state.pages) state.pages = [];
    if (!state.pages.length) {
      var pid = "p1";
      state.pages.push({ id: pid, name: "Page 1", h: DEVICE_H, bg: (state.device.bg || '#070a12'), widgets: [] });
      state.activePageId = pid;
    }
    if (!state.activePageId) state.activePageId = state.pages[0].id;
  }
function widgetById(id) {
    var ws = currentWidgets();
    for (var i=0;i<ws.length;i++) {
      if (ws[i].id === id) return ws[i];
    }
    return null;
  }
  function duplicateSelected() {
    var w = widgetById(state.selectedId);
    if (!w) return;
    var pg = currentPage();
    if (!pg) return;
    var clone = $.extend(true, {}, w);
    clone.id = uid(w.type || "widget");
    clone.x = clamp((clone.x || 0) + GRID, 0, DEVICE_W - 10);
    clone.y = clamp((clone.y || 0) + GRID, 0, (pg.h || DEVICE_H) - 10);
    (pg.widgets || (pg.widgets = [])).push(clone);
    setSelection(clone.id, true);
  }

  function copySelectedToPage(targetPageId) {
    var w = widgetById(state.selectedId);
    if (!w) return;
    ensurePages();
    var target = null;
    for (var i=0;i<state.pages.length;i++) if (state.pages[i].id === targetPageId) { target = state.pages[i]; break; }
    if (!target) return;
    var clone = $.extend(true, {}, w);
    clone.id = uid(w.type || "widget");
    // keep within bounds of target page
    var ph = toInt(target.h || DEVICE_H, DEVICE_H);
    clone.x = clamp(clone.x || 0, 0, DEVICE_W - 10);
    clone.y = clamp(clone.y || 0, 0, ph - 10);
    (target.widgets || (target.widgets = [])).push(clone);
    toast("Copied to " + (target.name || target.id) + ".");
  }

  function fillCopyPageSelect() {
    var $s = $("#smCopyPageSelect");
    if (!$s.length) return;
    $s.empty();
    for (var i=0;i<state.pages.length;i++) {
      var pg = state.pages[i];
      $s.append($("<option></option>").attr("value", pg.id).text(pg.name || pg.id));
    }
    // default to next page if exists
    var cur = currentPage();
    if (cur && state.pages.length > 1) {
      var pick = state.pages[0].id;
      for (var j=0;j<state.pages.length;j++) if (state.pages[j].id !== cur.id) { pick = state.pages[j].id; break; }
      $s.val(pick);
    }
  }



  function normalizeWidget(w) {
    ensurePages();
    var pg = currentPage();
    var ph = toInt(pg && pg.h ? pg.h : DEVICE_H, DEVICE_H);
    if (ph < DEVICE_H) ph = DEVICE_H;
    w.x = clamp(w.x, 0, DEVICE_W - 1);
    w.y = clamp(w.y, 0, ph - 1);
    w.w = clamp(w.w, 10, DEVICE_W);
    w.h = clamp(w.h, 10, ph);
    if (!w.bg) w.bg = (w.type === "action") ? "#0ea5e9" : "rgba(255,255,255,0.06)";
    if (!w.text) w.text = "#eaf2ff";
    if (!w.border) w.border = "#22d3ee";
    if (typeof w.borderSize === "undefined") w.borderSize = 2;
    if (typeof w.radius === "undefined") w.radius = 10;
    if (typeof w.textSize === "undefined") w.textSize = 12;
    if (typeof w.iconSize === "undefined") w.iconSize = 14;
    // Allow empty labels (icon-only buttons). Only set a default if label is undefined.
    if (typeof w.label === "undefined" && (w.type === "action" || w.type === "tab")) w.label = "";
    if (!w.source && w.type === "status") w.source = "player.statusText";
    if (!w.command && w.type === "action") w.command = "";
    if (!w.args && w.type === "action") w.args = {};
    return w;
  }

  // -------- rendering --------
  function ensureCanvasSizing() {
    ensurePages();
    var s = getScale();
    var cw = Math.round(DEVICE_W * s);
    var vh = Math.round(DEVICE_H * s);

    var pg = currentPage();
    var ph = toInt(pg && pg.h ? pg.h : DEVICE_H, DEVICE_H);
    if (ph < DEVICE_H) ph = DEVICE_H;
    var ch = Math.round(ph * s);

    // Viewport stays device-sized; inner canvas can be taller for scroll pages.
    if ($("#smCanvasViewport").length) {
      $("#smCanvasViewport").css({ width: cw + "px", height: vh + "px" });
    }

    // Resize the canvas itself (no CSS transforms) so jQueryUI drag behaves correctly.
    $("#smCanvas").css({ width: cw + "px", height: ch + "px" });

    // Apply per-page background base color via CSS variable so gradients remain.
    try {
      var pg2 = currentPage();
      var bg2 = (pg2 && pg2.bg) ? pg2.bg : (state.device.bg || "#070a12");
      document.getElementById("smCanvas").style.setProperty("--smCanvasBg", bg2);
    } catch(e) {}
  }



  function applyWidgetCss($el, w) {
    var s = getScale();
    $el.css({
      left: Math.round(w.x * s) + "px",
      top: Math.round(w.y * s) + "px",
      width: Math.round(w.w * s) + "px",
      height: Math.round(w.h * s) + "px",
      background: w.bg,
      color: w.text,
      borderColor: w.border,
      borderWidth: (w.borderSize||0) + "px",
      borderRadius: (w.radius||0) + "px"
    });
    // Text size belongs on the inner content (CSS sets a default there).
    try { $el.find('.sm-inner').css('font-size', (w.textSize||12) + 'px'); } catch(e) {}
    $el.attr("data-id", w.id);
  }

  function widgetText(w) {
    if (w.type === "status") return prettySource(w.source);
    if (w.type === "tab") {
      var label = (w.label == null) ? "" : String(w.label);
      var iconT = w.icon ? smFaHtml(w.icon, (w.iconSize||14)) : "";
      if (!label.trim()) return iconT;
      return iconT + "<span>" + esc(label) + "</span>";
    }
    // action: icon + label (spacing handled by CSS, not by trailing spaces)
    var label2 = (w.label == null) ? "" : String(w.label);
    var icon = w.icon ? smFaHtml(w.icon, (w.iconSize||14)) : "";
    if (!label2.trim()) return icon;
    return icon + "<span>" + esc(label2) + "</span>";
  }

  function esc(s) {
    s = (s == null) ? "" : String(s);
    return s.replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
  }

  function renderCanvas() {
    ensureCanvasSizing();
    try {
      var zp = getZoomPercent();
      $("#smZoomLabel").text(zp === 100 ? "Original size" : (zp + "%"));
    } catch(ez) {}
    var $c = $("#smCanvas");
    try {
      var pg3 = currentPage();
      var bg3 = (pg3 && pg3.bg) ? pg3.bg : (state.device.bg || '#070a12');
      document.getElementById('smCanvas').style.setProperty('--smCanvasBg', bg3);
    } catch(eBg) {}
    // Keep the grid overlay element; only remove widgets.
    $c.find('.sm-widget').remove();
    if (!$c.find('.sm-grid').length) {
      $c.prepend("<div class='sm-grid'></div>");
    }
    $c.find('.sm-grid').css('display', state.snap ? 'block' : 'none');

    var ws = currentWidgets();
    for (var i=0;i<ws.length;i++) {
      var w = normalizeWidget(ws[i]);
      var $el = $("<div class='sm-widget'><div class='sm-inner'></div></div>");
      $el.attr('data-type', w.type);
      if (w.id === state.selectedId) $el.addClass('selected');
      $el.find('.sm-inner').html(widgetText(w));
      applyWidgetCss($el, w);
      $c.append($el);

      // make interactive
      makeInteractive($el, w);
    }
  }

  
  function renderPageTabs() {
    ensurePages();
    var $t = $("#smPageTabs");
    if (!$t.length) return;
    $t.empty();
    for (var i=0;i<state.pages.length;i++) {
      (function(pg, idx){
        var $b = $("<div class='sm-pageTab'></div>");
        var name = pg.name || ("Page " + (idx+1));
        $b.append("<span class='sm-pageName'>" + esc(name) + "</span>");
        if (state.pages.length > 1) {
          var $x = $("<button class='sm-delPage' type='button' title='Delete page'>&times;</button>");
          $x.on("click", function(e){ e.stopPropagation(); deletePage(pg.id); });
          $b.append($x);
        }
        if (pg.id === state.activePageId) $b.addClass("active");
        $b.on("click", function(){ setActivePage(pg.id); });
        $t.append($b);
      })(state.pages[i], i);
    }
    try { $("#smPageHeight").val(currentPage().h || DEVICE_H); } catch(e) {}
    fillCopyPageSelect();
  }

  function deletePage(pageId) {
    ensurePages();
    if (state.pages.length <= 1) return;
    var idx = -1;
    for (var i=0;i<state.pages.length;i++) if (state.pages[i].id === pageId) { idx = i; break; }
    if (idx < 0) return;
    // remove
    state.pages.splice(idx, 1);
    // repair any tab widgets pointing to this page
    var fallback = (state.pages[0] ? state.pages[0].id : null);
    for (var p=0;p<state.pages.length;p++) {
      var ws = state.pages[p].widgets || [];
      for (var w=0;w<ws.length;w++) {
        if (ws[w].type === 'tab' && ws[w].targetPageId === pageId) ws[w].targetPageId = fallback;
      }
    }
    // pick a new active page if needed
    if (state.activePageId === pageId) {
      var newIdx = Math.max(0, idx-1);
      state.activePageId = state.pages[newIdx] ? state.pages[newIdx].id : fallback;
    }
    state.selectedId = null;
    highlightSelection(null);
    renderPageTabs();
    try { $('#smPageHeight').val(currentPage().h || DEVICE_H); } catch(e) {}
    renderCanvas();
    renderProps();
  }

  function addPage() {
    ensurePages();
    var pid = "p" + (new Date().getTime());
    state.pages.push({ id: pid, name: "Page " + (state.pages.length + 1), h: DEVICE_H, bg: (state.device.bg || '#070a12'), widgets: [] });
    setActivePage(pid);
  }

function makeInteractive($el, w) {
    var s = getScale();

    $el.off("mousedown").on("mousedown", function(e){
      // do NOT re-render on mousedown, it breaks jQueryUI drag start
      e.stopPropagation();
      state.selectedId = w.id;
      highlightSelection(w.id);
      renderProps();
    });

    // draggable/resizable in scaled space
    // Elements are freshly created on each renderCanvas(), so they may not have
    // draggable/resizable initialized yet. Calling destroy() unconditionally
    // throws: "cannot call methods on draggable prior to initialization".
    // If this element ever gets reused in the future, we safely destroy only
    // when initialized.
    try { if ($el.data('ui-draggable')) { $el.draggable('destroy'); } } catch(e) {}
    try { if ($el.data('ui-resizable')) { $el.resizable('destroy'); } } catch(e) {}

    $el.draggable({
      containment: "#smCanvas",
      grid: state.snap ? [GRID*s, GRID*s] : false,
      start: function(evt, ui){
        state.selectedId = w.id;
        highlightSelection(w.id);
        renderProps();
      },
      stop: function(evt, ui){
        var s2 = getScale();
        w.x = Math.round(ui.position.left / s2);
        w.y = Math.round(ui.position.top / s2);
        if (state.snap) { w.x = Math.round(w.x/GRID)*GRID; w.y = Math.round(w.y/GRID)*GRID; }
        w = normalizeWidget(w);
        renderCanvas();
        renderProps();
      }
    });

    $el.resizable({
      containment: "#smCanvas",
      grid: state.snap ? [GRID*s, GRID*s] : false,
      start: function(evt, ui){
        state.selectedId = w.id;
        highlightSelection(w.id);
        renderProps();
      },
      handles: "n,e,s,w,se,sw,ne,nw",
      stop: function(evt, ui){
        var s2 = getScale();
        w.x = Math.round(ui.position.left / s2);
        w.y = Math.round(ui.position.top / s2);
        w.w = Math.round(ui.size.width / s2);
        w.h = Math.round(ui.size.height / s2);
        if (state.snap) {
          w.x = Math.round(w.x/GRID)*GRID; w.y = Math.round(w.y/GRID)*GRID;
          w.w = Math.round(w.w/GRID)*GRID; w.h = Math.round(w.h/GRID)*GRID;
        }
        w = normalizeWidget(w);
        renderCanvas();
        renderProps();
      }
    });
  }

  function highlightSelection(id){
    try{
      $('#smCanvas .sm-widget').removeClass('sm-selected selected');
      if(id){ $('#smCanvas .sm-widget[data-id="'+id+'"]').addClass('sm-selected selected'); }
    }catch(e){}
  }

  function setSelection(id, forceRender){
    state.selectedId = id;
    if(forceRender){
      renderCanvas();
    } else {
      highlightSelection(id);
    }
    renderProps();
  }

  // -------- properties panel --------
  function renderProps() {
    var w = widgetById(state.selectedId);
    if (!w) {
      $('#smPropsForm').hide();
      $('#smNoSelection').show();
      $('#smDelete').prop('disabled', true);
      $('#smCopy').prop('disabled', true);
      $('#smCopyToPage').prop('disabled', true);
      return;
    }
    w = normalizeWidget(w);

    $('#smNoSelection').hide();
    $('#smPropsForm').show();
    $('#smDelete').prop('disabled', false);
    $('#smCopy').prop('disabled', false);
    $('#smCopyToPage').prop('disabled', false);

    $("#smType").val(w.type);
    $("#smX").val(w.x); $("#smY").val(w.y); $("#smW").val(w.w); $("#smH").val(w.h);
    $("#smBg").val(w.bg);
    $("#smFg").val(w.text);
    $("#smBorder").val(w.border);
    $("#smBorderSize").val(w.borderSize);
    $("#smRadius").val(w.radius);
    $("#smFontSize").val(w.textSize);

    $("#smLabelField").toggle(w.type === "action" || w.type === "tab");
    $("#smActionFields").toggle(w.type === "action" || w.type === "tab");
    $("#smStatusFields").toggle(w.type === "status");

    var $cmdField = $("#smPickCommand").closest(".sm-field");
    var $tabField = $(".sm-tabOnly");
    if (w.type === "action") {
      if ($cmdField.length) $cmdField.show();
      if ($tabField.length) $tabField.hide();
      $("#smLabel").val(typeof w.label === "string" ? w.label : "");
      $("#smIconValue").val(w.icon || "");
      $("#smIconSize").val(w.iconSize || 14);
      $("#smCommandDisplay").val(w.command ? w.command : "");
      $("#smCommand").val(w.command || "");
      $("#smCommandArgsJson").val(w.args ? JSON.stringify(w.args) : "{}");
    } else if (w.type === "tab") {
      if ($cmdField.length) $cmdField.hide();
      if ($tabField.length) $tabField.show();
      $("#smLabel").val(typeof w.label === "string" ? w.label : "");
      $("#smIconValue").val(w.icon || "");
      $("#smIconSize").val(w.iconSize || 14);
      // fill target pages
      var $tp = $("#smTargetPage"); $tp.empty();
      for (var i=0;i<state.pages.length;i++) {
        var pg = state.pages[i];
        $tp.append("<option value='" + esc(pg.id) + "'>" + esc(pg.name || pg.id) + "</option>");
      }
      $tp.val(w.targetPageId || state.activePageId);
    } else {
      if ($cmdField.length) $cmdField.hide();
      if ($tabField.length) $tabField.hide();
      $("#smSource").val(w.source || "player.statusText");
    }
  }

  function bindProps() {
    // IMPORTANT: don't constantly re-render the form while typing, or number fields become untypeable.
    function updatePosSizeLive() {
      var w = widgetById(state.selectedId); if (!w) return;
      w.x = toInt($("#smX").val(), w.x);
      w.y = toInt($("#smY").val(), w.y);
      w.w = toInt($("#smW").val(), w.w);
      w.h = toInt($("#smH").val(), w.h);
      normalizeWidget(w);
      renderCanvas();
      highlightSelection(w.id);
    }
    function updatePosSizeCommit() {
      var w = widgetById(state.selectedId); if (!w) return;
      w.x = toInt($("#smX").val(), w.x);
      w.y = toInt($("#smY").val(), w.y);
      w.w = toInt($("#smW").val(), w.w);
      w.h = toInt($("#smH").val(), w.h);
      if (state.snap) {
        w.x = Math.round(w.x/GRID)*GRID;
        w.y = Math.round(w.y/GRID)*GRID;
        w.w = Math.round(w.w/GRID)*GRID;
        w.h = Math.round(w.h/GRID)*GRID;
      }
      normalizeWidget(w);
      renderCanvas();
      renderProps();
    }
    $("#smX,#smY,#smW,#smH").off("input").on("input", updatePosSizeLive);
    $("#smX,#smY,#smW,#smH").off("change blur").on("change blur", updatePosSizeCommit);

    $("#smBg,#smFg,#smBorder").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w) return;
      w.bg = $("#smBg").val(); w.text = $("#smFg").val(); w.border = $("#smBorder").val();
      renderCanvas(); renderProps();
    });
    // Numeric fields: allow typing (do not re-render props while typing)
    function bindNumeric(id, getter, setter, min, max, fallback) {
      $(id).off('input').on('input', function(){
        var w = widgetById(state.selectedId); if (!w) return;
        var raw = String($(this).val() || '');
        if (raw === '' || raw === '-' || raw === '+') return;
        var v = parseInt(raw, 10);
        if (isNaN(v)) return;
        setter(w, v);
        normalizeWidget(w);
        renderCanvas(); highlightSelection(w.id);
      });
      $(id).off('change blur').on('change blur', function(){
        var w = widgetById(state.selectedId); if (!w) return;
        var v = toInt($(this).val(), fallback);
        if (min !== null && v < min) v = min;
        if (max !== null && v > max) v = max;
        setter(w, v);
        normalizeWidget(w);
        renderCanvas(); renderProps();
      });
    }

    bindNumeric('#smBorderSize', function(w){return w.borderSize;}, function(w,v){w.borderSize=v;}, 0, 10, 2);
    bindNumeric('#smRadius', function(w){return w.radius;}, function(w,v){w.radius=v;}, 0, 30, 10);
    bindNumeric('#smFontSize', function(w){return w.textSize;}, function(w,v){w.textSize=v;}, 8, 32, 12);

    $("#smLabel").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w || (w.type!=="action" && w.type!=="tab")) return;
      w.label = $(this).val();
      renderCanvas(); renderProps();
    });

    $("#smSource").off("change").on("change", function(){
      var w = widgetById(state.selectedId); if (!w || w.type!=="status") return;
      w.source = $(this).val();
      renderCanvas(); renderProps();
    });

    bindNumeric('#smIconSize', function(w){return w.iconSize;}, function(w,v){w.iconSize=clamp(v,8,64);}, 8, 64, 14);
    $("#smTargetPage").off("change").on("change", function(){
      var w = widgetById(state.selectedId); if (!w || w.type!=="tab") return;
      w.targetPageId = $(this).val();
      renderCanvas(); renderProps();
    });


    $("#smPickIcon").off("click").on("click", function(e){
      e.preventDefault();
      openIconModal();
    });

    $("#smClearIcon").off("click").on("click", function(e){
      e.preventDefault();
      var w = widgetById(state.selectedId); if (!w || (w.type!=="action" && w.type!=="tab")) return;
      w.icon = "";
      renderCanvas(); renderProps();
    });

    $("#smPickCommand").off("click").on("click", function(e){
      e.preventDefault();
      openCommandModal();
    });

    $("#smDelete").off("click").on("click", function(){
      var id = state.selectedId;
      if (!id) return;
      var pg = currentPage();
      pg.widgets = $.grep(pg.widgets || [], function(x){ return x.id !== id; });
      state.selectedId = null;
      highlightSelection(null);
      renderCanvas(); renderProps();
    });

    $("#smCopy").off("click").on("click", function(e){ e.preventDefault(); duplicateSelected(); });

    $("#smCopyToPage").off("click").on("click", function(e){
      e.preventDefault();
      if (!state.selectedId) return;
      fillCopyPageSelect();
      try {
        if ($("#smCopyPageModal").modal) { $("#smCopyPageModal").modal("show"); }
        else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smCopyPageModal")) || new window.bootstrap.Modal(document.getElementById("smCopyPageModal"))).show(); }
      } catch(ex) { $("#smCopyPageModal").addClass("show").show(); }
    });

    $("#smCopyPageDo").off("click").on("click", function(){
      var t = $("#smCopyPageSelect").val();
      if (!t) return;
      copySelectedToPage(t);
      try {
        if ($("#smCopyPageModal").modal) { $("#smCopyPageModal").modal("hide"); }
        else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smCopyPageModal")) || new window.bootstrap.Modal(document.getElementById("smCopyPageModal"))).hide(); }
      } catch(ex) { $("#smCopyPageModal").removeClass("show").hide(); }
    });

    // Modal close failsafe (Bootstrap 4/5 or no-bootstrap environments)
    $(document).off("click.smModalClose").on("click.smModalClose",
      "#smIconModal [data-dismiss=\"modal\"], #smIconModal [data-bs-dismiss=\"modal\"], #smIconModal .close, " +
      "#smCmdModal [data-dismiss=\"modal\"], #smCmdModal [data-bs-dismiss=\"modal\"], #smCmdModal .close, " +
      "#smCopyPageModal [data-dismiss=\"modal\"], #smCopyPageModal [data-bs-dismiss=\"modal\"], #smCopyPageModal .close",
      function(e){
        e.preventDefault();
        var $m = $(this).closest(".modal");
        try {
          if ($m.modal) { $m.modal("hide"); }
          else if (window.bootstrap && window.bootstrap.Modal) {
            var el = $m.get(0);
            var inst = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
            inst.hide();
          }
        } catch(err) {}
        // hard fallback
        $m.removeClass("show").hide();
        $(".modal-backdrop").remove();
        $("body").removeClass("modal-open").css("padding-right", "");
      }
    );

  }

  // -------- icon modal --------
  // Font Awesome helper: decide whether an icon is solid/brands/regular based on fa-icons.js
  function _smFaStyleMap() {
    if (window.smFaStyleMap) return window.smFaStyleMap;
    var m = {};
    if (window.faIcons && window.faIcons.length) {
      for (var i=0;i<window.faIcons.length;i++) {
        var it = window.faIcons[i];
        if (!it || typeof it !== 'object') continue;
        var t = String(it.title || '').trim();
        if (!t) continue;
        // expected: "fas fa-home" or "fab fa-github"
        var parts = t.split(/\s+/);
        var style = parts[0] || 'fas';
        var nm = (parts[1] || '').replace(/^fa-/, '').trim();
        if (nm) m[nm] = style;
      }
    }
    window.smFaStyleMap = m;
    return m;
  }

  // Return classes that work with BOTH Font Awesome 5 (fas/far/fab)
  // and Font Awesome 6 (fa-solid/fa-regular/fa-brands).
  // Also include the classic "fa" base class so this works on older FPP builds
  // that still ship Font Awesome 4 (fa fa-<name>).
  function smFaClassFor(name) {
    var m = _smFaStyleMap();
    var style = (m && m[name]) ? m[name] : 'fas';

    // If already a FA6 prefix, add the FA5-equivalent too.
    if (style.indexOf('fa-') === 0) {
      if (style === 'fa-brands') return 'fa fa-brands fab';
      if (style === 'fa-regular') return 'fa fa-regular far';
      // default: solid
      return 'fa fa-solid fas';
    }

    // Map FA5 prefixes to a dual-class set.
    if (style === 'fab') return 'fa fa-brands fab';
    if (style === 'far') return 'fa fa-regular far';
    // default: solid (fas)
    return 'fa fa-solid ' + style;
  }

  // Return the FA style token for an icon name (e.g. "fas" or "fab").
  // This is used to persist style in JSON so the firmware can pick the correct font.
  function smFaStyleFor(name) {
    var m = _smFaStyleMap();
    return (m && m[name]) ? m[name] : 'fas';
  }

  function smFaHtml(name, px) {
    if (!name) return '';
    var cls = smFaClassFor(name);
    var sz = px ? (" style='font-size:" + px + "px'") : '';
    return "<i class='" + cls + " fa-" + esc(name) + "'" + sz + "></i>";
  }

  function allIcons() {
    // supports faIcons array from fa-icons.js
    if (window.faIcons && window.faIcons.length) {
      var out = [];
      for (var i=0;i<window.faIcons.length;i++) {
        var it = window.faIcons[i];
        if (typeof it === "string") { out.push(it); }
        else if (it && typeof it === "object") {
          // common shapes: {title:'fas fa-play'} or {name:'play'}
          if (it.name) out.push(it.name);
          else if (it.title) out.push(String(it.title).replace(/^fa[srb]?\s+fa-/, "").replace(/^fa-/, "").trim());
        }
      }
      return out;
  }
    return [];
  }

  function openIconModal() {
    $("#smIconFind").val("");
    renderIconGrid(allIcons());
    try { if ($("#smIconModal").modal) { $("#smIconModal").modal("show"); } else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smIconModal")) || new window.bootstrap.Modal(document.getElementById("smIconModal"))).show(); } } catch(e) {}
  }

  function renderIconGrid(list) {
    var $g = $("#smIconGrid"); $g.empty();
    var w = widgetById(state.selectedId);
    var cur = (w && w.icon) ? w.icon : "";
    for (var i=0;i<list.length;i++) {
      var name = list[i];
      if (!name) continue;
      var $b = $("<button type='button' class='smIconTile'></button>");
      $b.attr("data-icon", name);
      $b.html("<i class='" + smFaClassFor(name) + " fa-" + esc(name) + "'></i>");
      if (name === cur) $b.addClass("active");
      $g.append($b);
    }
    $g.find("button").off("click").on("click", function(){
      var icon = $(this).attr("data-icon");
      var w2 = widgetById(state.selectedId);
      if (!w2 || (w2.type!=="action" && w2.type!=="tab")) return;
      w2.icon = icon;
      // Persist icon style so the firmware can pick the correct FA font (solid vs brands).
      w2.iconStyle = smFaStyleFor(icon);
      $("#smIconValue").val(icon);
      try { if ($("#smIconModal").modal) { $("#smIconModal").modal("hide"); } else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smIconModal")) || new window.bootstrap.Modal(document.getElementById("smIconModal"))).hide(); } } catch(e) {}
      renderCanvas(); renderProps();
    });
  }

  // -------- command modal --------
  function openCommandModal() {
    var w = widgetById(state.selectedId);
    if (!w || (w.type!=="action" && w.type!=="tab")) return;

    // BigButtons-style: use the built-in FPP Command Editor helpers so the command + args
    // are serialized exactly like other plugins (CommandToJSON + CommandSelectChanged).
    if ($.fn.fppDialog && typeof window.LoadCommandList === 'function' && typeof window.CommandToJSON === 'function' && typeof window.CommandSelectChanged === 'function') {
      // Prepare the hidden host table
      $('#smFppCmdSelect').off('change').on('change', function(){
        try { window.CommandSelectChanged('smFppCmdSelect', 'tableSmCmd', true); } catch(e) {}
      });

      // Populate list (FPP caches internally)
      try { window.LoadCommandList('smFppCmdSelect'); } catch(e2) {}

      // Restore existing command + args (BigButtons style)
      if (w.command) {
        if (typeof window.PopulateExistingCommand === 'function') {
          try {
            window.PopulateExistingCommand({
              command: w.command,
              args: w.args || {},
              multisyncCommand: w.multisyncCommand,
              multisyncHosts: w.multisyncHosts
            }, 'smFppCmdSelect', 'tableSmCmd', true);
          } catch(e3) {
            $('#smFppCmdSelect').val(w.command);
            try { window.CommandSelectChanged('smFppCmdSelect', 'tableSmCmd', true); } catch(e4) {}
          }
        } else {
          $('#smFppCmdSelect').val(w.command);
          try { window.CommandSelectChanged('smFppCmdSelect', 'tableSmCmd', true); } catch(e4) {}
        }
      }

      // Open dialog
      $('#smFppCmdWrap').fppDialog({
        title: 'FPP Command Editor',
        width: 640,
        buttons: {
          'Done': {
            click: function(){
              var tmp = {};
              try { window.CommandToJSON('smFppCmdSelect', 'tableSmCmd', tmp); } catch(e4) {}
              // Persist on widget in a firmware-friendly way (same keys as BigButtons)
              if (tmp.command !== undefined) w.command = tmp.command;
              if (tmp.args !== undefined) w.args = tmp.args;
              if (tmp.multisyncCommand !== undefined) w.multisyncCommand = tmp.multisyncCommand;
              if (tmp.multisyncHosts !== undefined) w.multisyncHosts = tmp.multisyncHosts;

              $('#smCommandDisplay').val(w.command || '');
              $('#smCommand').val(w.command || '');
              $('#smCommandArgsJson').val(w.args ? JSON.stringify(w.args) : '{}');

              try { $('#smFppCmdWrap').fppDialog('close'); } catch(e5) {}
              renderCanvas();
              renderProps();
            },
            class: 'btn-success'
          }
        }
      });
      return;
    }

    var $sel = $("#smCmdSelect"); $sel.empty();
    $sel.append("<option value='' disabled>Select a Command</option>");
    for (var i=0;i<state.commands.length;i++) {
      var c = state.commands[i];
      var name = (c && (c.name || c.command)) ? (c.name || c.command) : c;
      var desc = (c && c.description) ? c.description : "";
      if (!name) continue;
      var $o = $("<option></option>").attr("value", name).text(name);
      $o.attr("data-desc", desc);
      $sel.append($o);
    }

    if (w.command) $sel.val(w.command);

    $("#smCmdDesc").text($sel.find("option:selected").attr("data-desc") || "");
    $("#smCmdArg").val(w.arg || "");

    // playlist list
    var $pl = $("#smCmdPlaylist"); $pl.empty();
    for (var p=0;p<state.playlists.length;p++) {
      var pl = state.playlists[p];
      $pl.append($("<option></option>").attr("value", pl).text(pl));
    }
    $("#smCmdMultisync").prop("checked", !!(w.args && w.args.multisync));
    $("#smCmdRepeat").prop("checked", !!(w.args && w.args.repeat));
    $("#smCmdIfNotRunning").prop("checked", !!(w.args && w.args.ifNotRunning));
    if (w.args && w.args.playlist) $pl.val(w.args.playlist);

    updateCmdRows();

    $sel.off("change").on("change", function(){
      w.command = $(this).val();
      $("#smCmdDesc").text($(this).find("option:selected").attr("data-desc") || "");
      updateCmdRows();
    });

    $("#smCmdDone").off("click").on("click", function(){
      w.command = $sel.val() || "";
      w.arg = $("#smCmdArg").val() || "";
      w.args = w.args || {};
      w.args.multisync = $("#smCmdMultisync").is(":checked");
      w.args.repeat = $("#smCmdRepeat").is(":checked");
      w.args.ifNotRunning = $("#smCmdIfNotRunning").is(":checked");
      w.args.playlist = $("#smCmdPlaylist").val() || "";
      try { if ($("#smCmdModal").modal) { $("#smCmdModal").modal("hide"); } else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smCmdModal")) || new window.bootstrap.Modal(document.getElementById("smCmdModal"))).hide(); } } catch(e) {}
      renderProps();
    });

    try { if ($("#smCmdModal").modal) { $("#smCmdModal").modal("show"); } else if (window.bootstrap && window.bootstrap.Modal) { (window.bootstrap.Modal.getInstance(document.getElementById("smCmdModal")) || new window.bootstrap.Modal(document.getElementById("smCmdModal"))).show(); } } catch(e) {}
  }

  function updateCmdRows() {
    var cmd = $("#smCmdSelect").val() || "";
    var isStartPlaylist = (cmd === "Start Playlist" || cmd === "StartPlaylist");
    $("#smCmdPlaylistRow").toggle(isStartPlaylist);
    $("#smCmdFlagsRow").toggle(isStartPlaylist);
    $("#smCmdArgRow").toggle(!isStartPlaylist);
  }

  // -------- sources --------
  var SOURCES = [
    { id:"player.statusText", label:"Player: Status text" },
    { id:"player.uptime", label:"Player: Uptime" },
    { id:"player.currentPlaylist", label:"Player: Current playlist" },
    { id:"player.currentSequence", label:"Player: Current sequence" },
    { id:"player.mode", label:"Player: Mode" },
    { id:"player.playlistPosition", label:"Player: Playlist position" },
    { id:"player.sequencePosition", label:"Player: Sequence position" },
    { id:"player.repeat", label:"Player: Repeat" },
    { id:"player.volume", label:"Player: Volume" },
    { id:"system.hostname", label:"System: Hostname" },
    { id:"system.cpuTemp", label:"System: CPU temp" },
    { id:"system.cpuLoad", label:"System: CPU load" },
    { id:"system.memFree", label:"System: Free memory" },
    { id:"system.diskFree", label:"System: Free disk" },
    { id:"system.time", label:"System: Time" },
    { id:"system.ip", label:"System: IP address" },

    // ---- FPP Status JSON (extra fields) ----
    { id:"fpp.host_name", label:"FPP: Host name" },
    { id:"fpp.host_description", label:"FPP: Host description" },
    { id:"fpp.platform", label:"FPP: Platform" },
    { id:"fpp.version", label:"FPP: Version" },
    { id:"fpp.branch", label:"FPP: Branch" },
    { id:"fpp.uuid", label:"FPP: UUID" },
    { id:"fpp.mode_name", label:"FPP: Mode name" },
    { id:"fpp.status_name", label:"FPP: Status name" },
    { id:"fpp.fppd", label:"FPPD: State" },
    { id:"fpp.current_playlist.playlist", label:"Playlist: Current playlist" },
    { id:"fpp.current_sequence", label:"Playlist: Current sequence" },
    { id:"fpp.volume", label:"Audio: Volume" },
    { id:"fpp.uptimeStr", label:"System: Uptime" },
    { id:"fpp.dateStr", label:"System: Date" },
    { id:"fpp.timeStrFull", label:"System: Time (full)" },
    { id:"fpp.scheduler.status", label:"Scheduler: Status" },
    { id:"fpp.MQTT.configured", label:"MQTT: Configured" },
    { id:"fpp.MQTT.connected", label:"MQTT: Connected" },
    { id:"fpp.sensors[0].formatted", label:"Sensor: CPU temp" },
    { id:"fpp.powerBad", label:"System: Power bad" }
  ];
  function prettySource(id) {
    for (var i=0;i<SOURCES.length;i++) if (SOURCES[i].id === id) return SOURCES[i].label;
    return id || "";
  }
  function fillSources() {
    var $s = $("#smSource"); $s.empty();
    for (var i=0;i<SOURCES.length;i++) {
      $s.append($("<option></option>").attr("value", SOURCES[i].id).text(SOURCES[i].label));
    }
  }

  // -------- add widgets --------
  function addAction() {
    ensurePages();
    var pg = currentPage();
    var w = normalizeWidget({
      id: uid("action"),
      type: "action",
      x: Math.round((DEVICE_W - 120) / 2), y: Math.round((DEVICE_H - 44) / 2),
      w: 120, h: 44,
      label: "Start Show",
      icon: "play",
      iconStyle: smFaStyleFor("play"),
      iconSize: 24,
      textSize: 14,
      command: "",
      args: {}
    });
    (pg.widgets || (pg.widgets=[])).push(w);
    setSelection(w.id, true);
  }

  function addLock() {
    ensurePages();
    var pg = currentPage();
    var w = normalizeWidget({
      id: uid("action"),
      type: "action",
      x: Math.round((DEVICE_W - 120) / 2), y: Math.round((DEVICE_H - 44) / 2),
      w: 120, h: 44,
      label: "Lock",
      icon: "lock",
      iconStyle: smFaStyleFor("lock"),
      iconSize: 24,
      textSize: 14,
      // Local lock commands (handled locally on the Showmaster / Remote page)
      command: "lockscreen",
      args: {}
    });
    (pg.widgets || (pg.widgets=[])).push(w);
    setSelection(w.id, true);
  }

  function addStatus() {
    ensurePages();
    var pg = currentPage();
    var w = normalizeWidget({
      id: uid("status"),
      type: "status",
      x: Math.round((DEVICE_W - 140) / 2), y: Math.round((DEVICE_H - 44) / 2),
      w: 140, h: 44,
      source: "player.statusText",
      textSize: 14
    });
    (pg.widgets || (pg.widgets=[])).push(w);
    setSelection(w.id, true);
  }
  function addTab() {
    ensurePages();
    var pg = currentPage();
    var tgt = (state.pages.length > 1) ? state.pages[1].id : state.pages[0].id;
    var w = normalizeWidget({
      id: uid("tab"),
      type: "tab",
      x: Math.round((DEVICE_W - 120) / 2), y: Math.round((DEVICE_H - 44) / 2),
      w: 120, h: 44,
      label: "",
      icon: "columns",
      iconStyle: smFaStyleFor("columns"),
      iconSize: 22,
      textSize: 14,
      targetPageId: tgt
    });
    (pg.widgets || (pg.widgets=[])).push(w);
    setSelection(w.id, true);
  }


  // -------- save/load/push --------
  function exportConfig() {
    ensurePages();
    // Keep device.bg as a default/fallback, but backgrounds are per-page.
    var out = { device: { w: DEVICE_W, h: DEVICE_H, bg: state.device.bg }, pages: [], activePageId: state.activePageId };
    out.meta = { rotation: state.rotation || 0 };

    // Firmware display settings
    out.settings = out.settings || {};
    out.settings.screenTimeout = toInt(state.screenTimeout, 60);
    out.settings.brightness = clamp(toInt(state.brightness, 100), 0, 100);
    for (var p=0;p<state.pages.length;p++) {
      var pg = state.pages[p];
      var pgOut = { id: pg.id, name: pg.name, h: pg.h || DEVICE_H, bg: pg.bg || state.device.bg || '#070a12', widgets: [] };
      var ws = pg.widgets || [];
      for (var i=0;i<ws.length;i++) {
        var w = normalizeWidget($.extend({}, ws[i]));
        pgOut.widgets.push(w);
      }
      out.pages.push(pgOut);
    }
    return out;
  }

  function loadConfig(obj) {
    if (!obj) return;
    if (obj.device && obj.device.bg) state.device.bg = obj.device.bg;

    // Display settings (optional)
    try {
      if (obj.settings) {
        if (typeof obj.settings.screenTimeout !== 'undefined') state.screenTimeout = toInt(obj.settings.screenTimeout, state.screenTimeout);
        if (typeof obj.settings.brightness !== 'undefined') state.brightness = clamp(toInt(obj.settings.brightness, state.brightness), 0, 100);
      }
    } catch(eSet) {}

    // meta: rotation + upload target
    if (obj.meta && typeof obj.meta.rotation !== 'undefined') state.rotation = normalizeRotation(obj.meta.rotation);
    else if (obj.device && obj.device.w && obj.device.h) {
      // infer portrait from w/h
      if (parseInt(obj.device.w,10)===240 && parseInt(obj.device.h,10)===320) state.rotation = 90;
      else state.rotation = 0;
    }
    // uploadTarget removed (kept for backwards compatibility in JSON)

    // Backward compatibility: older configs stored a single widgets[] array.
    if (obj.pages && obj.pages.length) {
      state.pages = obj.pages;
      state.activePageId = obj.activePageId || (state.pages[0] ? state.pages[0].id : null);
    } else {
      var pid = "p1";
      state.pages = [{ id: pid, name: "Page 1", h: DEVICE_H, widgets: (obj.widgets || []) }];
      state.activePageId = pid;
    }

    applyRotation(state.rotation || 0, true);
    ensurePages();
    // Ensure each page has its own background
    for (var i=0;i<(state.pages||[]).length;i++) {
      if (!state.pages[i].bg) state.pages[i].bg = (state.device.bg || '#070a12');
      // Backfill iconStyle for existing configs (so brands icons work on device).
      var ws = state.pages[i].widgets || [];
      for (var j=0;j<ws.length;j++) {
        var w = ws[j];
        if (w && w.icon && typeof w.iconStyle === 'undefined') {
          try { w.iconStyle = smFaStyleFor(String(w.icon)); } catch(eIS) {}
        }
      }
    }
    state.selectedId = null;
    // Set page background
    try {
      var bg = (currentPage() && currentPage().bg) ? currentPage().bg : (state.device.bg || '#070a12');
      $("#smCanvasBg").val(bg);
      document.getElementById('smCanvas').style.setProperty('--smCanvasBg', bg);
    } catch(e) {}
    // upload target selector removed
    // highlight rotation buttons
    try { $('#smRotSeg button').removeClass('active'); $('#smRotSeg button[data-rot="' + (state.rotation||0) + '"]').addClass('active'); } catch(eR) {}
    $("#smPageHeight").val(currentPage().h || DEVICE_H);

    // display settings UI
    try {
      $("#smScreenTimeout").val(toInt(state.screenTimeout, 60));
      $("#smBrightness").val(clamp(toInt(state.brightness, 100), 0, 100));
      $("#smBrightnessLabel").text(clamp(toInt(state.brightness, 100), 0, 100) + "%");
    } catch(eUi) {}
    renderPageTabs();
    renderCanvas(); renderProps();
  }

  function apiGetConfig() {
    return $.getJSON("api/configfile/plugin.showmaster.json?plugin=showmaster").then(function(r){
      if (r && r.data) return r.data;
      return r;
    });
  }
  function apiSaveConfig(cfg) {
    return $.ajax({
      url: "api/configfile/plugin.showmaster.json?plugin=showmaster",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(cfg)
    });
  }

  function apiFetchCommands() {
    return $.getJSON("api/commands").then(function(r){
      // FPP returns {commands:[...]} or [...]
      var list = r && r.commands ? r.commands : r;
      if (!$.isArray(list)) list = [];
      state.commands = list;
    }, function(){ state.commands = []; });
  }
  function apiFetchPlaylists() {
    return $.getJSON("api/playlists").then(function(r){
      var list = r && r.playlists ? r.playlists : r;
      if (!$.isArray(list)) list = [];
      // normalize to names
      var out = [];
      for (var i=0;i<list.length;i++) {
        if (typeof list[i] === "string") out.push(list[i]);
        else if (list[i] && list[i].name) out.push(list[i].name);
      }
      state.playlists = out;
    }, function(){ state.playlists = []; });
  }

  function pushToShowmaster() {
    var host = ($("#smDeviceIp").val() || "").trim();
    if (!host) { toast("Enter Showmaster IP/host first.", true); return; }
    // allow IP or hostname (showmaster.local / Showmaster-xxxx)
    if (!/^[a-zA-Z0-9.\-:]+$/.test(host)) { toast("Invalid IP/host.", true); return; }

    // upload target selector removed; always push remote UI

    var cfg = exportConfig();
    // Ensure FPP target is embedded in the JSON so the Showmaster can send commands.
    // (Builder runs on FPP, so window.location.hostname is the correct target.)
    cfg.settings = cfg.settings || {};
    cfg.settings.fppHost = window.location.hostname;
    cfg.settings.fppPort = (window.location.port && parseInt(window.location.port, 10)) ? parseInt(window.location.port, 10) : 80;
    $("#smUpload").prop("disabled", true);

    // Prefer server-side push (avoids browser CORS/mixed-content issues in the FPP UI).
    dbg('Push start -> ' + host);
    $.ajax({
      // IMPORTANT: do NOT use &file= for PHP endpoints (served as plain text).
      url: 'plugin.php?plugin=showmaster&page=pages/api.php&cmd=push&nopage=1',
      method: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({ host: host, config: cfg, target: 'remote' })
    })
    .done(function(res){
      dbg('Push response: ' + JSON.stringify(res));
      if (res && res.ok) {
        toast(res.message || 'Pushed.', false);
      } else {
        toast('Push failed: ' + (res && res.error ? res.error : 'error'), true);
      }
    })
    .fail(function(xhr){
      var txt = '';
      try { txt = (xhr && xhr.responseText) ? String(xhr.responseText) : ''; } catch(e) {}
      dbg('Push xhr fail: ' + (xhr ? xhr.status : '0') + ' ' + txt);
      toast('Push failed: Failed to reach push.php', true);
    })
    .always(function(){ $("#smUpload").prop("disabled", false); });
  }

  // -------- init --------
  function wireUi() {
    fillSources();

    // Rotation segmented control
    $(document).off("click.smRot").on("click.smRot", "#smRotSeg button", function(e){
      e.preventDefault();
      var deg = $(this).attr('data-rot');
      applyRotation(deg, false);
    });

    // Debug log toggle
    $("#smDebugToggle").off("change").on("change", function(){
      var on = !!$(this).prop("checked");
      if (on) {
        $("#smDebugLog").show();
        dbg('Debug enabled');
      } else {
        $("#smDebugLog").hide();
      }
    });

    // Bootstrap 4/5 modal close failsafe (FPP can ship with either)
    $(document).off("click.smModalClose").on("click.smModalClose", "#smIconModal .close, #smCmdModal .close, #smIconModal [data-bs-dismiss='modal'], #smCmdModal [data-bs-dismiss='modal']", function(e){
      e.preventDefault();
      var $m = $(this).closest(".modal");
      if (!$m.length) return;
      try {
        if ($m.modal) { $m.modal("hide"); return; }
      } catch(ex) {}
      try {
        if (window.bootstrap && window.bootstrap.Modal) {
          var inst = window.bootstrap.Modal.getInstance($m[0]) || new window.bootstrap.Modal($m[0]);
          inst.hide();
        }
      } catch(ex2) {}
    });


    // Clicking empty canvas clears selection (do not re-render on mousedown).
    $("#smCanvas").off("click").on("click", function(e){
      if ($(e.target).closest('.sm-widget').length) return;
      state.selectedId = null;
      highlightSelection(null);
      renderProps();
    });

    $("#smAddAction").off("click").on("click", function(e){ e.preventDefault(); addAction(); });
    $("#smAddLock").off("click").on("click", function(e){ e.preventDefault(); addLock(); });
    $("#smAddStatus").off("click").on("click", function(e){ e.preventDefault(); addStatus(); });
    $("#smAddTab").off("click").on("click", function(e){ e.preventDefault(); addTab(); });
    $("#smAddPage").off("click").on("click", function(e){ e.preventDefault(); addPage(); });
    $("#smPageHeight").off("change").on("change", function(){
      var pg = currentPage();
      var h = toInt($(this).val(), DEVICE_H);
      if (h < DEVICE_H) h = DEVICE_H;
      pg.h = h;
      renderCanvas();
      try {
        var pg = currentPage();
        var ph = toInt(pg && pg.h ? pg.h : DEVICE_H, DEVICE_H);
        if (ph < DEVICE_H) ph = DEVICE_H;
        $('#smY').attr('max', String(ph-1));
        $('#smH').attr('max', String(ph));
      } catch(exB) {}
    });

    $("#smScreenTimeout").off("change").on("change", function(){
      state.screenTimeout = Math.max(0, toInt($(this).val(), state.screenTimeout));
    });

    $("#smBrightness").off("input change").on("input change", function(){
      state.brightness = clamp(toInt($(this).val(), state.brightness), 0, 100);
      try { $("#smBrightnessLabel").text(state.brightness + "%"); } catch(e) {}
    });

    $("#smSave").off("click").on("click", function(){
      var cfg = exportConfig();
      apiSaveConfig(cfg).done(function(){ toast("Saved.", false); }).fail(function(){ toast("Save failed.", true); });
    });

    // Load: upload a JSON file and replace the current config
    $("#smLoad").off("click").on("click", function(){
      try { document.getElementById('smLoadFile').value = ''; } catch(e) {}
      $("#smLoadFile").trigger('click');
    });

    $("#smLoadFile").off('change').on('change', function(){
      var f = (this.files && this.files[0]) ? this.files[0] : null;
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        try {
          var obj = JSON.parse(String(reader.result || '{}'));
          loadConfig(obj);
          renderPageTabs();
          renderCanvas();
          renderProps();
          // persist to FPP
          apiSaveConfig(exportConfig()).done(function(){ toast('Loaded.', false); }).fail(function(){ toast('Loaded, but save failed.', true); });
        } catch(ex) {
          toast('Invalid JSON.', true);
        }
      };
      reader.readAsText(f);
    });

    $("#smUpload").off("click").on("click", function(e){ e.preventDefault(); pushToShowmaster(); });
    // upload target selector removed

    // Scan for Showmaster on local network (best-effort)
    $("#smScan").off("click").on("click", function(e){
      e.preventDefault();

      var $btn = $(this);
      var $row = $("#smScanStatusRow");
      var $txt = $("#smScanStatusText");
      var $bar = $("#smScanBarFill");

      function setProgress(p){
        p = Math.max(0, Math.min(100, p|0));
        if ($bar.length) $bar.css("width", p + "%");
      }
      function setStatus(s){
        if ($txt.length) $txt.text(s);
      }
      function showStatus(show){
        if ($row.length) $row.toggle(!!show);
      }

      $btn.prop('disabled', true).text('Scanning...');
      showStatus(true);
      setProgress(0);
      setStatus("Scanning 192.168.0.0 - 192.168.255.255 (0%)");

      var allHosts = {};
      var foundList = [];

      // Scan /24 subnets: 192.168.0 .. 192.168.255
      // Keep it gentle: 4 concurrent subnet scans.
      var nextSubnet = 0;
      var done = 0;
      var concurrency = 4;
      var stopped = false;

      function updateUi(){
        var pct = Math.round((done / 256) * 100);
        setProgress(pct);
        setStatus("Scanning 192.168.*.* (" + pct + "%) — found " + foundList.length);
      }

      function addHosts(hosts){
        if (!hosts || !hosts.length) return;
        hosts.forEach(function(h){
          var v = (h && h.host) ? String(h.host).trim() : '';
          if (!v || allHosts[v]) return;
          allHosts[v] = true;
          foundList.push({host: v});
        });
      }

      function finish(){
        // Fill datalist + pick first
        var list = document.getElementById('smScannedIps');
        if (list) {
          while (list.firstChild) list.removeChild(list.firstChild);
          foundList.forEach(function(h){
            var opt = document.createElement('option');
            opt.value = h.host;
            list.appendChild(opt);
          });
        }
        if (foundList.length) {
          $('#smDeviceIp').val(foundList[0].host);
          toast(foundList.length === 1 ? ("Found: " + foundList[0].host) : ("Found " + foundList.length + " Showmasters. Click the IP field to choose."));
        } else {
          toast("Not found on 192.168.*.* (did you power on Showmaster?)", true);
        }

        setProgress(100);
        setStatus("Scan complete — found " + foundList.length);
        $btn.prop('disabled', false).text('Scan');
        setTimeout(function(){ showStatus(false); }, 2500);
      }

      function scanOne(subnetIdx){
        var sn = "192.168." + subnetIdx;
        return $.getJSON('plugin.php?plugin=showmaster&page=pages/api.php&cmd=scan&nopage=1&subnet=' + encodeURIComponent(sn))
          .done(function(res){
            if (res && res.hosts && res.hosts.length) addHosts(res.hosts);
          })
          .fail(function(){
            // ignore failures per subnet (keep going)
          })
          .always(function(){
            done++;
            updateUi();
          });
      }

      function pump(){
        if (stopped) return;
        if (done >= 256) return finish();

        while (nextSubnet < 256 && concurrency > 0) {
          // start a job
          concurrency--;
          var idx = nextSubnet++;
          scanOne(idx).always(function(){ concurrency++; pump(); });
        }
      }

      pump();
    });}

            // Pick first result
            if ($ip.length) $ip.val(hosts[0].host);

            toast(hosts.length === 1 ? ('Found: ' + hosts[0].host) : ('Found ' + hosts.length + ' Showmasters. Click the IP field to choose.'));
          } else {
            toast('Not found. Try opening Showmaster once, then scan again.', true);
          }
        })
        .fail(function(xhr){
          var txt = '';
          try { txt = (xhr && xhr.responseText) ? String(xhr.responseText) : ''; } catch(ex) {}
          dbg('Scan xhr fail: ' + (xhr ? xhr.status : '0') + ' ' + txt);
          toast('Scan failed.', true);
        })
        .always(function(){ $btn.prop('disabled', false).text('Scan'); });
    });

    $("#smDownload").off("click").on("click", function(e){
      e.preventDefault();
      try {
        var cfg = exportConfig();
        var txt = JSON.stringify(cfg, null, 2);
        var blob = new Blob([txt], {type: 'application/json'});
        var url = (window.URL || window.webkitURL).createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'plugin.showmaster.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function(){
          document.body.removeChild(a);
          try { (window.URL || window.webkitURL).revokeObjectURL(url); } catch(ex) {}
        }, 0);
      } catch(ex2) {
        toast('Download failed.', true);
      }
    });

    // Background is per-page
    $("#smCanvasBg").off("input change").on("input change", function(){
      var pg = currentPage();
      if (!pg) return;
      pg.bg = $(this).val();
      document.getElementById("smCanvas").style.setProperty("--smCanvasBg", pg.bg);
    });

    $("#smGridToggle").off("change").on("change", function(){
      state.snap = $(this).is(":checked");
      renderCanvas();
    });

    $("#smZoom").off("input change").on("input change", function(){
      state.zoom = toInt($(this).val(), 200);
      renderCanvas();
    });

    bindProps();

    // icon find
    $("#smIconFind").off("input").on("input", function(){
      var q = ($(this).val() || "").toLowerCase();
      var all = allIcons();
      if (!q) return renderIconGrid(all);
      var filtered = [];
      for (var i=0;i<all.length;i++) if (String(all[i]).toLowerCase().indexOf(q) >= 0) filtered.push(all[i]);
      renderIconGrid(filtered);
    });
  }

  function boot() {
    wireUi();
    // init rotation UI
    applyRotation(state.rotation || 0, true);
    try { $("#smCanvasBg").val((currentPage() && currentPage().bg) ? currentPage().bg : state.device.bg); } catch(e) {}
    $("#smGridToggle").prop("checked", state.snap);
    $("#smZoom").val(state.zoom);
    try {
      $("#smScreenTimeout").val(toInt(state.screenTimeout, 60));
      $("#smBrightness").val(clamp(toInt(state.brightness, 100), 0, 100));
      $("#smBrightnessLabel").text(clamp(toInt(state.brightness, 100), 0, 100) + "%");
    } catch(eDb) {}
    ensurePages();
    applyRotation(state.rotation || 0, true);
    try { $('#smRotSeg button').removeClass('active'); $('#smRotSeg button[data-rot="' + (state.rotation||0) + '"]').addClass('active'); } catch(eR) {}
    renderPageTabs();
    try { $('#smPageHeight').val(currentPage().h || DEVICE_H); } catch(e) {}
    renderCanvas();
    renderProps();

    // fetch data then load config
    $.when(apiFetchCommands(), apiFetchPlaylists()).always(function(){
      apiGetConfig().done(function(cfg){
        if (cfg) loadConfig(cfg);
      });
    });
  }

  $(boot);
})();
