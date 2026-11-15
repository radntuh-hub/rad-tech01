import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const origin='https://rad-tech01-student.rad-report-relay.workers.dev';
const filename=process.argv[2];
if(!filename)throw Error('Pass the path to the private login document.');
const credentials=await readFile(filename,'utf8');
const request=(path,opts)=>fetch(origin+path,{...opts,redirect:'manual',signal:AbortSignal.timeout(15000)});
const status=async(path,expected,opts)=>{
 const response=await request(path,opts);
 assert.equal(response.status,expected,path);
 return response;
};
const pub=await (await status('/api/arrows/published',200)).json();
assert.ok(Array.isArray(pub.arrows));
const student=await (await status('/',200)).text();
assert.ok(student.includes('study-web.js')&&!student.includes('TeacherArrowInitial'));
assert.equal((await (await status('/api/study/config',200)).json()).enabled,true);
assert.match(await (await status('/teacher/',200)).text(),/教師或管理者密碼/);
await status('/api/arrows/draft',401);
await status('/teacher/editor.js',401);
await status('/teacher/content.js',401);
for(const [label,role] of [['教師密碼','teacher'],['管理者密碼','admin']]){
 const password=credentials.split('\n').find(line=>line.startsWith(label))?.split('：').at(-1);
 if(!password||!/^\S{1,128}$/.test(password))throw Error('Private login document is not in the expected format.');
 const session=await status('/teacher/login',303,{method:'POST',headers:{Origin:origin},
  body:new URLSearchParams({password})});
 const cookie=session.headers.get('set-cookie');
 if(!cookie?.includes('Secure; HttpOnly; SameSite=Lax'))throw Error('Secure session cookie missing.');
 const headers={Cookie:cookie.split(';')[0]};
 const draft=await (await status('/api/arrows/draft',200,{headers})).json();
 assert.equal(draft.role,role);
 const privatePage=await status('/teacher/',200,{headers});
 assert.match(privatePage.headers.get('cache-control'),/no-store/);
 assert.match(privatePage.headers.get('content-security-policy'),/nonce-/);
 const page=await privatePage.text();
 assert.ok(page.includes('TeacherArrowInitial')&&page.includes('/teacher/online.js'));
 await status('/teacher/editor.js',200,{headers});
 await status('/teacher/content.js',200,{headers});
 const post=(body,site=origin)=>({method:'POST',headers:{...headers,Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(role==='teacher'){
  await status('/api/arrows/draft',403,post({revision:draft.draft.revision,data:draft.draft.data},'https://external.invalid'));
  await status('/api/arrows/publish',403,post({revision:draft.draft.revision,liveRevision:draft.live.revision}));
  const saved=await (await status('/api/arrows/draft',200,post({revision:draft.draft.revision,data:draft.draft.data}))).json();
  assert.equal(saved.draft.revision,draft.draft.revision);
 }
 await status('/api/arrows/logout',200,post({}));
 await status('/api/arrows/draft',401,{headers});
}
assert.deepEqual(await (await status('/api/arrows/published',200)).json(),pub);
console.log('Verified student page, both login roles, draft save, access restrictions, and logout. Public annotations unchanged.');
