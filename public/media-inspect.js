(() => {
 'use strict';
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function bounds(width,height,contentWidth,contentHeight,scale,x,y){
  const mx=Math.max(0,(contentWidth*scale-width)/2),my=Math.max(0,(contentHeight*scale-height)/2);
  return {x:mx?clamp(x,-mx,mx):0,y:my?clamp(y,-my,my):0};
 }
 function mount(player,slides){
  const imageDialog=document.querySelector('#zoom'),image=document.querySelector('#zoom-image');
  const imageStage=document.createElement('div');imageStage.className='inspection-viewport deck-zoom-picture';
  image.before(imageStage);imageStage.append(image);imageDialog.classList.add('inspection-dialog');
  let opened=null,imageSource=null;
  function controls(stage,target,host,repaint,source){
   let scale=1,x=0,y=0,drag=null,moved=false,cropping=false,selection=null;
   const originalTransform=target.style.transform,originalClip=target.style.clipPath,originalControls=target.controls;
   const tools=document.createElement('div');tools.className='inspection-tools';tools.setAttribute('aria-label','影像檢視縮放');
   function button(symbol,label,action){
    const b=document.createElement('button');b.type='button';b.textContent=symbol;b.title=label;b.setAttribute('aria-label',label);b.onclick=action;tools.append(b);return b;
   }
   const minus=button('-','Zoom out',()=>set(scale-.25));
   const range=document.createElement('input');range.type='range';range.min=100;range.max=600;range.step=25;range.value=100;
   range.setAttribute('aria-label','Zoom 倍率');range.oninput=()=>set(Number(range.value)/100);tools.append(range);
   const plus=button('+','Zoom in',()=>set(scale+.25));
   const output=document.createElement('output');tools.append(output);
   button('顯示全圖','顯示全圖',()=>set(1));
   const cropButton=button('裁切畫面','裁切畫面',()=>{
    if(target.tagName==='VIDEO')target.pause();
    cropping=true;selection=null;scale=1;x=y=0;
    stage.closest('.viewer')?.dispatchEvent(new Event('media:zoom'));paint();
   });
   const apply=button('套用裁切','套用裁切',()=>{
    if(!selection||selection.width<.01||selection.height<.01)return;
    slides.editCrop(source(),selection);cropping=false;selection=null;set(1);
   });
   const cancel=button('取消裁切','取消裁切',()=>{cropping=false;selection=null;set(1);});
   const uncrop=button('還原裁切','還原裁切',()=>{slides.editCrop(source(),null);set(1);});
   const selectionBox=document.createElement('div');selectionBox.className='inspection-crop-selection';selectionBox.hidden=true;stage.append(selectionBox);
   let play,playState;
   if(target.tagName==='VIDEO'){
    play=button('播放','播放影片',()=>{if(target.paused)target.play().catch(()=>{});else target.pause();});
    playState=()=>{play.textContent=target.paused?'播放':'暫停';play.title=target.paused?'播放影片':'暫停影片';play.setAttribute('aria-label',play.title);};
    target.addEventListener('play',playState);target.addEventListener('pause',playState);playState();
   }
   host.insertBefore(tools,host.querySelector('button'));stage.tabIndex=0;stage.setAttribute('aria-label','影像檢視區，放大後可拖曳平移');
   function paint(){
    const width=stage.clientWidth,height=stage.clientHeight;
    const nw=target.naturalWidth||target.videoWidth,nh=target.naturalHeight||target.videoHeight;
    const fit=nw&&nh?Math.min(width/nw,height/nh):0;
    const cw=nw*fit||width,ch=nh*fit||height,crop=cropping?null:slides?.cropFor(source());
    const initial=crop?Math.min(width/(cw*crop.width),height/(ch*crop.height)):1;
    ({x,y}=bounds(width,height,cw*(crop?.width??1)*initial,ch*(crop?.height??1)*initial,scale,x,y));
    const tx=crop?-(crop.x+crop.width/2-.5)*cw*initial*scale:0,ty=crop?-(crop.y+crop.height/2-.5)*ch*initial*scale:0;
    target.style.transform=`translate(${x+tx}px, ${y+ty}px) scale(${scale*initial})`;
    target.style.clipPath=crop?`inset(${(height-ch)/2+crop.y*ch}px ${(width-cw)/2+(1-crop.x-crop.width)*cw}px ${(height-ch)/2+(1-crop.y-crop.height)*ch}px ${(width-cw)/2+crop.x*cw}px)`:'';
    stage.classList.toggle('inspection-pannable',scale>1&&!cropping);stage.classList.toggle('inspection-cropping',cropping);
    const editable=typeof slides?.editCrop==='function';cropButton.hidden=!editable||cropping;uncrop.hidden=!editable||cropping||!crop;
    apply.hidden=cancel.hidden=!cropping;apply.disabled=!selection||selection.width<.01||selection.height<.01;
    selectionBox.hidden=!cropping||!selection;
    if(!selectionBox.hidden)Object.assign(selectionBox.style,{left:((width-cw)/2+selection.x*cw)+'px',top:((height-ch)/2+selection.y*ch)+'px',width:selection.width*cw+'px',height:selection.height*ch+'px'});
    range.value=Math.round(scale*100);output.textContent=range.value+'%';minus.disabled=scale===1;plus.disabled=scale===6;
    range.disabled=cropping;minus.disabled||=cropping;plus.disabled||=cropping;
    if(play)target.controls=scale===1&&!crop&&!cropping&&originalControls;
    repaint();
    stage.querySelectorAll('svg').forEach(svg=>svg.style.visibility=cropping?'hidden':'');
   }
   function set(value){
    scale=clamp(Math.round(value*4)/4,1,6);if(scale===1)x=y=0;
    stage.closest('.viewer')?.dispatchEvent(new Event('media:zoom'));paint();
   }
   function down(e){
    if((scale===1&&!cropping)||e.button!==0||e.target.closest('.teacher-arrow-hit'))return;
    if(cropping){
     const box=window.TeachingArrows.contentBox(target.getBoundingClientRect(),target.naturalWidth||target.videoWidth,target.naturalHeight||target.videoHeight);
     if(!box||e.clientX<box.left||e.clientX>box.left+box.width||e.clientY<box.top||e.clientY>box.top+box.height)return;
     drag={id:e.pointerId,box,x:clamp((e.clientX-box.left)/box.width,0,1),y:clamp((e.clientY-box.top)/box.height,0,1)};
     stage.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();return;
    }
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:x,oy:y};moved=false;
    stage.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
   }
   function move(e){
    if(drag?.id!==e.pointerId)return;
    if(cropping){
     const nx=clamp((e.clientX-drag.box.left)/drag.box.width,0,1),ny=clamp((e.clientY-drag.box.top)/drag.box.height,0,1);
     selection={x:Math.min(nx,drag.x),y:Math.min(ny,drag.y),width:Math.abs(nx-drag.x),height:Math.abs(ny-drag.y)};moved=true;paint();return;
    }
    x=drag.ox+e.clientX-drag.x;y=drag.oy+e.clientY-drag.y;
    moved||=Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3;paint();
   }
   const up=()=>{drag=null;};
   const click=e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}};
   function key(e){
    if(e.target!==stage)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&scale>1){
     e.preventDefault();e.stopPropagation();x+=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0;
     y+=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;paint();
    }else if(['+','=','-','Home'].includes(e.key)){
     e.preventDefault();e.stopPropagation();set(e.key==='Home'?1:scale+(e.key==='-'?-.25:.25));
    }
   }
   const reset=()=>{cropping=false;selection=null;set(1);};
   for(const [event,fn] of Object.entries({pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,click,keydown:key}))stage.addEventListener(event,fn);
   const observer=new ResizeObserver(paint);observer.observe(stage);
   const loadEvent=play?'loadedmetadata':'load';target.addEventListener(loadEvent,reset);
   paint();
   return {reset,destroy(){
    observer.disconnect();target.removeEventListener(loadEvent,reset);target.style.transform=originalTransform;target.style.clipPath=originalClip;
    if(play){target.controls=originalControls;target.removeEventListener('play',playState);target.removeEventListener('pause',playState);}
    for(const [event,fn] of Object.entries({pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,click,keydown:key}))stage.removeEventListener(event,fn);
    tools.remove();selectionBox.remove();stage.querySelectorAll('svg').forEach(svg=>svg.style.visibility='');stage.removeAttribute('tabindex');stage.removeAttribute('aria-label');stage.classList.remove('inspection-pannable','inspection-cropping');
   }};
  }
  const imageControl=controls(imageStage,image,imageDialog.querySelector('.dialog-top'),()=>slides?.refreshZoom(),()=>imageSource);
  function openVideo(viewer){
   if(opened)return;
   const article=viewer.closest('article'),placeholder=document.createComment('video inspection position');
   const dialog=document.createElement('dialog');dialog.className='inspection-dialog inspection-video';
   const top=document.createElement('div');top.className='dialog-top';
   const title=document.createElement('h2');title.textContent='影片細節檢視';
   const close=document.createElement('button');close.type='button';close.textContent='關閉';close.setAttribute('aria-label','關閉影片檢視');close.onclick=()=>dialog.close();
   top.append(title,close);dialog.append(top);article.append(dialog);
   viewer.before(placeholder);dialog.append(viewer);
   const stage=viewer.querySelector('.video-stage'),video=viewer.querySelector('video');
   stage.classList.add('inspection-viewport');dialog.showModal();
   const control=controls(stage,video,top,()=>player.paint(viewer),()=>viewer);
   opened={dialog,article};
   dialog.addEventListener('close',()=>{
    control.destroy();stage.classList.remove('inspection-viewport');placeholder.replaceWith(viewer);dialog.remove();opened=null;
    document.dispatchEvent(new Event('deck:slide'));
   },{once:true});
  }
  function video(viewer){
   const b=document.createElement('button');b.type='button';b.className='inspection-open-button';b.textContent='Zoom';b.title='Zoom in / Zoom out';b.setAttribute('aria-label','開啟影片 Zoom 檢視');
   b.onclick=()=>openVideo(viewer);viewer.querySelector('.video-tools').append(b);
  }
  document.addEventListener('deck:slide',()=>{if(opened?.article.hidden)opened.dialog.close();});
  return {image:button=>{imageSource=button.closest('figure');imageControl.reset();},video};
 }
 const api={bounds,mount};
 if(typeof module==='object')module.exports=api;else window.TeachingMediaInspect=api;
})();
