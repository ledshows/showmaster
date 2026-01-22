<?php
// Showmaster Remote menu entry under Status/Control
// Add a matching Font Awesome icon (same style as built-in FPP items)
// Use a gamepad icon as a clear "remote" symbol that exists in the free FA set.
printf("<li><a href='plugin.php?plugin=%s&page=%s'><i class='fas fa-gamepad fa-fw'></i> %s</a></li>\n",
    $plugin,
    'pages/remote.php',
    'Showmaster'
);
?>
