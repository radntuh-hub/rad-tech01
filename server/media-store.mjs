import model from '../public/upload-model.js';

const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const error=(message,status)=>Response.json({error:message},{status,headers});
export function signature(bytes,mime){
 const ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
 return mime==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':
  mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
  mime==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':
  mime==='video/mp4'?ascii(4,8)==='ftyp':
  mime==='video/webm'?bytes.slice(0,4).join(',')==='26,69,223,163':false;
}
export async function uploadMedia(request,env,internal){
 if(!(await internal('/session')).ok)return error('請重新登入教師版。',401);
 if(!env.MATERIALS)return error('尚未啟用上傳儲存空間，請聯絡管理者啟用 Cloudflare R2。',503);
 let asset;
 try{
  asset=model.metadata({...JSON.parse(decodeURIComponent(request.headers.get('X-Media-Metadata')||'')),id:crypto.randomUUID()});
  if(request.headers.get('Content-Type')!==asset.mime)throw Error();
 }catch{return error('檔案資料不正確。請使用 JPG、PNG、WebP、MP4 或 WebM。',400);}
 if(Number(request.headers.get('Content-Length'))!==asset.size)return error('檔案大小不符，請重新選擇。',400);
 const reader=request.body?.getReader();if(!reader)return error('沒有收到檔案。',400);
 const parts=[];let length=0;
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;
   if(length>asset.size)throw Error();parts.push(value);}
  if(length!==asset.size)throw Error();
 }catch{await reader.cancel().catch(()=>{});return error('檔案不完整或超過大小限制。',413);}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 if(!signature(bytes,asset.mime))return error('檔案內容與格式不符，請重新匯出圖片或影片。',415);
 try{
  await env.MATERIALS.put(asset.id,bytes,{httpMetadata:{contentType:asset.mime}});
  const registered=await internal('/media-register',{method:'POST',body:JSON.stringify(asset)});
  if(!registered.ok){await env.MATERIALS.delete(asset.id);return registered;}
  return Response.json({asset},{headers});
 }catch{return error('上傳未完成，請稍後重試。',503);}
}
export function byteRange(value,size){
 if(!value)return null;
 const match=value.match(/^bytes=(\d*)-(\d*)$/);
 if(!match||(!match[1]&&!match[2]))return false;
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
 let end=match[1]&&match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
 end=Math.min(end,size-1);return {offset:start,length:end-start+1};
}
export async function serveMedia(request,env,internal,id){
 if(!model.uuid.test(id))return error('找不到素材。',404);
 const access=await internal('/media-access/'+id);
 if(!access.ok)return access;
 if(!env.MATERIALS)return error('素材儲存空間尚未啟用。',503);
 try{
  const asset=await access.json(),range=byteRange(request.headers.get('Range'),asset.size);
  if(range===false)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+asset.size}});
  const object=request.method==='HEAD'?await env.MATERIALS.head(id):await env.MATERIALS.get(id,range?{range}:{});
  if(!object)return error('找不到素材檔案。',404);
  const responseHeaders={...headers,'Content-Type':asset.mime,'Accept-Ranges':'bytes','Content-Length':String(range?.length??asset.size)};
  if(range)responseHeaders['Content-Range']=`bytes ${range.offset}-${range.offset+range.length-1}/${asset.size}`;
  return new Response(request.method==='HEAD'?null:object.body,{status:range?206:200,headers:responseHeaders});
 }catch{return error('暫時無法讀取素材。',503);}
}
