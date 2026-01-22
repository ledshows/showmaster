<?php
// Showmaster Builder API endpoint.
// Executed via:
//   plugin.php?plugin=showmaster&page=pages/api.php&cmd=scan|push
//
// NOTE: do NOT use plugin.php?file=... for PHP endpoints.
// FPP serves file= targets as plain text (PHP won't execute).

error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

$cmd = isset($_GET['cmd']) ? strtolower(trim($_GET['cmd'])) : '';

if ($cmd === 'scan') {
  require __DIR__ . '/../api/scan.php';
  exit;
}

if ($cmd === 'push') {
  require __DIR__ . '/../api/push.php';
  exit;
}

echo json_encode(array('ok' => false, 'error' => 'Unknown cmd'));
