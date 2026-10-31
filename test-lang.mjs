import { PLACES } from './src/data.js';
const langs=['ru']; // test one language at a time to allow subsequent runs
async function fetchOne(lang,title){
  const ttl=title.trim().replace(/\s+/g,'_');
  const url=`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ttl)}`;
  const res=await fetch(url);
  if(!res.ok) return {status:res.status};
  const j=await res.json();
  return {status:200,type:j.type,title:j.title,desc:!!j.extract,img:!!(j.thumbnail?.source||j.originalimage?.source)};
}
const failures=[];
for(const p of PLACES){
  for(const lang of langs){
    try {
      const r=await fetchOne(lang,p.name.en);
      if(r.status!==200 || r.type==='disambiguation' || !r.desc){
        failures.push({id:p.id,lang,status:r.status,type:r.type,title:r.title});
      }
    } catch(e){ failures.push({id:p.id,lang,error:String(e)}); }
    await new Promise(res=>setTimeout(res,900));
  }
}
console.log('FAILURES',failures.length);
console.log(JSON.stringify(failures,null,2));