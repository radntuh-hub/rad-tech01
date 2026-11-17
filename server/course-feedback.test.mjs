import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import slideTools from '../public/slide-edits.js';

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
    assert.equal(blocks[0][1].split('如已填寫，無需重複填寫，謝謝。').length-1,1);
    assert.ok(blocks[0][1].includes(`href="${survey}" target="_blank" rel="noopener noreferrer">填寫匿名教學回饋問卷`));
   }
  }
 }
});

test('Feedback notices are appended to editable text without shifting saved IDs or editing links',()=>{
 const node=(text,excluded=false)=>({children:[],textContent:text,closest:()=>excluded});
 const heading=node('Existing heading'),body=node('Existing body'),notice=node('Feedback notice',true),link=node('Survey link',true);
 const article={querySelectorAll:selector=>selector==='.course-feedback p'?[notice]:[heading,notice,link,body]};
 assert.deepEqual(slideTools.editableTexts(article),[heading,body,notice]);
 const state={...slideTools.blank(),text:{'sinus/10:text:2':'Updated notice'}};
 assert.equal(slideTools.validate(state,{'sinus/10':[]}).text['sinus/10:text:2'],'Updated notice');
});
