import fs from 'node:fs';
for(const f of ['.env.defaults','.env.localhost','.env.local','.env.playwright.localhost']){try{for(const l of fs.readFileSync('C:/VIRTO/Platform/vc-mcp-testing-module/'+f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m){process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}}}catch{}}
const B = process.env.BACK_URL || 'http://localhost:8090';
const pw = process.env.ADMIN_PASSWORD_LOCALHOST || process.env.ADMIN_PASSWORD;
if(!pw) throw new Error('no admin password');
const tr = await fetch(B+'/connect/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',username:process.env.ADMIN_USER||'admin',password:pw})});
const tok=(await tr.json()).access_token; if(!tok) throw new Error('token '+tr.status);
const H={'authorization':'Bearer '+tok,'content-type':'application/json'};
const out=[]; const created=[];
async function call(method,path,body){const r=await fetch(B+path,{method,headers:H,body:body?JSON.stringify(body):undefined});const t=await r.text();return{status:r.status,ct:r.headers.get('content-type'),body:t};}
const perm=n=>'/'+'b'.repeat(n-1);
const CONTENT=JSON.stringify({settings:{},content:[]});
const STORE='B2B-store';
async function search(kw){return call('POST','/api/page-builder-pages/search',{storeId:STORE,keyword:kw,take:50});}
// endpoint 1: create-group-page
for(const n of [2048,2049,10000]){
  const name=`AGENT-TEST-6443 inv26 cgp ${n}`;
  const r=await call('POST','/api/page-builder-pages/create-group-page',{storeId:STORE,name,permalink:perm(n),cultureName:'en-US',content:CONTENT});
  let id=null; try{id=JSON.parse(r.body).id}catch{}
  if(r.status===200&&id) created.push(id);
  const s=await search(name);
  out.push({ep:'POST create-group-page',len:n,status:r.status,ct:r.ct,body:r.status===200?`(200, id ${id}, permalink.length=${JSON.parse(r.body).permalink?.length})`:r.body.slice(0,600),storedAfter:s.body.includes(name)?'FOUND':'not found'});
}
// endpoint 2: POST grouped
for(const n of [2048,2049,10000]){
  const name=`AGENT-TEST-6443 inv26 grp ${n}`;
  const r=await call('POST','/api/page-builder-pages/grouped',{storeId:STORE,name,permalink:perm(n),cultureName:'en-US',status:'Draft',pages:[{status:'Draft',content:CONTENT}]});
  let id=null; try{id=JSON.parse(r.body).id}catch{}
  if(r.status===200&&id) created.push(id);
  const s=await search(name);
  out.push({ep:'POST grouped',len:n,status:r.status,ct:r.ct,body:r.status===200?`(200, id ${id})`:r.body.slice(0,600),storedAfter:s.body.includes(name)?'FOUND':'not found'});
}
// endpoint 3: PUT grouped on a valid page
const baseName='AGENT-TEST-6443 inv26 put target';
const c=await call('POST','/api/page-builder-pages/create-group-page',{storeId:STORE,name:baseName,permalink:'/agent-test-6443-inv26-put',cultureName:'en-US',content:CONTENT});
const target=JSON.parse(c.body); created.push(target.id);
const before=await call('GET','/api/page-builder-pages/grouped/'+target.id);
for(const n of [2049,10000,2048]){
  const cur=JSON.parse((await call('GET','/api/page-builder-pages/grouped/'+target.id)).body);
  const r=await call('PUT','/api/page-builder-pages/grouped',{...cur,permalink:perm(n)});
  const after=JSON.parse((await call('GET','/api/page-builder-pages/grouped/'+target.id)).body);
  out.push({ep:'PUT grouped',len:n,status:r.status,ct:r.ct,body:r.body.slice(0,600),storedAfter:`permalink.length=${after.permalink?.length} modifiedDate=${after.modifiedDate}`});
}
out.push({beforePut:{permalink:JSON.parse(before.body).permalink,modifiedDate:JSON.parse(before.body).modifiedDate}});
// teardown
const td=[];
for(const id of created){const d=await call('DELETE','/api/page-builder-pages/grouped/'+id);const g=await call('GET','/api/page-builder-pages/grouped/'+id);td.push({id,del:d.status,get:g.status});}
out.push({teardown:td});
console.log(JSON.stringify(out,null,1));
