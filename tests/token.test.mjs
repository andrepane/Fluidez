import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/deepgram-token.js';
function setup(options={}){
 let calls=0;
 const handler=createHandler({env:{DEEPGRAM_API_KEY:'server-only-key'},now:()=>100000,request:async(url,config)=>{calls++;assert.equal(config.headers.Authorization,'Token server-only-key');assert.deepEqual(JSON.parse(config.body),{ttl_seconds:60});return {ok:true,json:async()=>({access_token:'temporary-token',expires_in:60})};},...options});
 return {calls:()=>calls,run:async(overrides={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{host:'example.com',origin:'https://example.com','content-type':'application/json'},body:{},...overrides},res);return res;}};
}
test('public token needs no password and never returns master key',async()=>{const h=setup();const r=await h.run();assert.equal(r.code,200);assert.equal(h.calls(),1);assert.equal(r.body.access_token,'temporary-token');assert.ok(!JSON.stringify(r).includes('server-only-key'));assert.equal(r.headers['Cache-Control'],'no-store');});
test('configuration, method, origin and JSON gates precede provider',async()=>{assert.equal((await setup({env:{}}).run()).code,503);const h=setup();assert.equal((await h.run({method:'GET'})).code,405);assert.equal((await h.run({headers:{host:'example.com',origin:'https://other.com'}})).code,403);assert.equal((await h.run({headers:{}})).code,415);assert.equal(h.calls(),0);});
test('instance brake returns 429 and resets after a minute',async()=>{let time=100000;const h=setup({now:()=>time});for(let i=0;i<10;i++)assert.equal((await h.run()).code,200);assert.equal((await h.run()).code,429);assert.equal(h.calls(),10);time+=60000;assert.equal((await h.run()).code,200);});
test('upstream error is generic',async()=>{const h=setup({request:async()=>{throw Error('sensitive upstream details');}});const r=await h.run();assert.equal(r.code,502);assert.ok(!JSON.stringify(r).includes('sensitive'));});
