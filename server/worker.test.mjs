import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from './worker.mjs';

const origin='https://course.example';
const endpoint='https://worker.example/api/study/ask';
const req=(input,from=origin)=>new Request(endpoint,{
 method:'POST',headers:{'Content-Type':'application/json',Origin:from},body:JSON.stringify(input)
});
function fixture(){
 const calls=[];
 const env={
  FRONTEND_ORIGIN:origin,GEMINI_API_KEY:'demo-model-secret'
 };
 const worker=createWorker(async(url,options)=>{
  assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
  assert.equal(options.redirect,'manual');
  const body=JSON.parse(options.body);
  calls.push('model');assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
  const {sources}=JSON.parse(body.contents[0].parts[0].text);
  if(!sources.length){
   assert.deepEqual(body.generationConfig.responseJsonSchema.properties.disposition.enum,['general','unanswered']);
   return gemini({disposition:'general',general_answer:'光合作用會把光能轉換成化學能。',blocks:[]});
  }
  assert.ok(sources.some(s=>s.id==='edh/2'&&s.passages.some(p=>p.includes('lentiform'))));
  assert.ok(sources.some(s=>s.id==='sdh/2'&&s.passages.some(p=>p.includes('crescentic'))));
  assert.ok(!JSON.stringify(sources).includes('本病例'));
  return gemini({disposition:'answer',general_answer:'',blocks:[{
   answer:'EDH 的典型外觀是 lentiform 或 biconvex。',source_id:'edh/2',
   passage_index:sources.find(s=>s.id==='edh/2').passages.findIndex(p=>p.includes('lentiform'))
  }]});
 });
 return {env,calls,worker};
}
const gemini=body=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});

test('Public AI still checks origin and uses verified evidence for course questions',async()=>{
 const {env,calls,worker}=fixture();
 const q={question:'EDH 和 SDH 有何不同？'};
 assert.equal((await worker.fetch(req(q,'https://unrelated.example'),env)).status,403);
 assert.equal((await worker.fetch(req(q),{...env,GEMINI_API_KEY:''})).status,503);
 assert.equal((await worker.fetch(req({question:''}),env)).status,400);
 assert.deepEqual(await (await worker.fetch(req({...q,question:'我的病人 EDH 病歷號 12345'}),env)).json(),{kind:'private_input'});
 assert.deepEqual(calls,[]);
 const response=await worker.fetch(req(q),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 const block=(await response.json()).blocks[0];
 assert.equal(block.source,'edh/2');assert.equal(block.evidence,'位於 skull inner table 與 dura 之間；典型外觀為 lentiform 或 biconvex。');
 assert.deepEqual(calls,['model']);
});
test('Questions outside the course return clearly separate general answers, without a local cap',async()=>{
 const {env,calls,worker}=fixture();
 for(let i=0;i<31;i++){
  const result=await (await worker.fetch(req({question:'光合作用'}),env)).json();
  assert.deepEqual(result,{kind:'general',answer:'光合作用會把光能轉換成化學能。'});
 }
 assert.equal(calls.length,31);
});
test('Gemini quota is shown to students without automatic retries',async()=>{
 const {env}=fixture();let requests=0;
 const worker=createWorker(async()=>{requests++;return new Response(null,{status:429});});
 const response=await worker.fetch(req({question:'光合作用'}),env);
 assert.equal(response.status,429);
 assert.match((await response.json()).error,/Gemini.*上限/);
 assert.equal(requests,1);
});
test('General answers cannot invent slide citations',async()=>{
 const {env}=fixture();
 const worker=createWorker(async()=>gemini({disposition:'answer',general_answer:'',blocks:[{source_id:'edh/2',answer:'test',passage_index:99}]}));
 assert.deepEqual(await (await worker.fetch(req({question:'光合作用'}),env)).json(),{kind:'unanswered'});
 assert.deepEqual(await (await worker.fetch(req({question:'EDH'}),env)).json(),{kind:'unanswered'});
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
