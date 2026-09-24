import {body,fail,json,now,requireId,rows} from './common.js';
export const moneyText=n=>(Number(n||0)/100).toFixed(2);
export const paymentColumns=`
 (SELECT coalesce(sum(p.amount_paise),0) FROM payments p WHERE p.order_id=o.id AND p.account='material' AND p.status='confirmed') AS confirmed_paise,
 (SELECT coalesce(sum(p.amount_paise),0) FROM payments p WHERE p.order_id=o.id AND p.account='material' AND p.status='pending') AS pending_paise,
 (SELECT count(*) FROM payments p WHERE p.order_id=o.id AND p.account='material' AND p.status='pending') AS pending_payments,
 (SELECT count(*) FROM payments p WHERE p.order_id=o.id AND p.account='material' AND p.status='disputed') AS disputed_payments,
 (SELECT v.amount_paise FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version WHERE i.order_id=o.id AND i.account='material' AND v.status='acknowledged') AS invoice_paise`;
export function paymentState(o){if(o.disputed_payments>0)return 'Disputed';if(o.pending_payments>0)return 'Awaiting collector confirmation';if(o.confirmed_paise>0){if(o.invoice_paise===null||o.invoice_paise===undefined)return 'Invoice review required';if(o.confirmed_paise>o.invoice_paise)return 'Overpayment to review';return o.confirmed_paise===o.invoice_paise?'Settled':'Partially settled';}return 'Not recorded';}
export async function personalInsights(request,env,user,path){
  if(path==='/api/v1/earnings'&&request.method==='GET'){
    const list=await rows(env.DB.prepare(`SELECT o.id,o.created_at,o.state,o.material_paise,${paymentColumns} FROM orders o WHERE o.collector_id=? OR o.recycler_id=? ORDER BY o.created_at DESC`).bind(user.id,user.id));
    return json({role:user.role,currency:'INR',expected:moneyText(list.reduce((n,o)=>n+(o.state==='accepted'?o.material_paise:0),0)),pending:moneyText(list.reduce((n,o)=>n+o.pending_paise,0)),confirmed:moneyText(list.reduce((n,o)=>n+o.confirmed_paise,0)),approved:moneyText(list.reduce((n,o)=>n+(o.invoice_paise||0),0)),outstanding:moneyText(list.reduce((n,o)=>n+Math.max(0,(o.invoice_paise||0)-o.confirmed_paise),0)),orders:list.map(o=>({id:o.id,createdAt:o.created_at,state:o.state,paymentState:paymentState(o),approved:o.invoice_paise==null?null:moneyText(o.invoice_paise),pending:moneyText(o.pending_paise),confirmed:moneyText(o.confirmed_paise)}))});
  }
  if(path==='/api/v1/notifications'&&request.method==='GET'){
    const cursor=new URL(request.url).searchParams.get('before')||'',parts=cursor.split('|');if(cursor&&(!Number.isFinite(Date.parse(parts[0]))||parts.length!==2))fail('Invalid notification cursor.');if(cursor)requireId(parts[1]);
    const list=await rows(env.DB.prepare('SELECT * FROM notifications WHERE user_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 101').bind(user.id,parts[0]||now(),parts[0]||now(),parts[1]||'z'));
    const unread=await env.DB.prepare('SELECT count(*) AS total FROM notifications WHERE user_id=? AND read_at IS NULL').bind(user.id).first();
    return json({notifications:list.slice(0,100),unread:unread.total,hasMore:list.length>100,nextCursor:list.length>100?list[99].created_at+'|'+list[99].id:null});
  }
  const seen=path.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
  if(seen&&request.method==='POST'){requireId(seen[1]);await body(request,1000);await env.DB.prepare('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?').bind(now(),seen[1],user.id).run();return json({read:true});}
  return null;
}
