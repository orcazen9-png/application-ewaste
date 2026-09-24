import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './helpers/logistics-fixture.mjs';
import worker from '../server/worker.js';
const id=()=>crypto.randomUUID(),today=()=>new Date().toISOString().slice(0,10);
const pdf=Buffer.from('%PDF-1.7\nExample invoice fixture\n%%EOF');
async function finance(t){
  const f=await setup(t);await f.env.DB.prepare("UPDATE operations_staff SET role='operations_finance' WHERE id=?").bind(f.staff).run();
  const base='/orders/'+f.order+'/finance';
  const upload=async (user=f.c,document=id(),bytes=pdf,order=f.order)=>{
    const response=await worker.fetch(new Request('https://test.example/api/v1/orders/'+order+'/finance/documents/'+document+'?name=Invoice.pdf',{method:'PUT',headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/pdf'},body:bytes}),f.env);
    assert.ok([200,201].includes(response.status),JSON.stringify(await response.clone().json()));return document;
  };
  const read=()=>f.ok(f.c,base);
  const cmd=async(actor,kind,input={},status=200)=>{const payload={commandId:id(),expectedVersion:(await read()).order.version,...input};const response=actor==='staff'?await f.ops(base+'/'+kind,'POST',payload):await f.call(actor,base+'/'+kind,'POST',payload);const d=await response.json();assert.equal(response.status,status,JSON.stringify(d));return d;};
  const received=async()=>{await f.ready();await f.act(f.c,'pickup',f.evidence('200'));await f.act(f.r,'receipt',f.evidence('200'));await f.act(f.c,'accept-receipt',{receiptId:(await f.read()).logistics.receipt.id,message:'Agreed received quantity'});};
  const invoice=async(extra={})=>cmd(f.c,'invoice',{documentId:await upload(),account:'material',issuer:'Collector business',number:'MAT-001',issuedOn:today(),amount:'10000',reason:'Final invoice submitted',...extra});
  const approve=async inv=>{await cmd(f.c,'invoice-review',{invoiceId:inv.invoiceId,invoiceVersion:inv.invoiceVersion,decision:'accept',message:'Reviewed seller copy'});await cmd(f.r,'invoice-review',{invoiceId:inv.invoiceId,invoiceVersion:inv.invoiceVersion,decision:'accept',message:'Reviewed buyer copy'});};
  const payment=(inv,amount='4000',extra={})=>cmd('staff','payment',{invoiceId:inv.invoiceId,invoiceVersion:inv.invoiceVersion,amount,method:'upi',reference:id(),paidOn:today(),evidenceReason:'Bank reference checked; receipt pending',...extra});
  return {...f,base,upload,financeRead:read,cmd,received,invoice,approve,payment};
}
test('invoice review, partial payments and collector receipts never deduct logistics or conflate delivery with settlement',async t=>{
  const f=await finance(t);await f.received();const inv=await f.invoice();await f.approve(inv);
  let d=await f.financeRead();assert.equal(d.accounts[0].outstanding,'10000.00');assert.equal(d.accounts[0].confirmed,'0.00');
  const p=await f.payment(inv);d=await f.financeRead();assert.equal(d.accounts[0].pending,'4000.00');assert.equal(d.accounts[0].outstanding,'10000.00');
  await f.cmd(f.r,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Cannot confirm collector receipt'},403);
  await f.cmd(f.c,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Received in bank'});d=await f.financeRead();assert.equal(d.accounts[0].outstanding,'6000.00');
  const p2=await f.payment(inv,'6000');await f.cmd(f.c,'payment-review',{paymentId:p2.paymentId,decision:'confirm',message:'Balance received'});d=await f.financeRead();assert.equal(d.accounts[0].confirmed,'10000.00');assert.equal(d.accounts[0].outstanding,'0.00');assert.equal(d.accounts[1].confirmed,'0.00');
  assert.equal((await f.read()).logistics.cost.amount,'1000.00');
});
test('invoice needs both parties and agreed custody; revisions preserve prior evidence and payment allocations',async t=>{
  const f=await finance(t),early=await f.invoice();await f.cmd(f.c,'invoice-review',{invoiceId:early.invoiceId,invoiceVersion:1,decision:'accept',message:'Too early'},409);
  await f.received();const inv=await f.invoice();await f.approve(inv);const p=await f.payment(inv,'4000');await f.cmd(f.c,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Received'});
  const revised=await f.invoice({amount:'3500',reason:'Approved return credit being reviewed'});assert.equal(revised.invoiceId,inv.invoiceId);await f.approve(revised);
  const d=await f.financeRead();assert.equal(d.invoices.length,3);assert.equal(d.accounts[0].overpaid,'500.00');assert.equal(d.payments[0].invoice_version,2);
  await f.cmd(f.r,'invoice-review',{invoiceId:inv.invoiceId,invoiceVersion:2,decision:'accept',message:'Stale review'},409);
});
test('finance permission, overpayment exception, immutable corrections, duplicate and concurrent settlement handling',async t=>{
  const f=await finance(t);await f.received();const inv=await f.invoice();await f.approve(inv);
  const input={commandId:id(),expectedVersion:(await f.financeRead()).order.version,invoiceId:inv.invoiceId,invoiceVersion:1,amount:'6000',method:'bank_transfer',reference:'BANK-001',paidOn:today(),evidenceReason:'Bank record checked'};
  await f.env.DB.prepare("UPDATE operations_staff SET role='operations' WHERE id=?").bind(f.staff).run();assert.equal((await f.ops(f.base+'/payment','POST',input)).status,403);
  await f.env.DB.prepare("UPDATE operations_staff SET role='finance' WHERE id=?").bind(f.staff).run();
  const competing={...input,commandId:id(),reference:'BANK-002'},res=await Promise.all([f.ops(f.base+'/payment','POST',input),f.ops(f.base+'/payment','POST',competing)]);assert.deepEqual(res.map(x=>x.status).sort(),[200,409]);
  const winner=res.findIndex(x=>x.status===200),p=await res[winner].json();assert.equal((await (await f.ops(f.base+'/payment','POST',winner===0?input:competing)).json()).replayed,true);
  await f.cmd('staff','payment',{...input,commandId:id(),expectedVersion:(await f.financeRead()).order.version,reference:'BANK-003'},409);
  await f.cmd(f.c,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Received'});
  await f.cmd('staff','reversal-request',{paymentId:p.paymentId,message:'Payment entered against wrong order'});assert.equal((await f.financeRead()).accounts[0].confirmed,'6000.00');
  await f.cmd(f.r,'reversal-review',{paymentId:p.paymentId,decision:'accept',message:'Wrong actor'},403);
  await f.cmd(f.c,'reversal-review',{paymentId:p.paymentId,decision:'accept',message:'Confirmed wrong order; no receipt on this order'});
  const d=await f.financeRead();assert.equal(d.accounts[0].confirmed,'0.00');assert.equal(d.payments[0].status,'reversed');assert.equal(d.paymentReviews.length,3);
});
test('documents are private until shared, immutable, scoped to an order and downloaded as attachments',async t=>{
  const f=await finance(t),doc=await f.upload(),stranger=await f.user();
  assert.equal((await f.call(f.r,f.base+'/documents/'+doc)).status,404);assert.equal((await f.call(stranger,f.base+'/documents/'+doc)).status,404);
  await f.invoice({documentId:doc});const res=await f.call(f.r,f.base+'/documents/'+doc);assert.equal(res.status,200);assert.match(res.headers.get('Content-Disposition'),/^attachment/);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
  const bad=await worker.fetch(new Request('https://test.example/api/v1'+f.base+'/documents/'+doc,{method:'PUT',headers:{Authorization:'Bearer '+f.c.token,'Content-Type':'application/pdf'},body:Buffer.from('%PDF-1.7\nChanged\n%%EOF')}),f.env);assert.equal(bad.status,409);
});
test('ERP, earnings and notifications use the same ledger and isolate personal inboxes',async t=>{
  const f=await finance(t);await f.received();const inv=await f.invoice();await f.approve(inv);const p=await f.payment(inv,'2500');await f.cmd(f.c,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Received'});
  const analytics=await f.okOps('/analytics');assert.equal(analytics.totals.total,1);assert.equal(analytics.orders[0].paymentState,'Partially settled');assert.equal(analytics.payments.find(x=>x.status==='confirmed').amount,250000);assert.equal(analytics.quantities[0].received,200000);assert.equal(analytics.dues.find(x=>x.account==='material').outstanding,750000);
  const earnings=await f.ok(f.c,'/earnings');assert.equal(earnings.confirmed,'2500.00');assert.equal(earnings.outstanding,'7500.00');
  assert.equal((await f.ok(f.c,'/orders/'+f.order)).order.paymentState,'Partially settled');assert.equal((await f.read()).order.paymentState,'Partially settled');
  const notifications=await f.ok(f.c,'/notifications');assert.ok(notifications.unread>0);const n=notifications.notifications[0];await f.ok(f.r,'/notifications/'+n.id+'/read','POST',{});assert.equal((await f.ok(f.c,'/notifications')).unread,notifications.unread);await f.ok(f.c,'/notifications/'+n.id+'/read','POST',{});assert.equal((await f.ok(f.c,'/notifications')).unread,notifications.unread-1);
  const csv=await f.ops('/export');assert.equal(csv.status,200);assert.match(await csv.text(),/Partially settled/);
});
test('ERP attention queues and recycler/state filters drill into the same pending transfers',async t=>{
  const f=await finance(t);await f.received();const inv=await f.invoice();await f.approve(inv);await f.payment(inv,'2500');
  const earnings=await f.ok(f.c,'/earnings');assert.equal(earnings.expected,'10000.00');assert.equal(earnings.pending,'2500.00');assert.equal(earnings.outstanding,'10000.00');assert.equal(earnings.confirmed,'0.00');
  const d=await f.okOps('/analytics?queue=confirmations&recycler='+f.r.id+'&state=accepted');
  assert.equal(d.totals.total,1);assert.equal(d.attention.confirmations,1);assert.equal(d.orders[0].id,f.order);assert.equal(d.requests.find(x=>x.state==='accepted').count,1);assert.equal(d.categories[0].code,'B01');
  const noInvoices=await f.okOps('/analytics?queue=invoices');assert.equal(noInvoices.totals.total,0);assert.equal(noInvoices.attention.confirmations,1);
  assert.equal((await f.okOps('/analytics?state=cancelled')).totals.total,0);
  const other=await f.user('recycler');assert.equal((await f.okOps('/analytics?recycler='+other.id)).totals.total,0);
  assert.equal((await f.ops('/analytics?queue=invalid')).status,400);
  const csv=await (await f.ops('/export?queue=invoices')).text();assert.ok(!csv.includes(f.order));
});
test('notification cursors retain same-time events once and stay isolated between accounts',async t=>{
  const f=await finance(t),time='2025-01-01T00:00:00.000Z';
  await f.env.DB.prepare('DELETE FROM notifications WHERE user_id=?').bind(f.c.id).run();
  for(let i=0;i<103;i++)await f.env.DB.prepare('INSERT INTO notifications(id,user_id,kind,resource_id,title,body,created_at) VALUES(?,?,?,?,?,?,?)').bind(id(),f.c.id,'finance.invoice',f.order,'Invoice update','Open order',time).run();
  const first=await f.ok(f.c,'/notifications');assert.equal(first.notifications.length,100);assert.equal(first.unread,103);
  const second=await f.ok(f.c,'/notifications?before='+encodeURIComponent(first.nextCursor));assert.equal(second.notifications.length,3);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.notifications,...second.notifications].map(n=>n.id)).size,103);
  assert.ok((await f.ok(f.r,'/notifications?before='+encodeURIComponent(first.nextCursor))).notifications.every(n=>n.user_id===f.r.id));
});
test('an explained actual transfer during a custody dispute never closes the dispute',async t=>{
  const f=await finance(t);await f.received();const inv=await f.invoice();await f.approve(inv);await f.act(f.c,'issue',{message:'Inspection damage needs review'});
  const p=await f.payment(inv,'2000',{exceptionReason:'Actual advance transferred while damage is being reviewed'});await f.cmd(f.c,'payment-review',{paymentId:p.paymentId,decision:'confirm',message:'Advance received; damage dispute remains open'});
  assert.equal((await f.read()).cases[0].state,'open');assert.equal((await f.financeRead()).accounts[0].confirmed,'2000.00');
});
