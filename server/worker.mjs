import {createStudyAI} from './study-ai.mjs';
import pages from './corpus.json' with {type:'json'};

const ACTION='teaching_question';
const bad=(status,message)=>Object.assign(new Error(message),{status});
const compact=(n,fallback,max)=>{const x=Number(n);return Number.isInteger(x)&&x>0&&x<=max?x:fallback;};
const json=(data,status,headers)=>Response.json(data,{status,headers});

async function readJSON(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw bad(415,'請從教材頁送出問題。');
 const reader=request.body?.getReader();if(!reader)throw bad(400,'問題內容不正確。');
 const decoder=new TextDecoder();let text='',length=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;if(length>5000)throw bad(413,'提問內容過長。');
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();try{return JSON.parse(text);}catch{throw bad(400,'問題格式不正確。');}
 }finally{await reader.cancel().catch(()=>{});}
}

export function nextQuota(previous,now,dayLimit,minuteLimit){
 const day=Math.floor(now/86400000),minute=Math.floor(now/60000);
 const daily=previous?.day===day?previous.daily:0,burst=previous?.minute===minute?previous.burst:0;
 return daily>=dayLimit||burst>=minuteLimit?null:{day,minute,daily:daily+1,burst:burst+1};
}

export class CourseQuota {
 constructor(ctx,env){this.storage=ctx.storage;this.env=env;}
 fetch(){
  const day=compact(this.env.DAILY_QUESTION_LIMIT,20,1000),minute=compact(this.env.MINUTE_QUESTION_LIMIT,4,60);
  const next=this.storage.transactionSync(()=>{
   const sql=this.storage.sql;
   sql.exec('CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY, day INTEGER, minute INTEGER, daily INTEGER, burst INTEGER)');
   const prior=sql.exec('SELECT day, minute, daily, burst FROM quota WHERE id = 1').toArray()[0];
   const increment=nextQuota(prior,Date.now(),day,minute);
   if(increment)sql.exec('INSERT OR REPLACE INTO quota VALUES (1, ?, ?, ?, ?)',increment.day,increment.minute,increment.daily,increment.burst);
   return increment;
  });
  return new Response(null,{status:next?204:429});
 }
}

export function createWorker(fetcher=fetch){
 return {async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const origin=request.headers.get('Origin'),frontend=env.FRONTEND_ORIGIN||url.origin;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
  if(origin===frontend)headers['Access-Control-Allow-Origin']=frontend;
  const reply=(data,status=200)=>json(data,status,headers);
  if(origin&&origin!==frontend)return reply({error:'請從課程網頁提問。'},403);
  if(request.method==='OPTIONS'){
   if(origin!==frontend||url.pathname!=='/api/study/ask')return reply({error:'不允許的請求。'},403);
   return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
  }
  const enabled=Boolean(env.GEMINI_API_KEY&&env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY&&env.COURSE_QUOTA);
  if(url.pathname==='/api/study/config'&&request.method==='GET')return reply({enabled,siteKey:enabled?env.TURNSTILE_SITE_KEY:''});
  if(url.pathname!=='/api/study/ask'||request.method!=='POST')return reply({error:'找不到功能。'},404);
  if(!enabled)return reply({error:'問 AI 尚未啟用。'},503);
  if(origin!==frontend)return reply({error:'請從課程網頁提問。'},403);
  try{
   const input=await readJSON(request);
   const ticket=input?.verification;
   if(typeof ticket!=='string'||!ticket||ticket.length>2048)throw bad(400,'請先完成防濫用驗證。');
   const ask=createStudyAI({
    pages,apiKey:env.GEMINI_API_KEY,provider:'gemini',fetcher,
    async beforeSend(){
     const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:ticket}),
      signal:AbortSignal.timeout(6000),redirect:'error'
     });
     if(!response.ok)throw bad(503,'驗證服務暫時無法使用，請稍後再試。');
     const checked=await response.json();
     if(checked?.success!==true||checked.action!==ACTION||checked.hostname!==new URL(frontend).hostname)throw bad(403,'驗證已失效，請重新驗證。');
     const quota=env.COURSE_QUOTA.get(env.COURSE_QUOTA.idFromName('course'));
     const permit=await quota.fetch('https://course-quota.internal/consume');
     if(permit.status===429)throw bad(429,'課程問答暫時達到用量上限，請稍後再試。');
     if(permit.status!==204)throw bad(503,'問答暫時無法使用。');
    }
   });
   return reply(await ask(input));
  }catch(e){return reply({error:e.status?e.message:'目前無法回答，請稍後再試。'},e.status||502);}
 }};
}

export default createWorker();
