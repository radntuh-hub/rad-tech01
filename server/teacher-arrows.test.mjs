import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createWorker,ArrowWorkspace} from './worker.mjs';
import manifest from './arrow-manifest.json' with {type:'json'};
import {readCourse} from '../annotation/build.mjs';
import slideTools from '../public/slide-edits.js';
import uploadTools from '../public/upload-model.js';
import {byteRange,signature} from './media-store.mjs';

const origin='https://course.test';
const teacherPass='test-only-teacher',adminPass='test-only-admin';
const sha=password=>createHash('sha256').update(password).digest('hex');
const pack=arrows=>({format:'radiology-video-arrows',version:1,course:manifest.course,arrows});
const example={id:'qa-1',page:'edh/2',view:0,key:'edh-1',first:19,last:21,x1:.25,y1:.32,x2:.51,y2:.6,color:'#ffda36'};
const source=await readFile(new URL('../public/index.html',import.meta.url),'utf8');

function fixture(){
 const env={ARROW_TEACHER_SHA256:sha(teacherPass),ARROW_ADMIN_SHA256:sha(adminPass),ASSETS:{fetch:()=>new Response(source)}};
 const files=new Map();
 env.MATERIALS={
  async put(id,bytes){files.set(id,bytes.slice());},async delete(id){files.delete(id);},
  async head(id){return files.has(id)?{}:null;},
  async get(id,opts){const bytes=files.get(id);if(!bytes)return null;const range=opts?.range;
   return {body:range?bytes.slice(range.offset,range.offset+range.length):bytes};}
 };
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
  return worker.fetch(new Request(origin+path,{method:opts.method||(opts.body?'POST':'GET'),headers,body:opts.type?opts.body:opts.body?JSON.stringify(opts.body):undefined}),env);
 }
 const loginRequest=password=>request('/teacher/login',{body:new URLSearchParams({password}),type:'application/x-www-form-urlencoded'});
 async function login(password){
  const res=await loginRequest(password);assert.equal(res.status,303);
  const cookie=res.headers.get('Set-Cookie');
  assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
  return cookie.split(';')[0];
 }
 return {request,login,loginRequest,files,env};
}

test('Uploaded files stay private until publication and survive rollback with byte-range playback',async()=>{
 const {request,login,files}=fixture(),teacher=await login(teacherPass),admin=await login(adminPass);
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 const metadata={name:'測試圖片',mime:'image/png',size:bytes.length,width:640,height:480};
 const opts={cookie:teacher,type:metadata.mime,body:bytes,headers:{'Content-Length':String(bytes.length),'X-Media-Metadata':encodeURIComponent(JSON.stringify(metadata))}};
 assert.equal((await request('/api/arrows/media',{...opts,cookie:undefined})).status,401);
 assert.equal((await request('/api/arrows/media',{...opts,origin:'https://evil.test'})).status,403);
 assert.equal((await request('/api/arrows/media',{...opts,body:new Uint8Array(12)})).status,415);
 assert.equal(files.size,0);
 const uploaded=await request('/api/arrows/media',opts);assert.equal(uploaded.status,200);
 const {asset}=await uploaded.json(),url=uploadTools.url(asset);
 assert.equal((await request(url)).status,401);
 assert.deepEqual(new Uint8Array(await (await request(url,{cookie:teacher})).arrayBuffer()),bytes);
 const slides={...slideTools.blank(),uploads:{'sinus/1:image:100':asset}},data={...pack([]),slides};
 const forged=structuredClone(data);forged.slides.uploads['sinus/1:image:100'].width=999;
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:forged}})).status,400);
 const saved=await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data}});assert.equal(saved.status,200);
 assert.equal((await request(url)).status,401);
 assert.equal((await request('/api/arrows/publish',{cookie:teacher,body:{revision:1,liveRevision:0}})).status,403);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:1,liveRevision:0}})).status,200);
 const range=await request(url,{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);
 assert.equal(range.headers.get('Content-Range'),'bytes 2-5/12');assert.deepEqual(new Uint8Array(await range.arrayBuffer()),bytes.slice(2,6));
 assert.equal((await request(url,{headers:{Range:'bytes=100-'}})).status,416);
 assert.equal((await request(url,{method:'HEAD'})).headers.get('Content-Length'),'12');
 assert.equal((await request('/api/arrows/rollback',{cookie:admin,body:{revision:1,liveRevision:1}})).status,200);
 assert.equal((await request(url)).status,401);assert.equal((await request(url,{cookie:teacher})).status,200);
});

test('Upload size, metadata, format and sequence bounds are validated',()=>{
 const asset={id:'11111111-1111-1111-1111-111111111111',name:'Video',mime:'video/mp4',size:200,width:512,height:512,duration:2,fps:10};
 const slides={...slideTools.blank(),uploads:{'sinus/1:video:100':asset},media:{'sinus/1:video:100':{scale:80,crops:{['upload-'+asset.id]:{x:.1,y:.1,width:.7,height:.7}}}}};
 assert.equal(slideTools.validate(slides,manifest.pages).uploads['sinus/1:video:100'].kind,'video');
 for(const changes of [{size:26*1024*1024},{mime:'text/html'},{width:0},{fps:0},{duration:Infinity},{id:'../../secret'}])
  assert.throws(()=>uploadTools.metadata({...asset,...changes}));
 const custom=uploadTools.extend(manifest,slideTools.validate(slides,manifest.pages).uploads);
 assert.equal(custom.frames['upload-'+asset.id],20);assert.equal(manifest.pages['sinus/1'][100],undefined);
 assert.deepEqual(byteRange('bytes=-4',12),{offset:8,length:4});assert.equal(byteRange('bytes=-0',12),false);
 assert.equal(byteRange('bytes=1-2,4-5',12),false);assert.equal(byteRange('bytes=6-3',12),false);
 assert.equal(signature(new TextEncoder().encode('<html>bad</html>'),'image/png'),false);
});

test('Uploaded video arrows and crops persist without changing original sequences',async()=>{
 const {request,login}=fixture(),cookie=await login(adminPass);
 const bytes=new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);
 const metadata={name:'Test video',mime:'video/mp4',size:12,width:640,height:360,duration:3,fps:10};
 const response=await request('/api/arrows/media',{cookie,type:metadata.mime,body:bytes,headers:{'Content-Length':'12','X-Media-Metadata':encodeURIComponent(JSON.stringify(metadata))}});
 assert.equal(response.status,200);const {asset}=await response.json(),key=uploadTools.key(asset),id='sinus/1:video:100';
 const slides={...slideTools.blank(),uploads:{[id]:asset},media:{[id]:{scale:90,crops:{[key]:{x:.1,y:.2,width:.8,height:.6}}}}};
 const arrow={...example,id:'upload-arrow',page:'sinus/1',view:100,key,first:12,last:16};
 const data={...pack([arrow]),slides};
 assert.equal((await request('/api/arrows/draft',{cookie,body:{revision:0,data:{...data,arrows:[{...arrow,last:31}]}}})).status,400);
 assert.equal((await request('/api/arrows/draft',{cookie,body:{revision:0,data}})).status,200);
 const reloaded=(await (await request('/api/arrows/draft',{cookie})).json()).draft.data;
 assert.deepEqual(reloaded.arrows,[arrow]);assert.deepEqual(reloaded.slides.media,slides.media);
 assert.equal((await request('/api/arrows/publish',{cookie,body:{revision:1,liveRevision:0}})).status,200);
 const live=await (await request('/api/arrows/published')).json();assert.deepEqual(live.arrows,[arrow]);
 assert.equal((await request(uploadTools.url(asset))).status,200);
 assert.deepEqual(manifest.pages['sinus/3'][0],['sinus-1','sinus-2']);
 assert.throws(()=>slideTools.validate({...slides,uploads:{}},manifest.pages));
});

test('Missing storage and invalid upload length fail without publishing content',async()=>{
 const {request,login,env,files}=fixture(),cookie=await login(teacherPass);
 const metadata={name:'Test',mime:'image/png',size:12,width:100,height:100};
 const opts={cookie,type:metadata.mime,body:new Uint8Array(12),headers:{'Content-Length':'10','X-Media-Metadata':encodeURIComponent(JSON.stringify(metadata))}};
 assert.equal((await request('/api/arrows/media',opts)).status,400);assert.equal(files.size,0);
 delete env.MATERIALS;assert.equal((await request('/api/arrows/media',opts)).status,503);
 assert.equal((await request('/teacher/uploads.js')).status,401);
});

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

test('Image and video sizes survive draft, publication, reset and rollback',async()=>{
 const {request,login}=fixture(),teacher=await login(teacherPass),admin=await login(adminPass);
 const slides={text:{},layout:{},styles:{},imageArrows:{},media:{'sinus/1:image:0':{scale:50},'sinus/3:video:0':{scale:150}}};
 for(const media of [
  {'sinus/1:image:0':{scale:24}}, {'sinus/1:image:0':{scale:201}},
  {'sinus/3:video:0':{scale:50.5}}, {'sinus/3:video:0':{scale:'50'}},
  {'sinus/1:text:0':{scale:50}}, {'sinus/1:video:0':{scale:50}},
  {'sinus/3:video:99':{scale:50}}, {'fake/1:image:0':{scale:50}}
 ]){
  assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:{...pack([]),slides:{...slides,media}}}})).status,400);
 }
 const data={...pack([]),slides};
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/draft',{cookie:admin})).json()).draft.data.slides,slides);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:1,liveRevision:0}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/published')).json()).slides,slides);
 const reset={...data,slides:{...slides,media:{'sinus/1:image:0':{scale:100},'sinus/3:video:0':{scale:100}}}};
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:1,data:reset}})).status,200);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:2,liveRevision:1}})).status,200);
 assert.equal((await (await request('/api/arrows/published')).json()).slides,undefined);
 assert.equal((await request('/api/arrows/rollback',{cookie:admin,body:{revision:2,liveRevision:2}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/published')).json()).slides,slides);
});

test('Media sizing scales the original width and never exceeds its column',()=>{
 assert.equal(slideTools.scaledWidth(440,600,50),220);
 assert.equal(slideTools.scaledWidth(440,600,125),550);
 assert.equal(slideTools.scaledWidth(440,600,200),600);
 assert.equal(slideTools.scaledWidth(280,280,200),280);
});

test('Nondestructive image and per-sequence video crops are validated, saved and published',async()=>{
 const {request,login}=fixture(),teacher=await login(teacherPass),admin=await login(adminPass);
 const crop={x:.1,y:.2,width:.7,height:.6};
 const slides={text:{},layout:{},styles:{},imageArrows:{},media:{
  'sinus/1:image:0':{scale:100,crop},'sinus/3:video:0':{scale:75,crops:{'sinus-1':crop}}
 }};
 const data={...pack([example]),slides};
 for(const media of [
  {'sinus/1:image:0':{scale:100,crop:{...crop,x:-.1}}},
  {'sinus/1:image:0':{scale:100,crop:{...crop,width:0}}},
  {'sinus/1:image:0':{scale:100,crop:{...crop,width:1}}},
  {'sinus/1:image:0':{scale:100,crops:{'sinus-1':crop}}},
  {'sinus/3:video:0':{scale:100,crop}},
  {'sinus/3:video:0':{scale:100,crops:{'edh-1':crop}}}
 ])assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data:{...data,slides:{...slides,media}}}})).status,400);
 assert.equal((await request('/api/arrows/draft',{cookie:teacher,body:{revision:0,data}})).status,200);
 const loaded=(await (await request('/api/arrows/draft',{cookie:admin})).json()).draft.data;
 assert.deepEqual(loaded,data);
 assert.equal(loaded.slides.media['sinus/3:video:0'].crops['sinus-2'],undefined);
 assert.equal((await (await request('/api/arrows/published')).json()).slides,undefined);
 assert.equal((await request('/api/arrows/publish',{cookie:admin,body:{revision:1,liveRevision:0}})).status,200);
 assert.deepEqual((await (await request('/api/arrows/published')).json()).slides,slides);
 assert.equal((await request('/api/arrows/rollback',{cookie:admin,body:{revision:1,liveRevision:1}})).status,200);
 assert.equal((await (await request('/api/arrows/published')).json()).slides,undefined);
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
