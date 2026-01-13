<?php
// Push Showmaster config JSON to Showmaster device
// Expects JSON body: {"ip":"192.168.1.50", "config":{...}}

header('Content-Type: application/json');

function respond($ok, $msg, $extra = array()) {
    $out = array_merge(array('ok' => $ok, 'msg' => $msg), $extra);
    echo json_encode($out);
    exit;
}

$body = file_get_contents('php://input');
if ($body === false || $body === '') {
    respond(false, 'Missing request body');
}

$req = json_decode($body, true);
if ($req === null) {
    respond(false, 'Invalid JSON');
}

$ip = isset($req['ip']) ? trim($req['ip']) : '';
$config = isset($req['config']) ? $req['config'] : null;

if ($ip === '' || $config === null) {
    respond(false, 'ip and config are required');
}

// Allow IP or hostname (basic safety: only alnum, dot, dash, colon for IPv6)
if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $ip)) {
    respond(false, 'Invalid device address');
}

$url = 'http://' . $ip . '/showmaster/config';

$payload = json_encode($config);
if ($payload === false) {
    respond(false, 'Config could not be encoded');
}

$ch = curl_init($url);
if ($ch === false) {
    respond(false, 'Failed to init curl');
}

curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$resp = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    respond(false, 'Push failed: ' . $err);
}

if ($http < 200 || $http >= 300) {
    respond(false, 'Device returned HTTP ' . $http, array('deviceResponse' => $resp));
}

respond(true, 'Pushed to ' . $url, array('deviceResponse' => $resp));
