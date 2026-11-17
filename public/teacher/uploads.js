(() => {
 'use strict';
 function mount({panel,deck,active,update,choose,message}){
  const model=window.TeachingUploadModel,row=document.createElement('div');row.className='content-editor-controls';
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;row.append(b);return b;};
  let selected=null,destination=null,kind='',file=null,details=null,xhr=null;
  button('上傳圖片',()=>open('image'));button('上傳影片',()=>open('video'));
  const replace=button('替換選取素材',()=>open(selected.kind,selected));replace.hidden=true;
  panel.prepend(row);
  const dialog=document.createElement('dialog');dialog.className='teacher-upload-dialog';dialog.setAttribute('aria-label','上傳教學素材');
  dialog.innerHTML='<form><h2>上傳教學素材</h2><p data-hint></p><label>檔案 <input type="file" required aria-label="選擇上傳檔案"></label><label>顯示名稱 <input type="text" maxlength="180" required aria-label="素材顯示名稱"></label><label data-fps>影片 FPS <input type="number" value="30" min="1" max="120" step="any" aria-label="影片每秒影格數"></label><p data-frame-note>請填原始影片的 FPS，逐格定位與箭頭顯示時間會依此計算。</p><label><input type="checkbox" required> 已確認素材不含可辨識的病人個資，且可用於這份公開教材。</label><p role="status" data-status></p><progress max="100" value="0" hidden aria-label="上傳進度"></progress><div class="content-editor-controls"><button type="submit">上傳並加入草稿</button><button type="button" data-cancel>取消</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),input=form.querySelector('[type=file]'),name=form.querySelector('[type=text]'),fps=form.querySelector('[type=number]'),
   status=form.querySelector('[data-status]'),progress=form.querySelector('progress'),submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[data-cancel]');
  function busy(on){
   for(const field of form.querySelectorAll('input'))field.disabled=on;submit.disabled=on||!details;
   document.dispatchEvent(new CustomEvent('teacher:upload',{detail:on}));
  }
  function open(type,item){
   const article=active();if(!article)return;
   kind=type;destination=item?{id:item.id,replace:true,asset:deck.state.uploads?.[item.id]?.id}: {page:article.dataset.case+'/'+article.dataset.pageInCase};
   form.reset();file=details=null;progress.hidden=true;status.textContent='';submit.disabled=true;
   input.accept=kind==='image'?'.jpg,.jpeg,.png,.webp':'.mp4,.webm';
   form.querySelector('[data-fps]').hidden=form.querySelector('[data-frame-note]').hidden=kind!=='video';
   form.querySelector('[data-hint]').textContent=(kind==='image'?'JPG、PNG、WebP，單檔最多 10 MB。':'MP4、WebM，單檔最多 25 MB。')+
    (item?' 替換目前選取項目；影片會替換此播放器的整組序列。原有裁切與圖片箭頭將重設，可用「復原」回復。':' 加入目前投影片，不更動原有素材。');
   dialog.showModal();
  }
  function inspect(file){
   return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),el=kind==='image'?new Image():document.createElement('video');
    let timer,result;
    const finish=(error)=>{clearTimeout(timer);URL.revokeObjectURL(url);el.removeAttribute('src');el.load?.();error?reject(Error(error)):resolve(result);};
    el.onerror=()=>{el.onerror=null;finish('瀏覽器無法讀取此檔。影片請匯出為 H.264 MP4 或 WebM。');};
    const loaded=()=>{
     result={width:el.naturalWidth||el.videoWidth,height:el.naturalHeight||el.videoHeight,...(kind==='video'?{duration:el.duration}:{})};
     el.onerror=null;el.onloadeddata=null;el.onload=null;finish();
    };
    if(kind==='image')el.onload=loaded;else {el.preload='auto';el.onloadeddata=loaded;}
    timer=setTimeout(()=>{el.onerror=null;finish('讀取檔案逾時，請確認格式後重試。');},20000);el.src=url;
   });
  }
  input.onchange=async()=>{
   file=input.files[0];details=null;submit.disabled=true;if(!file)return;
   const chosen=file;status.textContent='檢查素材中…';
   try{
    if(model.types[file.type]!==kind)throw Error('檔案格式不支援。請依上方格式重新選擇。');
    if(file.size>model.limit(kind))throw Error('檔案超過大小限制。請先縮短影片或另行匯出較小檔案。');
    name.value=file.name;
    const result=await inspect(file);if(chosen!==file||!dialog.open)return;details=result;
    status.textContent=`${details.width} × ${details.height}`+(kind==='video'?` · ${details.duration.toFixed(1)} 秒`:'');submit.disabled=false;
   }catch(e){if(chosen===file){details=null;status.textContent=e.message;}}
  };
  form.onsubmit=async e=>{
   e.preventDefault();if(!details||xhr)return;
   let metadata;
   try{metadata=model.metadata({id:crypto.randomUUID(),name:name.value,mime:file.type,size:file.size,...details,...(kind==='video'?{fps:fps.valueAsNumber}:{})});}
   catch(e){status.textContent=e.message;return;}
   busy(true);progress.hidden=false;progress.value=0;status.textContent='上傳中…';
   try{
    const asset=await new Promise((resolve,reject)=>{
     xhr=new XMLHttpRequest();xhr.open('POST','/api/arrows/media');xhr.setRequestHeader('Content-Type',file.type);
     xhr.setRequestHeader('X-Media-Metadata',encodeURIComponent(JSON.stringify(metadata)));
     xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=e.loaded/e.total*100;status.textContent=`上傳 ${Math.round(progress.value)}%`;}};
     xhr.onload=()=>{try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw Error(result.error||'上傳失敗。');resolve(result.asset);}catch(e){reject(e);}};
     xhr.onerror=()=>reject(Error('連線中斷，上傳未完成，請重試。'));xhr.onabort=()=>reject(Error('已取消上傳，未加入草稿。'));
     xhr.timeout=180000;xhr.ontimeout=()=>reject(Error('上傳逾時，請確認網路後重試。'));xhr.send(file);
    });
    let id=destination.id;
    if(destination.replace&&deck.state.uploads?.[id]?.id!==destination.asset)throw Error('選取素材已變更，請重新選擇後上傳。');
    if(!id){
     let index=100;while(deck.items.has(`${destination.page}:${kind}:${index}`))index++;
     if(index>999)throw Error('這頁新增素材已達上限。');id=`${destination.page}:${kind}:${index}`;
    }
    update(next=>{
     next.uploads??={};next.uploads[id]=asset;delete next.media?.[id];
     for(const [key,a] of Object.entries(next.imageArrows))if(a.image===id)delete next.imageArrows[key];
    });
    if(deck.state.uploads?.[id]?.id!==asset.id)throw Error('檔案已上傳，但加入投影片失敗。請重新整理後再試。');
    choose(deck.items.get(id));dialog.close();deck.items.get(id)?.node.scrollIntoView({block:'nearest'});
    message('素材已加入，請按「儲存草稿」。發布前學生無法取得新素材。');
   }catch(error){status.textContent=error.message;message(error.message,true);}
   finally{xhr=null;busy(false);}
  };
  cancel.onclick=()=>{if(xhr)xhr.abort();else dialog.close();};
  dialog.addEventListener('cancel',e=>{if(xhr){e.preventDefault();xhr.abort();}});
  window.addEventListener('beforeunload',e=>{if(xhr){e.preventDefault();e.returnValue='';}});
  return {select(item){selected=item;replace.hidden=!['image','video'].includes(item?.kind);}};
 }
 window.TeacherUploads={mount};
})();
