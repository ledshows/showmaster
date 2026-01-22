<?php
// Showmaster discovery for FPP plugin.
// Goal: return a list of devices without requiring PHP curl extensions.
// Strategy:
//  1) Prefer fast host candidates from ARP/neigh tables.
//  2) Optionally expand to a couple of common show subnets if we can detect them.

error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

// Optional: scan a specific /24 subnet, e.g. ?subnet=192.168.5
$subnet = isset($_GET['subnet']) ? trim($_GET['subnet']) : '';

function valid_subnet_192_168($sn){
  // Accept: 192.168.X (X 0-255)
  if (!is_string($sn) || $sn === '') return false;
  if (!preg_match('/^192\.168\.(\d{1,3})$/', $sn, $m)) return false;
  $x = intval($m[1]);
  if ($x < 0 || $x > 255) return false;
  return true;
}

$debug = array();
function dbg_add($s){
  global $debug;
  $debug[] = $s;
}

function json_out($arr) {
  global $debug;
  if (!isset($arr['debug'])) $arr['debug'] = $debug;
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

function http_ping_showmaster($ip, $timeoutSec) {
  $errno = 0; $errstr = '';
  $fp = @fsockopen($ip, 80, $errno, $errstr, $timeoutSec);
  if (!$fp) return false;
  stream_set_timeout($fp, (int)$timeoutSec, (int)(($timeoutSec - (int)$timeoutSec) * 1000000));
  $req = "GET /showmaster/ping HTTP/1.0\r\nHost: $ip\r\nConnection: close\r\n\r\n";
  @fwrite($fp, $req);
  $data = '';
  // Read a small chunk; we only need to see "pong".
  while (!feof($fp) && strlen($data) < 128) {
    $chunk = @fread($fp, 128);
    if ($chunk === false || $chunk === '') break;
    $data .= $chunk;
  }
  @fclose($fp);
  return (strpos($data, "pong") !== false);
}

// Fast-ish subnet scan without curl: async-connect to :80 in small batches and check /showmaster/ping.
function scan_subnet($sn){
  $hosts = array();
  $timeout = 0.18; // seconds total per batch
  $batch = 48;

  for ($start = 1; $start <= 254; $start += $batch) {
    $socks = array();
    $map = array();

    $end = min(254, $start + $batch - 1);
    for ($i = $start; $i <= $end; $i++) {
      $ip = $sn . '.' . $i;
      $errno = 0; $errstr = '';
      $ctx = stream_context_create();
      $sock = @stream_socket_client('tcp://' . $ip . ':80', $errno, $errstr, $timeout,
        STREAM_CLIENT_CONNECT | STREAM_CLIENT_ASYNC_CONNECT, $ctx);
      if ($sock) {
        stream_set_blocking($sock, false);
        $id = (int)$sock;
        $socks[] = $sock;
        $map[$id] = $ip;
      }
    }

    if (count($socks) === 0) continue;

    // Wait for connects
    $w = $socks; $r = null; $e = null;
    @stream_select($r, $w, $e, 0, (int)($timeout * 1000000));

    // For sockets that are writable, send ping and read a tiny response
    foreach ($w as $sock) {
      $ip = $map[(int)$sock];
      $req = "GET /showmaster/ping HTTP/1.0\r\nHost: $ip\r\nConnection: close\r\n\r\n";
      @fwrite($sock, $req);
    }

    // Read responses briefly
    $deadline = microtime(true) + $timeout;
    $buf = array();
    while (microtime(true) < $deadline && count($socks) > 0) {
      $r = $socks; $w2 = null; $e2 = null;
      $leftUs = (int)(max(0, ($deadline - microtime(true))) * 1000000);
      if ($leftUs <= 0) break;
      $n = @stream_select($r, $w2, $e2, 0, $leftUs);
      if ($n === false || $n === 0) break;
      foreach ($r as $sock) {
        $id = (int)$sock;
        if (!isset($buf[$id])) $buf[$id] = '';
        $chunk = @fread($sock, 256);
        if ($chunk !== false && $chunk !== '') {
          $buf[$id] .= $chunk;
          if (strpos($buf[$id], 'pong') !== false) {
            $hosts[] = array('host' => $map[$id], 'id' => '', 'fw' => '');
            @fclose($sock);
            // Remove from socks list
            $socks = array_values(array_filter($socks, function($s) use ($sock){ return $s !== $sock; }));
          }
        }
      }
    }

    // Close remaining sockets
    foreach ($socks as $sock) { @fclose($sock); }
  }

  return $hosts;
}

function read_arp_candidates() {
  $ips = array();
  // /proc/net/arp exists on Linux.
  $arp = @file_get_contents('/proc/net/arp');
  if ($arp) {
    $lines = preg_split('/\r?\n/', trim($arp));
    // Skip header
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

  // ip neigh is sometimes more complete
  $neigh = @shell_exec('ip -4 neigh 2>/dev/null');
  if ($neigh) {
    $lines = preg_split('/\r?\n/', trim($neigh));
    foreach ($lines as $ln) {
      if (!$ln) continue;
      // Format: 192.168.2.119 dev eth0 lladdr .. REACHABLE
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

// If a subnet is requested, scan ONLY that subnet.
if (valid_subnet_192_168($subnet)) {
  dbg_add('mode=subnet');
  dbg_add('subnet=' . $subnet);
  $found = uniq_hosts(scan_subnet($subnet));
  json_out(array('ok' => (count($found) > 0), 'hosts' => $found));
}

// Build candidate IP list.
$candidates = read_arp_candidates();
dbg_add('arp_candidates=' . count($candidates));

// If ARP table is empty, try a small quick sweep in likely subnets.
$subnets = array();
add_subnet($subnets, isset($_SERVER['SERVER_ADDR']) ? $_SERVER['SERVER_ADDR'] : '');
add_subnet($subnets, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
$subnets[] = '192.168.2';
$subnets[] = '192.168.8';
$subnets = array_values(array_unique($subnets));

if (count($candidates) == 0) {
  // Quick probe a limited range to avoid long waits.
  foreach ($subnets as $sn) {
    for ($i=1; $i<=254; $i+=8) {
      $candidates[] = $sn . '.' . $i;
    }
  }
}

dbg_add('subnets=' . implode(',', $subnets));
dbg_add('candidates_total=' . count($candidates));

$found = array();
$timeout = 0.12; // seconds
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
