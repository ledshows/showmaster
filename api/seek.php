<?php
error_reporting(0);
ini_set('display_errors','0');
header('Content-Type: application/json');

function out($ok,$msg,$extra=array()){
  $r=array_merge(array('ok'=>(bool)$ok),$extra);
  $r[$ok?'message':'error']=$msg;
  echo json_encode($r);
  exit;
}

function curl_get($url,$timeout=2){
  $ch=curl_init($url);
  if($ch===false) return array(false,0,'curl_init');
  curl_setopt($ch,CURLOPT_URL,$url);
  curl_setopt($ch,CURLOPT_RETURNTRANSFER,true);
  curl_setopt($ch,CURLOPT_FOLLOWLOCATION,false);
  curl_setopt($ch,CURLOPT_CONNECTTIMEOUT,1);
  curl_setopt($ch,CURLOPT_TIMEOUT,$timeout);
  $resp=curl_exec($ch);
  $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
  $err=curl_error($ch);
  curl_close($ch);
  if($resp===false) return array(false,$http,$err);
  return array(true,$http,$resp);
}

function curl_json($url,$timeout=2){
  list($ok,$http,$body)=curl_get($url,$timeout);
  if(!$ok || $http<200 || $http>=300) return array(false,$http,null);
  $j=json_decode($body,true);
  if($j===null) return array(false,$http,null);
  return array(true,$http,$j);
}

function get_val($arr,$keys){
  foreach($keys as $k){
    if(isset($arr[$k]) && $arr[$k]!=='' && $arr[$k]!==null) return $arr[$k];
  }
  return null;
}

$delta = isset($_GET['delta']) ? intval($_GET['delta']) : 10;
if($delta===0) out(true,'No-op',array('delta'=>0));
if($delta>60) $delta=60;
if($delta<-60) $delta=-60;

// 1) Status
list($ok1,$h1,$st)=curl_json('http://127.0.0.1/api/fppd/status',2);
if(!$ok1){
  list($ok2,$h2,$st)=curl_json('http://127.0.0.1/api/system/status',2);
  if(!$ok2) out(false,'Cannot read FPP status');
}

$seq = get_val($st, array('current_sequence','current_sequence_filename','sequence','sequence_filename'));
if(is_array($seq)) $seq='';
$seq = trim((string)$seq);
$seq = basename($seq);
if($seq==='') out(false,'No active sequence');

$paused = false;
$p = get_val($st, array('sequence_paused','paused','is_paused','seq_paused'));
if($p!==null){
  $paused = ($p===true || $p===1 || $p==='1' || strtolower((string)$p)==='true' || strtolower((string)$p)==='yes');
}

// 2) Guess FPS from meta if possible (fallback 20)
$fps = 20;
$enc = rawurlencode($seq);
list($mok,$mh,$meta)=curl_json('http://127.0.0.1/api/sequence/'.$enc.'/meta',2);
if($mok && is_array($meta)){
  // try several likely fields
  $ms = null;
  foreach(array('stepTime','step_time','frameTime','frame_time','frameTimeMs','frame_time_ms','msPerFrame','ms_per_frame') as $k){
    if(isset($meta[$k])){ $ms = floatval($meta[$k]); break; }
  }
  if($ms===null && isset($meta['header']) && is_array($meta['header'])){
    foreach(array('stepTime','step_time','ms_per_frame','msPerFrame') as $k){
      if(isset($meta['header'][$k])){ $ms = floatval($meta['header'][$k]); break; }
    }
  }
  if($ms!==null && $ms>5 && $ms<200){
    $fps = (int)round(1000.0/$ms);
    if($fps<5) $fps=5;
    if($fps>60) $fps=60;
  }
}

$steps = abs($delta) * $fps;
if($steps<1) $steps=1;
if($steps>1200) $steps=1200; // safety

// 3) Pause (only if it looks like not paused)
if(!$paused){
  curl_get('http://127.0.0.1/api/sequence/current/togglePause',2);
  usleep(120000);
}

$stepUrl = ($delta>0) ? 'http://127.0.0.1/api/sequence/current/step' : 'http://127.0.0.1/api/sequence/current/stepBack';
for($i=0;$i<$steps;$i++){
  curl_get($stepUrl,2);
  if(($i%50)===49) usleep(20000);
}

if(!$paused){
  curl_get('http://127.0.0.1/api/sequence/current/togglePause',2);
}

out(true,'Seek stepped',array('sequence'=>$seq,'delta'=>$delta,'fps'=>$fps,'steps'=>$steps,'pausedBefore'=>$paused));
