(() => {
 'use strict';
 const types={'image/jpeg':'image','image/png':'image','image/webp':'image','video/mp4':'video','video/webm':'video'};
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 const limit=kind=>(kind==='image'?10:25)*1024*1024;
 const key=asset=>'upload-'+asset.id;
 const url=asset=>'/api/arrows/media/'+asset.id;
 function metadata(input){
  const {id,name,mime,size,width,height,duration,fps}=input||{},kind=types[mime];
  if(!kind||!uuid.test(id)||typeof name!=='string'||!name.trim()||name.length>180||
   !Number.isInteger(size)||size<12||size>limit(kind)||
   ![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=16384))throw Error('圖片或影片的格式、大小或尺寸不正確。');
  const out={id,name,mime,kind,size,width,height};
  if(kind==='video'){
   if(!Number.isFinite(duration)||duration<=0||duration>7200||!Number.isFinite(fps)||fps<1||fps>120)
    throw Error('影片長度或每秒影格數不正確。');
   Object.assign(out,{duration,fps});
  }
  return out;
 }
 function placements(value,pages){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>300)throw Error('上傳素材資料不正確。');
  const result={};
  for(const [id,input] of Object.entries(value).sort(([a],[b])=>a.localeCompare(b))){
   const match=id.match(/^([a-z]+\/[1-9]\d?):(image|video):(\d{1,3})$/);
   if(!match||!Object.hasOwn(pages,match[1]))throw Error('上傳素材的投影片不存在。');
   const asset=metadata(input);
   if(asset.kind!==match[2]||(asset.kind==='video'&&Number(match[3])<100&&!pages[match[1]][Number(match[3])]))
    throw Error('上傳素材類型與選取項目不符。');
   result[id]=asset;
  }
  return result;
 }
 function extend(manifest,uploads){
  const pages=Object.fromEntries(Object.entries(manifest.pages).map(([page,views])=>[page,views.map(keys=>keys?.slice())])),frames={...manifest.frames};
  for(const [id,asset] of Object.entries(uploads||{})){
   if(asset.kind!=='video')continue;
   const [page,,index]=id.split(':'),k=key(asset);
   pages[page][index]=[...new Set([...(pages[page][index]||[]),k])];
   frames[k]=Math.max(1,Math.round(asset.duration*asset.fps));
  }
  return {...manifest,pages,frames};
 }
 const api={types,uuid,limit,key,url,metadata,placements,extend};
 if(typeof module==='object')module.exports=api;else window.TeachingUploadModel=api;
})();
