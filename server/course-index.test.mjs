import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import pages from './course-index.json' with {type:'json'};

test('The index matches the current student HTML and every page is linkable',()=>{
 const script=fileURLToPath(new URL('../scripts/build-course-index.py',import.meta.url));
 execFileSync('python3',[script,'--check']);
 assert.equal(pages.length,90);
 assert.equal(new Set(pages.map(({case:c,page})=>c+'/'+page)).size,90);
 assert.equal(new Set(pages.map(({case:c})=>c)).size,9);
 assert.equal(pages.filter(p=>p.parts.length).length,81);
 for(const page of pages.filter(p=>p.page==='5')){
  assert.match(page.title,/English report/);
  assert.deepEqual(page.parts,[]);
  assert.equal(page.search,'');
 }
 const opening=pages.find(p=>p.case==='npc'&&p.page==='1');
 assert.doesNotMatch(JSON.stringify(opening),/sputum|77 歲/);
});
