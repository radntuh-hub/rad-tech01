(() => {
 'use strict';
 const blank=()=>({text:{},layout:{},styles:{},imageArrows:{},boxes:{}});
 const record=o=>o&&typeof o==='object'&&!Array.isArray(o);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const within=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
 function validate(value,pages){
  const out=blank();if(value===undefined)return out;
  if(!record(value))throw Error('投影片編輯資料格式不正確。');
  let total=0;
  const target=id=>typeof id==='string'&&id.match(/^([a-z]+\/[1-9]\d?):(?:(text|image):(\d{1,3})|(box):([a-z0-9-]{1,64}))$/i);
  for(const group of Object.keys(out)){
   if(['imageArrows','boxes'].includes(group)&&value[group]===undefined)continue;
   if(!record(value[group]))throw Error('投影片編輯資料格式不正確。');
   const entries=Object.entries(value[group]);
   if(entries.length>1200)throw Error('編輯項目過多。');
   for(const [id,item] of entries.sort(([a],[b])=>a.localeCompare(b))){
    if(group==='imageArrows'){
     const {image,x1,y1,x2,y2,color}=item||{},match=target(image);
     if(!/^[a-z0-9-]{1,64}$/i.test(id)||!match||match[2]!=='image'||!Object.hasOwn(pages,match[1])||
      ![x1,y1,x2,y2].every(n=>within(n,0,1))||Math.hypot(x2-x1,y2-y1)<.001||
      typeof color!=='string'||!/^#[a-f0-9]{6}$/i.test(color))throw Error('圖片箭頭的位置或顏色不正確。');
     out.imageArrows[id]={image,x1,y1,x2,y2,color};continue;
    }
    const match=target(id);
    if(!match||!Object.hasOwn(pages,match[1])||(group!=='layout'&&match[2]!=='text'&&match[4]!=='box')||
     (match[4]==='box'&&!Object.hasOwn(value.boxes||{},id)))
     throw Error('投影片或項目代號不正確。');
    if(group==='boxes'){
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
  return out;
 }
 const nonempty=state=>Object.values(state).some(group=>Object.keys(group).length);
 const selector='h1,h2,h3,h4,p,li,th,td,figcaption,legend,summary,dt,dd,strong,em';
 const custom=['--deck-edit-size','--deck-edit-color','--deck-edit-weight','--deck-edit-x','--deck-edit-y'];
 function mount(chapters){
  const root=document.querySelector('main'),items=new Map(),onPage=new Map(),pages={},imageLayers=new WeakMap();
  const {contentBox,surface,draw}=window.TeachingArrows;
  for(const article of root.querySelectorAll('article')){
   const page=article.dataset.case+'/'+article.dataset.pageInCase;pages[page]=true;
   const list=[];
   function add(node,kind,i){
    const item={id:page+':'+kind+':'+i,node,kind,article,original:kind==='text'?node.textContent:null,
     movable:kind==='image'||!node.closest('table, figure, button, a, summary, fieldset, strong, em')};
    items.set(item.id,item);list.push(item);return item;
   }
   [...article.querySelectorAll(selector)].filter(node=>!node.children.length&&node.textContent.trim()&&
    !node.closest('.eyebrow,.viewer,.refs,.feedback,.course-feedback,button,a,template'))
    .forEach((node,i)=>add(node,'text',i));
   [...article.querySelectorAll('figure')].filter(node=>node.querySelector('img[data-image]')).forEach((node,i)=>add(node,'image',i));
   onPage.set(article,list);
  }
  let state=blank();
  const modified=new Set();
  function syncBoxes(){
   for(const [id,item] of items){
    if(item.added&&!Object.hasOwn(state.boxes||{},id)){
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
  }
  let zoomed=null,zoomRefresh;
  function zoom(button){
   const figure=button.closest('figure'),item=(onPage.get(figure?.closest('article'))||[]).find(item=>item.kind==='image'&&item.node===figure);
   zoomed=item?.id;
   if(!zoomRefresh&&marks(zoomed).length){
    const image=document.querySelector('#zoom-image'),stage=document.createElement('div');
    stage.className='deck-zoom-picture';image.before(stage);stage.append(image);
    const svg=layer(stage);
    zoomRefresh=()=>paintMarks(svg,stage,imageBox(image),marks(zoomed));
    image.addEventListener('load',zoomRefresh);new ResizeObserver(zoomRefresh).observe(image);
   }
   zoomRefresh?.();
  }
  function refresh(){
   const article=root.querySelector('article:not([hidden])');
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
   const next=validate(value,pages),currentKeys=new Set([next.text,next.layout,next.styles,next.boxes||{}].flatMap(group=>Object.keys(group)));
   state=next;syncBoxes();
   for(const id of new Set([...modified,...currentKeys])){
    const item=items.get(id);if(!item)continue;
    paintItem(item);if(item.node.tagName==='H1')title(item);
   }
   modified.clear();for(const id of currentKeys)modified.add(id);
   refresh();
  }
  window.addEventListener('resize',refresh);
  document.addEventListener('deck:slide',refresh);
  return {items,onPage,replace,place,pictureBox,paintPicture,zoom,get state(){return state;},get changes(){return nonempty(state)?state:undefined;}};
 }
 const api={blank,validate,nonempty,mount};
 if(typeof module==='object')module.exports=api;
 else window.TeachingSlideEdits=api;
})();
