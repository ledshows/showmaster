<?php
header('Content-Type: application/json');

function json_out($arr) {
  echo json_encode($arr);
  exit;
}

$port = 3232;
$msg = "SHOWMASTER_DISCOVER";
$timeoutMs = 1200;

$found = array();

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
      if ($bytes === false || $bytes <= 0) {
        break;
      }
      $buf = trim($buf);
      if (strpos($buf, 'SHOWMASTER ') === 0) {
        $parts = preg_split('/\s+/', $buf);
        if (count($parts) >= 2) {
          $ip = $parts[1];
          if (filter_var($ip, FILTER_VALIDATE_IP)) {
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

if (count($found) > 0) {
  json_out(array('ok' => true, 'host' => $found[0]['host'], 'hosts' => $found));
}

json_out(array('ok' => false, 'error' => 'Not found', 'hosts' => array()));
