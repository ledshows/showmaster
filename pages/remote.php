<?php
// Standalone Remote page: use the built UI without needing a Showmaster.
// Loads the same plugin config (plugin.showmaster.json) and renders it for mobile/desktop.
?>
<link rel="stylesheet" href="plugin.php?plugin=showmaster&file=css/style.css&nopage=1" />
<div class="sm-wrap sm-remoteWrap">
  <div class="sm-topbar sm-remoteTop">
    <div class="sm-brand">
      <img class="sm-logo" src="plugin.php?plugin=showmaster&file=images/ledshows.png&nopage=1" alt="Ledshows" />
      <div class="sm-titleBlock">
        <div class="sm-title">Showmaster Remote</div>
        <div class="sm-sub">Use your saved Builder layout to control FPP (no Showmaster required).</div>
      </div>
    </div>
    <div class="sm-remoteHint">
      <a class="sm-remoteLink" href="plugin.php?plugin=showmaster&page=plugin.php" title="Back to Builder">Back to Builder</a>
    </div>
  </div>

  <div class="sm-remoteToastArea">
    <div id="smRToast" class="sm-toast" style="display:none;"></div>
  </div>

  <div class="sm-remoteBody">
    <div class="sm-remoteBar">
      <div id="smRPageTabs" class="sm-pageTabs"></div>
      <div class="sm-remoteZoom" title="Zoom">
        <button class="sm-zoomBtn" id="smRZoomOut" type="button">-</button>
        <span id="smRZoomLabel" class="sm-zoomRead">200%</span>
        <button class="sm-zoomBtn" id="smRZoomIn" type="button">+</button>
      </div>
    </div>
    <div id="smRStage" class="sm-remoteStage">
      <div id="smRScene" class="sm-remoteScene">
        <div id="smRViewport" class="sm-canvasViewport sm-remoteViewport">
          <div id="smRCanvas" class="sm-canvas sm-remoteCanvas"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script src="plugin.php?plugin=showmaster&file=js/builder-remote.js&nopage=1"></script>
