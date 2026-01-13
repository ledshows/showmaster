/* Showmaster Builder (ES5-safe)
 * 320x240 drag+resize UI builder for the Showmaster touchscreen
 */
(function () {
  var DEVICE_W = 320;
  var DEVICE_H = 240;
  var GRID = 10;

  var state = {
    device: { w: DEVICE_W, h: DEVICE_H, bg: "#0b0f14" },
    widgets: [],
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

  function widgetById(id) {
    for (var i=0;i<state.widgets.length;i++) if (state.widgets[i].id === id) return state.widgets[i];
    return null;
  }

  function normalizeWidget(w) {
    w.x = clamp(w.x, 0, DEVICE_W - 1);
    w.y = clamp(w.y, 0, DEVICE_H - 1);
    w.w = clamp(w.w, 10, DEVICE_W);
    w.h = clamp(w.h, 10, DEVICE_H);
    if (!w.bg) w.bg = (w.type === "action") ? "#0ea5e9" : "rgba(255,255,255,0.06)";
    if (!w.text) w.text = "#eaf2ff";
    if (!w.border) w.border = "#22d3ee";
    if (typeof w.borderSize === "undefined") w.borderSize = 2;
    if (typeof w.radius === "undefined") w.radius = 10;
    if (typeof w.textSize === "undefined") w.textSize = 12;
    if (typeof w.iconSize === "undefined") w.iconSize = 14;
    if (!w.label && w.type === "action") w.label = "Button";
    if (!w.source && w.type === "status") w.source = "player.statusText";
    if (!w.command && w.type === "action") w.command = "";
    if (!w.args && w.type === "action") w.args = {};
    return w;
  }

  // -------- rendering --------
  function ensureCanvasSizing() {
    var s = getScale();
    var cw = Math.round(DEVICE_W * s);
    var ch = Math.round(DEVICE_H * s);
    // Resize the canvas itself (no CSS transforms) so jQueryUI drag behaves correctly.
    $("#smCanvas").css({ width: cw + "px", height: ch + "px" });

    // Apply background base color via CSS variable so gradients remain.
    try {
      document.getElementById("smCanvas").style.setProperty("--smCanvasBg", state.device.bg || "#070a12");
    } catch(e) {}

    // Scale grid overlay with zoom.
    $("#smCanvas .sm-grid").css("background-size", (GRID*s) + "px " + (GRID*s) + "px");

    // Label
    $("#smZoomLabel").text(getZoomPercent() === 100 ? "Original size" : (getZoomPercent() + "%"));
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
      borderRadius: (w.radius||0) + "px",
      fontSize: (w.textSize||12) + "px"
    });
    $el.attr("data-id", w.id);
  }

  function widgetText(w) {
    if (w.type === "status") return prettySource(w.source);
    // action: icon + label
    var icon = w.icon ? ("<i class='fa fa-" + esc(w.icon) + "' style='font-size:" + (w.iconSize||14) + "px'></i> ") : "";
    return icon + "<span>" + esc(w.label || "") + "</span>";
  }

  function esc(s) {
    s = (s == null) ? "" : String(s);
    return s.replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
  }

  function renderCanvas() {
    ensureCanvasSizing();
    var $c = $("#smCanvas");
    document.getElementById('smCanvas').style.setProperty('--smCanvasBg', state.device.bg || '#070a12');
    $c.empty();

    for (var i=0;i<state.widgets.length;i++) {
      var w = normalizeWidget(state.widgets[i]);
      var $el = $("<div class='smWidget'></div>");
      $el.toggleClass("action", w.type === "action");
      $el.toggleClass("status", w.type === "status");
      if (w.id === state.selectedId) $el.addClass("selected");
      $el.html(widgetText(w));
      applyWidgetCss($el, w);
      $c.append($el);

      // make interactive
      makeInteractive($el, w);
    }
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
      $('#smCanvas .sm-widget').removeClass('is-selected');
      if(id){ $('#smCanvas .sm-widget[data-id="'+id+'"]').addClass('is-selected'); }
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
  
    highlightSelection(state.selectedId);
}

  // -------- properties panel --------
  function renderProps() {
    var w = widgetById(state.selectedId);
    if (!w) {
      $("#smPropsBody").html("<div class='muted'>Select a widget on the canvas.</div>");
      return;
    }
    w = normalizeWidget(w);

    $("#smPropsType").val(w.type);
    $("#smX").val(w.x); $("#smY").val(w.y); $("#smW").val(w.w); $("#smH").val(w.h);
    $("#smBg").val(w.bg); $("#smText").val(w.text); $("#smBorder").val(w.border);
    $("#smBorderSize").val(w.borderSize);
    $("#smRadius").val(w.radius);
    $("#smTextSize").val(w.textSize);

    $("#smActionFields").toggle(w.type === "action");
    $("#smStatusFields").toggle(w.type === "status");

    if (w.type === "action") {
      $("#smLabel").val(w.label || "");
      $("#smIcon").val(w.icon || "");
      $("#smIconSize").val(w.iconSize || 14);
      $("#smCmdSummary").text(w.command ? w.command : "Choose…");
    } else {
      $("#smSource").val(w.source || "player.statusText");
    }
  }

  function bindProps() {
    function updatePosSize() {
      var w = widgetById(state.selectedId); if (!w) return;
      w.x = toInt($("#smX").val(), w.x); w.y = toInt($("#smY").val(), w.y);
      w.w = toInt($("#smW").val(), w.w); w.h = toInt($("#smH").val(), w.h);
      if (state.snap) { w.x = Math.round(w.x/GRID)*GRID; w.y = Math.round(w.y/GRID)*GRID; w.w = Math.round(w.w/GRID)*GRID; w.h = Math.round(w.h/GRID)*GRID; }
      normalizeWidget(w); renderCanvas(); renderProps();
    }
    $("#smX,#smY,#smW,#smH").off("input change").on("input change", updatePosSize);

    $("#smBg,#smText,#smBorder").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w) return;
      w.bg = $("#smBg").val(); w.text = $("#smText").val(); w.border = $("#smBorder").val();
      renderCanvas(); renderProps();
    });
    $("#smBorderSize").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w) return;
      w.borderSize = toInt($(this).val(), 2);
      renderCanvas(); renderProps();
    });
    $("#smRadius").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w) return;
      w.radius = toInt($(this).val(), 10);
      renderCanvas(); renderProps();
    });
    $("#smTextSize").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w) return;
      w.textSize = toInt($(this).val(), 12);
      renderCanvas(); renderProps();
    });

    $("#smLabel").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w || w.type!=="action") return;
      w.label = $(this).val();
      renderCanvas(); renderProps();
    });

    $("#smSource").off("change").on("change", function(){
      var w = widgetById(state.selectedId); if (!w || w.type!=="status") return;
      w.source = $(this).val();
      renderCanvas(); renderProps();
    });

    $("#smIconSize").off("input change").on("input change", function(){
      var w = widgetById(state.selectedId); if (!w || w.type!=="action") return;
      w.iconSize = clamp(toInt($(this).val(), 14), 8, 64);
      renderCanvas(); renderProps();
    });

    $("#smPickIcon").off("click").on("click", function(e){
      e.preventDefault();
      openIconModal();
    });

    $("#smPickCommand").off("click").on("click", function(e){
      e.preventDefault();
      openCommandModal();
    });

    $("#smDelete").off("click").on("click", function(){
      var id = state.selectedId;
      if (!id) return;
      state.widgets = $.grep(state.widgets, function(x){ return x.id !== id; });
      state.selectedId = null;
      renderCanvas(); renderProps();
    });
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
    $("#smIconModal").modal("show");
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
      if (!w2 || w2.type!=="action") return;
      w2.icon = icon;
      $("#smIcon").val(icon);
      $("#smIconModal").modal("hide");
      renderCanvas(); renderProps();
    });
  }

  // -------- command modal --------
  function openCommandModal() {
    var w = widgetById(state.selectedId);
    if (!w || w.type!=="action") return;

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
      $("#smCmdModal").modal("hide");
      renderProps();
    });

    $("#smCmdModal").modal("show");
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
    { id:"player.volume", label:"Player: Volume" },
    { id:"system.cpuTemp", label:"System: CPU temp" },
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
    var w = normalizeWidget({
      id: uid("action"),
      type: "action",
      x: 10, y: 10, w: 120, h: 44,
      label: "Start Show",
      icon: "play",
      command: ""
    });
    state.widgets.push(w);
    setSelection(w.id);
  }
  function addStatus() {
    var w = normalizeWidget({
      id: uid("status"),
      type: "status",
      x: 10, y: 70, w: 150, h: 28,
      source: "player.statusText"
    });
    state.widgets.push(w);
    setSelection(w.id);
  }

  // -------- save/load/push --------
  function exportConfig() {
    var out = { device: { w: DEVICE_W, h: DEVICE_H, bg: state.device.bg }, widgets: [] };
    for (var i=0;i<state.widgets.length;i++) {
      var w = normalizeWidget($.extend({}, state.widgets[i]));
      // do not include internal selection state
      out.widgets.push(w);
    }
    return out;
  }

  function loadConfig(obj) {
    if (!obj) return;
    if (obj.device && obj.device.bg) state.device.bg = obj.device.bg;
    state.widgets = obj.widgets || [];
    state.selectedId = null;
    $("#smCanvasBg").val(state.device.bg);
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
    var ip = ($("#smHost").val() || "").trim();
    if (!ip) { toast("Enter Showmaster IP first.", true); return; }
    // naive validation: must contain digit/dot/colon
    if (!/^[0-9a-fA-F\.\:\-]+$/.test(ip)) { toast("Invalid IP/host.", true); return; }

    var cfg = exportConfig();
    $("#smPush").prop("disabled", true);
    $.ajax({
      url: "api/push.php",
      method: "POST",
      dataType: "json",
      data: { host: ip, json: JSON.stringify(cfg) }
    }).done(function(resp){
      if (resp && resp.ok) toast("Pushed to Showmaster.", false);
      else toast((resp && resp.error) ? resp.error : "Push failed.", true);
    }).fail(function(xhr){
      toast("Push failed (" + xhr.status + ").", true);
    }).always(function(){ $("#smPush").prop("disabled", false); });
  }

  // -------- init --------
  function wireUi() {
    fillSources();

    $("#smCanvas").off("mousedown").on("mousedown", function(){ state.selectedId = null; renderCanvas(); renderProps(); });

    $("#smAddAction").off("click").on("click", function(e){ e.preventDefault(); addAction(); });
    $("#smAddStatus").off("click").on("click", function(e){ e.preventDefault(); addStatus(); });

    $("#smSave").off("click").on("click", function(){
      var cfg = exportConfig();
      apiSaveConfig(cfg).done(function(){ toast("Saved.", false); }).fail(function(){ toast("Save failed.", true); });
    });

    $("#smLoad").off("click").on("click", function(){
      apiGetConfig().done(function(cfg){ loadConfig(cfg); toast("Loaded.", false); }).fail(function(){ toast("Load failed.", true); });
    });

    $("#smPush").off("click").on("click", function(e){ e.preventDefault(); pushToShowmaster(); });

    $("#smCanvasBg").off("input change").on("input change", function(){
      state.device.bg = $(this).val();
      document.getElementById("smCanvas").style.setProperty("--smCanvasBg", state.device.bg);
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
    $("#smCanvasBg").val(state.device.bg);
    $("#smGridToggle").prop("checked", state.snap);
    $("#smZoom").val(state.zoom);
    renderCanvas();
    renderProps();

    // fetch data then load config
    $.when(apiFetchCommands(), apiFetchPlaylists()).always(function(){
      apiGetConfig().done(function(cfg){
        if (cfg && cfg.widgets) loadConfig(cfg);
      });
    });
  }

  $(boot);
})();
