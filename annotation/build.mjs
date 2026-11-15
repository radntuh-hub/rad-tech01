import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import arrows from '../public/arrows.js';
import slideTools from '../public/slide-edits.js';

const here=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.resolve(here,'../public');
const digest=value=>createHash('sha256').update(value).digest('hex');
const serialize=data=>JSON.stringify(data).replaceAll('<','\\u003c');

export async function readCourse(dir=publicDir){
 const html=await fs.readFile(path.join(dir,'index.html'),'utf8');
 const read=(name)=>JSON.parse(html.match(new RegExp('^const '+name+'=(.+);$','m'))?.[1]||'null');
 const media=read('media'),images=read('images');
 if(!media||!images)throw Error('Cannot read the deck media metadata.');
 const pages=Object.fromEntries([...html.matchAll(/<article data-case="([^"]+)" data-page-in-case="(\d+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map(([,id,page,body])=>[id+'/'+page,[...body.matchAll(/class="viewer" data-series="([^"]+)"/g)]
   .map(([,keys])=>keys.split(','))]));
 const keys=[...new Set(Object.values(pages).flat(2))].sort();
 if(!keys.length||Object.keys(pages).length!==90||keys.length!==Object.keys(media).length)
  throw Error('Unexpected course or viewer inventory. Check the source deck structure.');
 const pairs=await Promise.all(keys.map(async key=>{
  const m=media[key];
  if(!/^assets\/[a-z0-9_.-]+\.mp4$/i.test(m?.url)||!Number.isFinite(m.fps)||m.fps<=0||
     !Number.isFinite(m.duration)||m.duration<=0)
   throw Error('Unsupported video metadata: '+key);
  return [key,digest(await fs.readFile(path.join(dir,m.url))),m.fps,m.duration,m.width,m.height];
 }));
 const frames=Object.fromEntries(pairs.map(([key,,fps,duration])=>[key,Math.max(1,Math.round(fps*duration))]));
 const manifest={course:digest(JSON.stringify({pages,pairs})),pages,frames};
 return {manifest,html,files:[...new Set([...keys.map(k=>media[k].url),...Object.values(images)])]};
}

export function merge(packs,manifest){
 const items=new Map(),slides=slideTools.blank();
 for(const pack of packs){
  for(const arrow of arrows.validate(pack,manifest).arrows){
   if(items.has(arrow.id)&&JSON.stringify(items.get(arrow.id))!==JSON.stringify(arrow))
    throw Error('不同標註檔包含同一支箭頭的不同版本，請只保留要採用的檔案。');
   items.set(arrow.id,arrow);
  }
  for(const [group,changes] of Object.entries(slideTools.validate(pack.slides,manifest.pages))){
   for(const [id,value] of Object.entries(changes)){
    if(Object.hasOwn(slides[group],id)&&JSON.stringify(slides[group][id])!==JSON.stringify(value))
     throw Error('不同草稿對同一項教材內容有衝突，請確認採用的版本。');
    slides[group][id]=value;
   }
  }
 }
 const data=arrows.validate({format:arrows.format,version:1,course:manifest.course,arrows:[...items.values()]},manifest);
 const checked=slideTools.validate(slides,manifest.pages);
 return slideTools.nonempty(checked)?{...data,slides:checked}:data;
}

export async function build(mode,output,inputs=[]){
 if(!['teacher','preview'].includes(mode)||!output||(mode==='preview'&&!inputs.length))
  throw Error('Usage: node annotation/build.mjs teacher OUTPUT | preview OUTPUT REVIEWED_JSON...');
 const dest=path.resolve(output),teacher=mode==='teacher';
 const {manifest,files,html:source}=await readCourse();
 const packs=await Promise.all(inputs.map(async file=>JSON.parse(await fs.readFile(file,'utf8'))));
 const annotations=merge(packs,manifest);
 let html=source;
 const replace=(from,to)=>{
  if(html.split(from).length!==2)throw Error('Deck integration point changed: '+from);
  html=html.replace(from,to);
 };
 // Both local copies open directly from disk. The cloud question button is not included.
 replace('<link rel="stylesheet" href="study-web.css">\n<script defer src="study-config.js"></script>\n<script defer src="study-web.js"></script>','');
 replace('href="/arrows.css"','href="arrows.css"');
 replace('src="/arrows.js"','src="arrows.js"');
 replace('href="/slide-edits.css"','href="slide-edits.css"');
 replace('src="/slide-edits.js"','src="slide-edits.js"');
 replace('</head>',(teacher?'<script>window.TeacherArrowManifest='+serialize(manifest)+';</script><script src="teacher.js"></script>':'')+'</head>');
 const webSource=html.match(/if\(!teacherArrows&&location\.protocol!=='file:'\)fetch\('\/api\/arrows\/published'\)[\s\S]*?\.catch\(\(\)=>\{\}\);/)?.[0];
 if(!webSource)throw Error('Missing published annotation loader.');
 replace(webSource,'videoArrows.replace('+serialize(annotations.arrows)+');'+
  (annotations.slides?'slideEdits?.replace('+serialize(annotations.slides)+');':''));
 if(teacher)replace('<title>Radiology｜九病例課後補充</title>','<title>Radiology｜教師影片箭頭標註</title>');

 // Refuse to overwrite any existing delivery or teacher work.
 await fs.mkdir(dest);
 await fs.mkdir(path.join(dest,'assets'));
 for(const file of files){
  if(!/^assets\/[a-z0-9_.-]+$/i.test(file))throw Error('Invalid media path: '+file);
  await fs.copyFile(path.join(publicDir,file),path.join(dest,file));
 }
 await fs.writeFile(path.join(dest,teacher?'開啟教師標註.html':'index.html'),html);
 for(const file of ['arrows.js','arrows.css','slide-edits.js','slide-edits.css'])await fs.copyFile(path.join(publicDir,file),path.join(dest,file));
 if(teacher){
  await fs.copyFile(path.join(publicDir,'teacher/editor.js'),path.join(dest,'teacher.js'));
  await fs.copyFile(path.join(here,'操作說明.txt'),path.join(dest,'操作說明.txt'));
 }
 return {output:dest,pages:Object.keys(manifest.pages).length,videos:Object.keys(manifest.frames).length,arrows:annotations.arrows.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='manifest'){
  const output=path.resolve(here,'../server/arrow-manifest.json');
  const {manifest}=await readCourse();
  await fs.writeFile(output,JSON.stringify(manifest,null,2)+'\n');
 }else console.log(await build(process.argv[2],process.argv[3],process.argv.slice(4)));
}
