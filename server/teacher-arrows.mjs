import manifest from './arrow-manifest.json' with {type:'json'};
import arrowTools from '../public/arrows.js';
import slideTools from '../public/slide-edits.js';
import uploadTools from '../public/upload-model.js';
import {uploadMedia,serveMedia} from './media-store.mjs';

const cookieName='__Host-rad-teacher';
const lifetime=8*60*60;
const empty={format:arrowTools.format,version:1,course:manifest.course,arrows:[]};
function validateContent(input){
 const slides=slideTools.validate(input.slides,manifest.pages),data=arrowTools.validate({...input,slides},manifest);
 return slideTools.nonempty(slides)?{...data,slides}:data;
}
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(body,status=200)=>Response.json(body,{status,headers});
const err=(error,status)=>json({error},status);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
function same(a,b){
 if(typeof b!=='string'||a.length!==b.length)return false;
 let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
 return different===0;
}
const validHash=value=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const sessionCookie=(value,age)=>cookieName+'='+value+'; Max-Age='+age+'; Path=/; Secure; HttpOnly; SameSite=Lax';

async function read(req,limit){
 const reader=req.body?.getReader();if(!reader)throw Error('Missing body');
 const decoder=new TextDecoder();let text='',size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>limit)throw Error('Too large');
   text+=decoder.decode(value,{stream:true});
  }
  return text+decoder.decode();
 }finally{await reader.cancel().catch(()=>{});}
}
const serialize=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const html=(body,status=200,policy="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")=>
 new Response(body,{status,headers:{...headers,'Referrer-Policy':'same-origin','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':policy}});

function loginPage(message='',status=200){
 return html(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
 <title>教師標註登入</title><style>body{font:16px system-ui;background:#edf4f1;color:#173731;margin:0;padding:10vh 20px}main{max-width:28rem;margin:auto;background:white;padding:24px;border:1px solid #b7cdc4;border-radius:8px}h1{margin:0 0 10px;font-size:26px}label{display:block;margin:18px 0 5px}input,button{font:inherit;padding:10px;border:1px solid #779d90;border-radius:5px}input{width:100%;box-sizing:border-box}button{color:white;background:#176657;border-color:#176657;margin:12px 0 8px}a{color:#176657}.error{color:#9b2434}</style>
 <main><h1>教師教材編輯</h1><p>登入後可編輯文字、移動內容、標註影片，並儲存草稿。</p>${message?'<p role="alert" class="error">'+message+'</p>':''}
 <form method="post" action="/teacher/login"><label for="password">教師或管理者密碼</label><input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password"><button type="submit">登入</button></form><p><a href="/">返回學生版</a></p></main></html>`,status);
}

export class ArrowWorkspace {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS snapshots (slot TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated TEXT)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, credential TEXT NOT NULL, expires INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS login_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS media_uploads (id TEXT PRIMARY KEY, metadata TEXT NOT NULL)');
 }
 select(query,...args){return this.sql.exec(query,...args).toArray()[0];}
 snapshot(slot){
  const row=this.select('SELECT revision, payload, updated FROM snapshots WHERE slot = ?',slot);
  if(!row)return {revision:0,data:empty,updated:null};
  const data=validateContent(JSON.parse(row.payload));
  return {revision:row.revision,data,updated:row.updated};
 }
 put(slot,record){
  this.sql.exec('INSERT OR REPLACE INTO snapshots (slot, revision, payload, updated) VALUES (?,?,?,?)',
   slot,record.revision,JSON.stringify(record.data),record.updated);
 }
 credential(role){return role==='admin'?this.env.ARROW_ADMIN_SHA256:this.env.ARROW_TEACHER_SHA256;}
 async login(request){
  if(!['admin','teacher'].every(role=>validHash(this.credential(role)))||this.credential('admin')===this.credential('teacher'))
   return err('教師登入尚未啟用。',503);
  let password;
  try{password=JSON.parse(await read(request,2048)).password;}catch{return err('登入資料不正確。',400);}
  if(typeof password!=='string'||!password||password.length>128)return err('密碼不正確。',401);
  const now=Math.floor(Date.now()/1000),bucket=await hash(request.headers.get('X-Login-Bucket')||'-');
  const submitted=await hash(password),admin=same(submitted,this.credential('admin')),teacher=same(submitted,this.credential('teacher'));
  const raw=hex(crypto.getRandomValues(new Uint8Array(32))),token=await hash(raw);
  return this.ctx.storage.transactionSync(()=>{
   this.sql.exec('DELETE FROM login_limits WHERE until <= ?',now);
   this.sql.exec('DELETE FROM sessions WHERE expires <= ?',now);
   const limit=this.select('SELECT count, until FROM login_limits WHERE bucket = ?',bucket);
   if(limit?.count>=8)return err('登入嘗試過多，請十分鐘後再試。',429);
   if(!admin&&!teacher){
    this.sql.exec('INSERT OR REPLACE INTO login_limits (bucket,count,until) VALUES (?,?,?)',bucket,(limit?.count||0)+1,limit?.until||now+600);
    return err('密碼不正確。',401);
   }
   this.sql.exec('DELETE FROM login_limits WHERE bucket = ?',bucket);
   this.sql.exec('INSERT INTO sessions (token,role,credential,expires) VALUES (?,?,?,?)',token,admin?'admin':'teacher',submitted,now+lifetime);
   return json({token:raw});
  });
 }
 async fetch(request){
  const op=new URL(request.url).pathname,method=request.method;
  if(op==='/login'&&method==='POST')return this.login(request);
  if(op==='/published'&&method==='GET'){
   try{const live=this.snapshot('live');return json({...live.data,revision:live.revision});}
   catch{return json({...empty,revision:0});}
  }
  if(op.startsWith('/media-access/')&&method==='GET'){
   const id=op.slice('/media-access/'.length),row=this.select('SELECT metadata FROM media_uploads WHERE id = ?',id);
   if(!row)return err('找不到素材。',404);
   const live=this.snapshot('live');
   if(Object.values(live.data.slides?.uploads||{}).some(asset=>asset.id===id))return json(JSON.parse(row.metadata));
  }
  const raw=request.headers.get('X-Arrow-Session');
  if(!validHash(raw))return err('請重新登入教師版。',401);
  const token=await hash(raw);
  const authorized=()=>{
   const session=this.select('SELECT role, credential FROM sessions WHERE token = ? AND expires > ?',token,Math.floor(Date.now()/1000));
   return session&&same(session.credential,this.credential(session.role))?session.role:'';
  };
  const role=authorized();if(!role)return err('請重新登入教師版。',401);
  if(op.startsWith('/media-access/')&&method==='GET'){
   const row=this.select('SELECT metadata FROM media_uploads WHERE id = ?',op.slice('/media-access/'.length));
   return row?json(JSON.parse(row.metadata)):err('找不到素材。',404);
  }
  if(op==='/media-register'&&method==='POST'){
   try{
    const asset=uploadTools.metadata(JSON.parse(await read(request,4096)));
    this.sql.exec('INSERT INTO media_uploads (id,metadata) VALUES (?,?)',asset.id,JSON.stringify(asset));
    return json({ok:true});
   }catch{return err('無法登錄素材。',400);}
  }
  if(op==='/session'&&method==='GET')return json({role});
  if(op==='/logout'&&method==='POST'){this.sql.exec('DELETE FROM sessions WHERE token = ?',token);return json({ok:true});}
  const state=()=>{
   const draft=this.snapshot('draft'),live=this.snapshot('live');
   return {role,draft,live:{revision:live.revision,updated:live.updated,count:live.data.arrows.length},canRollback:!!this.select("SELECT slot FROM snapshots WHERE slot = 'previous'")};
  };
  try{
   if(op==='/draft'&&method==='GET')return json(state());
   if(!['/draft','/publish','/rollback'].includes(op)||method!=='POST')return err('找不到功能。',404);
   if(op!=='/draft'&&role!=='admin')return err('只有管理者可以發布或復原。',403);
   let input,data;
   try{
    input=JSON.parse(await read(request,680000));
    if(!Number.isSafeInteger(input.revision))throw Error('No revision');
    if(op==='/draft')data=validateContent(input.data);
    for(const asset of Object.values(data?.slides?.uploads||{})){
     const row=this.select('SELECT metadata FROM media_uploads WHERE id = ?',asset.id);
     if(!row||JSON.stringify(uploadTools.metadata(JSON.parse(row.metadata)))!==JSON.stringify(asset))throw Error('Unknown upload');
    }
   }catch{return err('標註或版本資料不正確。',400);}
   return this.ctx.storage.transactionSync(()=>{
    if(!authorized())return err('請重新登入教師版。',401);
    const draft=this.snapshot('draft'),live=this.snapshot('live'),updated=new Date().toISOString();
    if(input.revision!==draft.revision||(op!=='/draft'&&input.liveRevision!==live.revision))
     return err('其他人已更新版本。請先下載目前標註，再重新整理查看最新版。',409);
    if(op==='/draft'){
     if(JSON.stringify(draft.data)!==JSON.stringify(data))this.put('draft',{revision:draft.revision+1,data,updated});
    }else if(op==='/publish'){
     if(JSON.stringify(live.data)!==JSON.stringify(draft.data)){
      this.put('previous',live);this.put('live',{revision:live.revision+1,data:draft.data,updated});
     }
    }else{
     if(!this.select("SELECT slot FROM snapshots WHERE slot = 'previous'"))return err('尚無上一版可復原。',409);
     const previous=this.snapshot('previous');
     this.put('previous',live);this.put('live',{revision:live.revision+1,data:previous.data,updated});
    }
    return json(state());
   });
  }catch{return err('教材版本已變更或暫時無法使用，請聯絡管理者。',503);}
 }
}

export async function teacherArrows(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const cookie=(request.headers.get('Cookie')||'').split(/;\s*/).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 const validSession=validHash(cookie);
 const internal=(op,init={})=>env.ARROWS.getByName('course').fetch('https://arrows.internal'+op,{
  ...init,headers:{...(init.headers||{}),...(validSession?{'X-Arrow-Session':cookie}:{})}
 });
 if(path==='/api/arrows/published'&&method==='GET')return internal('/published');
 if(path.startsWith('/api/arrows/media/')&&['GET','HEAD'].includes(method))
  return serveMedia(request,env,internal,path.slice('/api/arrows/media/'.length));
 if(method==='POST'&&request.headers.get('Origin')!==url.origin)return err('請從原網站操作。',403);
 if(path==='/api/arrows/media'&&method==='POST')return uploadMedia(request,env,internal);
 if(path==='/teacher/login'&&method==='POST'){
  if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return loginPage('請使用登入表單。',400);
  let password;try{password=new URLSearchParams(await read(request,2048)).get('password');}catch{return loginPage('登入資料不正確。',400);}
  const result=await internal('/login',{method:'POST',body:JSON.stringify({password}),
   headers:{'X-Login-Bucket':request.headers.get('CF-Connecting-IP')||'-'}});
  if(!result.ok)return loginPage((await result.json()).error,result.status);
  const {token}=await result.json();
  return new Response(null,{status:303,headers:{...headers,Location:'/teacher/','Set-Cookie':sessionCookie(token,lifetime)}});
 }
 if(path==='/teacher'&&method==='GET')return new Response(null,{status:302,headers:{...headers,Location:'/teacher/'}});
 if(path==='/teacher/'&&method==='GET'){
  if(!validSession)return loginPage();
  const draft=await internal('/draft');
  if(draft.status===401)return loginPage();
  if(!draft.ok)return loginPage('無法載入教師版，請聯絡管理者。',503);
  const base=await env.ASSETS.fetch(new Request(url.origin+'/'));
  if(!base.ok)return loginPage('暫時無法載入教材。',503);
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const source=(await base.text()).replaceAll('<script>','<script nonce="'+nonce+'">');
  const boot='<base href="/"><script nonce="'+nonce+'">window.TeacherArrowManifest='+serialize(manifest)+
   ';window.TeacherArrowInitial='+serialize(await draft.json())+';</script><script src="/teacher/uploads.js"></script><script src="/teacher/content.js"></script><script src="/teacher/editor.js"></script><script src="/teacher/online.js"></script>';
  return html(source.replace('</head>',boot+'</head>'),200,"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; script-src 'self' 'nonce-"+nonce+"'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'");
 }
 if(['/teacher/content.js','/teacher/editor.js','/teacher/online.js','/teacher/uploads.js'].includes(path)&&method==='GET'){
  if(!validSession||!(await internal('/session')).ok)return err('請登入教師版。',401);
  const file=await env.ASSETS.fetch(new Request(url.origin+path));
  return new Response(file.body,{status:file.status,headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
 }
 if(path.startsWith('/api/arrows/')){
  const op=path.slice('/api/arrows'.length);
  if(!validSession)return err('請登入教師版。',401);
  if(op==='/logout'&&method==='POST'){
   const result=await internal(op,{method});
   return new Response(result.body,{status:result.status,headers:{...headers,'Content-Type':'application/json','Set-Cookie':sessionCookie('',0)}});
  }
  if(op==='/draft'&&method==='GET')return internal(op);
  if(['/draft','/publish','/rollback'].includes(op)&&method==='POST'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return err('請使用教師版介面。',415);
   return internal(op,{method,body:request.body});
  }
 }
 return err('找不到功能。',404);
}
