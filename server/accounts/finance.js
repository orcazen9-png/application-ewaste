import {fail,id,json,now,requireId,rows,text} from './common.js';
import {begin,commit} from './commands.js';
import {money,rupees} from './marketplace.js';
import {documentRoute,financeOrder,ownedDocument,financeStaff} from './documents.js';
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const required=(v,n,label)=>{const value=text(v,n,label);if(!value)fail('Enter '+label+'.');return value;};
const financial=user=>{if(!financeStaff(user))fail('Only Freedom Value finance staff can record settlement.',403);};
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>now().slice(0,10))fail('Enter a valid date no later than today.');return value;}
async function clearCustody(env,o){if(o.accepted_base===null||o.accepted_base<=0||await stmt(env,"SELECT id FROM logistics_cases WHERE order_id=? AND state='open'",o.id).first())fail('Agree the received quantity and resolve custody issues before approving invoices or payments.',409);}
async function basis(env,o,account){
  if(account==='material'){
    const term=await stmt(env,'SELECT status FROM order_terms WHERE order_id=? AND version=?',o.id,o.terms_version).first();
    if(term&&term.status!=='acknowledged')fail('Review the current material price proposal first.',409);
    return {version:o.terms_version,payer:o.recycler_id,payee:o.collector_id};
  }
  const cost=o.cost_json&&JSON.parse(o.cost_json);if(!cost||cost.basis!=='final'||o.cost_ack_version!==o.cost_version)fail('Recycler must acknowledge the final logistics charge first.',409);
  return {version:o.cost_version,payer:o.recycler_id,payee:cost.payee,amount:cost.amountPaise};
}
export async function financeProjection(env,user,o){
  const invoices=await rows(stmt(env,`SELECT i.*,v.*,d.name AS document_name FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id JOIN documents d ON d.id=v.document_id WHERE i.order_id=? ORDER BY i.account,v.version DESC`,o.id));
  const reviews=await rows(stmt(env,'SELECT r.* FROM invoice_reviews r JOIN invoices i ON i.id=r.invoice_id WHERE i.order_id=? ORDER BY r.created_at,r.id',o.id));
  const payments=await rows(stmt(env,'SELECT * FROM payments WHERE order_id=? ORDER BY created_at,id',o.id));
  const paymentReviews=await rows(stmt(env,'SELECT r.* FROM payment_reviews r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=? ORDER BY r.created_at,r.id',o.id));
  const events=await rows(stmt(env,'SELECT * FROM finance_events WHERE order_id=? ORDER BY version DESC LIMIT 200',o.id));
  const accounts=['material','logistics'].map(account=>{
    const invoice=invoices.find(i=>i.account===account&&i.current_version===i.version),ps=payments.filter(p=>p.account===account);
    const sum=status=>ps.filter(p=>p.status===status).reduce((n,p)=>n+p.amount_paise,0),confirmed=sum('confirmed'),pending=sum('pending'),disputed=sum('disputed');
    const approved=invoice?.status==='acknowledged'?invoice.amount_paise:0;
    return {account,approved:rupees(approved),confirmed:rupees(confirmed),pending:rupees(pending),disputed:rupees(disputed),outstanding:rupees(Math.max(0,approved-confirmed)),overpaid:rupees(Math.max(0,confirmed-approved)),invoiceStatus:invoice?.status||'not_uploaded',basisChanged:!!invoice&&(invoice.basis_version!==(account==='material'?o.terms_version:o.cost_version)||invoice.quantity_base!==o.accepted_base)};
  });
  return {order:{id:o.id,version:o.version,state:o.state,collectorId:o.collector_id,recyclerId:o.recycler_id,acceptedBase:o.accepted_base,unit:o.unit,termsVersion:o.terms_version,costVersion:o.cost_version},invoices,reviews,payments,paymentReviews,events:events.map(e=>({...e,data:JSON.parse(e.data_json)})),accounts};
}
async function action(request,env,user,o,kind){
  const c=await begin(request,env,user);if(c.previous)return c.previous;const i=c.input,time=now(),version=o.version+1;
  if(o.version!==i.expectedVersion||o.state!=='accepted')fail('Order changed or is cancelled. Refresh first.',409);
  const extras=[];let data={};
  if(kind==='invoice'){
    if(user.staff)financial(user);
    if(!['material','logistics'].includes(i.account))fail('Choose a material or logistics invoice.');
    if(i.account==='material'&&!user.staff&&user.id!==o.collector_id)fail('The collector or finance staff must upload the material invoice.',403);
    if(i.account==='logistics'&&!user.staff&&user.id!==o.recycler_id)fail('The recycler or finance staff must upload the logistics invoice.',403);
    const b=await basis(env,o,i.account),doc=await ownedDocument(env,user,o,i.documentId),old=await stmt(env,'SELECT * FROM invoices WHERE order_id=? AND account=?',o.id,i.account).first();
    const invoiceId=old?.id||id(),revision=(old?.current_version||0)+1,amount=money(i.amount);
    if(amount<=0)fail('Invoice amount must be positive.');if(b.amount!==undefined&&amount!==b.amount)fail('Invoice must match the acknowledged final logistics charge.',409);
    const issuer=required(i.issuer,200,'invoice issuer'),number=required(i.number,120,'invoice number'),issued=date(i.issuedOn),reason=required(i.reason,1000,'submission or revision reason');
    extras.push((g,a)=>stmt(env,`INSERT INTO invoices(id,order_id,account,current_version,created_at) SELECT ?,?,?,?,? WHERE ${g} ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version`,invoiceId,o.id,i.account,revision,time,...a));
    if(old)extras.push((g,a)=>stmt(env,`UPDATE invoice_versions SET status='superseded' WHERE invoice_id=? AND version=? AND ${g}`,invoiceId,old.current_version,...a));
    extras.push((g,a)=>stmt(env,`INSERT INTO invoice_versions(invoice_id,version,document_id,issuer,number,issued_on,amount_paise,basis_version,quantity_base,unit,payee,payer,uploaded_by,reason,status,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',? WHERE ${g}`,invoiceId,revision,doc.id,issuer,number,issued,amount,b.version,o.accepted_base,o.unit,b.payee,b.payer,user.actor,reason,time,...a));
    data={invoiceId,invoiceVersion:revision,account:i.account,amount:rupees(amount),reason};
  }else if(kind==='invoice-review'){
    if(user.staff)fail('Invoice approval belongs to the order parties.',403);
    const v=await stmt(env,`SELECT v.*,i.account FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version WHERE i.id=? AND i.order_id=?`,requireId(i.invoiceId),o.id).first();
    if(!v||v.version!==i.invoiceVersion||!['submitted','disputed'].includes(v.status))fail('Review the current pending invoice revision.',409);
    if(v.account==='logistics'&&user.id!==o.recycler_id)fail('The recycler approves logistics invoices.',403);
    if(!['accept','dispute'].includes(i.decision))fail('Choose accept or dispute.');
    const message=required(i.message,1000,'invoice review note');
    if(i.decision==='accept'){await clearCustody(env,o);const b=await basis(env,o,v.account);if(v.basis_version!==b.version||v.quantity_base!==o.accepted_base)fail('Upload a revision based on the current terms and received quantity.',409);}
    const previous=await stmt(env,'SELECT decision FROM invoice_reviews WHERE invoice_id=? AND version=? AND user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',v.invoice_id,v.version,user.id).first();
    if(previous?.decision===i.decision)fail('You already recorded this review.',409);
    const other=await stmt(env,'SELECT decision FROM invoice_reviews WHERE invoice_id=? AND version=? AND user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',v.invoice_id,v.version,user.id===o.collector_id?o.recycler_id:o.collector_id).first();
    const status=i.decision==='dispute'?'disputed':v.account==='logistics'||other?.decision==='accept'?'acknowledged':other?.decision==='dispute'?'disputed':'submitted';
    extras.push((g,a)=>stmt(env,`INSERT INTO invoice_reviews(id,invoice_id,version,user_id,decision,message,created_at) SELECT ?,?,?,?,?,?,? WHERE ${g}`,id(),v.invoice_id,v.version,user.id,i.decision,message,time,...a));
    extras.push((g,a)=>stmt(env,`UPDATE invoice_versions SET status=? WHERE invoice_id=? AND version=? AND ${g}`,status,v.invoice_id,v.version,...a));data={invoiceId:v.invoice_id,invoiceVersion:v.version,decision:i.decision,status,message};
  }else if(kind==='payment'){
    financial(user);await clearCustody(env,o);
    const v=await stmt(env,`SELECT v.*,i.account FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version WHERE i.id=? AND i.order_id=?`,requireId(i.invoiceId),o.id).first();
    if(!v||v.version!==i.invoiceVersion||v.status!=='acknowledged')fail('Record settlement against the current approved invoice.',409);
    const b=await basis(env,o,v.account);if(v.basis_version!==b.version||v.quantity_base!==o.accepted_base)fail('Invoice basis changed. Obtain approval of a revised invoice.',409);
    const amount=money(i.amount);if(amount<=0)fail('Payment amount must be positive.');
    if(!['bank_transfer','upi','cash','cheque','other'].includes(i.method))fail('Choose the payment method.');
    const reference=required(i.reference,150,'payment reference'),paidOn=date(i.paidOn),exception=text(i.exceptionReason,1000,'exception reason');
    const allocated=await stmt(env,"SELECT coalesce(sum(amount_paise),0) AS total FROM payments WHERE invoice_id=? AND status<>'reversed'",v.invoice_id).first();
    if(allocated.total+amount>v.amount_paise&&!exception)fail('This exceeds the invoice balance including pending or disputed payments. Explain the actual overpayment to record it.',409);
    if(await stmt(env,"SELECT id FROM payments WHERE order_id=? AND account=? AND reference=?",o.id,v.account,reference).first())fail('This payment reference is already recorded.',409);
    const proof=i.proofId?await ownedDocument(env,user,o,i.proofId):null,evidence=text(i.evidenceReason,1000,'missing proof explanation');if(!proof&&!evidence)fail('Upload payment proof or explain the missing evidence.');
    const paymentId=id();extras.push((g,a)=>stmt(env,`INSERT INTO payments(id,order_id,invoice_id,invoice_version,account,amount_paise,payer,payee,method,reference,paid_on,proof_id,evidence_reason,recorded_by,status,exception_reason,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,? WHERE ${g}`,paymentId,o.id,v.invoice_id,v.version,v.account,amount,v.payer,v.payee,i.method,reference,paidOn,proof?.id||null,evidence,user.actor,exception,time,...a));
    data={paymentId,account:v.account,amount:rupees(amount),invoiceId:v.invoice_id};
  }else if(['payment-review','reversal-request','reversal-review'].includes(kind)){
    const p=await stmt(env,'SELECT * FROM payments WHERE id=? AND order_id=?',requireId(i.paymentId),o.id).first();if(!p)fail('Payment not found.',404);
    const reason=required(i.message,1000,'payment review note');let decision=i.decision,status=p.status;
    if(kind==='reversal-request'){
      financial(user);if(p.status==='reversed')fail('Payment already reversed.',409);
      const latest=await stmt(env,"SELECT decision FROM payment_reviews WHERE payment_id=? AND decision LIKE 'reversal_%' ORDER BY created_at DESC,rowid DESC LIMIT 1",p.id).first();if(latest?.decision==='reversal_requested')fail('A reversal is already awaiting review.',409);
      decision='reversal_requested';
    }else{
      if(p.account==='material'){if(user.staff||user.id!==o.collector_id)fail('Only the collector can confirm material proceeds or a reversal.',403);}
      else {if(user.staff||user.id!==o.recycler_id)fail('The recycler verifies the logistics payee receipt.',403);if(!text(i.receiptReference,300,'payee receipt reference'))fail('Enter the logistics payee receipt or confirmation reference.');}
      if(kind==='payment-review'){
        if(!['pending','disputed'].includes(p.status)||!['confirm','dispute'].includes(decision))fail('Review a pending or disputed payment.',409);status=decision==='confirm'?'confirmed':'disputed';
      }else{
        const last=await stmt(env,"SELECT decision FROM payment_reviews WHERE payment_id=? AND decision LIKE 'reversal_%' ORDER BY created_at DESC,rowid DESC LIMIT 1",p.id).first();
        if(last?.decision!=='reversal_requested'||!['accept','reject'].includes(decision))fail('Review the current reversal request.',409);status=decision==='accept'?'reversed':p.status;decision=decision==='accept'?'reversal_accepted':'reversal_rejected';
      }
    }
    extras.push((g,a)=>stmt(env,`INSERT INTO payment_reviews(id,payment_id,actor,decision,reason,created_at) SELECT ?,?,?,?,?,? WHERE ${g}`,id(),p.id,user.actor,decision,reason+(i.receiptReference?' · Payee receipt: '+text(i.receiptReference,300,'receipt reference'):''),time,...a));
    extras.push((g,a)=>stmt(env,`UPDATE payments SET status=? WHERE id=? AND ${g}`,status,p.id,...a));data={paymentId:p.id,decision,status,message:reason};
  }else fail('Unknown finance action.',404);
  extras.push((g,a)=>stmt(env,`INSERT INTO finance_events(id,order_id,version,actor,kind,data_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${g}`,id(),o.id,version,user.actor,kind,JSON.stringify(data),time,...a));
  for(const uid of [o.collector_id,o.recycler_id])extras.push((g,a)=>stmt(env,`INSERT INTO notifications(id,user_id,kind,resource_id,title,body,created_at) SELECT ?,?,?,?,?,?,? WHERE ${g}`,id(),uid,'finance.'+kind,o.id,'Invoice and settlement update','Open the order to review the '+kind.replaceAll('-',' ')+'.',time,...a));
  return commit(env,c,stmt(env,"UPDATE orders SET version=version+1,updated_at=? WHERE id=? AND version=? AND state='accepted'",time,o.id,o.version),{id:o.id,version,...data},extras);
}
export async function financeRoute(request,env,user,path){
  const route=path.match(/^\/api\/(?:v1|ops)\/orders\/([^/]+)\/finance(?:\/([^/]+))?(?:\/([^/]+))?$/);if(!route)return null;
  user={...user,actor:user.staff?user.actor:'user:'+user.id};const o=await financeOrder(env,user,route[1]);
  if(route[2]==='documents'&&route[3])return documentRoute(request,env,user,o,route[3]);
  if(route[3])fail('Not found.',404);
  if(!route[2]&&request.method==='GET')return json(await financeProjection(env,user,o));
  if(route[2]&&request.method==='POST')return action(request,env,user,o,route[2]);fail('Method not supported.',405);
}
