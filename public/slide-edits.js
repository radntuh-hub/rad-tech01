(() => {
 'use strict';
 const uploadTools=typeof module==='object'?require('./upload-model.js'):window.TeachingUploadModel;
 const blank=()=>({text:{},layout:{},styles:{},imageArrows:{},boxes:{},media:{},uploads:{}});
 const record=o=>o&&typeof o==='object'&&!Array.isArray(o);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const within=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
 function cleanCrop(c){
  if(!record(c)||!within(c.x,0,1)||!within(c.y,0,1)||!within(c.width,.01,1)||!within(c.height,.01,1)||
   c.x+c.width>1.000001||c.y+c.height>1.000001)throw Error('裁切範圍必須在原始影像內。');
  return {x:c.x,y:c.y,width:c.width,height:c.height};
 }
 function validate(value,pages){
  const out=blank();if(value===undefined)return out;
  if(!record(value))throw Error('投影片編輯資料格式不正確。');
  out.uploads=uploadTools.placements(value.uploads,pages);
  pages=uploadTools.extend({pages},out.uploads).pages;
  let total=0;
  const target=id=>typeof id==='string'&&id.match(/^([a-z]+\/[1-9]\d?):(?:(text|image|video):(\d{1,3})|(box):([a-z0-9-]{1,64}))$/i);
  for(const group of Object.keys(out)){
   if(group==='uploads')continue;
   if(['imageArrows','boxes','media'].includes(group)&&value[group]===undefined)continue;
   if(!record(value[group]))throw Error('投影片編輯資料格式不正確。');
   const entries=Object.entries(value[group]);
   if(entries.length>1200)throw Error('編輯項目過多。');
   for(const [id,item] of entries.sort(([a],[b])=>a.localeCompare(b))){
    if(group==='imageArrows'){
     const {image,x1,y1,x2,y2,color}=item||{},match=target(image);
     if(!/^[a-z0-9-]{1,64}$/i.test(id)||!match||match[2]!=='image'||!Object.hasOwn(pages,match[1])||
      (Number(match[3])>=100&&!Object.hasOwn(out.uploads,image))||
      ![x1,y1,x2,y2].every(n=>within(n,0,1))||Math.hypot(x2-x1,y2-y1)<.001||
      typeof color!=='string'||!/^#[a-f0-9]{6}$/i.test(color))throw Error('圖片箭頭的位置或顏色不正確。');
     out.imageArrows[id]={image,x1,y1,x2,y2,color};continue;
    }
    const match=target(id);
    if(!match||!Object.hasOwn(pages,match[1])||(!['layout','media'].includes(group)&&match[2]!=='text'&&match[4]!=='box')||
     (['image','video'].includes(match[2])&&Number(match[3])>=100&&!Object.hasOwn(out.uploads,id))||
     (match[4]==='box'&&!Object.hasOwn(value.boxes||{},id)))
     throw Error('投影片或項目代號不正確。');
    if(group==='media'){
     if(!['image','video'].includes(match[2])||!record(item)||!Number.isInteger(item.scale)||!within(item.scale,25,200)||
      (match[2]==='video'&&!pages[match[1]]?.[Number(match[3])]))throw Error('圖片或影片的縮放比例需在 25% 到 200% 之間。');
     let crop,crops;
     if(item.crop!==undefined){
      if(match[2]!=='image')throw Error('影片裁切必須指定序列。');
      crop=cleanCrop(item.crop);
     }
     if(item.crops!==undefined){
      if(match[2]!=='video'||!record(item.crops))throw Error('影片裁切序列不正確。');
      crops={};for(const [key,c] of Object.entries(item.crops).sort(([a],[b])=>a.localeCompare(b))){
       if(!pages[match[1]][Number(match[3])].includes(key))throw Error('影片裁切序列不正確。');
       crops[key]=cleanCrop(c);
      }
      if(!Object.keys(crops).length)crops=undefined;
     }
     if(item.scale!==100||crop||crops)out.media[id]={scale:item.scale,...(crop?{crop}:{}),...(crops?{crops}:{})};
    }else if(group==='boxes'){
     if(match[4]!=='box'||!record(item)||typeof item.text!=='string'||item.text.length>4000||
      !within(item.x,0,1)||!within(item.y,0,1)||!within(item.width,.15,1)||item.x+item.width>1.001)
      throw Error('新增文字方塊的文字、位置或寬度不正確。');
     total+=item.text.length;out.boxes[id]={text:item.text,x:item.x,y:item.y,width:item.width};
    }else if(group==='text'){
     if(typeof item!=='string'||item.length>4000)throw Error('文字不可超過 4000 字。');
     total+=item.length;out.text[id]=item;
    }else if(group==='layout'){
     if(!record(item)||!within(item.x,-1,1)||!within(item.y,-1,1))throw Error('移動位置超出範圍。');
     if(item.x||item.y)out.layout[id]={x:item.x,y:item.y};
    }else{
     if(!record(item))throw Error('文字格式不正確。');
     const style={};
     if(item.size!==undefined){
      if(!Number.isInteger(item.size)||!within(item.size,12,48))throw Error('字級需在 12 到 48 之間。');
      style.size=item.size;
     }
     if(item.color!==undefined){
      if(typeof item.color!=='string'||!/^#[a-f0-9]{6}$/i.test(item.color))throw Error('文字顏色不正確。');
      style.color=item.color;
     }
     if(item.bold!==undefined){
      if(typeof item.bold!=='boolean')throw Error('粗體設定不正確。');
      style.bold=item.bold;
     }
     if(Object.keys(style).length)out.styles[id]=style;
    }
   }
  }
  if(total>90000)throw Error('草稿文字過長。');
  if(!Object.keys(out.boxes).length)delete out.boxes;
  if(!Object.keys(out.media).length)delete out.media;
  if(!Object.keys(out.uploads).length)delete out.uploads;
  return out;
 }
 const nonempty=state=>Object.values(state).some(group=>Object.keys(group).length);
 const selector='h1,h2,h3,h4,p,li,th,td,figcaption,legend,summary,dt,dd,strong,em';
 function editableTexts(article){
  const existing=[...article.querySelectorAll(selector)].filter(node=>!node.children.length&&node.textContent.trim()&&
   !node.closest('.eyebrow,.viewer,.refs,.feedback,.course-feedback,button,a,template'));
  // Append newly editable notices so existing saved text IDs never shift.
  return [...existing,...[...article.querySelectorAll('.course-feedback p')].filter(node=>!node.children.length&&node.textContent.trim())];
 }
 const custom=['--deck-edit-size','--deck-edit-color','--deck-edit-weight','--deck-edit-x','--deck-edit-y'];
 const scaledWidth=(base,available,percent)=>Math.min(base*percent/100,available);
 function mount(chapters){
  const root=document.querySelector('main'),items=new Map(),onPage=new Map(),pages={},imageLayers=new WeakMap();
  const {contentBox,surface,draw}=window.TeachingArrows;
  for(const article of root.querySelectorAll('article')){
   const page=article.dataset.case+'/'+article.dataset.pageInCase;
   pages[page]=[...article.querySelectorAll('.viewer')].map(node=>node.dataset.series.split(','));
   const list=[];
   function add(node,kind,i){
    const item={id:page+':'+kind+':'+i,node,kind,article,original:kind==='text'?node.textContent:null,
     movable:kind!=='video'&&(kind==='image'||!node.closest('table, figure, button, a, summary, fieldset, strong, em, .course-feedback'))};
    items.set(item.id,item);list.push(item);return item;
   }
   editableTexts(article).forEach((node,i)=>add(node,'text',i));
   [...article.querySelectorAll('figure')].filter(node=>node.querySelector('img[data-image]')).forEach((node,i)=>add(node,'image',i));
   [...article.querySelectorAll('.viewer')].forEach((node,i)=>add(node,'video',i));
   onPage.set(article,list);
  }
  let state=blank(),mediaHooks=null;
  const originals=new Map([...items].filter(([,item])=>['image','video'].includes(item.kind)).map(([id,item])=>[id,{
   image:item.node.querySelector('img')?.dataset.image,series:item.node.dataset.series,initial:item.node.dataset.initial
  }]));
  const applied=new Map();
  const modified=new Set();
  function resizeMedia(item){
   if(!['image','video'].includes(item.kind))return;
   const element=item.node.querySelector(item.kind==='image'?'img[data-image]':'video');
   if(!element)return;
   if(element.closest('.inspection-video'))return;
   const oldWindow=element.closest('.deck-crop-window');
   if(oldWindow)oldWindow.replaceWith(element);
   element.classList.remove('deck-cropped-media');
   for(const name of ['--deck-crop-left','--deck-crop-top'])element.style.removeProperty(name);
   element.classList.remove('deck-resized-media');element.style.removeProperty('--deck-media-width');
   const setting=state.media?.[item.id];
   if(!setting||item.article.hidden)return;
   const {scale}=setting,crop=cropFor(item.node);
   const width=item.kind==='image'?element.naturalWidth:element.videoWidth;
   const height=item.kind==='image'?element.naturalHeight:element.videoHeight;
   if(!width||!height)return;
   const base=contentBox(element.getBoundingClientRect(),width,height);
   const available=(item.kind==='image'?item.node:item.node.querySelector('.video-stage')).clientWidth;
   if(!base||!available)return;
   const rendered=scaledWidth(base.width,available,scale);
   element.style.setProperty('--deck-media-width',rendered+'px');
   element.classList.add('deck-resized-media');
   if(crop){
    const frame=document.createElement('span');frame.className='deck-crop-window';
    frame.style.width=rendered*crop.width+'px';frame.style.height=rendered*height/width*crop.height+'px';
    element.before(frame);frame.append(element);element.classList.add('deck-cropped-media');
    element.style.setProperty('--deck-crop-left',-crop.x*rendered+'px');
    element.style.setProperty('--deck-crop-top',-crop.y*rendered*height/width+'px');
   }
  }
  for(const item of items.values()){
   if(!['image','video'].includes(item.kind))continue;
   item.node.querySelector(item.kind==='image'?'img[data-image]':'video')?.addEventListener(
    item.kind==='image'?'load':'loadedmetadata',()=>{resizeMedia(item);refresh();});
  }
  function syncBoxes(){
   for(const [id,item] of items){
    if(item.added&&!item.uploaded&&!Object.hasOwn(state.boxes||{},id)){
     item.node.remove();items.delete(id);onPage.set(item.article,onPage.get(item.article).filter(row=>row!==item));
    }
   }
   for(const [id,box] of Object.entries(state.boxes||{})){
    let item=items.get(id);
    if(!item){
     const page=id.split(':')[0],article=[...onPage.keys()].find(a=>a.dataset.case+'/'+a.dataset.pageInCase===page);
     if(!article)continue;
     const node=document.createElement('div');node.className='deck-added-text';article.append(node);
     item={id,node,article,kind:'text',original:box.text,movable:true,added:true};
     items.set(id,item);onPage.get(article).push(item);
    }
    item.original=box.text;
    item.node.style.left=box.x*100+'%';item.node.style.top=box.y*100+'%';item.node.style.width=box.width*100+'%';
   }
   for(const article of onPage.keys())article.classList.toggle('deck-has-boxes',onPage.get(article).some(item=>item.added));
  }
  function syncUploads(){
   if(!mediaHooks)return;
   const uploads=state.uploads||{};
   for(const [id,item] of [...items]){
    if(item.uploaded&&!uploads[id]){
     mediaHooks.remove(item);item.node.remove();items.delete(id);applied.delete(id);
     onPage.set(item.article,onPage.get(item.article).filter(row=>row!==item));
    }
   }
   for(const id of new Set([...applied.keys(),...Object.keys(uploads)])){
    const asset=uploads[id],stamp=JSON.stringify(asset||null);if(applied.get(id)===stamp)continue;
    let item=items.get(id);
    if(!item&&asset){
     const [page,kind,index]=id.split(':'),article=[...onPage.keys()].find(a=>a.dataset.case+'/'+a.dataset.pageInCase===page);
     if(!article||Number(index)<100)continue;
     const node=mediaHooks.create(kind,article,index);
     item={id,node,kind,article,movable:true,added:true,uploaded:true};items.set(id,item);onPage.get(article).push(item);
     node.querySelector(kind==='image'?'img':'video').addEventListener(kind==='image'?'load':'loadedmetadata',refresh);
    }
    if(!item)continue;
    mediaHooks.apply(item,asset,originals.get(id));applied.set(id,stamp);
   }
  }
  function paintItem(item){
   const {id,node,kind}=item,s=state.styles[id];
   if(kind==='text'){
    const text=state.text[id]??item.original;
    if(node.textContent!==text)node.textContent=text;
    node.classList.toggle('deck-edited-copy',text!==item.original);
   }
   for(const name of custom)node.style.removeProperty(name);
   node.classList.toggle('deck-edited-size',s?.size!==undefined);
   node.classList.toggle('deck-edited-color',s?.color!==undefined);
   node.classList.toggle('deck-edited-weight',s?.bold!==undefined);
   if(s?.size)node.style.setProperty(custom[0],s.size+'px');
   if(s?.color)node.style.setProperty(custom[1],s.color);
   if(s?.bold!==undefined)node.style.setProperty(custom[2],s.bold?'700':'400');
   resizeMedia(item);
   place(item,state.layout[id]);
  }
  function place({node,article,movable,kind},position){
   node.style.removeProperty(custom[3]);node.style.removeProperty(custom[4]);
   node.classList.toggle('deck-edited-position',!!position&&movable);
   node.classList.toggle('deck-edited-fit',!!position&&movable&&kind==='text'&&!node.closest('ul,ol,dl')&&!node.classList.contains('deck-added-text'));
   if(!position||!movable||article.hidden)return;
   const parent=article.getBoundingClientRect(),box=node.getBoundingClientRect();
   if(!parent.width||!parent.height||!box.width||!box.height)return;
   const x=clamp(position.x*parent.width,parent.left-box.left,Math.max(parent.left-box.left,parent.right-box.right));
   const y=clamp(position.y*parent.height,parent.top-box.top,Math.max(parent.top-box.top,parent.bottom-box.bottom));
   node.style.setProperty(custom[3],x+'px');node.style.setProperty(custom[4],y+'px');
   return {x:clamp(x/parent.width,-1,1),y:clamp(y/parent.height,-1,1)};
  }
  const picture=item=>item.node.querySelector('img[data-image]');
  function imageBox(image){
   return image?.naturalWidth?contentBox(image.getBoundingClientRect(),image.naturalWidth,image.naturalHeight):null;
  }
  function pictureBox(item){
   return imageBox(picture(item));
  }
  const marks=id=>Object.values(state.imageArrows).filter(a=>a.image===id);
  const cropFor=node=>{
   const item=[...items.values()].find(item=>item.node===node),setting=state.media?.[item?.id];
   return item?.kind==='video'?setting?.crops?.[node.querySelector('video').dataset.key]:setting?.crop;
  };
  function paintMarks(svg,stage,box,arrows){
   svg.toggleAttribute('hidden',!box||!arrows.length);
   if(!box||!arrows.length)return;
   surface(svg,stage,box);
   svg.replaceChildren();for(const arrow of arrows)draw(svg,arrow,box.width,box.height);
  }
  function layer(stage){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.classList.add('deck-image-arrow-layer');svg.setAttribute('aria-hidden','true');stage.append(svg);return svg;
  }
  function paintPicture(item,draft){
   if(item?.kind!=='image')return;
   const {node,article}=item;
   const arrows=marks(item.id);
   if(draft)arrows.push(draft);
   let svg=imageLayers.get(node);
   if(!arrows.length){if(svg)svg.setAttribute('hidden','');return;}
   if(!svg){
    svg=layer(node);
    node.classList.add('deck-annotated-picture');imageLayers.set(node,svg);
    picture(item).addEventListener('load',()=>paintPicture(item));
    new ResizeObserver(()=>paintPicture(item)).observe(picture(item));
   }
   paintMarks(svg,node,!article.hidden&&pictureBox(item),arrows);
   window.TeachingArrows.clip(svg,state.media?.[item.id]?.crop);
  }
  let zoomed=null,zoomRefresh;
  function zoom(button){
   const figure=button.closest('figure'),item=(onPage.get(figure?.closest('article'))||[]).find(item=>item.kind==='image'&&item.node===figure);
   zoomed=item?.id;
   if(!zoomRefresh&&marks(zoomed).length){
    const image=document.querySelector('#zoom-image');
    let stage=image.closest('.inspection-viewport');
    if(!stage){stage=document.createElement('div');stage.className='deck-zoom-picture';image.before(stage);stage.append(image);}
    const svg=layer(stage);
    zoomRefresh=()=>{paintMarks(svg,stage,imageBox(image),marks(zoomed));window.TeachingArrows.clip(svg,state.media?.[zoomed]?.crop);};
    image.addEventListener('load',zoomRefresh);new ResizeObserver(zoomRefresh).observe(image);
   }
   zoomRefresh?.();
  }
  function refresh(){
   const article=root.querySelector('article:not([hidden])');
   for(const item of onPage.get(article)||[])resizeMedia(item);
   for(const item of onPage.get(article)||[]){
    if(state.layout[item.id])place(item,state.layout[item.id]);
    if(item.kind==='image')paintPicture(item);
   }
   const chapter=chapters.find(c=>c.id===article?.dataset.case);
   if(chapter){
    const options=document.querySelector('#topic').options;
    if(options.length===chapter.titles.length)for(let i=0;i<options.length;i++)options[i].textContent=(i+1)+'. '+chapter.titles[i];
   }
  }
  function title({article,node}){
   const chapter=chapters.find(c=>c.id===article.dataset.case),i=Number(article.dataset.pageInCase)-1;
   chapter.titles[i]=node.textContent;
   const link=document.querySelector('#contents [data-page="'+(chapter.start+i)+'"]');
   if(link)link.textContent=chapter.titles[i];
  }
  function replace(value){
   const next=validate(value,pages),currentKeys=new Set([next.text,next.layout,next.styles,next.boxes||{},next.media||{},next.uploads||{}].flatMap(group=>Object.keys(group)));
   state=next;syncBoxes();syncUploads();
   for(const id of new Set([...modified,...currentKeys])){
    const item=items.get(id);if(!item)continue;
    paintItem(item);if(item.node.tagName==='H1')title(item);
   }
   modified.clear();for(const id of currentKeys)modified.add(id);
   refresh();
  }
  window.addEventListener('resize',refresh);
  document.addEventListener('deck:slide',refresh);
  return {items,onPage,replace,place,pictureBox,paintPicture,zoom,cropFor,setMediaHooks(hooks){mediaHooks=hooks;syncUploads();refresh();},refreshZoom:()=>zoomRefresh?.(),get state(){return state;},get changes(){return nonempty(state)?state:undefined;}};
 }
 const api={blank,validate,nonempty,scaledWidth,editableTexts,mount};
 if(typeof module==='object')module.exports=api;
 else window.TeachingSlideEdits=api;
})();
