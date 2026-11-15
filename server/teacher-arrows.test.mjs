import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createWorker,ArrowWorkspace} from './worker.mjs';
import manifest from './arrow-manifest.json' with {type:'json'};
import {readCourse} from '../annotation/build.mjs';

const origin='https://course.test';
const teacherPass='test-only-teacher',adminPass='test-only-admin';
const sha=password=>createHash('sha256').update(password).digest('hex');
const pack=arrows=>({format:'radiology-video-arrows',version:1,course:manifest.course,arrows});
const example={id:'qa-1',page:'edh/2',view:0,key:'edh-1',first:19,last:21,x1:.25,y1:.32,x2:.51,y2:.6,color:'#ffda36'};
const source=await readFile(new URL('../public/index.html',import.meta.url),'utf8');

function fixture(){
 const env={ARROW_TEACHER_SHA256:sha(teacherPass),ARROW_ADMIN_SHA256:sha(adminPass),ASSETS:{fetch:()=>new Response(source)}};
 const db=new DatabaseSync(':memory:');
 const ctx={storage:{
  sql:{exec(sql,...args){
   const statement=db.prepare(sql);
   if(sql.startsWith('SELECT'))return {toArray:()=>statement.all(...args)};
   statement.run(...args);return {toArray:()=>[]};
  }},
  transactionSync(fn){
   db.exec('BEGIN');
   try{const result=fn();db.exec('COMMIT');return result;}
   catch(error){db.exec('ROLLBACK');throw error;}
  }
 }};
 const object=new ArrowWorkspace(ctx,env);
 env.ARROWS={getByName(){return {fetch:(url,init)=>object.fetch(new Request(url,{...init,duplex:'half'}))};}};
 const worker=createWorker();
 function request(path,opts={}){
  const headers={'CF-Connecting-IP':'203.0.113.5',...(opts.headers||{})};
  if(opts.cookie)headers.Cookie=opts.cookie;
  if(opts.body){headers.Origin=opts.origin||origin;headers['Content-Type']=opts.type||'application/json';}
  return worker.fetch(new Request(origin+path,{method:opts.body?'POST':'GET',headers,body:opts.type?opts.body:opts.body?JSON.stringify(opts.body):undefined}),env);
 }
 const loginRequest=password=>request('/teacher/login',{body:new URLSearchParams({password}),type:'application/x-www-form-urlencoded'});
 async function login(password){
  const res=await loginRequest(password);assert.equal(res.status,303);
  const cookie=res.headers.get('Set-Cookie');
  assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
  return cookie.split(';')[0];
 }
 return {request,login,loginRequest};
}

test('Web annotation manifest matches the shipped media and page IDs',async()=>{
 assert.deepEqual(manifest,(await readCourse()).manifest);
});
test('Unauthenticated students cannot see a draft, teacher page, or editor script',async()=>{
 const {request}=fixture();
 const login=await request('/teacher/');
 assert.equal(login.headers.get('Referrer-Policy'),'same-origin');
 assert.match(await login.text(),/教師或管理者密碼/);
 assert.equal((await request('/teacher/editor.js')).status,401);
 assert.equal((await request('/teacher/content.js')).status,401);
 assert.equal((await request('/api/arrows/draft')).status,401);
 assert.equal((await request('/api/arrows/publish',{body:{revision:0,liveRevision:0}})).status,401);
 assert.deepEqual(await (await request('/api/arrows/published')).json(),{...pack([]),revision:0});
});
test('Roles, save conflicts, pending vs public, targeted frames, and rollback',async()=>{
 const {request,login}=fixture();
 const teacher=await login(teacherPass),admin=await login(adminPass);
 const page=await request('/teacher/',{cookie:teacher});
 const html=await page.text();
 assert.match(html,/TeacherArrowInitial=.*"role":"teacher"/);
 assert.match(html,/<base href="\/">/);
 assert.match(page.headers.get('Content-Security-Policy'),/nonce-/);
 assert.match(page.headers.get('Cache-Control'),/no-store/);
 const wrongOrigin=await request('/api/arrows/draft',{cookie:teacher,origin:'https://other.test',body:{revision:0,data:pack([example])}});
 assert.equal(wrongOrigin.status,403);
 const invalid=await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:pack([{...example,last:456}])}});
 assert.equal(invalid.status,400);
 const slides={text:{'edh/2:text:0':'測試標題'},layout:{'sinus/1:image:0':{x:.12,y:-.08}},styles:{'edh/2:text:0':{size:34,color:'#2a645e',bold:true}},
  imageArrows:{'qa-photo-1':{image:'sinus/1:image:0',x1:.1,y1:.2,x2:.51,y2:.6,color:'#ffda36'}}};
 const data={...pack([example]),slides};
 for(const bad of [
  {...slides,layout:{'fake/1:image:0':{x:0,y:0}}},
  {...slides,layout:{'edh/2:text:0':{x:2,y:0}}},
  {...slides,text:{'edh/2:image:0':'not a text node'}},
  {...slides,imageArrows:{'qa-photo-1':{...slides.imageArrows['qa-photo-1'],image:'sinus/1:text:0'}}},
  {...slides,imageArrows:{'qa-photo-1':{...slides.imageArrows['qa-photo-1'],x2:-.5}}},
  {...slides,styles:{'edh/2:text:0':{color:'url(https://example.com)'}}}
 ]){
  assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:{...data,slides:bad}}})).status,400);
 }
 const save=await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data}});
 assert.equal(save.status,200);
 assert.equal((await save.json()).draft.revision,1);
 assert.deepEqual((await (await request('/api/arrows/draft',{cookie:admin})).json()).draft.data.slides,slides);
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:pack([])}})).status,409);
 assert.equal((await request('/api/arrows/publish',{cookie:teacher,body:{revision:1,liveRevision:0}})).status,403);
 assert.deepEqual(await (await request('/api/arrows/published')).json(),{...pack([]),revision:0});
 const published=await request('/api/arrows/publish',{cookie:admin,body:{revision:1,liveRevision:0}});
 assert.equal((await published.json()).live.revision,1);
 assert.deepEqual(await (await request('/api/arrows/published')).json(),{...data,revision:1});
 const rollback=await request('/api/arrows/rollback',{cookie:admin,body:{revision:1,liveRevision:1}});
 assert.equal((await rollback.json()).draft.revision,1);
 assert.deepEqual(await (await request('/api/arrows/published')).json(),{...pack([]),revision:2});
 await request('/api/arrows/logout',{cookie:teacher,body:{}});
 assert.equal((await request('/api/arrows/draft',{cookie:teacher})).status,401);
});
test('Repeated bad passwords are throttled for the sign-in source',async()=>{
 const {loginRequest}=fixture();
 for(let i=0;i<8;i++)assert.equal((await loginRequest('wrong')).status,401);
 assert.equal((await loginRequest('wrong')).status,429);
});

test('New text boxes persist, publish and rollback with safe text and normalized positions',async()=>{
 const {request,login}=fixture(),teacher=await login(teacherPass),admin=await login(adminPass);
 const id='sinus/1:box:qa-new-box';
 const slides={text:{'sinus/1:text:0':''},layout:{[id]:{x:.15,y:.1}},styles:{[id]:{size:28,bold:true}},imageArrows:{},
  boxes:{[id]:{text:'教師補充\n<script>alert(1)</script>',x:.1,y:.2,width:.4}}};
 for(const boxes of [
  {[id]:{...slides.boxes[id],width:2}},
  {[id]:{...slides.boxes[id],x:.9}},
  {'fake/1:box:no-page':slides.boxes[id]},
  {'sinus/1:text:0':slides.boxes[id]},
  {[id]:{...slides.boxes[id],text:'x'.repeat(4001)}}
 ]){
  assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:{...pack([]),slides:{...slides,boxes}}}})).status,400);
 }
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:{...pack([]),slides}}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/draft',{cookie:admin})).json()).draft.data.slides,slides);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:1,liveRevision:0}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/published')).json()).slides,slides);
 const empty={text:{},layout:{},styles:{},imageArrows:{},boxes:{}};
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:1,data:{...pack([]),slides:empty}}})).status,200);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:2,liveRevision:1}})).status,200);
 assert.equal((await (await request('/api/arrows/published')).json()).slides,undefined);
 assert.equal((await request('/api/arrows/rollback',{cookie:admin,body:{revision:2,liveRevision:2}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/published')).json()).slides,slides);
});
