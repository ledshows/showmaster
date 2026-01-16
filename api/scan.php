<?php
error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

function json_out($arr) {
  echo json_encode($arr);
  exit;
}

function uniq_hosts($hosts) {
  $seen = array();
  $out = array();
  foreach ($hosts as $h) {
    $k = isset($h['host']) ? $h['host'] : '';
    if ($k === '' || isset($seen[$k])) continue;
    $seen[$k] = true;
    $out[] = $h;
  }
  return $out;
}

function add_subnet(&$subnets, $ip) {
  if (!is_string($ip) || $ip === '') return;
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return;
  $p = explode('.', $ip);
  if (count($p) !== 4) return;
  // Only scan private ranges
  $a = intval($p[0]);
  $b = intval($p[1]);
  $isPrivate = ($a === 10) || ($a === 192 && $b === 168) || ($a === 172 && $b >= 16 && $b <= 31);
  if (!$isPrivate) return;
  $subnets[] = $p[0] . '.' . $p[1] . '.' . $p[2];
}

$subnets = array();
add_subnet($subnets, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
add_subnet($subnets, isset($_SERVER['SERVER_ADDR']) ? $_SERVER['SERVER_ADDR'] : '');

// Common fallbacks (your show networks)
$subnets[] = '192.168.2';
$subnets[] = '192.168.8';

$subnets = array_values(array_unique($subnets));

$found = array();

if (!function_exists('curl_multi_init')) {
  json_out(array('ok' => false, 'error' => 'curl_multi not available', 'hosts' => array()));
}

$connectTimeoutMs = 120;
$timeoutMs = 250;
$batch = 48;

foreach ($subnets as $sn) {
  for ($start = 1; $start <= 254; $start += $batch) {
    $mh = curl_multi_init();
    $chs = array();

    $end = min(254, $start + $batch - 1);
    for ($i = $start; $i <= $end; $i++) {
      $ip = $sn . '.' . $i;
      $ch = curl_init('http://' . $ip . '/showmaster/ping');
      curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
      curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, $connectTimeoutMs);
      curl_setopt($ch, CURLOPT_TIMEOUT_MS, $timeoutMs);
      curl_setopt($ch, CURLOPT_NOSIGNAL, 1);
      curl_multi_add_handle($mh, $ch);
      $chs[$ip] = $ch;
    }

    $running = null;
    do {
      $mrc = curl_multi_exec($mh, $running);
      if ($running) curl_multi_select($mh, 0.05);
    } while ($running && $mrc == CURLM_OK);

    foreach ($chs as $ip => $ch) {
      $body = curl_multi_getcontent($ch);
      $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      if ($http >= 200 && $http < 300 && trim($body) === 'pong') {
        $found[] = array('host' => $ip, 'id' => '', 'fw' => '');
      }
      curl_multi_remove_handle($mh, $ch);
      curl_close($ch);
    }

    curl_multi_close($mh);
  }
}

$found = uniq_hosts($found);

if (count($found) > 0) {
  json_out(array('ok' => true, 'host' => $found[0]['host'], 'hosts' => $found));
}

json_out(array('ok' => false, 'error' => 'Not found', 'hosts' => array()));
