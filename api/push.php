<?php
error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

function respond($ok, $msg, $extra = array()) {
    $out = array_merge(array('ok' => (bool)$ok), $extra);
    if ($ok) {
        $out['message'] = $msg;
    } else {
        $out['error'] = $msg;
    }
    echo json_encode($out);
    exit;
}

function curl_request($url, $method = 'GET', $postfields = null, $headers = array(), $timeout = 30) {
    $ch = curl_init($url);
    if ($ch === false) {
        return array('ok' => false, 'http' => 0, 'body' => '', 'err' => 'curl_init failed');
    }

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, 1);
        if ($postfields !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields);
        }
    }

    if ($headers && is_array($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($resp === false) {
        return array('ok' => false, 'http' => $http, 'body' => '', 'err' => $err);
    }
    return array('ok' => true, 'http' => $http, 'body' => $resp, 'err' => '');
}

$body = file_get_contents('php://input');
if ($body === false || $body === '') {
    http_response_code(400);
    respond(false, 'Missing request body');
}

$req = json_decode($body, true);
if ($req === null) {
    respond(false, 'Invalid JSON');
}

$host = '';
if (isset($req['host'])) $host = trim((string)$req['host']);
else if (isset($req['ip'])) $host = trim((string)$req['ip']);

$config = null;
if (isset($req['config'])) $config = $req['config'];
else if (isset($req['json'])) $config = $req['json'];

if ($host === '' || $config === null) {
    respond(false, 'host and config are required');
}

// Allow IP or hostname (basic safety)
if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $host)) {
    respond(false, 'Invalid device address');
}

$payload = json_encode($config, JSON_UNESCAPED_SLASHES);
if ($payload === false) {
    respond(false, 'Config could not be encoded');
}

// Write to a temp file so we can send multipart without holding 2 copies in memory.
$tmp = tempnam(sys_get_temp_dir(), 'showmaster_');
if ($tmp === false) {
    respond(false, 'Failed to create temp file');
}
file_put_contents($tmp, $payload);

$cfgUrl = 'http://' . $host . '/showmaster/config';
$reloadUrl = 'http://' . $host . '/showmaster/reload';
$pingUrl = 'http://' . $host . '/showmaster/ping';
$pingUrlLegacy = 'http://' . $host . '/ping';

$file = new CURLFile($tmp, 'application/json', 'showmaster.json');
$post = array('file' => $file);

$push = curl_request($cfgUrl, 'POST', $post, array(), 30);
@unlink($tmp);

if (!$push['ok']) {
    respond(false, 'Push failed: ' . $push['err']);
}
if ($push['http'] < 200 || $push['http'] >= 300) {
    respond(false, 'Device returned HTTP ' . $push['http'], array('deviceResponse' => $push['body']));
}

// Reload
$reload = curl_request($reloadUrl, 'POST', '', array(), 10);
$reloadOk = ($reload['ok'] && $reload['http'] >= 200 && $reload['http'] < 300);

// Ping check
$pingOk = false;
$ping = curl_request($pingUrl, 'GET', null, array(), 5);
if ($ping['ok'] && $ping['http'] >= 200 && $ping['http'] < 300) {
    $pingOk = (trim($ping['body']) === 'pong');
} else {
    $ping2 = curl_request($pingUrlLegacy, 'GET', null, array(), 5);
    if ($ping2['ok'] && $ping2['http'] >= 200 && $ping2['http'] < 300) {
        $pingOk = (trim($ping2['body']) === 'pong');
    }
}

// Config sanity check (do not parse fully - just check it looks like our JSON)
$configOk = false;
$cfg = curl_request($cfgUrl, 'GET', null, array(), 10);
if ($cfg['ok'] && $cfg['http'] >= 200 && $cfg['http'] < 300) {
    $txt = $cfg['body'];
    // lightweight checks
    if (strpos($txt, '"pages"') !== false || strpos($txt, '"Pages"') !== false) {
        $configOk = true;
    }
}

$msg = 'Pushed. Reload ' . ($reloadOk ? 'OK' : 'FAIL') . ' | Ping ' . ($pingOk ? 'OK' : 'FAIL') . ' | Config ' . ($configOk ? 'OK' : 'FAIL');
respond(true, $msg, array(
    'deviceResponse' => $push['body'],
    'reloadOk' => $reloadOk,
    'pingOk' => $pingOk,
    'configOk' => $configOk
));
