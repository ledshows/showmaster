<?php

$menuEntries = Array(
	Array(
		'text' => 'Showmaster Builder',
		'type' => 'content',
		'page' => 'plugin.php',
		'wrap' => 1
	)
);

foreach ($menuEntries as $entry)
{
	if ($entry['type'] != $menu)
		continue;

	$nopage = '';
	if (isset($entry['wrap']) && ($entry['wrap'] == 0))
		$nopage = '&nopage=1';

	printf("<li><a href='plugin.php?plugin=%s&page=%s%s'>%s</a></li>\n",
		$plugin, $entry['page'], $nopage, $entry['text']);
}
?>
