package com.ewaste.nativeapp;

import android.app.AlertDialog;
import android.graphics.BitmapFactory;
import android.text.InputType;
import android.widget.*;
import org.json.*;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.time.*;
import java.util.*;

/** Native marketplace presentation, separate from the account and draft editor. */
final class MarketplaceScreens {
    final AccountActivity a;
    JSONObject state=new JSONObject();
    MarketplaceScreens(AccountActivity activity){a=activity;}
    void put(JSONObject o,String k,Object v){Catalog.put(o,k,v);}
    String view(){return state.optString("view","");}
    JSONObject data(){JSONObject d=state.optJSONObject("data");return d==null?new JSONObject():d;}
    void persist(){if(a.session!=null)a.store.cache(a.account(),"market-ui",state);}
    void restore(){try{JSONObject saved=a.store.cached(a.account(),"market-ui");if(saved!=null)state=saved;}catch(Exception e){a.showError(e);}}
    void back(){a.screen="home";a.render();}
    void show(String view,JSONObject data){state=new JSONObject();put(state,"view",view);put(state,"data",data);a.screen="market";persist();a.render();}
    void load(String view,String path){
        try {
            JSONObject cached=a.store.cached(a.account(),path);show(view,cached==null?new JSONObject():cached);
            put(state,"path",path);persist();String owner=a.account(),token=a.token();
            a.task(()->{JSONObject result=a.api.request("GET",path,token,null);result.put("fetchedAt",Instant.now().toString());a.store.cache(owner,path,result);return result;},result->{put(state,"data",result);persist();a.render();});
        }catch(Exception e){a.showError(e);}
    }
    void refresh(){String path=state.optString("path");if(!path.isEmpty())load(view(),path);}
    void change(String path,String method,JSONObject input,String destination){
        try{a.store.queueMarket(a.account(),method,path,input,destination);retry();}catch(Exception e){a.showError(e);}
    }
    void retry(){
        String owner=a.account(),token=a.token();
        a.task(()->{
            JSONObject pending=a.store.pendingMarket(owner);if(pending==null)throw new IllegalStateException("No pending action.");
            try {JSONObject result=a.api.request(pending.getString("method"),pending.getString("path"),token,pending.getJSONObject("input"));a.store.finishMarket(owner);return new JSONObject().put("result",result).put("destination",pending.getString("destination"));}
            catch(AccountApi.Failure error){if(error.status>=400&&error.status<500&&error.status!=401&&error.status!=408&&error.status!=429)a.store.finishMarket(owner);throw error;}
        },result->{String destination=result.optString("destination");JSONObject value=result.optJSONObject("result");
            if(destination.equals("portfolio"))load("portfolio","/requirements");
            else if(destination.equals("order"))load("order","/orders/"+value.optString("id"));
            else load("request","/requests/"+value.optString("id"));
        });
    }
    void pending()throws Exception{if(a.store.pendingMarket(a.account())!=null){a.label("An earlier action is awaiting confirmation. Retry it to find out whether it was saved.",15);a.button("Retry pending action","market-retry",this::retry);}}
    JSONObject input(int version){JSONObject input=new JSONObject();put(input,"expectedVersion",version);return input;}
    void message(String title,String path,int version,String destination){
        EditText field=new EditText(a);field.setHint("Reason or clarification");field.setMinLines(2);
        new AlertDialog.Builder(a).setTitle(title).setView(field).setPositiveButton("Send",(d,w)->{JSONObject input=input(version);put(input,"message",field.getText().toString());change(path,"POST",input,destination);}).setNegativeButton("Back",null).show();
    }
    void render()throws Exception{
        pending();JSONObject d=data();
        switch(view()){
            case "portfolio":portfolio(d);break;
            case "requirement":requirement(d);break;
            case "matches":matches(d);break;
            case "review":review(d);break;
            case "requests":requests(d);break;
            case "request":request(d);break;
            case "orders":orders(d);break;
            case "order":order(d);break;
        }
        if(!state.optString("path").isEmpty()){
            if(d.has("fetchedAt"))a.label("Last checked: "+d.optString("fetchedAt").replace('T',' ').replace("Z"," UTC"),12);
            a.button("Refresh","market-refresh",this::refresh);
        }
        a.button("Home","market-home",this::back);
    }
    void catalogue(Runnable ready){
        try{if(a.store.cached(a.account(),"catalogue")!=null){ready.run();return;}}catch(Exception e){a.showError(e);return;}
        String owner=a.account(),token=a.token();a.task(()->{JSONObject result=a.api.request("GET","/catalogue",token,null);a.store.cache(owner,"catalogue",result);return result;},result->ready.run());
    }
    void newRequirement(){catalogue(()->{JSONObject draft=new JSONObject();put(draft,"id",UUID.randomUUID().toString());put(draft,"version",0);put(draft,"unit","kg");put(draft,"state","paused");put(draft,"minimum","1");put(draft,"broadCode","B01");put(draft,"validUntil",LocalDate.now().plusDays(30).toString());put(draft,"areas",new JSONArray().put(a.session.optJSONObject("user").optString("locality")));put(draft,"modes",new JSONArray().put("pickup"));show("requirement",draft);});}
    void portfolio(JSONObject d)throws Exception{
        a.label("Buying requirements",23);a.label("Prepare your portfolio here. Facility verification is required to publish it.",15);
        a.button("Add requirement","market-add-requirement",this::newRequirement);
        JSONArray list=d.optJSONArray("requirements");if(list==null||list.length()==0)a.label("No requirements loaded. Add one or refresh when online.",16);
        if(list!=null)for(int i=0;i<list.length();i++){
            JSONObject r=list.getJSONObject(i);a.label(r.getString("title"),20);requirementSummary(r);
            a.button("Edit requirement","market-edit-"+r.getString("id"),()->catalogue(()->show("requirement",Catalog.copy(r))));
        }more(d,"requirements");
    }
    void textField(JSONObject d,String key,String label,int type,int maximum){
        a.field(label,d.isNull(key)?"":d.optString(key),"market-"+key,type,maximum,value->{put(d,key,value);persist();});
    }
    void requirement(JSONObject d)throws Exception{
        a.label(d.optInt("version")==0?"Add requirement":"Edit requirement",23);
        textField(d,"title","Material or equipment",InputType.TYPE_CLASS_TEXT,120);
        textField(d,"specification","Specifications",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,2000);
        int selected=0;for(int i=0;i<Catalog.NAMES.length;i++)if(Catalog.code(i).equals(d.optString("broadCode")))selected=i;
        a.choices("Broad category",Catalog.NAMES,selected,pos->{put(d,"broadCode",Catalog.code(pos));persist();});
        a.label("Detailed category: "+(d.isNull("detailedCode")||d.optString("detailedCode").isEmpty()?"Any within broad category":d.optString("detailedCode")),14);
        a.button("Choose detailed category (106 codes)","market-detailed",()->chooseCategory(code->{put(d,"detailedCode",code);persist();a.render();},true));
        a.choices("Quote and quantity unit",new String[]{"kg","piece"},d.optString("unit").equals("piece")?1:0,pos->{put(d,"unit",pos==0?"kg":"piece");persist();});
        textField(d,"rate","Rate in ₹ per selected unit",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        textField(d,"minimum","Minimum quantity per request",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        textField(d,"target","Total demand (leave empty for unlimited)",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        JSONArray areas=d.optJSONArray("areas");String areaText=areas==null?"":join(areas,", ");
        a.field("Service areas, separated by commas",areaText,"market-areas",InputType.TYPE_CLASS_TEXT,2400,value->{JSONArray values=new JSONArray();for(String area:value.split(","))values.put(area.trim());put(d,"areas",values);persist();});
        JSONArray modes=d.optJSONArray("modes");int mode=modes!=null&&modes.length()==2?2:modes!=null&&modes.optString(0).equals("dropoff")?1:0;
        a.choices("Handover options",new String[]{"Pickup","Drop-off","Pickup and drop-off"},mode,pos->{JSONArray values=new JSONArray();if(pos!=1)values.put("pickup");if(pos!=0)values.put("dropoff");put(d,"modes",values);persist();});
        String date=d.optString("validUntil");a.field("Valid through (YYYY-MM-DD)",date.length()>10?date.substring(0,10):date,"market-validUntil",InputType.TYPE_CLASS_TEXT,10,value->{put(d,"validUntil",value);persist();});
        a.choices("Availability",new String[]{"Paused","Active"},d.optString("state").equals("active")?1:0,pos->{put(d,"state",pos==0?"paused":"active");persist();});
        if(d.optInt("version")>0)textField(d,"reason","Reason for this change",InputType.TYPE_CLASS_TEXT,1000);
        a.button("Save requirement","market-save-requirement",()->{try{
            JSONObject payload=Catalog.copy(d);String raw=d.getString("validUntil");payload.put("validUntil",LocalDate.parse(raw.substring(0,10)).plusDays(1).atStartOfDay(ZoneId.systemDefault()).minusSeconds(1).toInstant().toString());
            payload.put("expectedVersion",d.optInt("version"));change("/requirements/"+d.getString("id"),"PUT",payload,"portfolio");
        }catch(Exception error){a.showError(error);}});
    }
    interface CategoryChoice{void choose(String code);}
    void chooseCategory(CategoryChoice choose,boolean allowAny){catalogue(()->{try{
        JSONArray all=a.store.cached(a.account(),"catalogue").getJSONArray("categories");String[] labels=new String[all.length()+(allowAny?1:0)];
        if(allowAny)labels[0]="Any detailed category";for(int i=0;i<all.length();i++){JSONObject c=all.getJSONObject(i);labels[i+(allowAny?1:0)]=c.getString("code")+" — "+c.getString("name");}
        new AlertDialog.Builder(a).setTitle("Confirm equipment category").setItems(labels,(d,position)->{try{choose.choose(allowAny&&position==0?null:all.getJSONObject(position-(allowAny?1:0)).getString("code"));}catch(Exception e){a.showError(e);}}).setNegativeButton("Back",null).show();
    }catch(Exception e){a.showError(e);}});}
    void requirementSummary(JSONObject r){
        a.label(r.optString("recyclerName")+" · "+r.optString("verificationStatus"),14);
        a.label("₹"+r.optString("rate")+" / "+r.optString("unit")+" · "+r.optString("state"),17);
        a.label("Minimum "+r.optString("minimum")+" · Remaining "+(r.isNull("remaining")?"Unlimited":r.optString("remaining"))+" "+r.optString("unit"),14);
        a.label("Areas: "+join(r.optJSONArray("areas"),", ")+" · Until "+r.optString("validUntil"),14);
        a.label(r.optString("specification"),15);
    }
    String join(JSONArray array,String separator){List<String> items=new ArrayList<>();if(array!=null)for(int i=0;i<array.length();i++)items.add(array.optString(i));return String.join(separator,items);}
    void findMatches(){
        try{
            JSONObject saved=a.store.draft(a.account(),a.draft.getString("id"));if(!saved.optString("syncState").equals("synced")){a.showError(new Exception("Save this draft online before comparing current requirements."));return;}
            JSONObject line=a.draft.getJSONArray("items").getJSONObject(a.itemIndex);
            String quantity=line.isNull("quantity")?"":line.optString("quantity");
            EditText amount=new EditText(a);amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);amount.setText(quantity);
            new AlertDialog.Builder(a).setTitle("Quantity to offer ("+line.optString("unit")+")").setView(amount).setPositiveButton("Find matches",(d,w)->{
                try{String path="/matches?lotId="+a.draft.getString("id")+"&itemId="+line.getString("id")+"&quantity="+URLEncoder.encode(amount.getText().toString(),"UTF-8");
                    JSONObject selection=new JSONObject().put("lotId",a.draft.getString("id")).put("itemId",line.getString("id")).put("quantity",amount.getText().toString()).put("lotVersion",saved.getInt("serverVersion")).put("unit",line.getString("unit"));
                    a.store.cache(a.account(),"market-selection",selection);load("matches",path);
                }catch(Exception e){a.showError(e);}
            }).setNegativeButton("Back",null).show();
        }catch(Exception e){a.showError(e);}
    }
    void matches(JSONObject d)throws Exception{
        a.label("Matching requirements",23);a.label("Compare rates only within the same unit. Logistics is paid separately by the recycler.",15);
        JSONArray list=d.optJSONArray("matches");if(list==null||list.length()==0)a.label("No requirements loaded for this material. Your lot remains saved.",16);
        if(list!=null)for(int i=0;i<list.length();i++){
            JSONObject r=list.getJSONObject(i);a.label(r.getString("title"),20);requirementSummary(r);JSONArray why=r.optJSONArray("exclusions");
            if(why!=null&&why.length()>0)a.label(join(why,". "),15);
            else {if(r.optBoolean("detailedReviewRequired"))a.label("Recycler must confirm the detailed equipment code before acceptance.",14);
                a.button("Review request","market-review-"+r.getString("id"),()->{try{JSONObject review=Catalog.copy(a.store.cached(a.account(),"market-selection"));review.put("requirement",r);review.put("requestId",UUID.randomUUID().toString());review.put("mode",r.getJSONArray("modes").getString(0));show("review",review);}catch(Exception e){a.showError(e);}});
            }
        }more(d,"matches");
    }
    void review(JSONObject d)throws Exception{
        JSONObject r=d.getJSONObject("requirement");a.label("Review and share",23);requirementSummary(r);
        a.label("Quantity: "+d.getString("quantity")+" "+d.getString("unit"),18);
        BigDecimal estimated=new BigDecimal(d.getString("quantity")).multiply(new BigDecimal(r.getString("rate"))).setScale(2,java.math.RoundingMode.HALF_UP);
        a.label("Quoted material estimate: ₹"+estimated,18);a.label("Recycler pays logistics separately. Final price can be revised by agreement and requires a final invoice.",15);
        textField(d,"ask","Your proposed total material amount ₹ (optional)",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        JSONArray modes=r.getJSONArray("modes");String[] names=new String[modes.length()];int selected=0;for(int i=0;i<names.length;i++){names[i]=modes.getString(i);if(names[i].equals(d.optString("mode")))selected=i;}
        a.choices("Handover option",names,selected,pos->{put(d,"mode",names[pos]);persist();});
        a.label("Submitting shares this lot's photos, the selected material details, quantity and collection area with this recycler. Private lot notes are not shared.",15);
        a.button("Share photos and submit request","market-submit-request",()->{JSONObject input=Catalog.copy(d);put(input,"requirementId",r.optString("id"));put(input,"requirementVersion",r.optInt("version"));put(input,"sharePhotos",true);input.remove("requirement");change("/requests/"+d.optString("requestId"),"POST",input,"request");});
    }
    void requests(JSONObject d)throws Exception{
        a.label(a.session.getJSONObject("user").getString("role").equals("recycler")?"Incoming requests":"My requests",23);
        JSONArray list=d.optJSONArray("requests");if(list==null||list.length()==0)a.label("No requests loaded.",16);
        if(list!=null)for(int i=0;i<list.length();i++){JSONObject r=list.getJSONObject(i);a.label(r.getJSONObject("snapshot").optString("lotTitle")+" · "+r.getString("state"),18);a.label(r.getString("quantity")+" "+r.getString("unit"),15);a.button("Open request","market-request-"+r.getString("id"),()->load("request","/requests/"+r.optString("id")));}more(d,"requests");
    }
    void requestSummary(JSONObject r)throws Exception{
        JSONObject s=r.getJSONObject("snapshot");a.label(s.optString("lotTitle"),21);a.label(r.optString("state")+" · "+r.optString("quantity")+" "+r.optString("unit")+" · "+r.optString("mode"),16);
        a.label(s.optString("description")+"\n"+s.optString("condition")+" · "+s.optString("locality"),16);
        a.label("Collector material proposal: ₹"+s.optString("collectorProposal"),18);a.label("Original quoted estimate: ₹"+s.optString("estimatedMaterial")+"\nReviewed: "+s.optString("reviewedAt"),14);
        a.label("Logistics is paid separately by recycler. No payment has been recorded.",14);
        JSONArray photos=s.optJSONArray("fileIds");if(photos!=null)for(int i=0;i<photos.length();i++){String photo=photos.getString(i);a.button("View shared photo "+(i+1),"market-photo-"+i,()->viewPhoto(r.optString("id"),photo));}
    }
    void request(JSONObject d)throws Exception{
        JSONObject r=d.optJSONObject("request");a.label("Request details",23);if(r==null){a.label("Connect to load this request.",16);return;}requestSummary(r);
        JSONObject order=d.optJSONObject("order");if(order!=null)a.button("Open shared order","market-open-order",()->load("order","/orders/"+order.optString("id")));
        boolean open=Arrays.asList("submitted","clarification").contains(r.optString("state")),recycler=a.account().equals(r.optString("recyclerId"));String base="/requests/"+r.getString("id");
        if(open){
            if(recycler){
                a.button("Confirm detailed category","market-confirm-category",()->chooseCategory(code->{JSONObject input=input(r.optInt("version"));put(input,"code",code);change(base+"/review-category","POST",input,"request");},false));
                a.button("Assess shared photo with Gemini","market-assess-shared",()->identify(null,r));
                a.button("Accept material proposal","market-accept",()->new AlertDialog.Builder(a).setTitle("Accept this request?").setMessage("Accept ₹"+r.optJSONObject("snapshot").optString("collectorProposal")+" for material and reserve the requested quantity. You cover logistics separately. Price can still be revised by agreement.").setPositiveButton("Accept",(dialog,which)->change(base+"/accept","POST",input(r.optInt("version")),"order")).setNegativeButton("Back",null).show());
                a.button("Reject with reason","market-reject",()->message("Reject request",base+"/reject",r.optInt("version"),"request"));
            }else a.button("Withdraw request","market-withdraw",()->message("Withdraw request",base+"/withdraw",r.optInt("version"),"request"));
            a.button("Ask or reply to clarification","market-clarify",()->message("Clarification",base+"/clarify",r.optInt("version"),"request"));
        }events(d.optJSONArray("events"));
    }
    void orders(JSONObject d)throws Exception{
        a.label("Shared orders",23);JSONArray list=d.optJSONArray("orders");if(list==null||list.length()==0)a.label("No accepted orders loaded.",16);
        if(list!=null)for(int i=0;i<list.length();i++){JSONObject o=list.getJSONObject(i);a.label("Order "+o.getString("id").substring(0,8)+" · "+o.getString("state"),18);a.label("Material: ₹"+o.getString("materialAmount"),16);a.button("Open order","market-order-"+o.getString("id"),()->load("order","/orders/"+o.optString("id")));}more(d,"orders");
    }
    void order(JSONObject d)throws Exception{
        a.label("Shared order",23);JSONObject o=d.optJSONObject("order");if(o==null){a.label("Connect to load this order.",16);return;}
        a.label("Order "+o.getString("id").substring(0,8)+" · "+o.getString("state"),18);a.label("Acknowledged material amount: ₹"+o.getString("materialAmount"),20);
        a.label(o.optString("logistics")+"\nPayment: "+o.optString("paymentState")+"\nFinal invoice is still required.",15);
        if(d.optJSONObject("request")!=null)a.button("Original request and photos","market-original-request",()->load("request","/requests/"+o.optString("requestId")));
        JSONArray terms=d.optJSONArray("terms");if(terms!=null)for(int i=0;i<terms.length();i++){JSONObject term=terms.getJSONObject(i);a.label("Price revision "+term.getInt("version")+" · ₹"+new BigDecimal(term.getLong("amountPaise")).movePointLeft(2)+" · "+term.getString("status"),16);a.label(term.getString("reason"),14);
            if(o.optString("state").equals("accepted")&&term.getString("status").equals("proposed")&&!a.account().equals(term.getString("proposedBy")))a.button("Acknowledge this price","market-acknowledge",()->{JSONObject input=input(o.optInt("version"));put(input,"termsVersion",term.optInt("version"));change("/orders/"+o.optString("id")+"/acknowledge-terms","POST",input,"order");});
        }
        if(o.optString("state").equals("accepted")){
            a.button("Propose revised material price","market-propose",()->{
                LinearLayout layout=new LinearLayout(a);layout.setOrientation(LinearLayout.VERTICAL);EditText amount=new EditText(a),reason=new EditText(a);amount.setHint("Material amount ₹");amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);reason.setHint("Reason for revision");layout.addView(amount);layout.addView(reason);
                new AlertDialog.Builder(a).setTitle("Propose price revision").setView(layout).setPositiveButton("Propose",(dialog,which)->{JSONObject input=input(o.optInt("version"));put(input,"amount",amount.getText().toString());put(input,"message",reason.getText().toString());change("/orders/"+o.optString("id")+"/propose-terms","POST",input,"order");}).setNegativeButton("Back",null).show();
            });
            a.button("Cancel before collection","market-cancel",()->message("Cancel and release reserved stock","/orders/"+o.optString("id")+"/cancel",o.optInt("version"),"order"));
        }events(d.optJSONArray("events"));
    }
    void events(JSONArray events)throws Exception{a.label("Recent activity",20);if(events==null)return;for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);String message=e.optString("message");if(e.optString("kind").equals("category.confirmed")){JSONObject category=new JSONObject(message);message="Detailed category confirmed: "+category.getString("code")+" — "+category.getString("name");}a.label(e.optString("kind").replace('.',' ')+" · "+e.optString("createdAt")+"\n"+message,14);}}
    void more(JSONObject d,String key){if(d.isNull("nextCursor")||d.optString("nextCursor").isEmpty())return;
        a.button("Next page","market-next",()->{String path=state.optString("path").replaceAll("[?&]after=[^&]*","");load(view(),path+(path.contains("?")?"&":"?")+"after="+d.optString("nextCursor"));});
    }
    void viewPhoto(String requestId,String fileId){String token=a.token();a.task(()->a.api.sharedPhoto(requestId,fileId,token),bytes->{ImageView image=new ImageView(a);image.setImageBitmap(BitmapFactory.decodeByteArray(bytes,0,bytes.length));image.setAdjustViewBounds(true);image.setContentDescription("Photo shared with this request");new AlertDialog.Builder(a).setTitle("Shared lot photo").setView(image).setPositiveButton("Close",null).show();});}
    void identify(JSONObject draft,JSONObject request){
        try{
            JSONArray files=(draft!=null?draft:request.getJSONObject("snapshot")).optJSONArray("fileIds");if(files==null||files.length()==0){a.showError(new Exception("Add a photo or continue with manual category selection."));return;}
            String[] labels=new String[files.length()];for(int i=0;i<labels.length;i++)labels[i]="Photo "+(i+1);
            new AlertDialog.Builder(a).setTitle("Choose a photo for identification").setItems(labels,(dialog,index)->new AlertDialog.Builder(a).setTitle("Identify with Gemini?").setMessage("Send the selected photo to Gemini for a category suggestion. Check the result before using it. You can always choose manually.")
                .setPositiveButton("Identify",(d,w)->runAssessment(draft,request,files.optString(index))).setNegativeButton("Choose manually",null).show()).setNegativeButton("Back",null).show();
        }catch(Exception e){a.showError(e);}
    }
    void runAssessment(JSONObject draft,JSONObject request,String fileId){
        String owner=a.account(),token=a.token(),key="assessment:"+fileId+":"+(request==null?"broad":request.optString("id"));
        a.task(()->{
            JSONObject reference=a.store.cached(owner,key);if(reference==null){reference=new JSONObject().put("id",UUID.randomUUID().toString());a.store.cache(owner,key,reference);}
            else {try{JSONObject prior=a.api.request("GET","/assessments/"+reference.getString("id"),token,null);if(prior.optString("state").equals("ready"))return prior.getJSONObject("result");if(prior.optString("state").equals("failed")){reference=new JSONObject().put("id",UUID.randomUUID().toString());a.store.cache(owner,key,reference);}}catch(AccountApi.Failure error){if(error.status!=404)throw error;}}
            if(draft!=null)new AccountSync(a.store,a.api).save(owner,token,draft.getString("id"));
            JSONObject input=new JSONObject().put("fileId",fileId).put("consent",true);if(request!=null)input.put("requestId",request.getString("id"));
            JSONObject result=a.api.request("POST","/assessments/"+reference.getString("id"),token,input);return result.getJSONObject("result");
        },result->{
            JSONArray items=result.optJSONArray("items");StringBuilder text=new StringBuilder(result.optString("description")).append("\n\n").append(result.optString("uncertainty")).append("\n").append(result.optString("nextPhoto"));
            if(items!=null)for(int i=0;i<items.length();i++)text.append("\n").append(items.optJSONObject(i).optString("code")).append(": ").append(items.optJSONObject(i).optString("evidence"));
            AlertDialog.Builder dialog=new AlertDialog.Builder(a).setTitle("Review identification").setMessage(text.toString()).setNegativeButton("Keep manual selection",null);
            if(items!=null&&items.length()>0)dialog.setPositiveButton("Review a suggested category",(d,w)->{String[] choices=new String[items.length()];for(int i=0;i<choices.length;i++)choices[i]=items.optJSONObject(i).optString("code");new AlertDialog.Builder(a).setTitle("Confirm category").setItems(choices,(di,pos)->{
                if(draft!=null){try{JSONObject current=a.store.draft(owner,draft.getString("id")),line=current.getJSONArray("items").getJSONObject(a.itemIndex);line.put("broadCode",choices[pos]).put("reviewState","confirmed");a.store.save(owner,current);a.draft=current;a.screen="edit";a.render();}catch(Exception e){a.showError(e);}}
                else {JSONObject input=input(request.optInt("version"));put(input,"code",choices[pos]);change("/requests/"+request.optString("id")+"/review-category","POST",input,"request");}
            }).setNegativeButton("Back",null).show();});dialog.show();
        });
    }
}
