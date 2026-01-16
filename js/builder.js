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
    zoom: 200 // percent
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
    return clamp(v, 100, 300);
  }
  function getScale() { return getZoomPercent() / 100.0; }

  function toast(msg, isErr) {
    var $t = $("#smToast");
    if (!$t.length) return alert(msg);
    $t.text(msg).toggleClass("err", !!isErr).fadeIn(120);
    setTimeout(function(){ $t.fadeOut(250); }, 2600);
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
      var iconT = w.icon ? ("<i class=\'fa fa-" + esc(w.icon) + "\' style=\'font-size:" + (w.iconSize||14) + "px\'></i>") : "";
      if (!label.trim()) return iconT;
      return iconT + "<span>" + esc(label) + "</span>";
    }
    // action: icon + label (spacing handled by CSS, not by trailing spaces)
    var label2 = (w.label == null) ? "" : String(w.label);
    var icon = w.icon ? ("<i class='fa fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i>") : "";
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
      $b.html("<i class='fa fa-" + esc(name) + "'></i>");
      if (name === cur) $b.addClass("active");
      $g.append($b);
    }
    $g.find("button").off("click").on("click", function(){
      var icon = $(this).attr("data-icon");
      var w2 = widgetById(state.selectedId);
      if (!w2 || (w2.type!=="action" && w2.type!=="tab")) return;
      w2.icon = icon;
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
    { id:"system.ip", label:"System: IP address" }
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
      iconSize: 24,
      textSize: 14,
      command: "",
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

    // Let Showmaster know where FPP is, so button presses can call the FPP API.
    // Builder runs inside FPP's web UI, so the current hostname/port is the right target.
    try {
      var h = (window.location && window.location.hostname) ? window.location.hostname : "";
      var p = (window.location && window.location.port) ? parseInt(window.location.port, 10) : 0;
      out.settings = { fppHost: h, fppPort: (p && p > 0) ? p : 80 };
    } catch(e) {
      out.settings = { fppHost: "", fppPort: 80 };
    }
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

    // Backward compatibility: older configs stored a single widgets[] array.
    if (obj.pages && obj.pages.length) {
      state.pages = obj.pages;
      state.activePageId = obj.activePageId || (state.pages[0] ? state.pages[0].id : null);
    } else {
      var pid = "p1";
      state.pages = [{ id: pid, name: "Page 1", h: DEVICE_H, widgets: (obj.widgets || []) }];
      state.activePageId = pid;
    }

    ensurePages();
    // Ensure each page has its own background
    for (var i=0;i<(state.pages||[]).length;i++) {
      if (!state.pages[i].bg) state.pages[i].bg = (state.device.bg || '#070a12');
    }
    state.selectedId = null;
    // Set page background
    try {
      var bg = (currentPage() && currentPage().bg) ? currentPage().bg : (state.device.bg || '#070a12');
      $("#smCanvasBg").val(bg);
      document.getElementById('smCanvas').style.setProperty('--smCanvasBg', bg);
    } catch(e) {}
    $("#smPageHeight").val(currentPage().h || DEVICE_H);
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
    var ip = ($("#smDeviceIp").val() || "").trim();
    if (!ip) { toast("Enter Showmaster IP first.", true); return; }
    // naive validation: must contain digit/dot/colon
    if (!/^[a-zA-Z0-9.\-:]+$/.test(ip)) { toast("Invalid host.", true); return; }

    var cfg = exportConfig();
    $("#smUpload").prop("disabled", true);
    $.ajax({
      // IMPORTANT: plugin runs under plugin.php, so we must route API calls through plugin.php
      // otherwise relative URLs like "api/push.php" resolve to /api/push.php and will 404.
      url: "plugin.php?plugin=showmaster&file=api/push.php&nopage=1",
      method: "POST",
      dataType: "json",
      data: { host: ip, json: JSON.stringify(cfg) }
    }).done(function(resp){
      if (resp && resp.ok) {
        var warn = false;
        var parts = ["Pushed."];
        if (typeof resp.reloadOk !== "undefined") {
          parts.push(resp.reloadOk ? "Reload OK" : "Reload skipped");
        }
        if (typeof resp.pingOk !== "undefined") {
          parts.push(resp.pingOk ? "Ping OK" : "Ping FAIL");
          if (!resp.pingOk) warn = true;
        }
        if (typeof resp.configOk !== "undefined") {
          parts.push(resp.configOk ? "Config OK" : "Config FAIL");
          if (!resp.configOk) warn = true;
        }
        toast(parts.join(" | "), warn);
      } else {
        toast((resp && resp.error) ? resp.error : "Push failed.", true);
      }
    }).fail(function(xhr){
      toast("Push failed (" + xhr.status + ").", true);
    }).always(function(){ $("#smUpload").prop("disabled", false); });
  }

  // -------- init --------
  function wireUi() {
    fillSources();

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
    $("#smAddStatus").off("click").on("click", function(e){ e.preventDefault(); addStatus(); });
    $("#smAddTab").off("click").on("click", function(e){ e.preventDefault(); addTab(); });
    $("#smAddPage").off("click").on("click", function(e){ e.preventDefault(); addPage(); });
    $("#smPageHeight").off("change").on("change", function(){
      var pg = currentPage();
      var h = toInt($(this).val(), DEVICE_H);
      if (h < DEVICE_H) h = DEVICE_H;
      pg.h = h;
      renderCanvas();
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

    // Scan for Showmaster on local network (best-effort)
    $("#smScan").off("click").on("click", function(e){
      e.preventDefault();
      var $btn = $(this);
      $btn.prop('disabled', true).text('Scanning...');
      $.getJSON('plugin.php?plugin=showmaster&file=api/scan.php&nopage=1')
        .done(function(res){
          if (res && res.ok && res.host) {
            $('#smDeviceIp').val(res.host);
            toast('Found: ' + res.host);
          } else {
            toast('Not found. Try opening Showmaster once, then scan again.', true);
          }
        })
        .fail(function(){ toast('Scan failed.', true); })
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
    try { $("#smCanvasBg").val((currentPage() && currentPage().bg) ? currentPage().bg : state.device.bg); } catch(e) {}
    $("#smGridToggle").prop("checked", state.snap);
    $("#smZoom").val(state.zoom);
    ensurePages();
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
