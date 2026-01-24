<?php
// Standalone Remote page: use the built UI without needing a Showmaster.
// Loads the same plugin config (plugin.showmaster.json) and renders it for mobile/desktop.
?>
<link rel="stylesheet" href="plugin.php?plugin=showmaster&file=css/style.css&nopage=1" />
<!-- jQuery for remote page (FPP pages do not always include it) -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<div class="sm-wrap sm-remoteWrap">
  <div class="sm-topbar sm-remoteTop">
    <div class="sm-brand">
      <div class="sm-logo"><img src="plugin.php?plugin=showmaster&file=images/showmaster.png&nopage=1" alt="Showmaster" /></div>
      <div class="sm-subtitle">Showmaster</div>
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

      <div class="sm-remoteTools">
        <button class="sm-zoomBtn sm-fsBtn" id="smRFullscreen" type="button" title="Canvas fullscreen">
          <i class="fas fa-expand"></i>
        </button>
      </div>
    </div>
    <div id="smRStageHolder" class="sm-remoteStageHolder">
    <div id="smRStage" class="sm-remoteStage">
      <button class="sm-zoomBtn sm-canvasOnlyExit" id="smRCanvasExit" type="button" title="Exit canvas fullscreen">
        <i class="fas fa-times"></i>
      </button>
      <div id="smRScene" class="sm-remoteScene">
        <div id="smRViewport" class="sm-canvasViewport sm-remoteViewport">
          <div id="smRCanvas" class="sm-canvas sm-remoteCanvas"></div>
        </div>
      </div>
    </div>
    </div>
  </div>
</div>

<script src="plugin.php?plugin=showmaster&file=js/fa-icons.js&nopage=1"></script>
<script src="plugin.php?plugin=showmaster&file=js/builder-remote.js&nopage=1"></script>
