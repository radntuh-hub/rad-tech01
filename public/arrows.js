(() => {
 'use strict';
 const format='radiology-video-arrows';
 const pageKey=a=>a.dataset.case+'/'+a.dataset.pageInCase;
 const fail=message=>{throw Error(message);};
 const unit=n=>Number.isFinite(n)&&n>=0&&n<=1;
 function validate(data,manifest){
  if(data?.format!==format||data.version!==1||data.course!==manifest.course)
   fail('這份標註不屬於目前的教材或影片版本。');
  if(!Array.isArray(data.arrows)||data.arrows.length>2000)fail('標註清單格式不正確。');
  const ids=new Set();
  return {format,version:1,course:manifest.course,arrows:data.arrows.map(a=>{
   const {id,page,view,key,first,last,x1,y1,x2,y2,color}=a||{};
   if(typeof id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(id)||ids.has(id)||
    typeof page!=='string'||typeof key!=='string'||!Number.isInteger(view)||view<0||
    !Object.hasOwn(manifest.pages,page)||!manifest.pages[page][view]?.includes(key))
    fail('投影片、影片或箭頭代號不正確。');
   if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>manifest.frames[key]||
    ![x1,y1,x2,y2].every(unit)||Math.hypot(x2-x1,y2-y1)<.001||
    typeof color!=='string'||!/^#[a-f\d]{6}$/i.test(color))
    fail('請檢查箭頭位置、顏色或顯示影格。');
   ids.add(id);
   return {id,page,view,key,first,last,x1,y1,x2,y2,color};
  })};
 }
 function contentBox(rect,width,height){
  const scale=Math.min(rect.width/width,rect.height/height);
  if(!Number.isFinite(scale)||scale<=0||!width||!height)return null;
  const w=width*scale,h=height*scale;
  return {left:rect.left+(rect.width-w)/2,top:rect.top+(rect.height-h)/2,width:w,height:h};
 }
 function surface(node,stage,box){
  const r=stage.getBoundingClientRect();
  Object.assign(node.style,{left:(box.left-r.left)+'px',top:(box.top-r.top)+'px',
   width:box.width+'px',height:box.height+'px'});
 }
 function croppedBox(box,crop){
  if(!box||!crop)return box;
  return {...box,left:box.left+crop.x*box.width,top:box.top+crop.y*box.height,width:box.width*crop.width,height:box.height*crop.height};
 }
 const frameAt=(time,video)=>Math.max(1,Math.min(Math.round(video.duration*video.fps),Math.floor(time*video.fps+.0001)+1));
 const ns='http://www.w3.org/2000/svg';
 function clip(svg,crop){
  svg.style.clipPath=crop?`inset(${crop.y*100}% ${(1-crop.x-crop.width)*100}% ${(1-crop.y-crop.height)*100}% ${crop.x*100}%)`:'';
 }
 function draw(svg,a,w,h){
  const x=a.x1*w,y=a.y1*h,tx=a.x2*w,ty=a.y2*h,dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);
  if(len<1)return;
  const ux=dx/len,uy=dy/len,head=Math.min(20,len*.5),wide=head*.48;
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d',`M ${x} ${y} L ${tx} ${ty} M ${tx-ux*head-uy*wide} ${ty-uy*head+ux*wide} L ${tx} ${ty} L ${tx-ux*head+uy*wide} ${ty-uy*head-ux*wide}`);
  path.setAttribute('fill','none');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
  const outline=path.cloneNode();outline.setAttribute('stroke','#131717');outline.setAttribute('stroke-width','7');svg.append(outline);
  path.setAttribute('stroke',a.color);path.setAttribute('stroke-width','4');svg.append(path);
 }
 function player(media,manifest){
  const layers=new WeakMap(),grouped=new Map(),identities=new WeakMap();
  let arrows=[];
  const keyFor=(page,view,key)=>[page,view,key].join(':');
  function identity(viewer){
   if(!identities.has(viewer)){
    const article=viewer.closest('article');
    identities.set(viewer,{page:pageKey(article),view:[...article.querySelectorAll('.viewer')].indexOf(viewer)});
   }
   return {...identities.get(viewer),key:viewer.querySelector('video').dataset.key};
  }
  function context(viewer){
   const v=viewer.querySelector('video'),key=v.dataset.key,m=media[key];
   if(!m||v.readyState<1||!v.videoWidth||!v.videoHeight)return null;
   const box=contentBox(v.getBoundingClientRect(),v.videoWidth,v.videoHeight);
   return box&&{...identity(viewer),...box,frame:frameAt(v.currentTime,m),max:manifest?.frames[key]};
  }
  function mount(viewer){
   identity(viewer);
   const stage=viewer.querySelector('.video-stage'),video=viewer.querySelector('video');
   const svg=document.createElementNS(ns,'svg');svg.classList.add('teaching-arrow-layer');svg.setAttribute('aria-hidden','true');svg.setAttribute('hidden','');stage.append(svg);
   const toggle=document.createElement('button');toggle.type='button';toggle.textContent='隱藏箭頭';toggle.hidden=true;
   const layer={stage,svg,toggle,visible:true,stamp:'',draft:null};layers.set(viewer,layer);
   toggle.onclick=()=>{layer.visible=!layer.visible;toggle.textContent=layer.visible?'隱藏箭頭':'顯示箭頭';paint(viewer);};
   viewer.querySelector('.video-tools').append(toggle);
   new ResizeObserver(()=>paint(viewer)).observe(video);
   paint(viewer);
  }
  function paint(viewer){
   const layer=layers.get(viewer);if(!layer)return;
   const {page,view,key}=identity(viewer),saved=grouped.get(keyFor(page,view,key))||[];
   layer.toggle.hidden=!saved.length;
   if(!saved.length&&!layer.draft){layer.svg.setAttribute('hidden','');return;}
   const box=context(viewer);
   if(!box){layer.svg.setAttribute('hidden','');return;}
   const shown=layer.visible?saved.filter(a=>a.first<=box.frame&&a.last>=box.frame):[];
   if(layer.draft)shown.push(layer.draft);
   layer.svg.toggleAttribute('hidden',!shown.length);
   if(!shown.length)return;
   surface(layer.svg,layer.stage,box);
   clip(layer.svg,apiView?.cropFor?.(viewer));
   const stamp=JSON.stringify([box.width,box.height,shown]);if(stamp===layer.stamp)return;
   layer.stamp=stamp;layer.svg.replaceChildren();
   for(const arrow of shown)draw(layer.svg,arrow,box.width,box.height);
  }
  const refresh=()=>document.querySelectorAll('article:not([hidden]) .viewer').forEach(paint);
  function replace(values){
   arrows=values;grouped.clear();
   for(const arrow of arrows){
    const key=keyFor(arrow.page,arrow.view,arrow.key);
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(arrow);
   }
   refresh();
  }
  let apiView=null;
  return {mount,paint,refresh,context,visibleContext:viewer=>croppedBox(context(viewer),apiView?.cropFor(viewer)),identity,replace,setSlides(value){apiView=value;},get arrows(){return arrows;},
   draft(viewer,value){layers.get(viewer).draft=value;paint(viewer);}};
 }
 const api={format,pageKey,validate,contentBox,surface,croppedBox,frameAt,draw,clip,player};
 if(typeof module==='object')module.exports=api;
 else window.TeachingArrows=api;
})();
