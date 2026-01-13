<?php
// Showmaster menu entry (guard against double include)
if (!empty($GLOBALS['__showmaster_menu_added'])) { return; }
$GLOBALS['__showmaster_menu_added'] = true;

printf("<li><a href='plugin.php?plugin=%s&page=%s'>%s</a></li>\n",
    $plugin,
    'plugin.php',
    'Showmaster Builder'
);
?>