(() => {
 'use strict';
 const {format,validate,surface}=window.TeachingArrows;
 const makeButton=(text,action)=>{
  const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;
 };
 function start(player,manifest,media,online,slideEdits){
  const controls=new WeakMap(),header=document.querySelector('header');
  const status=document.createElement('div');status.className='teacher-arrow-status';status.setAttribute('role','status');
  header.append(status);
  const message=(text,error=false)=>{status.textContent=text;status.toggleAttribute('data-error',error);};
  message('教師標註版 · 到有影片的頁面，使用播放器下方的「畫箭頭」。');
  const content=online&&window.TeacherSlideEditor?.start(slideEdits,message);
  const pack=()=>({format,version:1,course:manifest.course,arrows:player.arrows,
   ...(slideEdits?.changes?{slides:slideEdits.changes}:{})});
  const serialized=()=>JSON.stringify(pack());
  let saved=serialized(),active=null,drag=null;
  const dirty=()=>saved!==serialized();
  const fileInput=document.createElement('input');
  fileInput.type='file';fileInput.accept='.json,application/json';fileInput.hidden=true;
  function exportFile(){
   const url=URL.createObjectURL(new Blob([JSON.stringify(pack(),null,2)+'\n'],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;
   link.download=(online?'教師教材草稿-':'教師影片標註-')+new Date().toISOString().slice(0,10)+'.json';
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   if(!online)saved=serialized();
   message('已送出標註檔下載。'+(online?'下載檔案不會儲存線上草稿。':'請到「下載項目」確認 JSON 檔案。'));
  }
  fileInput.onchange=async()=>{
   const file=fileInput.files[0];fileInput.value='';if(!file)return;
   try{
    if(file.size>1024*1024)throw Error('標註檔太大，請選擇本工具匯出的 JSON。');
    const payload=JSON.parse(await file.text()),data=validate(payload,manifest);
    if(dirty()&&!window.confirm('匯入會取代目前未儲存的變更。確定繼續嗎？'))return;
    cancel();
    if(payload.slides!==undefined)slideEdits?.replace(payload.slides);
    player.replace(data.arrows);if(!online)saved=serialized();refresh();content?.refresh();
    message('已匯入 '+data.arrows.length+' 個箭頭。'+(online?'請儲存草稿。':''));
   }catch(e){message('無法匯入：'+(e instanceof SyntaxError?'請選擇有效的 JSON 標註檔。':e.message),true);}
  };
  const options=online?online.connect({
   pack,dirty,message,
   load(data){cancel();slideEdits?.replace(data.slides);player.replace(validate(data,manifest).arrows);saved=serialized();refresh();content?.refresh();},
   markSaved(data){saved=JSON.stringify(data);}
  }):[];
  for(const button of options)button.dataset.teacherAction='';
  document.querySelector('.header-actions').prepend(...options,makeButton('匯入標註',()=>fileInput.click()),makeButton('下載標註',exportFile),fileInput);
  window.addEventListener('beforeunload',event=>{
   if(dirty()){event.preventDefault();event.returnValue='';}
  });
  function refresh(viewer){
   if(!viewer){document.querySelectorAll('article:not([hidden]) .viewer').forEach(refresh);return;}
   const c=controls.get(viewer);if(!c)return;
   const {page,view,key}=player.identity(viewer),before=c.select.value;
   const rows=player.arrows.filter(a=>a.page===page&&a.view===view&&a.key===key);
   c.select.replaceChildren(new Option('選取箭頭',''),...rows.map((a,i)=>new Option(`${i+1}. 第 ${a.first}–${a.last} 張`,a.id)));
   c.select.value=rows.some(a=>a.id===before)?before:'';
   fields(viewer);
  }
  function fields(viewer){
   const c=controls.get(viewer),a=player.arrows.find(a=>a.id===c.select.value);
   c.fields.hidden=!a;if(!a)return;
   c.first.value=a.first;c.last.value=a.last;c.color.value=a.color;
   c.first.max=c.last.max=manifest.frames[a.key];
  }
  function cancel(){
   if(!active)return;
   const viewer=active,c=controls.get(viewer);
   active=null;drag=null;c.hit.hidden=true;c.draw.textContent='畫箭頭';player.draft(viewer,null);
  }
  function apply(values){
   player.replace(validate({...pack(),arrows:values},manifest).arrows);refresh();
   message(online?'標註已修改。完成後請按「儲存草稿」。':'標註已修改。完成後請按「下載標註」。');
  }
  function mount(viewer){
   const stage=viewer.querySelector('.video-stage'),video=viewer.querySelector('video');
   const hit=document.createElement('div');hit.className='teacher-arrow-hit';hit.hidden=true;hit.setAttribute('aria-hidden','true');stage.append(hit);
   const draw=makeButton('畫箭頭',()=>{
    if(active===viewer){cancel();return;}
    if(!player.context(viewer)||video.seeking||video.readyState<2){message('影片還沒定位完成，請稍等再畫。',true);return;}
    cancel();video.pause();active=viewer;
    surface(hit,stage,player.context(viewer));hit.hidden=false;draw.textContent='取消畫箭頭';
    message('從箭尾拖曳到要指出的位置。預設只在目前影格顯示。');
   });
   viewer.querySelector('.video-tools').append(draw);
   const panel=document.createElement('div');panel.className='teacher-arrow-controls';
   const select=document.createElement('select');select.setAttribute('aria-label','本影片的箭頭');
   const opts=document.createElement('div');opts.className='teacher-arrow-settings';opts.hidden=true;
   const field=(name,type)=>{
    const label=document.createElement('label'),input=document.createElement('input');
    input.type=type;if(type==='number'){input.min=1;input.step=1;}
    label.append(name,input);opts.append(label);return input;
   };
   const first=field('起始張', 'number'),last=field('結束張','number'),color=field('箭頭顏色','color');
   opts.append(makeButton('套用',()=>{
    try{
     const id=select.value;
     apply(player.arrows.map(a=>a.id===id?{...a,first:first.valueAsNumber,last:last.valueAsNumber,color:color.value}:a));
    }catch(e){message(e.message,true);}
   }),makeButton('前往起始張',()=>{
    const a=player.arrows.find(row=>row.id===select.value);
    if(!a||video.readyState<1)return;
    video.pause();video.currentTime=(a.first-1+.25)/media[a.key].fps;
   }),makeButton('刪除箭頭',()=>apply(player.arrows.filter(a=>a.id!==select.value))));
   panel.append(select,opts);viewer.querySelector('.video-tools').after(panel);
   controls.set(viewer,{draw,hit,select,fields:opts,first,last,color});
   select.onchange=()=>fields(viewer);
   const clamp=x=>Math.max(0,Math.min(1,x));
   const point=(e,c)=>({x:clamp((e.clientX-c.left)/c.width),y:clamp((e.clientY-c.top)/c.height)});
   hit.onpointerdown=e=>{
    if(active!==viewer||drag||e.button!==0)return;
    const c=player.context(viewer);if(!c||video.seeking||video.readyState<2)return;
    e.preventDefault();drag={pointer:e.pointerId,c,...point(e,c)};hit.setPointerCapture(e.pointerId);
   };
   function pending(e){
    if(!drag||e.pointerId!==drag.pointer||active!==viewer)return null;
    const {c,x,y}=drag,p=point(e,c);
    return {page:c.page,view:c.view,key:c.key,first:c.frame,last:c.frame,x1:x,y1:y,x2:p.x,y2:p.y,color:'#ffda36'};
   }
   hit.onpointermove=e=>{const a=pending(e);if(a)player.draft(viewer,a);};
   hit.onpointerup=e=>{
    const a=pending(e);if(!a)return;
    const {width,height}=drag.c;cancel();
    if(Math.hypot((a.x2-a.x1)*width,(a.y2-a.y1)*height)<8)return;
    try{
     const id=crypto.randomUUID();
     apply([...player.arrows,{id,...a}]);select.value=id;fields(viewer);
    }catch(error){message(error.message,true);}
   };
   hit.onpointercancel=()=>cancel();
   video.addEventListener('emptied',()=>{if(active===viewer)cancel();refresh(viewer);});
   video.addEventListener('loadeddata',()=>refresh(viewer));
   video.addEventListener('seeking',()=>{if(active===viewer)cancel();});
   new ResizeObserver(()=>{if(active===viewer){if(drag)cancel();else{const c=player.context(viewer);if(c)surface(hit,stage,c);}}}).observe(video);
   refresh(viewer);
  }
  document.addEventListener('deck:slide',()=>{cancel();refresh();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)cancel();});
  return {mount};
 }
 window.TeacherArrowEditor={start};
})();
