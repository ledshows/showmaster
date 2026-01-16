<?php
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

$port = 3232;
$msg = 'SHOWMASTER_DISCOVER';
$timeoutMs = 1200;
$found = array();

// --- Try UDP discovery via PHP sockets (fast) ---
if (function_exists('socket_create')) {
  $sock = @socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
  if ($sock !== false) {
    @socket_set_option($sock, SOL_SOCKET, SO_BROADCAST, 1);

    $sec = intdiv($timeoutMs, 1000);
    $usec = ($timeoutMs % 1000) * 1000;
    @socket_set_option($sock, SOL_SOCKET, SO_RCVTIMEO, array('sec' => $sec, 'usec' => $usec));

    $targets = array('255.255.255.255');
    $ips = trim(shell_exec('hostname -I 2>/dev/null'));
    if ($ips) {
      foreach (preg_split('/\s+/', $ips) as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
          $parts = explode('.', $ip);
          if (count($parts) === 4) {
            $targets[] = $parts[0] . '.' . $parts[1] . '.' . $parts[2] . '.255';
          }
        }
      }
    }
    $targets = array_values(array_unique($targets));

    foreach ($targets as $t) {
      @socket_sendto($sock, $msg, strlen($msg), 0, $t, $port);
    }

    $start = microtime(true);
    while ((microtime(true) - $start) < 1.2) {
      $buf = '';
      $from = '';
      $fromPort = 0;
      $bytes = @socket_recvfrom($sock, $buf, 256, 0, $from, $fromPort);
      if ($bytes === false || $bytes <= 0) break;
      $buf = trim($buf);
      if (strpos($buf, 'SHOWMASTER ') === 0) {
        $parts = preg_split('/\s+/', $buf);
        if (count($parts) >= 2) {
          $ip = $parts[1];
          if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $found[] = array(
              'host' => $ip,
              'id' => isset($parts[2]) ? $parts[2] : '',
              'fw' => isset($parts[3]) ? $parts[3] : ''
            );
          }
        }
      }
    }

    @socket_close($sock);
  }
}

$found = uniq_hosts($found);

// --- Fallback scan (works even when PHP sockets module is missing) ---
// We do a fast curl_multi sweep of each local /24 subnet for /showmaster/ping == pong.
if (count($found) === 0 && function_exists('curl_multi_init')) {
  $subnets = array();
  $ips = trim(shell_exec('hostname -I 2>/dev/null'));
  if ($ips) {
    foreach (preg_split('/\s+/', $ips) as $ip) {
      if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $parts = explode('.', $ip);
        if (count($parts) === 4) {
          $subnets[] = $parts[0] . '.' . $parts[1] . '.' . $parts[2];
        }
      }
    }
  }
  $subnets = array_values(array_unique($subnets));

  $connectTimeoutMs = 150;
  $timeoutMs2 = 250;
  $batch = 64; // concurrency

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
        curl_setopt($ch, CURLOPT_TIMEOUT_MS, $timeoutMs2);
        curl_setopt($ch, CURLOPT_NOSIGNAL, 1);
        curl_multi_add_handle($mh, $ch);
        $chs[$ip] = $ch;
      }

      $running = null;
      do {
        $mrc = curl_multi_exec($mh, $running);
        if ($running) {
          curl_multi_select($mh, 0.05);
        }
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

      // Stop early if we already found some devices on this subnet
      if (count($found) > 0) {
        // Keep scanning remaining subnets too (to build full list) - don't break here.
      }
    }
  }

  $found = uniq_hosts($found);
}

if (count($found) > 0) {
  json_out(array('ok' => true, 'host' => $found[0]['host'], 'hosts' => $found));
}

json_out(array('ok' => false, 'error' => 'Not found', 'hosts' => array()));
