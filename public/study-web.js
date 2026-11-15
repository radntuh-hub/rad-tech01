(() => {
 'use strict';
 const header=document.querySelector('.header-actions');if(!header)return;
 const endpoint=(window.STUDENT_STUDY_API||'').replace(/\/$/,'');
 const dialog=document.createElement('dialog');
 dialog.id='student-study';dialog.setAttribute('aria-labelledby','student-study-title');
 dialog.innerHTML='<div class="dialog-top"><h2 id="student-study-title">問 AI</h2><button type="button" class="student-study-close" aria-label="關閉">✕</button></div><form><label for="student-question">教材問題</label><textarea id="student-question" required maxlength="300" rows="3" placeholder="例如：EDH 和 SDH 有何不同？"></textarea><p class="student-study-note">只回答選定的教材概念，不提供個人診斷。問題與相關教材段落可能傳給 Google，免費方案可能用於產品改善或由人員審閱。請勿輸入個資、病人資料或機密。</p><div class="student-check"></div><button type="submit" disabled>送出問題</button></form><div class="student-results" role="status" aria-live="polite"></div>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),input=dialog.querySelector('textarea'),send=form.querySelector('[type=submit]');
 const result=dialog.querySelector('.student-results'),challenge=dialog.querySelector('.student-check');
 const launch=document.createElement('button');launch.type='button';launch.id='student-study-open';launch.textContent='問 AI';header.append(launch);
 let turnstileScript,widget=null,token='',busy=false,cycle=0;
 function refresh(){send.disabled=busy||!token;}
 function clearWidget(){
  if(widget!==null)window.turnstile?.remove(widget);
  widget=null;token='';refresh();
 }
 function turnstileReady(){
  if(window.turnstile)return Promise.resolve();
  if(!turnstileScript)turnstileScript=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   script.onload=resolve;
   script.onerror=()=>{script.remove();turnstileScript=null;reject(Error('驗證元件無法載入，請稍後再試。'));};
   document.head.append(script);
  });
  return turnstileScript;
 }
 async function open(){
  const ticket=++cycle;clearWidget();
  result.textContent='正在確認問答服務…';
  dialog.showModal();input.focus();
  try{
   const status=await fetch(endpoint+'/api/study/config',{signal:AbortSignal.timeout(7000)});
   if(!status.ok||!(status.headers.get('content-type')||'').includes('application/json'))throw Error('問 AI 尚未啟用，仍可使用投影片與目錄。');
   const config=await status.json();
   if(!config.enabled||!config.siteKey)throw Error('問 AI 尚未啟用，仍可使用投影片與目錄。');
   await turnstileReady();
   if(ticket!==cycle||!dialog.open)return;
   result.textContent='';
   widget=window.turnstile.render(challenge,{sitekey:config.siteKey,action:'teaching_question',size:'flexible',
    callback:value=>{token=value;refresh();},
    'expired-callback':()=>{token='';refresh();},
    'error-callback':()=>{token='';refresh();result.textContent='驗證未完成，請稍後再試。';}
   });
  }catch(e){if(ticket===cycle&&dialog.open)result.textContent=e.message;}
 }
 function show(answer){
  result.replaceChildren();
  if(answer.kind!=='answer'){
   result.textContent=answer.kind==='private_input'?'請勿輸入個人或病人資料。':'目前的教材段落不足以回答，請加上投影片中的專有名詞。';
   return;
  }
  for(const block of answer.blocks){
   const item=document.createElement('section'),p=document.createElement('p'),quote=document.createElement('blockquote'),a=document.createElement('a');
   p.textContent=block.answer;quote.textContent=block.evidence;
   a.href='#'+block.source;a.textContent='來源：第 '+block.source.split('/')[1]+' 頁 · '+block.title;
   a.onclick=()=>dialog.close();item.append(p,quote,a);result.append(item);
  }
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||!token||!input.value.trim())return;
  const ticket=cycle;busy=true;refresh();result.textContent='正在查找教材…';
  try{
   const current=document.querySelector('article:not([hidden])')?.dataset.case;
   const response=await fetch(endpoint+'/api/study/ask',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:input.value,current,verification:token}),signal:AbortSignal.timeout(42000)});
   const answer=await response.json();
   if(!response.ok)throw Error(answer.error||'目前無法回答。');
   if(ticket===cycle&&dialog.open)show(answer);
  }catch(e){if(ticket===cycle&&dialog.open)result.textContent=e.name==='TimeoutError'?'問答逾時，請再試一次。':e.message;}
  finally{busy=false;if(ticket===cycle){token='';if(widget!==null)window.turnstile.reset(widget);}refresh();}
 };
 launch.onclick=open;dialog.querySelector('.student-study-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{cycle++;clearWidget();});
})();
