import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Use synthetic fixtures only. Uploads remain private and never enter a lesson draft.
const [credentialsPath,imagePath,videoPath]=process.argv.slice(2);
if(!credentialsPath||!imagePath||!videoPath)throw Error('Pass the private login document, a synthetic 640x360 PNG and a 3-second 10 FPS MP4.');
const origin='https://rad-tech01-student.rad-report-relay.workers.dev';
const text=await readFile(credentialsPath,'utf8');
const password=text.split('\n').find(line=>line.startsWith('教師密碼'))?.split('：').at(-1);
if(!password)throw Error('Cannot read teacher login.');
const request=(path,options={})=>fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(60000)});
const live=await (await request('/api/arrows/published')).json();
const login=await request('/teacher/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({password})});
assert.equal(login.status,303);
const cookie=login.headers.get('set-cookie').split(';')[0],auth={Cookie:cookie};
try{
 const before=await (await request('/api/arrows/draft',{headers:auth})).json();
 const page=await (await request('/teacher/',{headers:auth})).text();
 assert.match(page,/\/teacher\/uploads\.js/);
 const script=await request('/teacher/uploads.js',{headers:auth});assert.equal(script.status,200);
 assert.match(await script.text(),/上傳影片/);
 for(const [path,mime] of [[imagePath,'image/png'],[videoPath,'video/mp4']]){
  const bytes=await readFile(path),metadata={name:'Synthetic upload verification',mime,size:bytes.length,width:640,height:360,
   ...(mime==='video/mp4'?{duration:3,fps:10}:{})};
  const response=await request('/api/arrows/media',{method:'POST',headers:{...auth,Origin:origin,'Content-Type':mime,'X-Media-Metadata':encodeURIComponent(JSON.stringify(metadata))},body:bytes});
  const result=await response.json();assert.equal(response.status,200,result.error);
  const route='/api/arrows/media/'+result.asset.id;
  assert.equal((await request(route)).status,401);
  const fetched=await request(route,{headers:auth});assert.equal(fetched.status,200);
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),bytes);
  const range=await request(route,{headers:{...auth,Range:'bytes=0-11'}});assert.equal(range.status,206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(0,12));
  const head=await request(route,{method:'HEAD',headers:auth});assert.equal(Number(head.headers.get('content-length')),bytes.length);
  console.log('Verified private '+mime+' upload, exact original bytes and range delivery.');
 }
 assert.deepEqual(await (await request('/api/arrows/draft',{headers:auth})).json(),before);
 assert.deepEqual(await (await request('/api/arrows/published')).json(),live);
 console.log('Existing draft and published lessons unchanged. Synthetic files remain private, outside the draft.');
}finally{
 await request('/api/arrows/logout',{method:'POST',headers:{...auth,Origin:origin}});
}
