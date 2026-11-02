import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelResponseWatchdog } from '../apps/server/src/model-response-watchdog.js';
const delay = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
test('silent model settles the caller with a clear error instead of awaiting the entire stage deadline', async()=>{
  let aborted=false,notices=0;
  const watcher=new ModelResponseWatchdog(35,()=>{aborted=true;},()=>{notices++;},10);
  watcher.activity();
  await assert.rejects(watcher.wait(new Promise(()=>{})),/模型连续.*未返回响应/);
  assert.equal(aborted,true);assert.equal(notices,1);
});
test('streaming activity resets model silence and tools suspend the model watchdog',async()=>{
  let aborted=false;
  const watcher=new ModelResponseWatchdog(80,()=>{aborted=true;},()=>{},50);
  watcher.activity();await delay(20);watcher.activity();await delay(20);
  watcher.stop();await delay(100);assert.equal(aborted,false);
  watcher.activity();assert.equal(await watcher.wait(Promise.resolve('complete')),'complete');
  await delay(100);assert.equal(aborted,false);
});
test('continuous deltas cannot extend the absolute model call deadline', async()=>{
  const watcher = new ModelResponseWatchdog(100,()=>{},()=>{},80,{callMs:45});
  watcher.beginCall();
  const heartbeat = setInterval(()=>watcher.activity(),5);
  try { await assert.rejects(watcher.wait(new Promise(()=>{})),/单次模型调用/); }
  finally { clearInterval(heartbeat); watcher.dispose(); }
});
test('reads and repeated progress keys cannot extend durable-progress deadline; tool time is independent of call time', async()=>{
  const watcher = new ModelResponseWatchdog(200,()=>{},()=>{},150,{callMs:20,progressMs:65});
  watcher.beginCall(); watcher.durableProgress('saved-one'); watcher.stop();
  const repeat = setInterval(()=>watcher.durableProgress('saved-one'),5);
  try { await assert.rejects(watcher.wait(new Promise(()=>{})),/未保存新的可验证进展/); }
  finally { clearInterval(repeat); watcher.dispose(); }
});
