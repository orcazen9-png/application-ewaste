package com.ewaste.nativeapp;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.text.InputType;
import android.widget.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.time.LocalDate;
import java.util.UUID;

/** Native invoice documents, approval and recipient confirmations. */
final class FinanceScreens {
    final MarketplaceScreens m;final AccountActivity a;
    FinanceScreens(MarketplaceScreens market){m=market;a=market.a;}
    void open(String id){m.load("finance","/orders/"+id+"/finance");}
    void action(JSONObject o,String kind,JSONObject input){m.put(input,"expectedVersion",o.optInt("version"));m.change("/orders/"+o.optString("id")+"/finance/"+kind,"POST",input,"finance");}
    File documentFile(String owner,String id)throws Exception {AccountStore.validId(owner);AccountStore.validId(id);File dir=new File(a.getFilesDir(),"documents/"+owner);if(!dir.exists()&&!dir.mkdirs())throw new IOException("Could not save document.");return new File(dir,id);}
    void document(Uri uri){
        if(uri==null||!m.view().equals("invoice-form")||a.session==null)return;
        String owner=a.account(),doc=UUID.randomUUID().toString(),mime=a.getContentResolver().getType(uri);JSONObject form=m.data();
        if(!"application/pdf".equals(mime)&&!"image/jpeg".equals(mime)&&!"image/png".equals(mime)){a.showError(new Exception("Choose a PDF, JPG or PNG document."));return;}
        a.task(()->{File file=documentFile(owner,doc);try(InputStream in=a.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(file)){if(in==null)throw new IOException("Document could not be opened.");byte[] buffer=new byte[8192];int count,total=0;while((count=in.read(buffer))!=-1){total+=count;if(total>5242880)throw new IOException("Choose a document up to 5 MB.");out.write(buffer,0,count);}if(total==0)throw new IOException("Document is empty.");}return doc;},result->{m.put(form,"documentId",result);m.put(form,"documentMime",mime);m.put(form,"documentName","Invoice."+(mime.equals("application/pdf")?"pdf":mime.equals("image/png")?"png":"jpg"));m.persist();a.render();});
    }
    void start(JSONObject order){JSONObject form=new JSONObject();m.put(form,"order",order);m.put(form,"account",a.account().equals(order.optString("collectorId"))?"material":"logistics");m.put(form,"issuedOn",LocalDate.now().toString());m.show("invoice-form",form);}
    void invoiceForm(JSONObject d)throws Exception{
        JSONObject order=d.getJSONObject("order");a.label("Upload invoice",23);a.label(d.optString("account").equals("material")?"Material proceeds for the collector":"Recycler-paid logistics",16);
        for(String[] spec:new String[][]{{"issuer","Invoice issuer"},{"number","Invoice number"},{"issuedOn","Invoice date (YYYY-MM-DD)"},{"amount","Invoice total ₹"},{"reason","Submission or revision reason"}}){String key=spec[0];a.field(spec[1],d.optString(key),"finance-"+key,key.equals("amount")?InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL:InputType.TYPE_CLASS_TEXT,500,v->{m.put(d,key,v);m.persist();});}
        a.label(d.has("documentId")?"Document saved on this phone":"Choose the issued invoice document.",15);
        a.button("Choose PDF or photo","finance-choose-document",()->a.documentPicker.launch(new String[]{"application/pdf","image/jpeg","image/png"}));
        a.button("Submit for review","finance-submit-invoice",()->{try{if(!d.has("documentId"))throw new Exception("Choose the invoice first.");JSONObject input=new JSONObject(d.toString());input.remove("order");action(order,"invoice",input);}catch(Exception e){a.showError(e);}});
        a.button("Back to financial record","finance-back",()->open(order.optString("id")));
    }
    void render(JSONObject d)throws Exception{
        a.label("Invoices & settlement",23);JSONObject o=d.optJSONObject("order");if(o==null){a.label("Connect to load financial records.",16);return;}
        String order=o.getString("id");boolean collector=a.account().equals(o.optString("collectorId"));
        a.label("Payments happen outside the app. Collector material proceeds and recycler-paid logistics are separate.",15);
        JSONArray accounts=d.optJSONArray("accounts");if(accounts!=null)for(int i=0;i<accounts.length();i++){JSONObject s=accounts.getJSONObject(i);a.label(s.optString("account").equals("material")?"Material account":"Logistics account",20);a.label("Approved ₹"+s.optString("approved")+"\nConfirmed ₹"+s.optString("confirmed")+" · Pending ₹"+s.optString("pending")+"\nOutstanding ₹"+s.optString("outstanding")+" · Overpaid ₹"+s.optString("overpaid"),16);if(s.optBoolean("basisChanged"))a.label("Terms changed. Review a revised invoice before further settlement.",15);}
        if(o.optString("state").equals("accepted"))a.button("Upload invoice or revision","finance-upload",()->start(o));
        JSONArray invoices=d.optJSONArray("invoices");if(invoices!=null)for(int i=0;i<invoices.length();i++){
            JSONObject v=invoices.getJSONObject(i);a.label(v.optString("number")+" · revision "+v.optInt("version"),19);a.label(v.optString("issuer")+" · ₹"+money(v.optLong("amount_paise"))+" · "+v.optString("status")+"\n"+v.optString("reason"),16);
            a.button("Open invoice","finance-document-"+i,()->viewDocument(order,v.optString("document_id"),"application/pdf"));
            boolean current=v.optInt("version")==v.optInt("current_version"),pending=v.optString("status").equals("submitted")||v.optString("status").equals("disputed");
            if(current&&pending&&(v.optString("account").equals("material")||!collector)){
                a.button("Approve invoice","finance-approve-"+i,()->review(o,"invoice-review",v,"accept"));a.button("Dispute invoice","finance-dispute-invoice-"+i,()->review(o,"invoice-review",v,"dispute"));
            }
        }
        a.label("Payment history",21);JSONArray payments=d.optJSONArray("payments"),reviews=d.optJSONArray("paymentReviews");if(payments==null||payments.length()==0)a.label("No external payments recorded yet.",16);
        if(payments!=null)for(int i=0;i<payments.length();i++){
            JSONObject p=payments.getJSONObject(i);a.label("₹"+money(p.optLong("amount_paise"))+" · "+p.optString("account")+" · "+p.optString("status"),19);a.label(p.optString("method")+" · "+p.optString("reference")+"\n"+p.optString("paid_on")+"\n"+p.optString("evidence_reason"),15);
            if(!p.isNull("proof_id"))a.button("Open payment proof","finance-proof-"+i,()->viewDocument(order,p.optString("proof_id"),"application/pdf"));
            boolean recipient=p.optString("account").equals("material")?collector:!collector;
            if(recipient&&(p.optString("status").equals("pending")||p.optString("status").equals("disputed"))){
                a.button(collector?"Confirm money received":"Verify logistics payee receipt","finance-confirm-"+i,()->review(o,"payment-review",p,"confirm"));a.button("Dispute payment","finance-dispute-payment-"+i,()->review(o,"payment-review",p,"dispute"));
            }
            String last="";if(reviews!=null)for(int j=0;j<reviews.length();j++){JSONObject r=reviews.getJSONObject(j);if(r.optString("payment_id").equals(p.optString("id"))){a.label(r.optString("decision")+" · "+r.optString("reason"),14);if(r.optString("decision").startsWith("reversal_"))last=r.optString("decision");}}
            if(recipient&&last.equals("reversal_requested")){a.button("Accept reversal","finance-reverse-"+i,()->review(o,"reversal-review",p,"accept"));a.button("Reject reversal","finance-reject-reverse-"+i,()->review(o,"reversal-review",p,"reject"));}
            if(p.optString("status").equals("confirmed"))a.button("Share payment acknowledgment","finance-share-"+i,()->{Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,"Freedom Value — external payment acknowledgment\nOrder: "+order+"\nAmount: ₹"+money(p.optLong("amount_paise"))+"\nAccount: "+p.optString("account")+"\nDate: "+p.optString("paid_on")+"\nReference: "+p.optString("reference")+"\nConfirmed in the platform. This is a payment acknowledgment, not a tax invoice.");a.startActivity(Intent.createChooser(send,"Share acknowledgment"));});
        }
    }
    static String money(long paise){return java.math.BigDecimal.valueOf(paise,2).toPlainString();}
    void review(JSONObject o,String kind,JSONObject record,String decision){
        LinearLayout layout=new LinearLayout(a);layout.setOrientation(LinearLayout.VERTICAL);EditText reason=new EditText(a),reference=new EditText(a);reason.setHint("Review note / reason");layout.addView(reason);boolean logistics=!kind.equals("invoice-review")&&record.optString("account").equals("logistics");if(logistics){reference.setHint("Logistics payee receipt reference");layout.addView(reference);}
        new AlertDialog.Builder(a).setTitle(decision+" · ₹"+money(record.optLong("amount_paise"))).setMessage(kind.equals("invoice-review")?"Review the document, amount and received quantity before approving.":"Confirm only what actually happened. This does not transfer money.").setView(layout).setPositiveButton("Submit review",(di,w)->{JSONObject input=new JSONObject();m.put(input,"decision",decision);m.put(input,"message",reason.getText().toString());if(logistics)m.put(input,"receiptReference",reference.getText().toString());if(kind.equals("invoice-review")){m.put(input,"invoiceId",record.optString("invoice_id"));m.put(input,"invoiceVersion",record.optInt("version"));}else m.put(input,"paymentId",record.optString("id"));action(o,kind,input);}).setNegativeButton("Back",null).show();
    }
    void viewDocument(String order,String doc,String mime){String owner=a.account(),token=a.token();a.task(()->{byte[] bytes=a.api.document(order,doc,token);File file=documentFile(owner,doc);try(OutputStream out=new FileOutputStream(file)){out.write(bytes);}return file;},file->{try{byte[] head=new byte[8];try(InputStream in=new FileInputStream(file)){in.read(head);}String type=head[0]=='%'?"application/pdf":(head[0]&255)==137?"image/png":"image/jpeg";Uri uri=FileProvider.getUriForFile(a,a.getPackageName()+".files",file);a.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}catch(Exception e){a.showError(new Exception("Install a PDF or image viewer to open this document."));}});}
    void earnings(JSONObject d)throws Exception{a.label(d.optString("role").equals("collector")?"Your earnings":"Material payments",23);a.label("Confirmed ₹"+d.optString("confirmed")+"\nApproved invoices ₹"+d.optString("approved")+"\nOutstanding ₹"+d.optString("outstanding"),19);a.label("Totals use collector-confirmed material payments. Logistics is accounted separately.",15);JSONArray orders=d.optJSONArray("orders");if(orders!=null)for(int i=0;i<orders.length();i++){JSONObject o=orders.getJSONObject(i);a.label(o.optString("paymentState")+" · ₹"+o.optString("confirmed"),17);a.button("Open financial record","earnings-order-"+i,()->open(o.optString("id")));}}
    void inbox(JSONObject d)throws Exception{a.label("Notifications",23);a.label(d.optInt("unread")+" unread",16);JSONArray list=d.optJSONArray("notifications");if(list==null)return;for(int i=0;i<list.length();i++){JSONObject n=list.getJSONObject(i);a.label(n.optString("title")+(n.isNull("read_at")?" · New":""),18);a.label(n.optString("body")+"\n"+n.optString("created_at"),15);a.button("View update","notification-"+i,()->{String token=a.token();a.task(()->a.api.request("POST","/notifications/"+n.optString("id")+"/read",token,new JSONObject()),result->{if(n.optString("kind").startsWith("finance."))open(n.optString("resource_id"));else if(n.optString("kind").startsWith("logistics."))m.logistics.open(n.optString("resource_id"));else m.load("request","/requests/"+n.optString("resource_id"));});});}if(d.optBoolean("hasMore"))a.label("Showing your latest 100 notifications.",14);}
}
