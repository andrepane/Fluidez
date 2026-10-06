import test from 'node:test';
import assert from 'node:assert/strict';
import {once,EventEmitter} from 'node:events';
import {WebSocket} from 'ws';
import {createProxy} from './server.mjs';
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;};
test('local proxy hides key/files and rejects foreign origin',async t=>{
 const server=createProxy({key:'test-only-placeholder'}),base=await listen(server);t.after(()=>server.close());
 assert.deepEqual(await (await fetch(base+'/experimental/config')).json(),{configured:true});
 assert.equal((await fetch(base+'/experimental-proxy/.env')).status,404);
 const client=new WebSocket(base.replace('http','ws')+'/experimental/deepgram',{origin:'https://foreign.invalid'});client.on('error',()=>{});await new Promise(resolve=>client.on('close',resolve));
});
test('proxy forwards PCM and CloseStream; key exists only in upstream header',async t=>{
 let options,url,sent=[];
 class Upstream extends EventEmitter{constructor(){super();this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.emit('open'));}send(data){sent.push(data);}terminate(){this.readyState=3;}}
 const server=createProxy({key:'test-only-placeholder',connect:(u,o)=>{url=u;options=o;return new Upstream();}}),base=await listen(server);
 const client=new WebSocket(base.replace('http','ws')+'/experimental/deepgram',{origin:base});client.on('error',()=>{});t.after(()=>{client.terminate();server.close();});await once(client,'open');
 const ready=once(client,'message');client.send(JSON.stringify({type:'Start',sampleRate:48000}));assert.equal(JSON.parse((await ready)[0]).type,'ProxyReady');
 assert.match(url,/model=nova-3/);assert.match(url,/language=es/);assert.match(url,/sample_rate=48000/);assert.equal(options.headers.Authorization,'Token test-only-placeholder');
 client.send(new Uint8Array([1,2,3,4]));client.send(JSON.stringify({type:'CloseStream'}));
 await new Promise(r=>setTimeout(r,30));assert.equal(sent[0].byteLength,4);assert.equal(JSON.parse(sent[1]).type,'CloseStream');
});
