(() => {
 'use strict';
 const header=document.querySelector('.header-actions');if(!header)return;
 const endpoint=(window.STUDENT_STUDY_API||'').replace(/\/$/,'');
 const dialog=document.createElement('dialog');
 dialog.id='student-study';dialog.setAttribute('aria-labelledby','student-study-title');
 dialog.innerHTML='<div class="dialog-top"><h2 id="student-study-title">問 AI</h2><button type="button" class="student-study-close" aria-label="關閉">✕</button></div><form><label for="student-question">你的問題</label><textarea id="student-question" required maxlength="300" rows="3" placeholder="例如：EDH 和 SDH 有何不同？"></textarea><p class="student-study-note">可問教材或一般知識，不提供個人診斷。問題與相關教材段落可能傳給 Google，免費方案可能用於產品改善或由人員審閱。請勿輸入個資、病人資料或機密。</p><button type="submit" disabled>送出問題</button></form><div class="student-results" role="status" aria-live="polite"></div>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),input=dialog.querySelector('textarea'),send=form.querySelector('[type=submit]');
 const result=dialog.querySelector('.student-results');
 const launch=document.createElement('button');launch.type='button';launch.id='student-study-open';launch.textContent='問 AI';header.append(launch);
 let enabled=false,busy=false,cycle=0;
 function refresh(){send.disabled=busy||!enabled;}
 async function open(){
  const ticket=++cycle;enabled=false;refresh();
  result.textContent='正在確認問答服務…';
  dialog.showModal();input.focus();
  try{
   const status=await fetch(endpoint+'/api/study/config',{signal:AbortSignal.timeout(7000)});
   if(!status.ok||!(status.headers.get('content-type')||'').includes('application/json'))throw Error('問 AI 尚未啟用，仍可使用投影片與目錄。');
   const config=await status.json();
   if(!config.enabled)throw Error('問 AI 尚未啟用，仍可使用投影片與目錄。');
   if(ticket!==cycle||!dialog.open)return;
   result.textContent='';
   enabled=true;refresh();
  }catch(e){if(ticket===cycle&&dialog.open)result.textContent=e.message;}
 }
 function show(answer){
  result.replaceChildren();
  function showGeneral(text,heading,note){
   const label=document.createElement('h3'),body=document.createElement('p');
   label.textContent=heading;body.className='student-general-answer';body.textContent=text;
   result.append(label);
   if(note){const lead=document.createElement('p');lead.className='student-study-note';lead.textContent=note;result.append(lead);}
   result.append(body);
  }
  if(answer.kind==='general'){
   showGeneral(answer.answer,'一般知識（非教材引用）',answer.note);return;
  }
  if(answer.kind!=='answer'){
   const messages={
    private_input:'請勿輸入個人或病人資料。',
    course_missing:'目前可供問答的教材段落不足以回答這題。你選擇只依教材，因此未加入一般知識。',
    page_missing:'目前沒有這一頁可供 AI 引用的段落。可以輸入你想了解的投影片術語，我會找相關教材或提供一般解釋。'
   };
   result.textContent=messages[answer.kind]||'這題目前無法回答，請試著換個問法。';
   return;
  }
  if(answer.intro){const intro=document.createElement('p');intro.textContent=answer.intro;result.append(intro);}
  for(const block of answer.blocks){
   const item=document.createElement('section'),p=document.createElement('p'),quote=document.createElement('blockquote'),a=document.createElement('a');
   p.textContent=block.answer;quote.textContent=block.evidence;
   a.href='#'+block.source;a.textContent='來源：第 '+block.source.split('/')[1]+' 頁 · '+block.title;
   a.onclick=()=>dialog.close();item.append(p,quote,a);result.append(item);
  }
  if(answer.supplement)showGeneral(answer.supplement,'一般知識補充（非教材引用）');
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||!enabled||!input.value.trim())return;
  const ticket=cycle;busy=true;refresh();result.textContent='正在準備回答…';
  try{
   const slide=document.querySelector('article:not([hidden])')?.dataset;
   const response=await fetch(endpoint+'/api/study/ask',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:input.value,current:slide?.case,currentPage:slide?.pageInCase}),signal:AbortSignal.timeout(42000)});
   const answer=await response.json();
   if(!response.ok)throw Error(answer.error||'目前無法回答。');
   if(ticket===cycle&&dialog.open)show(answer);
  }catch(e){if(ticket===cycle&&dialog.open)result.textContent=e.name==='TimeoutError'?'問答逾時，請再試一次。':e.message;}
  finally{busy=false;refresh();}
 };
 launch.onclick=open;dialog.querySelector('.student-study-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{cycle++;enabled=false;refresh();});
})();
