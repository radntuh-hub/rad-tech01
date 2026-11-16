import test from 'node:test';
import assert from 'node:assert/strict';
import inspect from '../public/media-inspect.js';
import arrows from '../public/arrows.js';

test('Fit-to-view recenters; zoomed panning stays inside source image edges',()=>{
 assert.deepEqual(inspect.bounds(800,600,800,600,1,40,-20),{x:0,y:0});
 assert.deepEqual(inspect.bounds(800,600,800,600,2,500,-400),{x:400,y:-300});
 assert.deepEqual(inspect.bounds(800,600,300,600,2,200,200),{x:0,y:200});
 assert.deepEqual(inspect.bounds(800,600,800,600,6,-9999,9999),{x:-2000,y:1500});
});
test('Zoomed and panned media retain normalized annotation coordinates',()=>{
 const normal=arrows.contentBox({left:100,top:50,width:800,height:600},400,300);
 const zoomed=arrows.contentBox({left:-300,top:-250,width:1600,height:1200},400,300);
 for(const [x,y] of [[.2,.4],[.8,.1]]){
  const screenX=zoomed.left+x*zoomed.width,screenY=zoomed.top+y*zoomed.height;
  assert.equal((screenX-zoomed.left)/zoomed.width,x);
  assert.equal((screenY-zoomed.top)/zoomed.height,y);
  assert.equal(zoomed.width/normal.width,2);
 }
});
test('Opening either comparison viewer does not change its annotation identity',()=>{
 const article={dataset:{case:'dai',pageInCase:'4'},querySelectorAll:()=>list};
 const video1={dataset:{key:'dai-1'}},video2={dataset:{key:'dai-2'}};
 const one={closest:()=>article,querySelector:()=>video1},two={closest:()=>article,querySelector:()=>video2};
 let list=[one,two];
 const player=arrows.player({},null);
 assert.equal(player.identity(one).view,0);assert.equal(player.identity(two).view,1);
 list=[two,one];
 assert.equal(player.identity(one).view,0);assert.equal(player.identity(two).view,1);
 video1.dataset.key='dai-3';assert.equal(player.identity(one).key,'dai-3');
});
test('Crop hit area follows the visible region while annotations keep original coordinates',()=>{
 const full={left:100,top:50,width:800,height:600};
 const visible=arrows.croppedBox(full,{x:.25,y:.1,width:.5,height:.6});
 assert.deepEqual(visible,{left:300,top:110,width:400,height:360});
 assert.equal((visible.left-full.left)/full.width,.25);
 assert.equal(arrows.croppedBox(full,null),full);
});
