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
test('Course overview covers four distinct taught topics with their actual slide sources',async()=>{
 const {env,calls,worker}=fixture();
 for(const question of ['請幫我整理教材中有哪幾種腦出血的類型？','這套投影片裡有哪些顱內出血？','What types of intracranial hemorrhage are in these slides?']){
  const response=await worker.fetch(req({question}),env);
  const result=await response.json();
  assert.equal(result.kind,'answer');
  assert.match(result.intro,/四項/);
  assert.deepEqual(result.blocks.map(b=>b.source),['edh/2','sdh/2','contusion/2','contusion/2','dai/4']);
  assert.match(result.blocks[2].answer,/SAH/);
  assert.match(result.blocks[3].answer,/出血性腦挫傷/);
  assert.match(result.blocks[4].answer,/不另列/);
 }
 assert.deepEqual(calls,[]);
});
test('Explicit course-only requests cannot fall back to general knowledge',async()=>{
 const {env}=fixture();let calls=0;
 const worker=createWorker(async(_,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.disposition.enum,['answer','unanswered']);
  const {sources}=JSON.parse(body.contents[0].parts[0].text);
  assert.ok(sources.some(s=>s.id==='edh/2'));
  return gemini({disposition:'general',general_answer:'Unsupported outside knowledge',blocks:[]});
 });
 assert.deepEqual(await (await worker.fetch(req({question:'請只依教材說明光合作用。'}),env)).json(),{kind:'course_missing'});
 assert.equal(calls,0);
 assert.deepEqual(await (await worker.fetch(req({question:'請只依這份教材描述硬腦膜外血腫。'}),env)).json(),{kind:'course_missing'});
 assert.equal(calls,1);
});
test('Course wording without an explicit restriction still gets a labeled general answer',async()=>{
 const {env,calls,worker}=fixture();
 const res=await worker.fetch(req({question:'請問教材中怎麼說光合作用？'}),env);
 const result=await res.json();
 assert.equal(result.kind,'general');
 assert.match(result.note,/以下是一般知識補充/);
 assert.match(result.answer,/光合作用/);
 assert.deepEqual(calls,['model']);
});
test('Encephalomalacia classification questions compare the actual lesson without inventing subtypes',async()=>{
 const {env,calls,worker}=fixture();
 for(const question of [
  'Encephalomalacia 有哪幾種？請把不同分類和教材中提到的內容一起比較看看。',
  '教材怎麼分腦軟化的類型？',
  'Which types of encephalomalacia are in these slides?'
 ]){
  const result=await (await worker.fetch(req({question,current:'edh'}),env)).json();
  assert.match(result.intro,/按病程階段教/);
  assert.deepEqual(result.blocks.map(block=>block.source),['contusion/7','contusion/8']);
  assert.match(result.supplement,/沒有足夠資料替本例判定病理亞型/);
 }
 const result=await (await worker.fetch(req({question:'請只依教材說明腦軟化有哪幾種。'}),env)).json();
 assert.equal(result.kind,'answer');
 assert.equal(result.supplement,undefined);
 assert.deepEqual(calls,[]);
});
test('Open-ended Encephalomalacia questions retrieve the Contusion lesson for the model',async()=>{
 const {env}=fixture();let calls=0;
 const worker=createWorker(async(_,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.match(body.systemInstruction.parts[0].text,/不要把未列出的分類硬套到教學病例/);
  const {sources}=JSON.parse(body.contents[0].parts[0].text);
  const page=sources.find(source=>source.id==='contusion/7');
  assert.ok(page,'must retrieve the actual teaching slide, including for long mixed-language questions');
  assert.ok(!JSON.stringify(sources).includes('mild cognitive impairment'));
  const passage_index=page.passages.findIndex(p=>p.includes('prior injury 後的 tissue loss'));
  assert.ok(passage_index>=0);
  return gemini({disposition:'answer',general_answer:'其他病理分類屬於課外背景，不能由這些投影片判定本例的亞型。',blocks:[{
   source_id:page.id,passage_index,answer:'Contusion / SAH 章節用 Encephalomalacia 說明舊傷後的 tissue loss。'
  }]});
 });
 for(const question of [
  'Encephalomalacia 是什麼意思？學習時要怎麼理解這個字在教材的脈絡？',
  '請問教材怎麼介紹腦軟化？可以對照整理這個名詞在課程中的重點嗎？',
  'How does the course explain encephalomalacia and what should students look for in the lesson?'
 ]){
  const result=await (await worker.fetch(req({question,current:'edh'}),env)).json();
  assert.equal(result.kind,'answer');
  assert.equal(result.blocks[0].source,'contusion/7');
  assert.equal(result.blocks[0].evidence,'後期可見 encephalomalacia，代表 prior injury 後的 tissue loss。');
  assert.match(result.supplement,/課外背景/);
 }
 assert.equal(calls,3);
});
test('Expanded coverage also retrieves the neck infection teaching comparison',async()=>{
 const {env}=fixture();let calls=0;
 const worker=createWorker(async(_,options)=>{
  calls++;
  const {sources}=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
  const source=sources.find(s=>s.id==='infection/6');
  assert.ok(source);
  return gemini({disposition:'answer',general_answer:'',blocks:[{
   source_id:source.id,answer:'CT 上有時無法完全區分兩者。',
   passage_index:source.passages.findIndex(p=>p.includes('難完全區分'))
  }]});
 });
 const result=await (await worker.fetch(req({question:'膿瘍跟 Phlegmon 在這份投影片有什麼重要差別？'}),env)).json();
 assert.equal(result.blocks[0].source,'infection/6');
 assert.match(result.blocks[0].evidence,/難完全區分/);
 assert.equal(calls,1);
});
test('Current-slide questions reuse approved excerpts but never accept client-supplied slides',async()=>{
 const {env}=fixture();let calls=0;
 const worker=createWorker(async(_,options)=>{
  calls++;
  const {sources,current_slide}=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
  assert.equal(current_slide,'edh/2');
  assert.equal(sources[0].id,current_slide);
  assert.ok(!JSON.stringify(sources).includes('private addition'));
  return gemini({disposition:'answer',general_answer:'這是教材以外的補充。',blocks:[{
   source_id:current_slide,passage_index:1,answer:'這一頁介紹 EDH 的位置與典型外觀。'
  }]});
 });
 const prompt={question:'這頁在講什麼？',current:'edh',currentPage:'2',sources:['private addition']};
 let result=await (await worker.fetch(req(prompt),env)).json();
 assert.equal(result.blocks[0].source,'edh/2');
 assert.equal(result.supplement,'這是教材以外的補充。');
 result=await (await worker.fetch(req({...prompt,question:'請只依教材解釋這頁。'}),env)).json();
 assert.equal(result.blocks[0].source,'edh/2');
 assert.equal(result.supplement,undefined);
 result=await (await worker.fetch(req({...prompt,currentPage:'9'}),env)).json();
 assert.deepEqual(result,{kind:'page_missing'});
 assert.equal(calls,2);
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
