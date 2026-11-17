(() => {
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function start(deck,message){
  document.body.classList.add('deck-teacher');
  const main=document.querySelector('main'),panel=document.createElement('section');
  panel.className='content-editor';panel.hidden=true;
  panel.setAttribute('aria-label','投影片內容編輯');
  panel.innerHTML='<div class="content-editor-controls"><label>選取項目 <select data-items></select></label><button type="button" data-move>拖曳移動</button><button type="button" data-reset>還原此項</button><button type="button" data-undo>復原</button><button type="button" data-redo>重做</button></div><div data-text hidden><textarea aria-label="修改文字" rows="2" maxlength="4000"></textarea><div class="content-editor-controls"><label>字級 <input aria-label="字級" type="number" min="12" max="48" placeholder="原始"></label><label>文字顏色 <input type="color"></label><label><input type="checkbox"> 粗體</label><button type="button" data-format-reset>還原格式</button></div></div><div data-picture class="content-editor-controls" hidden><button type="button" data-draw>在圖片畫箭頭</button><label>圖上的箭頭 <select data-arrows></select></label><label>圖片箭頭顏色 <input type="color" value="#ffda36"></label><button type="button" data-remove-arrow>刪除箭頭</button></div>';
  main.before(panel);
  const select=panel.querySelector('[data-items]'),text=panel.querySelector('textarea');
  const move=panel.querySelector('[data-move]'),reset=panel.querySelector('[data-reset]'),undoButton=panel.querySelector('[data-undo]'),redoButton=panel.querySelector('[data-redo]');
  const textFields=panel.querySelector('[data-text]'),size=panel.querySelector('[type=number]'),color=textFields.querySelector('[type=color]'),bold=panel.querySelector('[type=checkbox]');
  const photo=panel.querySelector('[data-picture]'),draw=photo.querySelector('[data-draw]'),arrowMenu=photo.querySelector('[data-arrows]'),
   arrowColor=photo.querySelector('[type=color]'),removeArrow=photo.querySelector('[data-remove-arrow]');
  const inspect=document.createElement('button');inspect.type='button';inspect.textContent='Zoom 檢視';
  inspect.onclick=()=>selected?.node.querySelector('[data-zoom]')?.onclick();photo.prepend(inspect);
  const mediaFields=document.createElement('div');mediaFields.className='content-editor-controls';mediaFields.hidden=true;
  mediaFields.innerHTML='<button type="button" data-smaller title="縮小版面尺寸" aria-label="縮小版面尺寸">-</button><label>版面尺寸 <input type="range" min="25" max="200" step="1" aria-label="版面尺寸"></label><button type="button" data-larger title="放大版面尺寸" aria-label="放大版面尺寸">+</button><label><input type="number" min="25" max="200" step="1" aria-label="縮放百分比"> %</label><button type="button" data-scale-reset>還原尺寸</button>';
  panel.append(mediaFields);
  const scale=mediaFields.querySelector('[type=range]'),percent=mediaFields.querySelector('[type=number]');
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='編輯內容';toggle.dataset.teacherAction='';
  toggle.setAttribute('aria-expanded','false');
  document.querySelector('.header-actions').prepend(toggle);
  const add=document.createElement('button'),remove=document.createElement('button');
  add.type=remove.type='button';add.textContent='新增文字方塊';remove.textContent='刪除文字方塊';remove.hidden=true;
  panel.querySelector('.content-editor-controls').prepend(add,remove);
  const handles=document.createElement('div');handles.className='deck-selection-tools';handles.hidden=true;
  handles.innerHTML='<button type="button" title="拖曳移動選取項目" aria-label="拖曳移動選取項目">移動</button>';
  const handle=handles.querySelector('button');
  let selected=null,moving=false,drawing=false,drag=null,undo=[],redo=[],typing=false,composing=false,suppressClick=false;
  const active=()=>main.querySelector('article:not([hidden])');
  function editable(item,on){
   if(item?.kind!=='text')return;
   if(on){item.node.setAttribute('contenteditable','plaintext-only');item.node.setAttribute('spellcheck','false');}
   else {item.node.removeAttribute('contenteditable');item.node.removeAttribute('spellcheck');}
  }
  function positionHandle(){
   handles.hidden=panel.hidden||!selected?.movable||selected.article.hidden||drawing;
   if(handles.hidden)return;
   const box=selected.node.getBoundingClientRect(),parent=selected.article.getBoundingClientRect();
   selected.article.classList.add('deck-editing-page');selected.article.append(handles);
   handles.style.left=Math.max(0,Math.min(parent.width-64,box.left-parent.left))+'px';
   handles.style.top=Math.max(-24,box.top-parent.top-30)+'px';
  }
  function finishMove(){
   if(drawing)deck.paintPicture(selected);
   moving=false;drawing=false;drag=null;
   selected?.node.classList.remove('deck-teacher-moving','deck-teacher-drawing');
   move.textContent='拖曳移動';move.setAttribute('aria-pressed','false');
   draw.textContent='在圖片畫箭頭';draw.setAttribute('aria-pressed','false');
   editable(selected,!panel.hidden);positionHandle();
  }
  function undoState(){
   undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
  }
  function choose(item){
   finishMove();typing=false;editable(selected,false);selected?.node.classList.remove('deck-teacher-selected');
   selected=item||null;selected?.node.classList.add('deck-teacher-selected');
   select.value=selected?.id||'';
   editable(selected,!panel.hidden);remove.hidden=!selected?.added;remove.textContent=selected?.uploaded?'刪除新增素材':'刪除文字方塊';
   uploadUI?.select(selected);
   move.disabled=!selected?.movable||window.matchMedia('(max-width: 540px)').matches;reset.disabled=!selected;
   textFields.hidden=selected?.kind!=='text';
   photo.hidden=selected?.kind!=='image';
   mediaFields.hidden=!['image','video'].includes(selected?.kind);
   if(!mediaFields.hidden)scale.value=percent.value=deck.state.media?.[selected.id]?.scale??100;
   if(!photo.hidden){
    const before=arrowMenu.value,arrows=Object.entries(deck.state.imageArrows).filter(([,a])=>a.image===selected.id);
    arrowMenu.replaceChildren(new Option('選取箭頭',''),...arrows.map(([id],i)=>new Option('箭頭 '+(i+1),id)));
    arrowMenu.value=arrows.some(([id])=>id===before)?before:'';
    arrowFields();
   }
   if(selected?.kind==='text'){
    const style=deck.state.styles[selected.id]||{};
    text.value=selected.node.textContent;
    size.value=style.size??'';
    color.value=style.color??'#172820';
    bold.checked=style.bold??Number(getComputedStyle(selected.node).fontWeight)>=600;
   }
   undoState();positionHandle();
  }
  function refresh(){
   if(panel.hidden)return;
   const items=deck.onPage.get(active())||[];
   select.replaceChildren(new Option('請選擇文字、圖片或影片',''),...items.map(item=>new Option(
    item.kind==='image'?'圖片：'+(item.node.querySelector('img')?.alt||item.id.split(':').at(-1)):
    item.kind==='video'?'影片：'+(item.node.querySelector('video')?.getAttribute('aria-label')||item.node.dataset.series):
     item.node.textContent.trim().slice(0,52),item.id
   )));
   choose(items.includes(selected)?selected:null);
  }
  function update(change,{group=false,redraw=true}={}){
   const previous=copy(deck.state),next=copy(previous);change(next);
   if(JSON.stringify(previous)===JSON.stringify(next))return;
   try{
    deck.replace(next);
    if(!group||!typing){undo.push(previous);if(undo.length>80)undo.shift();}
    redo=[];typing=group;
    if(redraw)refresh();else {undoState();positionHandle();}
    message('內容已修改。完成後請按「儲存草稿」。');
   }catch(error){message(error.message,true);}
  }
  function restore(history,other){
   if(!history.length)return;
   other.push(copy(deck.state));deck.replace(history.pop());refresh();
   message('內容已修改。完成後請按「儲存草稿」。');
  }
  toggle.onclick=()=>{
   panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));
   toggle.textContent=panel.hidden?'編輯內容':'結束內容編輯';
   main.classList.toggle('deck-editing',!panel.hidden);
   document.body.classList.toggle('deck-content-open',!panel.hidden);
   if(panel.hidden)choose(null);else refresh();
  };
  select.onchange=()=>choose(deck.items.get(select.value));
  function setScale(value,group=false){
   if(!selected||mediaFields.hidden||!Number.isInteger(value)||value<25||value>200)return;
   if((deck.state.media?.[selected.id]?.scale??100)===value){scale.value=percent.value=value;return;}
   update(next=>{
    next.media??={};const setting={...next.media[selected.id],scale:value};
    if(value===100&&!setting.crop&&!setting.crops)delete next.media[selected.id];else next.media[selected.id]=setting;
   },{group,redraw:false});
   scale.value=percent.value=value;
  }
  scale.onpointerdown=()=>{typing=false;};
  scale.oninput=()=>setScale(Number(scale.value),true);
  scale.onchange=()=>{typing=false;};
  percent.oninput=()=>{if(percent.value&&percent.validity.valid)setScale(percent.valueAsNumber,true);};
  percent.onblur=()=>{typing=false;percent.value=deck.state.media?.[selected?.id]?.scale??100;};
  mediaFields.querySelector('[data-smaller]').onclick=()=>setScale(Math.max(25,Number(scale.value)-10));
  mediaFields.querySelector('[data-larger]').onclick=()=>setScale(Math.min(200,Number(scale.value)+10));
  mediaFields.querySelector('[data-scale-reset]').onclick=()=>setScale(100);
  deck.editCrop=(node,crop)=>{
   const item=[...deck.items.values()].find(item=>item.node===node);if(!item)return;
   update(next=>{
    next.media??={};const setting={scale:100,...next.media[item.id]};
    if(item.kind==='video'){
     const key=node.querySelector('video').dataset.key;setting.crops={...setting.crops};
     if(crop)setting.crops[key]=crop;else delete setting.crops[key];
     if(!Object.keys(setting.crops).length)delete setting.crops;
    }else if(crop)setting.crop=crop;else delete setting.crop;
    if(setting.scale===100&&!setting.crop&&!setting.crops)delete next.media[item.id];else next.media[item.id]=setting;
   });
   message('裁切已套用至草稿。請關閉檢視器後儲存草稿，學生版尚未更新。');
  };
  function mediaButton(item){
   if(item.kind!=='video')return;
   if(item.node.querySelector('.deck-video-size'))return;
   const button=document.createElement('button');button.type='button';button.textContent='調整版面尺寸';
   button.className='deck-video-size';button.onclick=()=>choose(item);
   item.node.querySelector('.video-tools').append(button);
  }
  for(const item of deck.items.values())mediaButton(item);
  document.addEventListener('deck:media-item',e=>{mediaButton(e.detail);refresh();});
  const uploadUI=window.TeacherUploads?.mount({panel,deck,active,update,choose,message});
  add.onclick=()=>{
   const article=active();if(!article)return;
   const id=article.dataset.case+'/'+article.dataset.pageInCase+':box:'+crypto.randomUUID();
   update(next=>{next.boxes??={};next.boxes[id]={text:'新增文字',x:.08,y:.2,width:.4};});
   refresh();choose(deck.items.get(id));
   if(selected){
    selected.node.focus();const range=document.createRange();range.selectNodeContents(selected.node);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
   }
  };
  remove.onclick=()=>{
   if(!selected?.added)return;
   const id=selected.id;choose(null);
   update(next=>{
    for(const group of ['boxes','text','layout','styles','media','uploads'])delete next[group]?.[id];
    for(const [key,a] of Object.entries(next.imageArrows))if(a.image===id)delete next.imageArrows[key];
   });
  };
  text.onblur=()=>{typing=false;};
  function changeText(value){
   if(!selected)return;
   update(next=>{
    if(selected.added){next.boxes[selected.id].text=value;delete next.text[selected.id];}
    else if(value===selected.original)delete next.text[selected.id];
    else next.text[selected.id]=value;
   },{group:true,redraw:false});
  }
  text.oninput=e=>{if(!e.isComposing)changeText(text.value);};
  text.addEventListener('compositionend',()=>changeText(text.value));
  main.addEventListener('compositionstart',()=>{composing=true;});
  main.addEventListener('compositionend',e=>{composing=false;inlineInput(e);});
  function inlineInput(e){
   if(panel.hidden||composing||e.isComposing||selected?.kind!=='text'||e.target!==selected.node)return;
   const value=selected.node.innerText;changeText(value);text.value=value;
  }
  main.addEventListener('input',inlineInput);
  main.addEventListener('focusout',()=>{typing=false;});
  function setStyle(key,value){
   if(!selected)return;
   update(next=>{
    const style={...next.styles[selected.id]};
    if(value===undefined)delete style[key];else style[key]=value;
    if(Object.keys(style).length)next.styles[selected.id]=style;else delete next.styles[selected.id];
   },{redraw:false});
  }
  size.onchange=()=>setStyle('size',size.value?size.valueAsNumber:undefined);
  size.oninput=()=>{if(!size.value||size.validity.valid)size.onchange();};
  color.onchange=()=>setStyle('color',color.value);
  bold.onchange=()=>setStyle('bold',bold.checked);
  reset.onclick=()=>{if(selected)update(next=>{
   for(const [key,group] of Object.entries(next))if(key!=='boxes'&&!(key==='uploads'&&selected.uploaded))delete group[selected.id];
   for(const [id,a] of Object.entries(next.imageArrows))if(a.image===selected.id)delete next.imageArrows[id];
  });};
  panel.querySelector('[data-format-reset]').onclick=()=>{if(selected)update(next=>{delete next.styles[selected.id];});};
  undoButton.onclick=()=>restore(undo,redo);redoButton.onclick=()=>restore(redo,undo);
  move.onclick=()=>{
   if(!selected?.movable)return;
   if(moving){finishMove();return;}
   finishMove();
   moving=true;selected.node.classList.add('deck-teacher-moving');move.textContent='取消移動';move.setAttribute('aria-pressed','true');
   editable(selected,false);
   message('拖曳目前選取的文字或圖片。');
  };
  draw.onclick=()=>{
   if(drawing){finishMove();return;}
   if(!selected||!deck.pictureBox(selected)){message('圖片還沒載入完成。',true);return;}
   finishMove();
   drawing=true;selected.node.classList.add('deck-teacher-drawing');draw.textContent='取消畫箭頭';draw.setAttribute('aria-pressed','true');
   positionHandle();
   message('在圖片內從箭尾拖到箭尖。');
  };
  function arrowFields(){
   const a=deck.state.imageArrows[arrowMenu.value];
   if(a)arrowColor.value=a.color;
   removeArrow.disabled=!a;
  }
  arrowMenu.onchange=arrowFields;
  arrowColor.onchange=()=>{if(arrowMenu.value)update(next=>{next.imageArrows[arrowMenu.value].color=arrowColor.value;});};
  removeArrow.onclick=()=>{if(arrowMenu.value)update(next=>{delete next.imageArrows[arrowMenu.value];});};
  main.addEventListener('click',e=>{
   if(panel.hidden||e.target.closest('.viewer,.course-feedback,.refs,.deck-selection-tools'))return;
   if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}
   const items=deck.onPage.get(active())||[];
   const candidates=items.filter(item=>item.node.contains(e.target));
   const item=candidates.find(item=>item.kind==='image')||candidates.at(-1);
   if(!item)return;
   if(item.kind==='image'||moving||drawing)e.preventDefault();
   e.stopPropagation();
   if(!moving&&!drawing&&selected!==item)choose(item);
   if(item.kind==='text'&&!moving&&!drawing)item.node.focus({preventScroll:true});
  },true);
  // Select on pointerdown so the browser can place the caret during the same click.
  main.addEventListener('pointerdown',e=>{
   if(panel.hidden||moving||drawing||e.target.closest('.viewer,.course-feedback,.refs,.deck-selection-tools'))return;
   const item=(deck.onPage.get(active())||[]).find(item=>item.kind==='text'&&item.node.contains(e.target));
   if(item&&item!==selected)choose(item);
  },true);
  handle.addEventListener('pointerdown',e=>{
   if(!selected?.movable||window.matchMedia('(max-width: 540px)').matches)return;
   finishMove();moving=true;editable(selected,false);selected.node.classList.add('deck-teacher-moving');
  });
  main.addEventListener('pointerdown',e=>{
   if((!moving&&!drawing)||drag||e.button!==0||(!selected?.node.contains(e.target)&&!handles.contains(e.target)))return;
   const box=drawing?deck.pictureBox(selected):selected.article.getBoundingClientRect(),state=deck.state.layout[selected.id]||{x:0,y:0};
   if(!box?.width||!box.height)return;
   const visible=drawing?window.TeachingArrows.croppedBox(box,deck.cropFor(selected.node)):box;
   if(drawing&&(e.clientX<visible.left||e.clientX>visible.left+visible.width||e.clientY<visible.top||e.clientY>visible.top+visible.height))return;
   suppressClick=false;drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,box,state};
   e.preventDefault();main.setPointerCapture(e.pointerId);
  });
  const clamp=x=>Math.max(-1,Math.min(1,x));
  const unit=x=>Math.max(0,Math.min(1,x));
  function imageArrow(e){
   const {box,x,y}=drag;
   return {image:selected.id,x1:unit((x-box.left)/box.width),y1:unit((y-box.top)/box.height),
    x2:unit((e.clientX-box.left)/box.width),y2:unit((e.clientY-box.top)/box.height),color:arrowColor.value};
  }
  function position(e){
   return {x:clamp(drag.state.x+(e.clientX-drag.x)/drag.box.width),y:clamp(drag.state.y+(e.clientY-drag.y)/drag.box.height)};
  }
  main.addEventListener('pointermove',e=>{
   if(drag?.pointer!==e.pointerId)return;
   if(drawing)deck.paintPicture(selected,imageArrow(e));
   else {deck.place(selected,position(e));positionHandle();}
  });
  main.addEventListener('pointerup',e=>{
   if(drag?.pointer!==e.pointerId)return;
   suppressClick=true;
   if(drawing){
    const a=imageArrow(e),{width,height}=drag.box;finishMove();
    if(Math.hypot((a.x2-a.x1)*width,(a.y2-a.y1)*height)<8)return;
    const id=crypto.randomUUID();update(next=>{next.imageArrows[id]=a;});
    arrowMenu.value=id;arrowFields();return;
   }
   const item=selected,value=deck.place(item,position(e));
   finishMove();
   if(value)update(next=>{if(value.x||value.y)next.layout[item.id]=value;else delete next.layout[item.id];});
  });
  main.addEventListener('pointercancel',()=>{
   if(!drag||!selected)return;
   if(moving)deck.place(selected,deck.state.layout[selected.id]);finishMove();
  });
  document.addEventListener('deck:slide',refresh);
  document.addEventListener('keydown',e=>{
   if(panel.hidden||e.isComposing||composing)return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();e.stopPropagation();restore(e.shiftKey?redo:undo,e.shiftKey?undo:redo);
   }
  });
  window.addEventListener('resize',refresh);
  return {refresh};
 }
 window.TeacherSlideEditor={start};
})();
