import {createStudyAI} from './study-ai.mjs';
import pages from './course-index.json' with {type:'json'};
import {teacherArrows} from './teacher-arrows.mjs';
export {ArrowWorkspace} from './teacher-arrows.mjs';

const bad=(status,message)=>Object.assign(new Error(message),{status});
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

// Retain the migrated class without a binding so deployment does not delete its storage.
export class CourseQuota {
 fetch(){return new Response(null,{status:410});}
}

export function createWorker(fetcher=(...args)=>globalThis.fetch(...args)){
 return {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/teacher'||url.pathname.startsWith('/teacher/')||url.pathname.startsWith('/api/arrows/'))
   return teacherArrows(request,env);
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
  const enabled=Boolean(env.GEMINI_API_KEY);
  if(url.pathname==='/api/study/config'&&request.method==='GET')return reply({enabled});
  if(url.pathname!=='/api/study/ask'||request.method!=='POST')return reply({error:'找不到功能。'},404);
  if(!enabled)return reply({error:'問 AI 尚未啟用。'},503);
  if(origin!==frontend)return reply({error:'請從課程網頁提問。'},403);
  try{
   const input=await readJSON(request);
   const ask=createStudyAI({pages,apiKey:env.GEMINI_API_KEY,provider:'gemini',fetcher});
   return reply(await ask(input));
  }catch(e){return reply({error:e.status?e.message:'目前無法回答，請稍後再試。'},e.status||502);}
 }};
}

export default createWorker();
