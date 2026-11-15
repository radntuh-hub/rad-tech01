import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const survey='https://docs.google.com/forms/d/e/1FAIpQLSea5_rGxQenW5_H3NJhnBPq9tHKOvxsgbVOPNuCJuR5RDKLqQ/viewform';

test('Every case has the anonymous feedback link on its last slide only',()=>{
 const pages=[...html.matchAll(/<article data-case="([^"]+)" data-page-in-case="(\d+)"[^>]*>([\s\S]*?)<\/article>/g)];
 assert.equal(pages.length,90);
 const cases=new Set(pages.map(([,c])=>c));
 assert.equal(cases.size,9);
 for(const c of cases){
  const slides=pages.filter(([,id])=>id===c);
  assert.equal(slides.length,10);
  for(const [,,n,slide] of slides){
   const blocks=[...slide.matchAll(/<section class="course-feedback"[^>]*>([\s\S]*?)<\/section>/g)];
   assert.equal(blocks.length,n==='10'?1:0,`${c}/${n}`);
   if(blocks.length){
    assert.match(slide,/<h1>[^<]*延伸閱讀<\/h1>/);
    assert.ok(blocks[0][1].includes('感謝您完成影像病例學習。歡迎花1–2分鐘填寫匿名教學回饋，協助我們改善未來的課程。'));
    assert.ok(blocks[0][1].includes(`href="${survey}" target="_blank" rel="noopener noreferrer">填寫匿名教學回饋問卷`));
   }
  }
 }
});
