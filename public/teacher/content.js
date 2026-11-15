(() => {
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function start(deck,message){
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
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='編輯內容';toggle.dataset.teacherAction='';
  toggle.setAttribute('aria-expanded','false');
  document.querySelector('.header-actions').prepend(toggle);
  let selected=null,moving=false,drawing=false,drag=null,undo=[],redo=[],typing=false;
  const active=()=>main.querySelector('article:not([hidden])');
  function finishMove(){
   if(drawing)deck.paintPicture(selected);
   moving=false;drawing=false;drag=null;
   selected?.node.classList.remove('deck-teacher-moving','deck-teacher-drawing');
   move.textContent='拖曳移動';move.setAttribute('aria-pressed','false');
   draw.textContent='在圖片畫箭頭';draw.setAttribute('aria-pressed','false');
  }
  function undoState(){
   undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
  }
  function choose(item){
   finishMove();typing=false;selected?.node.classList.remove('deck-teacher-selected');
   selected=item||null;selected?.node.classList.add('deck-teacher-selected');
   select.value=selected?.id||'';
   move.disabled=!selected?.movable||window.matchMedia('(max-width: 540px)').matches;reset.disabled=!selected;
   textFields.hidden=selected?.kind!=='text';
   photo.hidden=selected?.kind!=='image';
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
   undoState();
  }
  function refresh(){
   if(panel.hidden)return;
   const items=deck.onPage.get(active())||[];
   select.replaceChildren(new Option('請選擇文字或圖片',''),...items.map(item=>new Option(
    item.kind==='image'?'圖片：'+(item.node.querySelector('img')?.alt||item.id.split(':').at(-1)):
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
    if(redraw)refresh();else undoState();
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
   if(panel.hidden)choose(null);else refresh();
  };
  select.onchange=()=>choose(deck.items.get(select.value));
  text.onblur=()=>{typing=false;};
  text.oninput=()=>{
   if(!selected||!text.value.trim())return;
   update(next=>{
    if(text.value===selected.original)delete next.text[selected.id];
    else next.text[selected.id]=text.value;
   },{group:true,redraw:false});
  };
  function setStyle(key,value){
   if(!selected)return;
   update(next=>{
    const style={...next.styles[selected.id]};
    if(value===undefined)delete style[key];else style[key]=value;
    if(Object.keys(style).length)next.styles[selected.id]=style;else delete next.styles[selected.id];
   });
  }
  size.onchange=()=>setStyle('size',size.value?size.valueAsNumber:undefined);
  color.onchange=()=>setStyle('color',color.value);
  bold.onchange=()=>setStyle('bold',bold.checked);
  reset.onclick=()=>{if(selected)update(next=>{
   for(const group of Object.values(next))delete group[selected.id];
   for(const [id,a] of Object.entries(next.imageArrows))if(a.image===selected.id)delete next.imageArrows[id];
  });};
  panel.querySelector('[data-format-reset]').onclick=()=>{if(selected)update(next=>{delete next.styles[selected.id];});};
  undoButton.onclick=()=>restore(undo,redo);redoButton.onclick=()=>restore(redo,undo);
  move.onclick=()=>{
   if(!selected?.movable)return;
   if(moving){finishMove();return;}
   finishMove();
   moving=true;selected.node.classList.add('deck-teacher-moving');move.textContent='取消移動';move.setAttribute('aria-pressed','true');
   message('拖曳目前選取的文字或圖片。');
  };
  draw.onclick=()=>{
   if(drawing){finishMove();return;}
   if(!selected||!deck.pictureBox(selected)){message('圖片還沒載入完成。',true);return;}
   finishMove();
   drawing=true;selected.node.classList.add('deck-teacher-drawing');draw.textContent='取消畫箭頭';draw.setAttribute('aria-pressed','true');
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
   if(panel.hidden||e.target.closest('.viewer,.course-feedback,.refs'))return;
   const items=deck.onPage.get(active())||[];
   const candidates=items.filter(item=>item.node.contains(e.target));
   const item=candidates.find(item=>item.kind==='image')||candidates.at(-1);
   if(!item)return;
   e.preventDefault();e.stopPropagation();
   if(!moving&&!drawing)choose(item);
  },true);
  main.addEventListener('pointerdown',e=>{
   if((!moving&&!drawing)||drag||e.button!==0||!selected?.node.contains(e.target))return;
   const box=drawing?deck.pictureBox(selected):selected.article.getBoundingClientRect(),state=deck.state.layout[selected.id]||{x:0,y:0};
   if(!box?.width||!box.height)return;
   if(drawing&&(e.clientX<box.left||e.clientX>box.left+box.width||e.clientY<box.top||e.clientY>box.top+box.height))return;
   drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,box,state};
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
   else deck.place(selected,position(e));
  });
  main.addEventListener('pointerup',e=>{
   if(drag?.pointer!==e.pointerId)return;
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
  window.addEventListener('resize',refresh);
  return {refresh};
 }
 window.TeacherSlideEditor={start};
})();
