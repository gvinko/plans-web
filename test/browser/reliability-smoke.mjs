const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const base=process.env.DP_TEST_URL || 'http://127.0.0.1:18749';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('For safety, use a loopback test server only.');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 const p=await ctx.newPage(), errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);
 await p.getByPlaceholder('Customer name').fill('Offline synthetic project');
 await p.getByPlaceholder('Suburb').fill('Test');
 await p.getByRole('button',{name:'New project',exact:true}).click();
 await p.getByRole('button',{name:/^Offline synthetic project/}).waitFor();
 await p.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 const cached=await p.evaluate(async()=>{const keys=await caches.keys();const c=await caches.open(keys.find(k=>k.startsWith('ductplanner-shell-v2-')));return (await c.keys()).map(r=>r.url);});
 assert.ok(cached.some(s=>s.includes('pdf.worker'))); assert.ok(cached.some(s=>s.includes('DrawingWorkspace')));
 await p.evaluate(async()=>{
   const c=await caches.open('unrelated-cache-test');await c.put('/unrelated',new Response('preserve'));
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ductplanner');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(['projects','plan_pages'],'readwrite');const pages=tx.objectStore('plan_pages');const projects=tx.objectStore('projects');
     // A deliberately complex multi-level drawing, with branch and radius runs. No real user data.
     const runs=Array.from({length:18},(_,i)=>{const y=100+i*43;return {id:'r'+i,kind:'smduct',w:400,h:200,air:'supply',mat:'sheet',bend:'radius',bendR:1,sheetLen:2400,pts:[{x:100,y},{x:270,y},{x:270,y:y+35}]}});
     runs.push({id:'branch',kind:'smduct',w:250,h:150,air:'supply',mat:'sheet',pts:[{x:180,y:100},{x:180,y:70}],a:{kind:'side',id:'r0',seg:0,t:80/170}});
     const data=JSON.stringify({items:[],connections:[],joins:[],sketch:runs,scale:{pxPerM:50},showFab:true});
     for(let i=2;i<=12;i++) pages.put({Id:i,Name:'Level '+i,projectId_c:1,drawingJson_c:data,ModifiedOn:new Date().toISOString()});
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close();
 });
 await ctx.setOffline(true);
 await p.reload({waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:/^Offline synthetic project/}).click();
 await p.getByLabel('Floor level').waitFor();
 await p.getByLabel('Floor level').selectOption('12');
 const duct=p.getByRole('button',{name:/^Sheet metal run/}).first();
 await duct.waitFor();await duct.focus();await p.keyboard.press('Enter');
 assert.equal(await duct.getAttribute('aria-pressed'),'true');
 // Touch/pointer cancellation must not commit a partially moved run.
 const screen=await duct.evaluate(el=>{const q=el.ownerSVGElement.createSVGPoint();q.x=145;q.y=100;const p=q.matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y};});
 await p.mouse.move(screen.x,screen.y);await p.mouse.down();await p.mouse.move(screen.x+20,screen.y+12,{steps:5});
 await p.evaluate(()=>{const captured=[...document.querySelectorAll('*')].find(x=>x.hasPointerCapture?.(1));if(!captured)throw Error('no pointer capture');captured.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true,pointerType:'mouse'}));});
 await p.mouse.up();await p.waitForTimeout(1800);
 const original=await p.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('ductplanner');q.onsuccess=()=>r(q.result)});const row=await new Promise(r=>{const q=db.transaction('plan_pages').objectStore('plan_pages').get(12);q.onsuccess=()=>r(q.result)});db.close();return JSON.parse(row.drawingJson_c).sketch[0].pts;});
 assert.deepEqual(original,[{x:100,y:100},{x:270,y:100},{x:270,y:135}]);
 console.log('PASS: cancelled gesture restored duct coordinates');

 const downloadPromise=p.waitForEvent('download'); await p.getByRole('button',{name:'DXF',exact:true}).click(); const d=await downloadPromise;
 const fs=await import('node:fs/promises');const filename=await d.path();const dx=await fs.readFile(filename,'utf8');
 assert.ok((dx.match(/\nARC\n/g)||[]).length>=54);
 assert.ok(dx.includes('DUCT-SM-JOINT'));
 await p.getByRole('button',{name:'Save drawing'}).click();
 await p.waitForTimeout(600);
 await p.reload({waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:/^Offline synthetic project/}).click();
 await p.getByLabel('Floor level').selectOption('12');
 await p.getByRole('button',{name:/^Sheet metal run/}).first().waitFor();
 assert.equal(await p.getByRole('button',{name:/^Sheet metal run/}).count(),19);
 assert.ok(await p.evaluate(async()=> (await caches.keys()).includes('unrelated-cache-test')));
 // Build a real tiny PDF with xref offsets (no external library or service).
 await p.getByLabel('Floor level').selectOption('1');
 const content='0 0 0 RG 30 30 150 150 re S';
 const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objs.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 await p.locator('input[accept="image/*,.pdf,application/pdf"]').setInputFiles({name:'offline-fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
 await p.getByTitle('Remove the plan image').waitFor({timeout:12000});
 await p.waitForTimeout(2200);
 const attachment=await p.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('ductplanner');q.onsuccess=()=>r(q.result)});const row=await new Promise(r=>{const q=db.transaction('plan_pages').objectStore('plan_pages').get(1);q.onsuccess=()=>r(q.result)});db.close();return row.planFile_c;});
 assert.equal(attachment.length,1);console.log('PASS: PDF rendered and stored without internet');

 assert.deepEqual(errors,[]);
 console.log('PASS: offline cold reload, 12 levels, 19 duct runs, offline DXF arc/joint export, keyboard selection, save/reopen, unrelated cache preserved');
} finally {await browser.close();}
