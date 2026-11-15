(() => {
 'use strict';
 function connect(editor){
  let state=window.TeacherArrowInitial,busy=false;
  const buttons=[];
  const button=(text,task)=>{
   const b=document.createElement('button');b.type='button';b.textContent=text;
   b.onclick=async()=>{
    if(busy)return;
    busy=true;refresh();
    try{await task();}catch(e){editor.message(e.message,true);}
    finally{busy=false;refresh();}
   };
   buttons.push(b);return b;
  };
  const counts=()=>`草稿第 ${state.draft.revision} 版 · 已發布 ${state.live.count} 支箭頭`;
  async function post(op,input={}){
   const response=await fetch('/api/arrows/'+op,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'暫時無法儲存，請重試。');
   return data;
  }
  button('儲存草稿',async()=>{
   const data=editor.pack();
   state=await post('draft',{revision:state.draft.revision,data});
   editor.markSaved(data);
   editor.message('已儲存草稿，學生版未更新。'+(editor.dirty()?' 尚有更新未儲存。':' ')+counts());
  });
  let rollback;
  if(state.role==='admin'){
   button('發布到學生版',async()=>{
    if(editor.dirty())throw Error('請先儲存目前修改，再發布。');
    if(!window.confirm('確定將這份草稿發布給學生？學生重新整理後會看到更新。'))return;
    state=await post('publish',{revision:state.draft.revision,liveRevision:state.live.revision});
    editor.message('學生版已更新。'+counts());
   });
   rollback=button('復原上一版',async()=>{
    if(!window.confirm('確定將公開學生版切換至上一次版本？草稿會保留。'))return;
    state=await post('rollback',{revision:state.draft.revision,liveRevision:state.live.revision});
    editor.message('已切換學生版。'+counts());
   });
  }
  button('登出',async()=>{
   if(editor.dirty()&&!window.confirm('有未儲存的箭頭。確定登出？'))return;
   await post('logout');editor.markSaved(editor.pack());location.replace('/teacher/');
  });
  function refresh(){for(const b of buttons)b.disabled=busy;if(rollback)rollback.disabled=busy||!state.canRollback;}
  editor.load(state.draft.data);editor.message((state.role==='admin'?'管理者':'教師')+' · '+counts());refresh();
  return buttons;
 }
 window.TeacherArrowOnline={connect};
})();
