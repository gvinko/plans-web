import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetMetalLayout } from '../src/lib/sheetMetalGeometry.js';
import { createDxf, writeSheetMetalDxf } from '../src/lib/dxf.js';
import { mergeAttachment, splitSegmentAttachment, networkIssues } from '../src/lib/ductNetwork.js';
import { stockSections } from '../src/lib/sheetMetalJoints.js';
const pts = [{x:0,y:0},{x:3000,y:0},{x:3000,y:3000}];
const layout = (p=pts,width=400,bend='radius',bendR=1) => sheetMetalLayout(p,{width,bend,bendR},1);
test('radius elbow uses tangent geometry and true centreline length',()=>{
  const l=layout(), b=l.bends[0];
  assert.equal(b.radius,true); assert.ok(Math.abs(b.R-400)<1e-8);
  assert.ok(Math.abs(b.st.x-2600)<1e-8);assert.ok(Math.abs(b.en.y-400)<1e-8);
  assert.ok(Math.abs(l.length-(5200+200*Math.PI))<1e-6);
  assert.deepEqual(stockSections(l.segs[0],1,2400).map(x=>x.lenMm),[2400,200]);
});
test('radius that does not fit is identified rather than drawing a negative inner arc',()=>{
  const l=layout([{x:0,y:0},{x:100,y:0},{x:100,y:100}]);
  assert.equal(l.bends[0].radius,false);assert.equal(l.bends[0].requestedRadius,400);
  assert.ok(l.segs.every(s=>s.to>=s.from));
});
test('adjacent bends do not overlap and stock sections do not exceed 2400 mm',()=>{
  const p=[{x:0,y:0},{x:5100,y:0},{x:5100,y:1200},{x:8000,y:1200},{x:8000,y:6500}];
  const l=layout(p,400,'radius',1.5);
  for(const s of l.segs) { assert.ok(s.to>=s.from-1e-9); assert.ok(stockSections(s,1,2400).every(x=>x.lenMm<=2400)); }
  assert.equal(l.bends.length,3);
});
test('DXF radius exports 3 exact ARC entities with consistent radii and 90° sweep',()=>{
  for(const p of [pts,[{x:0,y:0},{x:3000,y:0},{x:3000,y:-3000}]]){
    const d=createDxf();writeSheetMetalDxf(d,p,layout(p));
    const text=d.toString(); const arcs=[...text.matchAll(/\nARC\n8\n([^\n]+)\n10\n[^\n]+\n20\n[^\n]+\n30\n0\n40\n([^\n]+)\n50\n([^\n]+)\n51\n([^\n]+)/g)];
    assert.equal(arcs.length,3);
    assert.deepEqual(arcs.map(a=>Number(a[2])).sort((a,b)=>a-b),[200,400,600]);
    assert.ok(arcs.every(a=>((Number(a[4])-Number(a[3])+360)%360)===90));
    assert.ok(!text.includes('DUCT-SM-JOINT'));
  }
});
test('SHOP DXF emits joints while DESIGN does not; square bends have no arc',()=>{
  const d=createDxf();writeSheetMetalDxf(d,pts,layout(pts,400,'square'),{shop:true,sheetLen:2400});const text=d.toString();
  assert.equal((text.match(/\nARC\n/g)||[]).length,0);
  assert.equal((text.match(/\nLINE\n8\nDUCT-SM-JOINT\n/g)||[]).length,4);
});
test('reverse and merge preserve the physical branch positions and flip side-mounted fitting orientation',()=>{
  const opts={xId:'x',yId:'y',nX:4,nY:3,xRev:true,yRev:true};
  assert.deepEqual(mergeAttachment({id:'x',seg:0,t:.25,side:1},opts),{id:'x',seg:2,t:.75,side:-1});
  assert.deepEqual(mergeAttachment({kind:'side',id:'y',seg:1,t:.25},opts),{kind:'side',id:'x',seg:3,t:.75});
  assert.deepEqual(mergeAttachment({id:'y',end:'start'},opts),{id:'x',end:'end'});
  assert.equal(mergeAttachment({id:'x',end:'start'},opts),null);
});
test('inserting a bend point keeps branches at their original physical distances',()=>{
  const l={id:'x',seg:1,t:.75};
  assert.deepEqual(splitSegmentAttachment(l,'x',1,.5),{id:'x',seg:2,t:.5});
  assert.deepEqual(splitSegmentAttachment({...l,t:.25},'x',1,.5),{id:'x',seg:1,t:.5});
});
test('network validation catches missing and invalid links',()=>{
  const a={kind:'smduct',id:'a',pts, a:{kind:'side',id:'missing',seg:0,t:.5}};
  const b={kind:'smduct',id:'b',pts,b:{kind:'side',id:'a',seg:5,t:.5}};
  assert.equal(networkIssues([a,b],[{id:'f',onRun:{id:'gone',seg:0,t:.5}}]).length,3);
  assert.equal(networkIssues([{...a,a:null},{...b,b:{kind:'side',id:'a',seg:1,t:.5}}],[{id:'f',onRun:{id:'a',seg:0,t:.5}}]).length,0);
});
