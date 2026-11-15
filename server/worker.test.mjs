import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,nextQuota} from './worker.mjs';

const origin='https://course.example';
const endpoint='https://worker.example/api/study/ask';
const req=(input,from=origin)=>new Request(endpoint,{
 method:'POST',headers:{'Content-Type':'application/json',Origin:from},body:JSON.stringify(input)
});
function fixture(){
 const calls=[];
 const env={
  FRONTEND_ORIGIN:origin,GEMINI_API_KEY:'demo-model-secret',
  COURSE_QUOTA:{idFromName:x=>x,get:()=>({fetch:async()=>{calls.push('quota');return new Response(null,{status:204});}})}
 };
 const worker=createWorker(async(url,options)=>{
  assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
  assert.equal(options.redirect,'manual');
  const body=JSON.parse(options.body);
  calls.push('model');assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
  const {sources}=JSON.parse(body.contents[0].parts[0].text);
  assert.ok(sources.some(s=>s.id==='edh/2'&&s.passages.some(p=>p.includes('lentiform'))));
  assert.ok(sources.some(s=>s.id==='sdh/2'&&s.passages.some(p=>p.includes('crescentic'))));
  assert.ok(!JSON.stringify(sources).includes('本病例'));
  const text=JSON.stringify({disposition:'answer',blocks:[{
   answer:'EDH 的典型外觀是 lentiform 或 biconvex。',source_id:'edh/2',evidence:'典型外觀為 lentiform 或 biconvex。'
  }]});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});
 });
 return {env,calls,worker};
}
test('Public AI requires correct origin and available quota, without a browser challenge',async()=>{
 const {env,calls,worker}=fixture();
 const q={question:'EDH 和 SDH 有何不同？'};
 assert.equal((await worker.fetch(req(q,'https://unrelated.example'),env)).status,403);
 assert.equal((await worker.fetch(req(q),{...env,GEMINI_API_KEY:''})).status,503);
 assert.equal((await worker.fetch(req({question:''}),env)).status,400);
 assert.deepEqual(await (await worker.fetch(req({...q,question:'請教我做蛋糕'}),env)).json(),{kind:'out_of_scope'});
 assert.deepEqual(calls,[]);
 const response=await worker.fetch(req(q),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await response.json()).blocks[0].source,'edh/2');
 assert.deepEqual(calls,['quota','model']);
});
test('Quota refusal does not call Gemini',async()=>{
 const {env,calls,worker}=fixture();
 env.COURSE_QUOTA.get=()=>({fetch:async()=>new Response(null,{status:429})});
 assert.equal((await worker.fetch(req({question:'EDH'}),env)).status,429);
 assert.deepEqual(calls,[]);
});
test('Counter enforces shared daily and minute limits',()=>{
 const first=nextQuota(undefined,0,2,1);
 assert.equal(nextQuota(first,1000,2,1),null);
 const second=nextQuota(first,60000,2,1);
 assert.equal(nextQuota(second,120000,2,1),null);
 assert.equal(nextQuota(second,86400000,2,1).daily,1);
});
test('Configuration and preflight never expose credentials',async()=>{
 const {env,worker}=fixture();
 const url=new URL('/api/study/config',endpoint);
 const response=await worker.fetch(new Request(url,{headers:{Origin:origin}}),env);
 assert.deepEqual(await response.json(),{enabled:true});
 const pre=await worker.fetch(new Request(endpoint,{method:'OPTIONS',headers:{Origin:origin}}),env);
 assert.equal(pre.status,204);
 assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);
});
test('Worker default fetch preserves the runtime receiver and does not reveal errors',async t=>{
 const {env}=fixture();
 t.mock.method(globalThis,'fetch',async function(){
  assert.equal(this,globalThis);
  throw Error('upstream diagnostic must not reach the browser');
 });
 const response=await createWorker().fetch(req({question:'EDH'}),env);
 assert.equal(response.status,502);
 assert.deepEqual(await response.json(),{error:'AI 連線失敗或逾時，請稍後再試。'});
 assert.equal(globalThis.fetch.mock.callCount(),1);
 assert.equal(globalThis.fetch.mock.calls[0].this,globalThis);
});
