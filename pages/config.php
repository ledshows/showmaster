<?php
// Showmaster Builder main page
?>
<link rel="stylesheet" href="plugin.php?plugin=showmaster&file=css/style.css&nopage=1" />

<div class="sm-wrap">
  <div class="sm-topbar">
    <div class="sm-brand">
      <div class="sm-logo"><img src="plugin.php?plugin=showmaster&file=images/showmaster.png&nopage=1" alt="Showmaster" /></div>
      <div class="sm-subtitle"></div>
    </div>

    <!-- Notice sits between logo and Save -->
    <div class="sm-toastInline" aria-live="polite">
      <div id="smToast" class="sm-toast sm-toastInline" style="display:none;"></div>
    </div>

    <div class="sm-actions">
      <button class="buttons btn-success" id="smSave">Save</button>
      <button class="buttons btn-outline-light" id="smLoad">Load JSON</button>
      <button class="buttons btn-outline-light" id="smDownload" type="button">Download JSON</button>

      <div class="sm-upload">
        <div class="sm-uploadRow">
          <input class="sm-ip" id="smDeviceIp" placeholder="Showmaster IP (e.g. 192.168.1.50)" list="smScannedIps" />
          <datalist id="smScannedIps"></datalist>
          <button class="buttons btn-outline-light" id="smScan" type="button" title="Scan network for Showmaster">Scan</button>
          <button class="buttons btn-primary" id="smUpload" type="button">Push to Showmaster</button>
        </div>
      </div>

      <!-- hidden file input used by the Load button -->
      <input id="smLoadFile" type="file" accept="application/json,.json" style="display:none;" />
    </div>
  </div>

  <div class="sm-body sm-body3">
    <!-- LEFT: CANVAS SETTINGS -->
    <div class="sm-panel sm-canvasSettings">
      <div class="sm-panelTitle">CANVAS SETTINGS</div>

      <div class="sm-field">
        <label>Rotate</label>
        <div class="sm-rotSeg" id="smRotSeg">
          <button type="button" data-rot="0">0°</button>
          <button type="button" data-rot="90">90°</button>
          <button type="button" data-rot="180">180°</button>
          <button type="button" data-rot="270">270°</button>
        </div>
      </div>

      <div class="sm-field">
        <label>Background</label>
        <input id="smCanvasBg" type="color" value="#0b1020" title="Canvas background" />
      </div>

      <div class="sm-field">
        <label>Snap</label>
        <label class="sm-check sm-checkBig"><input id="smGridToggle" type="checkbox" checked /><span class="sm-checkText">Enable snap</span></label>
      </div>

      <div class="sm-field">
        <label>Zoom</label>
        <div class="sm-zoomRow">
          <input id="smZoom" class="sm-zoomSlider" type="range" min="100" max="250" step="25" value="200" />
          <span id="smZoomLabel" class="sm-zoomLabel">200%</span>
        </div>
      </div>

      <div class="sm-field">
        <label>Page height</label>
        <input id="smPageHeight" type="number" min="240" step="10" value="240" />
      </div>

      <div class="sm-field">
        <label>Screen timeout (s)</label>
        <input id="smScreenTimeout" type="number" min="0" step="1" value="60" />
      </div>

      <div class="sm-field">
        <label>Brightness</label>
        <div class="sm-zoomRow">
          <input id="smBrightness" class="sm-zoomSlider" type="range" min="0" max="100" step="1" value="100" />
          <span id="smBrightnessLabel" class="sm-zoomLabel">100%</span>
        </div>
      </div>
    </div>

    <!-- CENTER: CANVAS -->
    <div class="sm-canvasShell">
      <div class="sm-panelTitle sm-panelTitleCenter">CANVAS</div>

      <div class="sm-pagesBar">
        <div id="smPageTabs" class="sm-pageTabs"></div>
        <button id="smAddPage" class="btn btn-outline-light btn-sm sm-addPage" type="button" title="Add page">+</button>
      </div>

      <div id="smCanvasViewport" class="sm-canvasViewport">
        <div id="smCanvas" class="sm-canvas" aria-label="Showmaster canvas">
          <div class="sm-grid"></div>
        </div>
      </div>
    </div>

    <!-- RIGHT: BUTTON SETTINGS -->
    <div class="sm-props">
      <div class="sm-panelTitle">BUTTON SETTINGS</div>

      <div class="sm-propsHeader">
        <div class="sm-propsRow sm-propsRowAdd">
          <button class="buttons btn-outline-light sm-addBtn" id="smAddAction" title="Add action button to canvas"><span class="smPlus">+</span><span class="smBtnText">Action</span></button>
          <button class="buttons btn-outline-light sm-addBtn" id="smAddSeek10" title="Add a +10s seek button to canvas"><span class="smPlus">+</span><span class="smBtnText">10s</span></button>
          <button class="buttons btn-outline-light sm-addBtn" id="smAddStatus" title="Add status button to canvas"><span class="smPlus">+</span><span class="smBtnText">Status</span></button>
          <button class="buttons btn-outline-light sm-addBtn" id="smAddTab" title="Add tab button to canvas"><span class="smPlus">+</span><span class="smBtnText">Tab</span></button>
        </div>
        <div class="sm-propsRow sm-propsRowOps">
          <button class="buttons btn-outline-light" id="smCopy" title="Duplicate selected">Copy</button>
          <button class="buttons btn-outline-light" id="smCopyToPage" title="Copy selected to another page">Copy to page</button>
          <button class="buttons btn-outline-light" id="smDelete" title="Delete selected">Delete</button>
        </div>
      </div>

      <div id="smNoSelection" class="sm-empty">Select a widget on the canvas.</div>

      <div id="smPropsForm" class="sm-propsForm" style="display:none;">
        <div class="sm-field">
          <label>Button type</label>
          <input id="smType" disabled />
        </div>

        <div class="sm-field" id="smLabelField">
          <label>Label</label>
          <input id="smLabel" maxlength="40" />
        </div>

        <!-- Command settings directly under label -->
        <div id="smActionFields">
          <div class="sm-field">
            <label>Command</label>
            <div class="sm-commandStack">
              <input id="smCommandDisplay" placeholder="Choose a command..." readonly />
              <button class="buttons btn-outline-light" id="smPickCommand" type="button">Choose…</button>
            </div>
          </div>

          <div class="sm-field sm-tabOnly" style="display:none">
            <label>Target Page</label>
            <select id="smTargetPage"></select>
          </div>

          <input type="hidden" id="smCommand" />
          <input type="hidden" id="smCommandArgsJson" />

          <div class="sm-field">
            <label>Icon</label>
            <input id="smIconValue" placeholder="(none)" readonly />
          </div>

          <div class="sm-field">
            <label>Select icon</label>
            <button class="buttons btn-outline-light sm-fullBtn" id="smPickIcon" type="button">Select icon</button>
          </div>

          <div class="sm-field">
            <label>Icon size</label>
            <input id="smIconSize" type="number" min="8" max="64" step="1" />
          </div>

          <button class="buttons btn-outline-light sm-fullBtn" id="smClearIcon" type="button">Clear</button>
        </div>

        <div id="smStatusFields">
          <div class="sm-field">
            <label>Source</label>
            <select id="smSource"></select>
          </div>
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
            <label>Text/Icon</label>
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
      </div>

      <!-- Debug toggle moved to bottom-right of the properties panel -->
      <div class="sm-propsDebugBottom">
        <label class="sm-check sm-checkSmall" title="Show debug log under the page">
          <span class="sm-checkText">Debug</span>
          <input id="smDebugToggle" type="checkbox" />
        </label>
      </div>
    </div>
  </div>

  <textarea id="smDebugLog" class="sm-debugLog" style="display:none;" spellcheck="false" readonly></textarea>
</div>

<!-- Hidden FPP Command Editor Host (BigButtons-style) -->
<div id="smFppCmdWrap" style="display:none;">
  <div class="bb_commandTableWrap">
    <div class="bb_commandTableCrop">
      <table border="0" id="tableSmCmd" class="tableButton">
        <tr>
          <td>Command:</td>
          <td>
            <select id="smFppCmdSelect" class="form-control"><option value="" disabled selected>Select a Command</option></select>
          </td>
        </tr>
      </table>
    </div>
  </div>
</div>

<script src="plugin.php?plugin=showmaster&file=js/fa-icons.js&nopage=1"></script>
<script src="plugin.php?plugin=showmaster&file=js/builder.js&nopage=1"></script>


<!-- Icon Picker Modal -->
<div class="modal fade" id="smIconModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Select an Icon</h4>
        <button type="button" class="smModalClose" data-dismiss="modal" data-bs-dismiss="modal" aria-label="Close">&times;</button>
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
        <button type="button" class="smModalClose" data-dismiss="modal" data-bs-dismiss="modal" aria-label="Close">&times;</button>
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

<!-- Copy to Page Modal -->
<div class="modal fade" id="smCopyPageModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">Copy widget to page</h4>
        <button type="button" class="smModalClose" data-dismiss="modal" data-bs-dismiss="modal" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="sm-field">
          <label>Target page</label>
          <select id="smCopyPageSelect" class="form-control"></select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button class="buttons btn-outline-light" type="button" data-dismiss="modal" data-bs-dismiss="modal">Cancel</button>
          <button class="buttons btn-primary" id="smCopyPageDo" type="button">Copy</button>
        </div>
      </div>
    </div>
  </div>
</div>
