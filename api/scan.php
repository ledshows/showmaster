<?php
// Showmaster discovery for FPP plugin.
//
// Modes:
//  - Fast (default): uses ARP/neigh + small probes (quick).
//  - Subnet scan: provide ?subnet=192.168.2  (scans 192.168.2.1-254)
// The UI can loop subnets 192.168.0..255 for a full /16 scan.

error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json');

$debug = array();
function dbg_add($s){ global $debug; $debug[] = $s; }
function json_out($arr) { global $debug; if (!isset($arr['debug'])) $arr['debug'] = $debug; echo json_encode($arr); exit; }

function uniq_hosts($hosts) {
  $seen = array();
  $out = array();
  foreach ($hosts as $h) {
    $k = (isset($h['host']) ? trim($h['host']) : '');
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
  while (!feof($fp) && strlen($data) < 128) {
    $chunk = @fread($fp, 128);
    if ($chunk === false || $chunk === '') break;
    $data .= $chunk;
  }
  @fclose($fp);
  return (strpos($data, "pong") !== false);
}

function cmd_exists($cmd) {
  $out = @shell_exec("command -v " . escapeshellarg($cmd) . " 2>/dev/null");
  return ($out && trim($out) !== '');
}

function alive_hosts_in_subnet($subnet3) {
  // Returns array of IPv4 strings.
  $subnet3 = trim($subnet3);
  if (!preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}$/', $subnet3)) return array();

  // Prefer fping if available (fast).
  if (cmd_exists('fping')) {
    $cmd = "fping -a -q -g " . escapeshellarg($subnet3 . ".1") . " " . escapeshellarg($subnet3 . ".254") . " 2>/dev/null";
    $out = @shell_exec($cmd);
    if ($out) {
      $ips = preg_split('/\r?\n/', trim($out));
      $res = array();
      foreach ($ips as $ip) {
        $ip = trim($ip);
        if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $res[] = $ip;
      }
      return array_values(array_unique($res));
    }
  }

  // Fallback: parallel ping sweep (keeps it reasonably fast).
  // NOTE: This uses common Linux tools: seq, xargs, ping.
  $cmd = "seq 1 254 | xargs -n1 -P32 -I{} sh -c 'ping -c1 -W1 " . $subnet3 . ".{} >/dev/null 2>&1 && echo " . $subnet3 . ".{}'";
  $out = @shell_exec($cmd . " 2>/dev/null");
  if (!$out) return array();
  $ips = preg_split('/\r?\n/', trim($out));
  $res = array();
  foreach ($ips as $ip) {
    $ip = trim($ip);
    if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $res[] = $ip;
  }
  return array_values(array_unique($res));
}

function read_arp_candidates() {
  $ips = array();

  $arp = @file_get_contents('/proc/net/arp');
  if ($arp) {
    $lines = preg_split('/\r?\n/', trim($arp));
    foreach ($lines as $i => $ln) {
      if ($i === 0) continue; // header
      $p = preg_split('/\s+/', trim($ln));
      if (count($p) >= 1) {
        $ip = trim($p[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $ips[] = $ip;
      }
    }
  }

  $neigh = @shell_exec('ip -4 neigh 2>/dev/null');
  if ($neigh) {
    $lines = preg_split('/\r?\n/', trim($neigh));
    foreach ($lines as $ln) {
      if (!$ln) continue;
      $p = preg_split('/\s+/', trim($ln));
      if (count($p) >= 1 && filter_var($p[0], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $ips[] = $p[0];
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

function fast_scan() {
  $candidates = read_arp_candidates();
  $subnets = array();

  // Detect local IP of the FPP device
  $ifconfig = @shell_exec("ip -4 addr show 2>/dev/null");
  if ($ifconfig) {
    preg_match_all('/inet\s+(\d+\.\d+\.\d+\.\d+)\//', $ifconfig, $m);
    if (isset($m[1])) {
      foreach ($m[1] as $ip) add_subnet($subnets, $ip);
    }
  }

  // Default common show subnet
  if (count($subnets) === 0) $subnets[] = '192.168.2';
  $subnets = array_values(array_unique($subnets));

  if (count($candidates) === 0) {
    // Quick probe a limited range to avoid long waits.
    foreach ($subnets as $sn) {
      for ($i=1; $i<=254; $i+=8) $candidates[] = $sn . '.' . $i;
    }
  }

  $timeout = 0.12;
  $limit = 256;
  $found = array();

  for ($i=0; $i<count($candidates) && $i<$limit; $i++) {
    $ip = $candidates[$i];
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) continue;
    if (http_ping_showmaster($ip, $timeout)) $found[] = array('host' => $ip, 'id' => '', 'fw' => '');
  }

  $found = uniq_hosts($found);
  if (count($found) > 0) json_out(array('ok' => true, 'host' => $found[0]['host'], 'hosts' => $found));

  json_out(array('ok' => false, 'error' => 'Not found', 'hosts' => array()));
}

// ---- main ----
$subnet = isset($_GET['subnet']) ? trim($_GET['subnet']) : '';
if ($subnet !== '') {
  if (!preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}$/', $subnet)) {
    json_out(array('ok' => false, 'error' => 'Invalid subnet', 'hosts' => array()));
  }
  dbg_add('mode=subnet');
  dbg_add('subnet=' . $subnet);

  $alive = alive_hosts_in_subnet($subnet);
  dbg_add('alive=' . count($alive));

  $found = array();
  foreach ($alive as $ip) {
    if (http_ping_showmaster($ip, 0.20)) $found[] = array('host' => $ip, 'id' => '', 'fw' => '');
  }
  $found = uniq_hosts($found);

  json_out(array(
    'ok' => (count($found) > 0),
    'hosts' => $found
  ));
}

fast_scan();
