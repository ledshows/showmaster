<?php
// Showmaster menu entry (guard against double include)
if (!empty($GLOBALS['__showmaster_menu_added'])) { return; }
$GLOBALS['__showmaster_menu_added'] = true;

// Add a matching Font Awesome icon (same style as built-in FPP items)
printf("<li><a href='plugin.php?plugin=%s&page=%s'><i class='fas fa-edit fa-fw'></i> %s</a></li>\n",
    $plugin,
    'plugin.php',
    'Showmaster'
);
?>
