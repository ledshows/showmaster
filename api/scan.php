<?php
// Scan for Showmaster device on local network.
// Best-effort: try mDNS hostname first, then ARP cache.
header('Content-Type: application/json');

function tryHost($host) {
    $url = "http://{$host}/";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 1200);
    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 1800);
    curl_setopt($ch, CURLOPT_RANGE, '0-2048');
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($code >= 200 && $code < 400) {
        $b = strtolower($body ?: "");
        // Heuristic: match known strings (safe even if missing)
        if (strpos($b, 'showmaster') !== false || strpos($b, 'ledshows') !== false) {
            return true;
        }
        // If device doesn't expose identifiable HTML, still accept as candidate
        return true;
    }
    return false;
}

// 1) mDNS default
$mdns = 'showmaster.local';
if (tryHost($mdns)) {
    echo json_encode([ 'ok' => true, 'host' => $mdns ]);
    exit;
}

// 2) Check ARP cache (fast)
$arpFile = '/proc/net/arp';
$candidates = [];
if (is_readable($arpFile)) {
    $lines = file($arpFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $i => $line) {
        if ($i === 0) continue; // header
        $parts = preg_split('/\s+/', trim($line));
        if (count($parts) >= 4) {
            $ip = $parts[0];
            if (filter_var($ip, FILTER_VALIDATE_IP)) $candidates[] = $ip;
        }
    }
}


// If ARP cache is empty, try a small set of common IPs in our /24
if (count($candidates) === 0) {
    $myIp = trim(shell_exec("hostname -I 2>/dev/null"));
    if ($myIp) {
        $myIp = preg_split('/\s+/', $myIp)[0];
    }
    if (filter_var($myIp, FILTER_VALIDATE_IP)) {
        $parts = explode('.', $myIp);
        if (count($parts) === 4) {
            $prefix = $parts[0] . "." . $parts[1] . "." . $parts[2] . ".";
            $common = [1,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,200,210,220,230,240,250];
            foreach ($common as $o) $candidates[] = $prefix . $o;
        }
    }
}
// De-dupe, keep it short
$candidates = array_values(array_unique($candidates));
$candidates = array_slice($candidates, 0, 64);

foreach ($candidates as $ip) {
    if (tryHost($ip)) {
        echo json_encode([ 'ok' => true, 'host' => $ip ]);
        exit;
    }
}

echo json_encode([ 'ok' => false, 'error' => 'Not found' ]);
