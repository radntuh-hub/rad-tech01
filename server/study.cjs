(() => {
 'use strict';
 const normalize=value=>value.normalize('NFKC').toLowerCase();
 const stop=new Set(['what','why','does','which','about','from','this','with','have','where','when','how','the','and','for','any','about','are','is','can','you','show','tell','什麼','怎麼','如何','為什','為何','請問','可以','哪裡','在哪','一下','這個','那個','需要','請教']);
 function tokens(text){
  const result=new Set();
  for(const word of normalize(text).match(/[a-z0-9]+|\p{Script=Han}+/gu)||[]){
   if(/^[a-z0-9]/.test(word)){if(word.length>=2&&!stop.has(word))result.add(word);}
   else for(let i=0;i+1<word.length;i++){const pair=word.slice(i,i+2);if(!stop.has(pair))result.add(pair);}
  }
  return result;
 }
 function lookup(question,pages,current){
  const query=tokens(question);if(!query.size)return [];
  const df=new Map(),rows=[];
  for(const page of pages){
   const title=tokens(page.title),parts=page.parts.map(text=>({text,terms:tokens(text)}));
   const terms=new Set([...title,...parts.flatMap(p=>[...p.terms])]);
   for(const term of terms)if(query.has(term))df.set(term,(df.get(term)||0)+1);
   rows.push({page,title,parts});
  }
  const weight=term=>Math.log(1+pages.length/(1+(df.get(term)||0)));
  const rank=set=>[...query].reduce((sum,term)=>sum+(set.has(term)?weight(term):0),0);
  const results=[];
  for(const {page,title,parts} of rows){
   const best=parts.map(p=>({...p,score:rank(p.terms)})).sort((a,b)=>b.score-a.score)[0];
   const titleScore=rank(title),score=(best?.score||0)+titleScore*.65;
   if(score>0)results.push({...page,excerpt:(best?.score?best.text:page.parts[0]||page.title).slice(0,420),score:score*(page.case===current?1.18:1)});
  }
  return results.sort((a,b)=>b.score-a.score).slice(0,3);
 }
 module.exports={lookup,tokens};
})();
