<?php
// Standalone Remote page: use the built UI without needing a Showmaster.
// Loads the same plugin config (plugin.showmaster.json) and renders it for mobile/desktop.
?>
<link rel="stylesheet" href="plugin.php?plugin=showmaster&file=css/style.css&nopage=1" />
<link rel="stylesheet" href="/css/fontawesome/css/all.min.css" />
<link rel="stylesheet" href="/css/font-awesome/css/font-awesome.min.css" />
<link rel="stylesheet" href="/css/font-awesome.min.css" />
<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.15.4/css/all.css" />
<div class="sm-wrap sm-remoteWrap">
  <div class="sm-topbar sm-remoteTop">
    <div class="sm-brand">
      <div class="sm-logo"><img src="plugin.php?plugin=showmaster&file=images/showmaster.png&nopage=1" alt="Showmaster" /></div>
    </div>
    <div class="sm-remoteHint">
      <a class="sm-remoteLink" href="plugin.php?plugin=showmaster&page=plugin.php" title="Back to Builder">Back to Builder</a>
    </div>
  </div>

  <div class="sm-remoteBody">
    <div class="sm-remoteBar">
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

<script src="plugin.php?plugin=showmaster&file=js/fa-icons.js&nopage=1"></script>
<script src="plugin.php?plugin=showmaster&file=js/builder-remote.js&nopage=1"></script>
