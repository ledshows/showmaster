<?php
// Showmaster Builder API endpoint.
// IMPORTANT: This file is executed via FPP's plugin page loader:
//   plugin.php?plugin=showmaster&page=pages/api.php&cmd=scan|push
// We cannot use plugin.php?file=... for PHP because FPP serves file= targets
// as plain text (PHP is not executed).

error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

function curl_request_simple($url, $method = 'GET', $postfields = null, $headers = array(), $timeout = 5) {
  if (!function_exists('curl_init')) {
    return array('ok' => false, 'http' => 0, 'body' => '', 'err' => 'curl not available');
  }
  $ch = curl_init($url);
  if ($ch === false) return array('ok' => false, 'http' => 0, 'body' => '', 'err' => 'curl_init failed');
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
  curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
  if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, 1);
    if ($postfields !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields);
  }
  if ($headers && is_array($headers)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  $resp = curl_exec($ch);
  $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($resp === false) return array('ok' => false, 'http' => $http, 'body' => '', 'err' => $err);
  return array('ok' => true, 'http' => $http, 'body' => $resp, 'err' => '');
}

function parse_seconds_any($v) {
  if ($v === null) return 0;
  if (is_int($v) || is_float($v)) {
    $n = (float)$v;
    if ($n > 1000*60) $n = $n/1000.0; // ms -> s
    if ($n < 0) $n = 0;
    return (int)floor($n);
  }
  $s = trim((string)$v);
  if ($s === '') return 0;
  // HH:MM:SS or MM:SS
  if (preg_match('/^(\d+):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
    if (isset($m[3]) && $m[3] !== '') return ((int)$m[1])*3600 + ((int)$m[2])*60 + ((int)$m[3]);
    return ((int)$m[1])*60 + ((int)$m[2]);
  }
  if (preg_match('/(\d+(?:\.\d+)?)\s*s/i', $s, $m)) {
    return (int)floor((float)$m[1]);
  }
  if (is_numeric($s)) return (int)floor((float)$s);
  return 0;
}



$cmd = isset($_GET['cmd']) ? strtolower(trim($_GET['cmd'])) : '';

if ($cmd === 'scan') {
  // Inline scan implementation (copied from api/scan.php)
  $debug = array();
  function dbg_add($s){ global $debug; $debug[] = $s; }
  function json_out($arr) { global $debug; if (!isset($arr['debug'])) $arr['debug'] = $debug; echo json_encode($arr); exit; }
  function uniq_hosts($hosts) { $seen = array(); $out = array(); foreach ($hosts as $h) { $k = isset($h['host']) ? $h['host'] : ''; if ($k === '' || isset($seen[$k])) continue; $seen[$k] = true; $out[] = $h; } return $out; }

  function http_ping_showmaster($ip, $timeoutSec) {
    $errno = 0; $errstr = '';
    $fp = @fsockopen($ip, 80, $errno, $errstr, $timeoutSec);
    if (!$fp) return false;
    stream_set_timeout($fp, (int)$timeoutSec, (int)(($timeoutSec - (int)$timeoutSec) * 1000000));
    $req = "GET /showmaster/ping HTTP/1.0\r\nHost: $ip\r\nConnection: close\r\n\r\n";
    @fwrite($fp, $req);
    $data = '';
    while (!feof($fp) && strlen($data) < 128) {
      $chunk = @fread($fp, 128);
      if ($chunk === false || $chunk === '') break;
      $data .= $chunk;
    }
    @fclose($fp);
    return (strpos($data, 'pong') !== false);
  }

  function read_arp_candidates() {
    $ips = array();
    $arp = @file_get_contents('/proc/net/arp');
    if ($arp) {
      $lines = preg_split('/\r?\n/', trim($arp));
      for ($i=1; $i<count($lines); $i++) {
        $parts = preg_split('/\s+/', trim($lines[$i]));
        if (count($parts) >= 4) {
          $ip = $parts[0];
          $flags = $parts[2];
          $mac = $parts[3];
          if ($ip && $mac && $mac !== '00:00:00:00:00:00' && $flags !== '0x0') {
            $ips[] = $ip;
          }
        }
      }
    }

    $neigh = @shell_exec('ip -4 neigh 2>/dev/null');
    if ($neigh) {
      $lines = preg_split('/\r?\n/', trim($neigh));
      foreach ($lines as $ln) {
        if (!$ln) continue;
        $p = preg_split('/\s+/', trim($ln));
        if (count($p) >= 1 && filter_var($p[0], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
          $ips[] = $p[0];
        }
      }
    }

    return array_values(array_unique($ips));
  }

  function add_subnet(&$subnets, $ip) {
    if (!is_string($ip) || $ip === '') return;
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return;
    $p = explode('.', $ip);
    if (count($p) !== 4) return;
    $subnets[] = $p[0] . '.' . $p[1] . '.' . $p[2];
  }

  $candidates = read_arp_candidates();
  dbg_add('arp_candidates=' . count($candidates));

  $subnets = array();
  add_subnet($subnets, isset($_SERVER['SERVER_ADDR']) ? $_SERVER['SERVER_ADDR'] : '');
  add_subnet($subnets, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
  $subnets[] = '192.168.2';
  $subnets[] = '192.168.8';
  $subnets = array_values(array_unique($subnets));

  if (count($candidates) == 0) {
    foreach ($subnets as $sn) {
      for ($i=1; $i<=254; $i+=8) {
        $candidates[] = $sn . '.' . $i;
      }
    }
  }

  dbg_add('subnets=' . implode(',', $subnets));
  dbg_add('candidates_total=' . count($candidates));

  $found = array();
  $timeout = 0.12;
  $limit = 256;
  for ($i=0; $i<count($candidates) && $i<$limit; $i++) {
    $ip = $candidates[$i];
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) continue;
    if (http_ping_showmaster($ip, $timeout)) {
      $found[] = array('host' => $ip, 'id' => '', 'fw' => '');
    }
  }

  $found = uniq_hosts($found);
  if (count($found) > 0) {
    json_out(array('ok' => true, 'host' => $found[0]['host'], 'hosts' => $found));
  }
  json_out(array('ok' => false, 'error' => 'Not found', 'hosts' => array()));
}



if ($cmd === 'seek') {
  // Seek the currently playing sequence by delta seconds.
  // Implemented server-side (localhost) to avoid browser/session quirks.

  $delta = 10;
  if (isset($_GET['delta'])) $delta = (int)$_GET['delta'];
  if ($delta === 0) $delta = 10;

  $base = 'http://127.0.0.1';

  $st = curl_request_simple($base . '/api/fppd/status', 'GET', null, array(), 3);
  if (!$st['ok'] || $st['http'] < 200 || $st['http'] >= 300) {
    echo json_encode(array('ok' => false, 'error' => 'Could not read FPP status', 'detail' => $st));
    exit;
  }
  $js = json_decode($st['body'], true);
  if (!is_array($js)) {
    echo json_encode(array('ok' => false, 'error' => 'Bad status JSON'));
    exit;
  }

  $seq = '';
  if (isset($js['current_sequence'])) $seq = (string)$js['current_sequence'];
  if ($seq === '' && isset($js['current_playlist']) && isset($js['current_playlist']['current_sequence'])) {
    $seq = (string)$js['current_playlist']['current_sequence'];
  }

  // elapsed seconds
  $cur = 0;
  if (isset($js['seconds_elapsed'])) $cur = parse_seconds_any($js['seconds_elapsed']);
  else if (isset($js['elapsed'])) $cur = parse_seconds_any($js['elapsed']);
  else if (isset($js['time_elapsed'])) $cur = parse_seconds_any($js['time_elapsed']);
  else if (isset($js['status']) && isset($js['status']['seconds_elapsed'])) $cur = parse_seconds_any($js['status']['seconds_elapsed']);

  if ($seq === '') {
    echo json_encode(array('ok' => false, 'error' => 'No current_sequence in status', 'status' => $js));
    exit;
  }

  $target = $cur + $delta;
  if ($target < 0) $target = 0;

  // Stop Now
  $stop = curl_request_simple($base . '/api/command/' . rawurlencode('Stop Now'), 'POST', '[]', array('Content-Type: application/json'), 3);

  // Start at target second (REST)
  $start = curl_request_simple($base . '/api/sequence/' . rawurlencode($seq) . '/start/' . rawurlencode((string)$target), 'GET', null, array(), 5);

  // Fallback: legacy fppjson.php (some builds behave better)
  $legacy = curl_request_simple($base . '/fppjson.php?command=startSequence&sequence=' . rawurlencode($seq) . '&startSecond=' . rawurlencode((string)$target), 'GET', null, array(), 5);

  echo json_encode(array(
    'ok' => true,
    'sequence' => $seq,
    'from' => $cur,
    'to' => $target,
    'delta' => $delta,
    'stop' => $stop,
    'start' => $start,
    'legacy' => $legacy
  ));
  exit;
}

if ($cmd === 'push') {
  // Push proxy (copied from api/push.php)
  function respond($ok, $msg, $extra = array()) {
    $out = array_merge(array('ok' => (bool)$ok), $extra);
    if ($ok) $out['message'] = $msg; else $out['error'] = $msg;
    echo json_encode($out);
    exit;
  }

  function tail_text($txt, $maxChars) {
    $txt = (string)$txt;
    if (strlen($txt) <= $maxChars) return $txt;
    return substr($txt, -$maxChars);
  }

  function curl_request($url, $method = 'GET', $postfields = null, $headers = array(), $timeout = 30) {
    if (!function_exists('curl_init')) {
      return array('ok' => false, 'http' => 0, 'body' => '', 'err' => 'curl not available on this FPP image');
    }
    $ch = curl_init($url);
    if ($ch === false) return array('ok' => false, 'http' => 0, 'body' => '', 'err' => 'curl_init failed');

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);

    if ($method === 'POST') {
      curl_setopt($ch, CURLOPT_POST, 1);
      if ($postfields !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields);
    }
    if ($headers && is_array($headers)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($resp === false) return array('ok' => false, 'http' => $http, 'body' => '', 'err' => $err);
    return array('ok' => true, 'http' => $http, 'body' => $resp, 'err' => '');
  }

  $body = file_get_contents('php://input');
  if ($body === false || $body === '') { http_response_code(400); respond(false, 'Missing request body'); }
  $req = json_decode($body, true);
  if ($req === null) respond(false, 'Invalid JSON');

  $host = '';
  if (isset($req['host'])) $host = trim((string)$req['host']);
  else if (isset($req['ip'])) $host = trim((string)$req['ip']);
  $config = null;
  if (isset($req['config'])) $config = $req['config'];
  else if (isset($req['json'])) $config = $req['json'];

  $target = 'remote';
  if (isset($req['target'])) { $target = strtolower(trim((string)$req['target'])); }
  if ($target !== 'web' && $target !== 'remote') $target = 'remote';

  if ($host === '' || $config === null) respond(false, 'host and config are required');
  if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $host)) respond(false, 'Invalid device address');

  $payload = json_encode($config, JSON_UNESCAPED_SLASHES);
  if ($payload === false) respond(false, 'Config could not be encoded');

  $tmp = tempnam(sys_get_temp_dir(), 'showmaster_');
  if ($tmp === false) respond(false, 'Failed to create temp file');
  file_put_contents($tmp, $payload);

  // Let the Showmaster decide between Remote UI / Web UI. Query string is ignored by older firmwares.
  $qs = '?target=' . $target;
  $cfgUrl = 'http://' . $host . '/showmaster/config' . $qs;
  $reloadUrl = 'http://' . $host . '/showmaster/reload' . $qs;
  $pingUrl = 'http://' . $host . '/showmaster/ping' . $qs;
  $pingUrlLegacy = 'http://' . $host . '/ping';
  $logUrl = 'http://' . $host . '/showmaster/log' . $qs;

  $file = new CURLFile($tmp, 'application/json', 'showmaster.json');
  $post = array('file' => $file);

  $push = curl_request($cfgUrl, 'POST', $post, array(), 30);
  @unlink($tmp);
  if (!$push['ok']) respond(false, 'Push failed: ' . $push['err']);
  if ($push['http'] < 200 || $push['http'] >= 300) respond(false, 'Device returned HTTP ' . $push['http'], array('deviceResponse' => $push['body']));

  $reload = curl_request($reloadUrl, 'POST', '', array(), 10);
  $reloadOk = ($reload['ok'] && $reload['http'] >= 200 && $reload['http'] < 300);

  $pingOk = false;
  $ping = curl_request($pingUrl, 'GET', null, array(), 5);
  if ($ping['ok'] && $ping['http'] >= 200 && $ping['http'] < 300) {
    $pingOk = (trim($ping['body']) === 'pong');
  } else {
    $ping2 = curl_request($pingUrlLegacy, 'GET', null, array(), 5);
    if ($ping2['ok'] && $ping2['http'] >= 200 && $ping2['http'] < 300) $pingOk = (trim($ping2['body']) === 'pong');
  }

  $configOk = false;
  $cfg = curl_request($cfgUrl, 'GET', null, array(), 10);
  if ($cfg['ok'] && $cfg['http'] >= 200 && $cfg['http'] < 300) {
    $txt = $cfg['body'];
    if (strpos($txt, '"pages"') !== false || strpos($txt, '"Pages"') !== false) $configOk = true;
  }

  $msg = 'Pushed. Reload ' . ($reloadOk ? 'OK' : 'FAIL') . ' | Ping ' . ($pingOk ? 'OK' : 'FAIL') . ' | Config ' . ($configOk ? 'OK' : 'FAIL');

  $deviceLog = '';
  $log = curl_request($logUrl, 'GET', null, array(), 5);
  if ($log['ok'] && $log['http'] >= 200 && $log['http'] < 300) $deviceLog = tail_text($log['body'], 4000);

  respond(true, $msg, array(
    'deviceResponse' => $push['body'],
    'reloadOk' => $reloadOk,
    'pingOk' => $pingOk,
    'configOk' => $configOk,
    'deviceLog' => $deviceLog
  ));
}

// Unknown command
echo json_encode(array('ok' => false, 'error' => 'Unknown cmd'));
exit;
