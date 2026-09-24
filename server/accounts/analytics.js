import {fail,json,now,indiaToday,rows,requireId} from './common.js';
import {moneyText,paymentColumns,paymentState} from './finance-read.js';
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export async function analyticsRoute(request,env,user,path){
  if(path!=='/api/ops/analytics'&&path!=='/api/ops/export')return null;
  if(request.method!=='GET')fail('Method not supported.',405);
  const url=new URL(request.url),from=url.searchParams.get('from')||'2000-01-01',to=url.searchParams.get('to')||indiaToday(),area=(url.searchParams.get('area')||'').trim();
  const recycler=url.searchParams.get('recycler')||'',state=url.searchParams.get('state')||'',queue=url.searchParams.get('queue')||'';
  if(recycler)requireId(recycler);if(!['','accepted','cancelled'].includes(state))fail('Choose a valid order state.');
  const queues={
    invoices:"EXISTS(SELECT 1 FROM invoices qi JOIN invoice_versions qv ON qv.invoice_id=qi.id AND qv.version=qi.current_version WHERE qi.order_id=o.id AND qv.status IN ('submitted','disputed'))",
    confirmations:"EXISTS(SELECT 1 FROM payments qp WHERE qp.order_id=o.id AND qp.status='pending')",
    disputes:"EXISTS(SELECT 1 FROM payments qp WHERE qp.order_id=o.id AND qp.status='disputed') OR EXISTS(SELECT 1 FROM logistics_cases qc WHERE qc.order_id=o.id AND qc.state='open')",
    logistics:"o.state='accepted' AND NOT EXISTS(SELECT 1 FROM logistics_jobs qj WHERE qj.order_id=o.id AND qj.schedule_json IS NOT NULL)"
  };
  if(queue&&!Object.hasOwn(queues,queue))fail('Choose a valid attention queue.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||area.length>120)fail('Choose valid dates and area.');
  for(const value of [from,to])if(!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Choose valid dates.');
  const start=new Date(from+'T00:00:00+05:30').toISOString(),end=new Date(Date.parse(to+'T00:00:00+05:30')+86400000).toISOString();
  const baseWhere="o.created_at>=? AND o.created_at<? AND (?='' OR lower(json_extract(s.snapshot_json,'$.locality'))=lower(?)) AND (?='' OR o.recycler_id=?) AND (?='' OR o.state=?)",args=[start,end,area,area,recycler,recycler,state,state];
  const where=baseWhere+(queue?' AND ('+queues[queue]+')':'');
  const orders=await rows(stmt(env,`SELECT o.id,o.created_at,o.state,o.material_paise,${paymentColumns},c.display_name AS collector,r.display_name AS recycler,
    json_extract(s.snapshot_json,'$.locality') AS locality,s.unit,s.quantity_base,j.accepted_base,coalesce(j.state,'not_arranged') AS delivery,
    (SELECT count(*) FROM logistics_cases x WHERE x.order_id=o.id AND x.state='open') AS issues
    FROM orders o JOIN supply_requests s ON s.id=o.request_id JOIN users c ON c.id=o.collector_id JOIN users r ON r.id=o.recycler_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE ${where} ORDER BY o.created_at DESC LIMIT 1001`,...args));
  const clipped=orders.length>1000,visible=orders.slice(0,1000);
  if(path==='/api/ops/export'){
    if(clipped)fail('Narrow the date or area filter to export at most 1,000 orders.',413);
    const escape=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    const header=['Order','Created','Collector','Recycler','Area','State','Delivery','Unit','Requested quantity','Accepted quantity','Material quote INR','Approved invoice INR','Confirmed material INR','Payment state','Open issues'];
    const csv=[header,...visible.map(o=>[o.id,o.created_at,o.collector,o.recycler,o.locality,o.state,o.delivery,o.unit,o.unit==='kg'?o.quantity_base/1000:o.quantity_base,o.accepted_base==null?'':o.unit==='kg'?o.accepted_base/1000:o.accepted_base,moneyText(o.material_paise),o.invoice_paise==null?'':moneyText(o.invoice_paise),moneyText(o.confirmed_paise),paymentState(o),o.issues])].map(r=>r.map(escape).join(',')).join('\r\n');
    return new Response('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="freedom-value-orders.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  const totals=await stmt(env,`SELECT count(*) AS total,sum(o.state='accepted') AS active,sum(o.state='cancelled') AS cancelled,coalesce(sum(CASE WHEN o.state='accepted' THEN o.material_paise ELSE 0 END),0) AS quoted,
    sum(j.accepted_base IS NOT NULL AND j.accepted_base>0) AS received FROM orders o JOIN supply_requests s ON s.id=o.request_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE ${where}`,...args).first();
  const invoices=await rows(stmt(env,`SELECT i.account,v.status,count(*) AS count,sum(v.amount_paise) AS amount FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version JOIN orders o ON o.id=i.order_id JOIN supply_requests s ON s.id=o.request_id WHERE ${where} GROUP BY i.account,v.status`,...args));
  const payments=await rows(stmt(env,`SELECT p.account,p.status,count(*) AS count,sum(p.amount_paise) AS amount FROM payments p JOIN orders o ON o.id=p.order_id JOIN supply_requests s ON s.id=o.request_id WHERE ${where} GROUP BY p.account,p.status`,...args));
  const dues=await rows(stmt(env,`SELECT account,sum(max(0,approved-confirmed)) AS outstanding,sum(max(0,confirmed-approved)) AS overpaid FROM (
    SELECT i.account,v.amount_paise AS approved,coalesce((SELECT sum(p.amount_paise) FROM payments p WHERE p.order_id=o.id AND p.account=i.account AND p.status='confirmed'),0) AS confirmed
    FROM invoices i JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version JOIN orders o ON o.id=i.order_id JOIN supply_requests s ON s.id=o.request_id WHERE v.status='acknowledged' AND ${where}) GROUP BY account`,...args));
  const quantities=await rows(stmt(env,`SELECT s.unit,sum(s.quantity_base) AS requested,sum(coalesce(j.accepted_base,0)) AS received FROM orders o JOIN supply_requests s ON s.id=o.request_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE o.state='accepted' AND ${where} GROUP BY s.unit`,...args));
  const pipeline=await rows(stmt(env,`SELECT CASE WHEN o.state='cancelled' THEN 'cancelled' ELSE coalesce(j.state,'not_arranged') END AS state,count(*) AS count FROM orders o JOIN supply_requests s ON s.id=o.request_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE ${where} GROUP BY 1`,...args));
  const activity=await rows(stmt(env,`SELECT 'finance' AS source,e.order_id,e.kind,e.created_at FROM finance_events e JOIN orders o ON o.id=e.order_id JOIN supply_requests s ON s.id=o.request_id WHERE ${where}
    UNION ALL SELECT 'logistics',e.order_id,e.kind,e.created_at FROM logistics_records e JOIN orders o ON o.id=e.order_id JOIN supply_requests s ON s.id=o.request_id WHERE ${where} AND e.kind<>'internal-note' ORDER BY 4 DESC LIMIT 30`,...args,...args));
  const trends=await rows(stmt(env,`SELECT date(o.created_at,'+330 minutes') AS day,count(*) AS orders,sum(o.material_paise) AS quoted FROM orders o JOIN supply_requests s ON s.id=o.request_id WHERE o.state='accepted' AND ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,...args));
  const network=await stmt(env,"SELECT (SELECT count(*) FROM users WHERE role='collector' AND status='active') AS collectors,(SELECT count(*) FROM users WHERE role='recycler' AND status='active') AS recyclers,(SELECT count(*) FROM facilities WHERE verification_status<>'verified') AS facilityReviews,(SELECT count(*) FROM requirements WHERE state='active' AND valid_until>?) AS activeRequirements",now()).first();
  const supply=await rows(stmt(env,`SELECT li.unit,count(*) AS lines,sum(li.quantity_base) AS quantity FROM lot_items li JOIN lots l ON l.id=li.lot_id WHERE li.review_state='confirmed' GROUP BY li.unit`));
  const attention=await stmt(env,`SELECT ${Object.entries(queues).map(([key,clause])=>`coalesce(sum(CASE WHEN (${clause}) THEN 1 ELSE 0 END),0) AS ${key}`).join(',')} FROM orders o JOIN supply_requests s ON s.id=o.request_id WHERE ${baseWhere}`,...args).first();
  const recyclers=await rows(stmt(env,"SELECT id,display_name AS name FROM users WHERE role='recycler' AND status='active' ORDER BY display_name,id"));
  const requestArgs=[start,end,area,area,recycler,recycler],requestWhere="s.created_at>=? AND s.created_at<? AND (?='' OR lower(json_extract(s.snapshot_json,'$.locality'))=lower(?)) AND (?='' OR s.recycler_id=?)";
  const requests=await rows(stmt(env,`SELECT s.state,count(*) AS count FROM supply_requests s WHERE ${requestWhere} GROUP BY s.state`,...requestArgs));
  const reviews=await stmt(env,`SELECT count(*) AS reviews,count(DISTINCT e.request_id) AS requests FROM market_events e JOIN supply_requests s ON s.id=e.request_id WHERE e.kind='category.confirmed' AND ${requestWhere}`,...requestArgs).first();
  const categories=await rows(stmt(env,`SELECT json_extract(s.snapshot_json,'$.broadCode') AS code,s.unit,count(*) AS orders,sum(s.quantity_base) AS requested,sum(coalesce(j.accepted_base,0)) AS received FROM orders o JOIN supply_requests s ON s.id=o.request_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE ${where} GROUP BY 1,2`,...args));
  return json({generatedAt:now(),filters:{from,to,area,recycler,state,queue},attention,recyclers,requests,reviews,categories,totals,invoices,payments,dues,quantities,pipeline,activity,trends,network,supply,orders:visible.map(o=>({...o,paymentState:paymentState(o)})),truncated:clipped,scope:'Order metrics use order creation date, area, recycler, state and selected queue. Attention counts ignore the selected queue. Request conversion and category reviews use request creation date, area and recycler; they include requests without orders. Network and draft supply totals cover the entire demo.'});
}
