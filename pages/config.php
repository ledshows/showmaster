<?php
// Showmaster Builder main page
?>
<link rel="stylesheet" href="plugin.php?plugin=showmaster&file=css/style.css&nopage=1" />

<div class="sm-wrap">
  <div class="sm-topbar">
    <div class="sm-brand">
      <div class="sm-logo"><img src="plugin.php?plugin=showmaster&file=images/ledshows.png&nopage=1" alt="LED-SHOWS" /></div>
      <div>
        <div class="sm-title">Showmaster Builder</div>
        <div class="sm-subtitle">Canvas 320×240 • Drag • Resize • Push to Showmaster</div>
      </div>
    </div>

    <div class="sm-actions">
      <button class="buttons btn-outline-light" id="smAddAction">+ Action</button>
      <button class="buttons btn-outline-light" id="smAddStatus">+ Status</button>
      <button class="buttons btn-success" id="smSave">Save</button>
      <button class="buttons btn-outline-light" id="smLoad">Load</button>
      <div class="sm-upload">
        <input class="sm-ip" id="smDeviceIp" placeholder="Showmaster IP (e.g. 192.168.1.50)" />
        <button class="buttons btn-primary" id="smUpload">Push to Showmaster</button>
      </div>
    </div>
  </div>

  <div class="sm-body">
    <div class="sm-canvasShell">
      <div class="sm-canvasTitle">
        Device Preview (exact size)
        <div class="sm-canvasTools">
          <span class="sm-toolLabel">Background</span>
          <input id="smCanvasBg" type="color" value="#0b1020" title="Canvas background" />
          <label class="sm-check"><input id="smGridToggle" type="checkbox" checked /> Snap</label>
          <span class="sm-toolLabel sm-ml">Zoom</span>
          <input id="smZoom" class="sm-zoomSlider" type="range" min="100" max="300" step="25" value="200" />
          <span id="smZoomLabel" class="sm-zoomLabel">200%</span>
        </div>
      </div>
      <div id="smCanvas" class="sm-canvas" aria-label="Showmaster canvas">
        <div class="sm-grid"></div>
      </div>
      <div class="sm-hint">
        Tip: click a widget to edit • drag inside canvas • resize from corners • Del to remove
      </div>
    </div>

    <div class="sm-props">
      <div class="sm-propsHeader">
        <div class="sm-propsTitle">Properties</div>
        <button class="buttons btn-outline-light" id="smDelete" title="Delete selected">Delete</button>
      </div>

      <div id="smNoSelection" class="sm-empty">Select a widget on the canvas.</div>

      <div id="smPropsForm" class="sm-propsForm" style="display:none;">
        <div class="sm-field">
          <label>Type</label>
          <input id="smType" disabled />
        </div>

        <div class="sm-row2">
          <div class="sm-field">
            <label>X</label>
            <input id="smX" type="number" min="0" max="319" />
          </div>
          <div class="sm-field">
            <label>Y</label>
            <input id="smY" type="number" min="0" max="239" />
          </div>
        </div>

        <div class="sm-row2">
          <div class="sm-field">
            <label>W</label>
            <input id="smW" type="number" min="10" max="320" />
          </div>
          <div class="sm-field">
            <label>H</label>
            <input id="smH" type="number" min="10" max="240" />
          </div>
        </div>

        <div class="sm-divider"></div>


        <div class="sm-colorRow sm-colorRow3">
          <div class="sm-field">
            <label>Bg</label>
            <input id="smBg" type="color" />
          </div>
          <div class="sm-field">
            <label>Text</label>
            <input id="smFg" type="color" />
          </div>
          <div class="sm-field">
            <label>Border</label>
            <input id="smBorder" type="color" />
          </div>
        </div>

        <div class="sm-row2">
          <div class="sm-field">
            <label>Text size</label>
            <input id="smFontSize" type="number" min="8" max="32" step="1" />
          </div>
          <div class="sm-field">
            <label>Border size</label>
            <input id="smBorderSize" type="number" min="0" max="10" step="1" />
          </div>
        </div>
        <div class="sm-field">
          <label>Corner radius</label>
          <input id="smRadius" type="number" min="0" max="30" step="1" />
        </div>


	<div id="smActionFields">
          <div class="sm-field">
            <label>Label</label>
            <input id="smLabel" maxlength="40" />
          </div>
                  <div class="sm-field">
            <label>Command</label>
            <div class="sm-iconRow">
              <input id="smCommandDisplay" placeholder="Choose a command..." readonly />
              <button class="buttons btn-outline-light" id="smPickCommand" type="button">Choose…</button>
            </div>
          </div>

          <input type="hidden" id="smCommand" />
          <input type="hidden" id="smCommandArgsJson" />

          <div class="sm-row3">
            <div class="sm-field">
              <label>Icon</label>
              <div class="sm-iconRow">
                <input id="smIconValue" placeholder="(none)" readonly />
                <button class="buttons btn-outline-light" id="smPickIcon" type="button">Select…</button>
                <button class="buttons btn-outline-light" id="smClearIcon" type="button">Clear</button>
              </div>
            </div>
            <div class="sm-field">
              <label>Icon size</label>
              <input id="smIconSize" type="number" min="8" max="64" step="1" />
            </div>
          </div>


</div>

        <div id="smStatusFields">
          <div class="sm-field">
            <label>Source</label>
            <select id="smSource"></select>
          </div>
        </div>

        <div class="sm-field">
          <label>Widget ID</label>
          <input id="smId" disabled />
        </div>
      </div>

      <div class="sm-footerNote">
        Config is saved to <code>/home/fpp/media/config/plugin.showmaster.json</code>
      </div>
    </div>
  </div>

  <div id="smToast" class="sm-toast" style="display:none;"></div>
</div>

<script src="plugin.php?plugin=showmaster&file=js/fa-icons.js&nopage=1"></script>
<script src="plugin.php?plugin=showmaster&file=js/builder.js&nopage=1"></script>


<!-- Icon Picker Modal -->
<div class="modal fade" id="smIconModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-xl" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Select an Icon</h4>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="sm-modalTools">
          <input id="smIconFind" class="form-control" placeholder="Search icons..." />
        </div>
        <div id="smIconGrid" class="smIconGrid"></div>
      </div>
    </div>
  </div>
</div>

<!-- Command Picker Modal -->
<div class="modal fade" id="smCmdModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Command for Button</h4>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="bb_commandTableWrap">
          <div class="bb_commandTableCrop">
            <table border="0" class="tableButton">
              <tbody>
                <tr>
                  <td>Command:</td>
                  <td>
                    <select id="smCmdSelect" class="form-control"></select>
                  </td>
                </tr>
                <tr>
                  <td></td>
                  <td id="smCmdDesc" class="text-muted" style="font-size:12px;"></td>
                </tr>
                <tr id="smCmdFlagsRow">
                  <td>Multisync:</td>
                  <td>
                    <label style="margin-right:12px;"><input type="checkbox" id="smCmdMultisync" /> Multisync</label>
                    <label style="margin-right:12px;"><input type="checkbox" id="smCmdRepeat" /> Repeat</label>
                    <label><input type="checkbox" id="smCmdIfNotRunning" /> If Not Running</label>
                  </td>
                </tr>
                <tr id="smCmdPlaylistRow">
                  <td>Playlist:</td>
                  <td>
                    <select id="smCmdPlaylist" class="form-control"></select>
                  </td>
                </tr>
                <tr id="smCmdArgRow">
                  <td>Arg:</td>
                  <td>
                    <input id="smCmdArg" class="form-control" placeholder="Optional argument" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="smCmdDone" type="button" class="buttons btn-success">Done</button>
      </div>
    </div>
  </div>
</div>
