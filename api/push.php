<?php
// Push Showmaster config JSON to a Showmaster device.
// This file is called by builder.js via standard form POST:
//   host=<ip-or-hostname>&json=<raw-json-string>
//
// Firmware expects multipart upload:
//   POST http://<device>/showmaster/config   (form field name: file)
// and then:
//   POST http://<device>/showmaster/reload

header('Content-Type: application/json');

function respond($ok, $msg, $extra = array()) {
  $out = array_merge(array('ok' => $ok), $extra);
  if ($ok) $out['message'] = $msg;
  else $out['error'] = $msg;
  echo json_encode($out);
  exit;
}

function http_get_text($url, $connectTimeoutSec, $timeoutSec) {
  $ch = curl_init($url);
  if (!$ch) return array(false, 0, 'curl_init_failed');
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeoutSec);
  curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSec);
  $body = curl_exec($ch);
  $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($body === false) return array(false, 0, $err);
  return array(true, $http, $body);
}

function is_pong($body) {
  $t = trim((string)$body);
  return ($t === 'pong');
}

// Accept both x-www-form-urlencoded and JSON body
$host = '';
$jsonText = '';

if (isset($_POST['host'])) {
  $host = trim($_POST['host']);
  $jsonText = isset($_POST['json']) ? (string)$_POST['json'] : '';
} else {
  $raw = file_get_contents('php://input');
  if ($raw) {
    $req = json_decode($raw, true);
    if (is_array($req)) {
      $host = isset($req['host']) ? trim($req['host']) : (isset($req['ip']) ? trim($req['ip']) : '');
      if (isset($req['json'])) $jsonText = (string)$req['json'];
      else if (isset($req['config'])) $jsonText = json_encode($req['config']);
    }
  }
}

if ($host === '' || $jsonText === '') {
  http_response_code(400);
  respond(false, 'host and json are required');
}

// Allow IP or hostname (basic safety)
if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $host)) {
  http_response_code(400);
  respond(false, 'Invalid device address');
}

// Validate JSON early (better error than device)
$tmpObj = json_decode($jsonText, true);
if ($tmpObj === null) {
  http_response_code(400);
  respond(false, 'Invalid JSON');
}

$tmp = tempnam(sys_get_temp_dir(), 'showmaster_');
if ($tmp === false) {
  http_response_code(500);
  respond(false, 'Failed to create temp file');
}
file_put_contents($tmp, $jsonText);

$url = 'http://' . $host . '/showmaster/config';

$ch = curl_init($url);
if ($ch === false) {
  @unlink($tmp);
  http_response_code(500);
  respond(false, 'Failed to init curl');
}

$post = array(
  'file' => new CURLFile($tmp, 'application/json', 'showmaster.json')
);

curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$resp = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

@unlink($tmp);

if ($resp === false) {
  http_response_code(502);
  respond(false, 'Push failed: ' . $err);
}

if ($http < 200 || $http >= 300) {
  http_response_code(502);
  respond(false, 'Device returned HTTP ' . $http, array('deviceResponse' => $resp));
}

// Reload UI (best-effort)
$reloadUrl = 'http://' . $host . '/showmaster/reload';
$reloadOk = false;
$reloadHttp = 0;
$reloadResp = '';
$ch2 = curl_init($reloadUrl);
if ($ch2) {
  curl_setopt($ch2, CURLOPT_POST, 1);
  curl_setopt($ch2, CURLOPT_POSTFIELDS, '');
  curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch2, CURLOPT_CONNECTTIMEOUT, 2);
  curl_setopt($ch2, CURLOPT_TIMEOUT, 5);
  $reloadResp = curl_exec($ch2);
  $reloadHttp = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
  curl_close($ch2);
  if ($reloadHttp >= 200 && $reloadHttp < 300) $reloadOk = true;
}

// Post-push verification (server-side, avoids browser CORS)
// 1) ping endpoint must answer 'pong'
// 2) config endpoint must return valid JSON
$pingOk = false;
$pingHttp = 0;
$pingBody = '';
list($ok1, $http1, $body1) = http_get_text('http://' . $host . '/showmaster/ping', 2, 3);
if ($ok1 && $http1 >= 200 && $http1 < 300 && is_pong($body1)) {
  $pingOk = true; $pingHttp = $http1; $pingBody = $body1;
} else {
  // legacy fallback
  list($ok1b, $http1b, $body1b) = http_get_text('http://' . $host . '/ping', 2, 3);
  if ($ok1b && $http1b >= 200 && $http1b < 300 && is_pong($body1b)) {
    $pingOk = true; $pingHttp = $http1b; $pingBody = $body1b;
  } else {
    $pingHttp = $http1; $pingBody = $body1;
  }
}

$configOk = false;
$configHttp = 0;
$configErr = '';
list($ok2, $http2, $body2) = http_get_text('http://' . $host . '/showmaster/config', 2, 6);
if ($ok2 && $http2 >= 200 && $http2 < 300) {
  $cfg = json_decode((string)$body2, true);
  if (is_array($cfg) && isset($cfg['pages'])) {
    $configOk = true;
    $configHttp = $http2;
  } else {
    $configHttp = $http2;
    $configErr = 'invalid_json';
  }
} else {
  $configHttp = $http2;
  $configErr = $ok2 ? 'http_' . $http2 : (string)$body2;
}

$msg = $reloadOk ? ('Pushed + reloaded ' . $host) : ('Pushed ' . $host);
respond(true, $msg, array(
  'deviceResponse' => $resp,
  'reloadOk' => $reloadOk,
  'reloadHttp' => $reloadHttp,
  'reloadResponse' => $reloadResp,
  'pingOk' => $pingOk,
  'pingHttp' => $pingHttp,
  'configOk' => $configOk,
  'configHttp' => $configHttp,
  'configErr' => $configErr
));
