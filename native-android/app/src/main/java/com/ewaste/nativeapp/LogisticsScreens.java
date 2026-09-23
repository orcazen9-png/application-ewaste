package com.ewaste.nativeapp;

import android.app.AlertDialog;
import android.graphics.BitmapFactory;
import android.text.InputType;
import android.widget.ImageView;
import org.json.*;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/** Native custody and evidence screens; no payment completion side effects. */
final class LogisticsScreens {
    final MarketplaceScreens m;final AccountActivity a;
    LogisticsScreens(MarketplaceScreens market){m=market;a=market.a;}
    void open(String id){m.load("logistics","/orders/"+id+"/logistics");}
    void action(JSONObject o,String kind,JSONObject input){m.put(input,"expectedVersion",o.optInt("version"));m.change("/orders/"+o.optString("id")+"/logistics/"+kind,"POST",input,"logistics");}
    void message(JSONObject o,String title,String kind){m.message(title,"/orders/"+o.optString("id")+"/logistics/"+kind,o.optInt("version"),"logistics");}
    void render(JSONObject d)throws Exception{
        a.label(a.t("Pickup & receipt"),23);JSONObject o=d.optJSONObject("order"),j=d.optJSONObject("logistics");if(o==null||j==null){a.label(a.t("Connect to load logistics details."),16);return;}
        String order=o.getString("id"),unit=j.getString("unit");boolean collector=a.account().equals(o.optString("collectorId"));
        a.label(a.t("Delivery: ")+j.optString("state"),20);a.label(a.t("Material: ₹")+o.optString("materialAmount")+" · Payment: "+o.optString("paymentState"),16);
        a.label(a.t("Requested: ")+j.optString("requested")+" "+unit+"\nAccepted receipt: "+(j.isNull("acceptedQuantity")?a.t("Awaiting review"):j.optString("acceptedQuantity")+" "+unit)+"\nReturned: "+j.optString("returnedQuantity")+" "+unit,16);
        JSONObject schedule=j.optJSONObject("schedule"),cost=j.optJSONObject("cost"),pickup=j.optJSONObject("pickup"),receipt=j.optJSONObject("receipt");
        if(schedule==null)a.label(a.t("Operations has not scheduled this order yet."),16);
        else a.label(schedule.optString("partnerName")+" · "+schedule.optString("partnerContact")+"\n"+schedule.optString("start")+" to "+schedule.optString("end")+"\n"+schedule.optString("instructions"),16);
        if(cost==null)a.label(a.t("Logistics charge is not available yet. Recycler pays separately."),16);
        else a.label(a.t("Recycler-paid logistics: ₹")+cost.optString("amount")+" · "+cost.optString("basis")+"\nPayee: "+cost.optString("payee")+"\n"+(j.optBoolean("costAcknowledged")?a.t("Recycler acknowledged this charge"):a.t("Awaiting recycler acknowledgment")),16);
        if(o.optString("state").equals("accepted")){
            if(!collector&&cost!=null&&!j.optBoolean("costAcknowledged"))a.button(a.t("Acknowledge logistics charge"),"logistics-ack-cost",()->new AlertDialog.Builder(a).setTitle(a.t("Acknowledge ₹")+cost.optString("amount")+" logistics?").setMessage(a.t("You pay this separately from the collector's material amount. This does not record a payment.")).setPositiveButton(a.t("Acknowledge"),(di,w)->{JSONObject input=new JSONObject();m.put(input,"costVersion",j.optInt("costVersion"));action(o,"acknowledge-cost",input);}).setNegativeButton(a.t("Back"),null).show());
            if(pickup==null)a.button(a.t("Request schedule change"),"logistics-schedule-change",()->message(o,a.t("Requested pickup change"),"schedule-change"));
            if(collector&&pickup==null&&j.optString("state").equals("scheduled"))a.button(a.t("Record handover"),"logistics-pickup",()->start(o,j,"pickup",null));
            if(!collector&&pickup!=null&&j.isNull("acceptedQuantity")&&!j.optString("state").equals("return_pending")&&!j.optString("state").equals("returned"))a.button(receipt==null?a.t("Record received quantity"):a.t("Correct receipt with evidence"),"logistics-receipt",()->start(o,j,"receipt",receipt));
            if(collector&&receipt!=null&&j.isNull("acceptedQuantity")&&j.optString("state").equals("received"))a.button(a.t("Review received quantity"),"logistics-review-receipt",()->new AlertDialog.Builder(a).setTitle(a.t("Review ")+receipt.optString("quantity")+" "+unit).setMessage(receipt.optString("condition")+"\n"+receipt.optString("message")+"\nAcceptance records quantity only. Missing goods still require custody review; it does not confirm payment.").setPositiveButton(a.t("Accept quantity"),(di,w)->{JSONObject input=new JSONObject();m.put(input,"receiptId",receipt.optString("id"));m.put(input,"message",a.t("Collector reviewed and accepted this receipt quantity"));action(o,"accept-receipt",input);}).setNeutralButton(a.t("Dispute"),(di,w)->message(o,a.t("Explain the receipt dispute"),"issue")).setNegativeButton(a.t("Back"),null).show());
            if(collector&&j.optString("state").equals("return_pending"))a.button(a.t("Confirm goods returned"),"logistics-return",()->start(o,j,"confirm-return",null));
            a.button(a.t("Report delivery issue"),"logistics-issue",()->message(o,a.t("Delivery issue"),"issue"));
        }
        JSONArray cases=d.optJSONArray("cases");if(cases!=null&&cases.length()>0){a.label(a.t("Issues & review"),20);for(int i=0;i<cases.length();i++){JSONObject c=cases.getJSONObject(i);a.label(c.optString("state")+" · "+c.optString("reason")+(c.isNull("resolution")?"":"\n"+c.optString("resolution")),15);}}
        a.label(a.t("Evidence & activity"),20);JSONArray records=d.optJSONArray("records");if(records!=null)for(int i=0;i<records.length();i++){
            JSONObject r=records.getJSONObject(i),e=r.getJSONObject("data");a.label(r.optString("kind")+" · "+a.localDate(r.optString("createdAt")),15);
            a.button(a.t("View record details"),"logistics-record-"+r.optString("id"),()->new AlertDialog.Builder(a).setTitle(r.optString("kind").replace('-',' ')).setMessage(a.t("Recorded by ")+r.optString("actorName",a.t("Order participant"))+"\n\n"+details(e)).setPositiveButton(a.t("Close"),null).show());
            JSONArray files=e.optJSONArray("fileIds");if(files!=null)for(int n=0;n<files.length();n++){String f=files.getString(n);a.button(a.t("View evidence photo ")+(n+1),"logistics-photo-"+f,()->photo(order,f));}
        }
        a.button(a.t("Back to order"),"logistics-order",()->m.load("order","/orders/"+order));
    }
    void start(JSONObject o,JSONObject j,String kind,JSONObject previous){
        try{String key="evidence:"+o.getString("id")+":"+kind;JSONObject d=a.store.cached(a.account(),key);
            if(d!=null&&d.optInt("expectedVersion")!=o.optInt("version")){
                final JSONObject saved=d;new AlertDialog.Builder(a).setTitle(a.t("Order updated since this draft")).setMessage(a.t("Your saved evidence remains intact. Review the current pickup and receipt details before using this draft against the updated order.")).setPositiveButton(a.t("Review saved evidence"),(di,w)->{m.put(saved,"expectedVersion",o.optInt("version"));if(previous!=null)m.put(saved,"supersedes",previous.optString("id"));m.show("evidence",saved);save(saved);}).setNegativeButton(a.t("Back to current order"),null).show();return;
            }
            if(d==null){d=new JSONObject().put("orderId",o.getString("id")).put("kind",kind).put("expectedVersion",o.getInt("version")).put("unit",j.getString("unit")).put("capturedAt",Instant.now().toString()).put("locationSource","manual").put("fileIds",new JSONArray());if(previous!=null)d.put("supersedes",previous.getString("id"));}
            m.show("evidence",d);save(d);
        }catch(Exception e){a.showError(e);}
    }
    void save(JSONObject d){try{a.store.cache(a.account(),"evidence:"+d.getString("orderId")+":"+d.getString("kind"),d);m.persist();}catch(Exception e){a.showError(e);}}
    String context(){JSONObject d=m.data();return "evidence:"+d.optString("orderId")+":"+d.optString("kind");}
    void field(JSONObject d,String key,String title,int type,int length){a.field(title,d.optString(key),"evidence-"+key,type,length,value->{m.put(d,key,value);save(d);});}
    void evidence(JSONObject d)throws Exception{
        a.label(d.optString("kind").equals("pickup")?a.t("Record handover"):d.optString("kind").equals("receipt")?a.t("Record inspection"):a.t("Confirm physical return"),23);
        a.label(a.t("Evidence is shared with this order's collector, recycler and Freedom Value operations. Location below is entered manually."),15);
        field(d,"quantity",a.t("Actual quantity (")+d.optString("unit")+")",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        field(d,"condition",a.t("Condition on inspection"),InputType.TYPE_CLASS_TEXT,500);
        field(d,"location",a.t("Location (manual)"),InputType.TYPE_CLASS_TEXT,300);
        ZonedDateTime captured=Instant.parse(d.getString("capturedAt")).atZone(ZoneId.systemDefault());
        a.label(a.t("Evidence time: ")+captured.format(DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a z")),15);
        a.button(a.t("Change evidence time"),"evidence-time",()->new android.app.DatePickerDialog(a,(picker,year,month,day)->new android.app.TimePickerDialog(a,(clock,hour,minute)->{m.put(d,"capturedAt",ZonedDateTime.of(year,month+1,day,hour,minute,0,0,ZoneId.systemDefault()).toInstant().toString());save(d);a.render();},captured.getHour(),captured.getMinute(),false).show(),captured.getYear(),captured.getMonthValue()-1,captured.getDayOfMonth()).show());
        field(d,"message",a.t("Handover / inspection note"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,2000);
        a.button(a.t("Take evidence photo"),"evidence-camera",()->{save(d);a.takeEvidencePhoto(context());});
        a.button(a.t("Upload evidence photo"),"evidence-gallery",()->{save(d);a.gallery.launch(new String[]{"image/*"});});
        JSONArray files=d.getJSONArray("fileIds");a.label(files.length()+" evidence photo(s)",16);
        for(int i=0;i<files.length();i++){String f=files.getString(i);BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=4;android.graphics.Bitmap bitmap=BitmapFactory.decodeFile(a.store.photo(a.account(),f).getAbsolutePath(),options);if(bitmap!=null){ImageView preview=new ImageView(a);preview.setImageBitmap(bitmap);preview.setContentDescription(a.t("Evidence photo ")+(i+1));preview.setScaleType(ImageView.ScaleType.CENTER_INSIDE);a.page.addView(preview,new android.widget.LinearLayout.LayoutParams(-1,a.dp(150)));}a.button(a.t("Remove evidence photo ")+(i+1),"evidence-remove-"+i,()->{JSONArray keep=new JSONArray();for(int n=0;n<files.length();n++)if(!files.optString(n).equals(f))keep.put(files.optString(n));m.put(d,"fileIds",keep);save(d);a.render();});}
        if(files.length()==0)field(d,"noPhotoReason",a.t("If no photo, explain the missing evidence"),InputType.TYPE_CLASS_TEXT,500);
        a.button(a.t("Review and submit evidence"),"evidence-submit",()->new AlertDialog.Builder(a).setTitle(a.t("Submit this evidence?")).setMessage(a.t("Record ")+d.optString("quantity")+" "+d.optString("unit")+" and share the selected photos. This records custody evidence, not a payment.").setPositiveButton(a.t("Submit"),(di,w)->{save(d);m.change("/orders/"+d.optString("orderId")+"/logistics/"+d.optString("kind"),"POST",Catalog.copy(d),"logistics");}).setNegativeButton(a.t("Back"),null).show());
        a.button(a.t("Back to pickup & receipt"),"evidence-back",()->open(d.optString("orderId")));
    }
    void photo(String order,String file){String token=a.token();a.task(()->a.api.logisticsPhoto(order,file,token),bytes->{ImageView image=new ImageView(a);image.setImageBitmap(BitmapFactory.decodeByteArray(bytes,0,bytes.length));image.setAdjustViewBounds(true);image.setContentDescription(a.t("Shared handover evidence"));new AlertDialog.Builder(a).setTitle(a.t("Evidence photo")).setView(image).setPositiveButton(a.t("Close"),null).show();});}
    String details(JSONObject e){StringBuilder text=new StringBuilder();String[][] fields={{"quantity",a.t("Quantity")},{"unit",a.t("Unit")},{"acceptedQuantity",a.t("Accepted quantity")},{"condition",a.t("Condition")},{"location",a.t("Location (manual)")},{"capturedAt",a.t("Evidence time")},{"message",a.t("Note")},{"noPhotoReason",a.t("Missing photo explanation")},{"amount",a.t("Logistics charge ₹")},{"basis",a.t("Charge basis")},{"payee",a.t("Payee")},{"source",a.t("Source")},{"reason",a.t("Reason")},{"partnerName",a.t("Transport partner")},{"partnerContact",a.t("Partner contact")},{"start",a.t("Window start")},{"end",a.t("Window end")},{"instructions",a.t("Instructions")},{"resolution",a.t("Resolution")}};for(String[] f:fields)if(e.has(f[0])&&!e.isNull(f[0])&&!e.optString(f[0]).isEmpty())text.append(f[1]).append(": ").append(e.optString(f[0])).append("\n");if(!e.isNull("supersedes")&&!e.optString("supersedes").isEmpty())text.append("Correction: earlier evidence remains in the activity history.\n");return text.toString();}
}
