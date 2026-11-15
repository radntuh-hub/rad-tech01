import test from 'node:test';
import assert from 'node:assert/strict';
import arrows from '../public/arrows.js';
import {readCourse,merge} from './build.mjs';

const {manifest}=await readCourse();
const example={id:'test-arrow',page:'edh/2',view:0,key:'edh-1',
 first:19,last:21,x1:.18,y1:.31,x2:.68,y2:.42,color:'#ffda36'};
const pack=(rows,course=manifest.course)=>({format:arrows.format,version:1,course,arrows:rows});

test('Annotation inventory is tied to the current 90 pages and actual video files',()=>{
 assert.equal(Object.keys(manifest.pages).length,90);
 assert.equal(Object.keys(manifest.frames).length,38);
 assert.match(manifest.course,/^[a-f0-9]{64}$/);
 assert.deepEqual(arrows.validate(pack([example]),manifest).arrows,[example]);
 assert.throws(()=>arrows.validate(pack([example],'old-course'),manifest),/不屬於/);
 for(const patch of [{view:1},{key:'sinus-1'},{last:33},{x2:1.1},{color:'url(...)'}])
  assert.throws(()=>arrows.validate(pack([{...example,...patch}]),manifest));
});

test('Teacher submissions merge without double arrows or overwriting another draft',()=>{
 const one=pack([example]),two=pack([{...example,id:'second'}]);
 assert.deepEqual(merge([one,one,two],manifest).arrows.map(a=>a.id),['test-arrow','second']);
 assert.throws(()=>merge([one,pack([{...example,last:24}])],manifest),/不同版本/);
});

test('Overlay follows the visible picture rather than the surrounding black bars',()=>{
 const rect={left:20,top:100,width:400,height:300};
 assert.deepEqual(arrows.contentBox(rect,300,300),{left:70,top:100,width:300,height:300});
 assert.deepEqual(arrows.contentBox(rect,800,400),{left:20,top:150,width:400,height:200});
 assert.equal(arrows.frameAt(1.925,{fps:10,duration:3.2}),20);
 assert.equal(arrows.frameAt(3.2,{fps:10,duration:3.2}),32);
});
