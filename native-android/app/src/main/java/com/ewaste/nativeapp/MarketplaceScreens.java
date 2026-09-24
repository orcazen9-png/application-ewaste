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
    final LogisticsScreens logistics;
    final FinanceScreens finance;
    JSONObject state=new JSONObject();
    MarketplaceScreens(AccountActivity activity){a=activity;logistics=new LogisticsScreens(this);finance=new FinanceScreens(this);}
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
            JSONObject pending=a.store.pendingMarket(owner);if(pending==null)throw new IllegalStateException(a.t("No pending action."));
            try {
                if(pending.getString("path").contains("/logistics/")){
                    JSONArray photos=pending.getJSONObject("input").optJSONArray("fileIds");
                    if(photos!=null)for(int i=0;i<photos.length();i++){String photo=photos.getString(i);if(!a.store.uploaded(owner,photo)){a.api.upload(a.store.photo(owner,photo),photo,token);a.store.markUploaded(owner,photo);}}
                }
                JSONObject payload=new JSONObject(pending.getJSONObject("input").toString());
                if(pending.getString("path").endsWith("/finance/invoice")){String doc=payload.getString("documentId"),order=pending.getString("path").split("/")[2];a.api.uploadDocument(finance.documentFile(owner,doc),order,doc,payload.getString("documentMime"),payload.getString("documentName"),token);payload.remove("documentMime");payload.remove("documentName");}
                JSONObject result=a.api.request(pending.getString("method"),pending.getString("path"),token,payload);a.store.finishMarket(owner);return new JSONObject().put("result",result).put("destination",pending.getString("destination"));}
            catch(AccountApi.Failure error){if(error.status>=400&&error.status<500&&error.status!=401&&error.status!=408&&error.status!=429)a.store.finishMarket(owner);throw error;}
        },result->{String destination=result.optString("destination");JSONObject value=result.optJSONObject("result");
            if(destination.equals("portfolio"))load("portfolio","/requirements");
            else if(destination.equals("order"))load("order","/orders/"+value.optString("id"));
            else if(destination.equals("finance"))finance.open(value.optString("id"));
            else if(destination.equals("logistics"))logistics.open(value.optString("id"));
            else load("request","/requests/"+value.optString("id"));
        });
    }
    void pending()throws Exception{if(a.store.pendingMarket(a.account())!=null){a.label(a.t("An earlier action is awaiting confirmation. Retry it to find out whether it was saved."),15);a.button(a.t("Retry pending action"),"market-retry",this::retry);}}
    JSONObject input(int version){JSONObject input=new JSONObject();put(input,"expectedVersion",version);return input;}
    void message(String title,String path,int version,String destination){
        EditText field=new EditText(a);field.setHint(a.t("Reason or clarification"));field.setMinLines(2);
        new AlertDialog.Builder(a).setTitle(title).setView(field).setPositiveButton(a.t("Send"),(d,w)->{JSONObject input=input(version);put(input,"message",field.getText().toString());change(path,"POST",input,destination);}).setNegativeButton(a.t("Back"),null).show();
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
            case "finance":finance.render(d);break;
            case "invoice-form":finance.invoiceForm(d);break;
            case "earnings":finance.earnings(d);break;
            case "inbox":finance.inbox(d);break;
            case "logistics":logistics.render(d);break;
            case "evidence":logistics.evidence(d);break;
        }
        if(!state.optString("path").isEmpty()){
            if(d.has("fetchedAt"))a.label(a.t("Last checked: ")+a.localDate(d.optString("fetchedAt")),12);
            a.button(a.t("Refresh"),"market-refresh",this::refresh);
        }
        // Home and primary destinations remain available in the bottom navigation.
    }
    void catalogue(Runnable ready){
        try{if(a.store.cached(a.account(),"catalogue")!=null){ready.run();return;}}catch(Exception e){a.showError(e);return;}
        String owner=a.account(),token=a.token();a.task(()->{JSONObject result=a.api.request("GET","/catalogue",token,null);a.store.cache(owner,"catalogue",result);return result;},result->ready.run());
    }
    void newRequirement(){catalogue(()->{JSONObject draft=new JSONObject();put(draft,"id",UUID.randomUUID().toString());put(draft,"version",0);put(draft,"unit","kg");put(draft,"state","paused");put(draft,"minimum","1");put(draft,"broadCode","B01");put(draft,"validUntil",LocalDate.now().plusDays(30).toString());put(draft,"areas",new JSONArray().put(a.session.optJSONObject("user").optString("locality")));put(draft,"modes",new JSONArray().put("pickup"));show("requirement",draft);});}
    void portfolio(JSONObject d)throws Exception{
        a.label(a.t("Buying requirements"),23);a.label(a.t(d.optBoolean("demoAccess")?a.t("Demo access only. Facility verification is pending."):a.t("Prepare your portfolio here. Facility verification is required to publish it.")),15);
        a.button(a.t("Add requirement"),"market-add-requirement",this::newRequirement);
        JSONArray list=d.optJSONArray("requirements");if(list==null||list.length()==0)a.label(a.t("No requirements loaded. Add one or refresh when online."),16);
        if(list!=null)for(int i=0;i<list.length();i++){
            JSONObject r=list.getJSONObject(i);a.label(r.getString("title"),20);requirementSummary(r);
            a.button(a.t("Edit requirement"),"market-edit-"+r.getString("id"),()->catalogue(()->show("requirement",Catalog.copy(r))));
        }more(d,"requirements");
    }
    void textField(JSONObject d,String key,String label,int type,int maximum){
        a.field(label,d.isNull(key)?"":d.optString(key),"market-"+key,type,maximum,value->{put(d,key,value);persist();});
    }
    void requirement(JSONObject d)throws Exception{
        a.label(d.optInt("version")==0?a.t("Add requirement"):a.t("Edit requirement"),23);
        textField(d,"title",a.t("Material or equipment"),InputType.TYPE_CLASS_TEXT,120);
        textField(d,"specification",a.t("Specifications"),InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,2000);
        int selected=0;for(int i=0;i<Catalog.NAMES.length;i++)if(Catalog.code(i).equals(d.optString("broadCode")))selected=i;
        a.choices(a.t("Broad category"),Catalog.NAMES,selected,pos->{put(d,"broadCode",Catalog.code(pos));persist();});
        a.label(a.t("Detailed category: ")+(d.isNull("detailedCode")||d.optString("detailedCode").isEmpty()?a.t("Any within broad category"):d.optString("detailedCode")),14);
        a.button(a.t("Choose detailed category (106 codes)"),"market-detailed",()->chooseCategory(code->{put(d,"detailedCode",code);try{JSONArray all=a.store.cached(a.account(),"catalogue").getJSONArray("categories");for(int i=0;i<all.length();i++){JSONObject category=all.getJSONObject(i);if(category.optString("code").equals(code)&&category.has("broad_category_id"))put(d,"broadCode",category.getString("broad_category_id"));}}catch(Exception error){a.showError(error);}persist();a.render();},true));
        a.choices(a.t("Quote and quantity unit"),new String[]{"kg","piece"},d.optString("unit").equals("piece")?1:0,pos->{put(d,"unit",pos==0?"kg":"piece");persist();});
        textField(d,"rate",a.t("Rate in ₹ per selected unit"),InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        textField(d,"minimum",a.t("Minimum quantity per request"),InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        textField(d,"target",a.t("Total demand (leave empty for unlimited)"),InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        JSONArray areas=d.optJSONArray("areas");String areaText=areas==null?"":join(areas,", ");
        a.field(a.t("Service areas, separated by commas"),areaText,"market-areas",InputType.TYPE_CLASS_TEXT,2400,value->{JSONArray values=new JSONArray();for(String area:value.split(","))values.put(area.trim());put(d,"areas",values);persist();});
        JSONArray modes=d.optJSONArray("modes");int mode=modes!=null&&modes.length()==2?2:modes!=null&&modes.optString(0).equals("dropoff")?1:0;
        a.choices(a.t("Handover options"),new String[]{a.t("Pickup"),a.t("Drop-off"),a.t("Pickup and drop-off")},mode,pos->{JSONArray values=new JSONArray();if(pos!=1)values.put("pickup");if(pos!=0)values.put("dropoff");put(d,"modes",values);persist();});
        String date=d.optString("validUntil");a.field(a.t("Valid through (YYYY-MM-DD)"),date.length()>10?date.substring(0,10):date,"market-validUntil",InputType.TYPE_CLASS_TEXT,10,value->{put(d,"validUntil",value);persist();});
        a.choices(a.t("Availability"),new String[]{a.t("Paused"),a.t("Active")},d.optString("state").equals("active")?1:0,pos->{put(d,"state",pos==0?"paused":"active");persist();});
        if(d.optInt("version")>0)textField(d,"reason",a.t("Reason for this change"),InputType.TYPE_CLASS_TEXT,1000);
        a.button(a.t("Save requirement"),"market-save-requirement",()->{try{
            JSONObject payload=Catalog.copy(d);String raw=d.getString("validUntil");payload.put("validUntil",LocalDate.parse(raw.substring(0,10)).plusDays(1).atStartOfDay(ZoneId.systemDefault()).minusSeconds(1).toInstant().toString());
            payload.put("expectedVersion",d.optInt("version"));change("/requirements/"+d.getString("id"),"PUT",payload,"portfolio");
        }catch(Exception error){a.showError(error);}});
    }
    interface CategoryChoice{void choose(String code);}
    void chooseCategory(CategoryChoice choose,boolean allowAny){catalogue(()->{try{
        JSONArray all=a.store.cached(a.account(),"catalogue").getJSONArray("categories");String[] labels=new String[all.length()+(allowAny?1:0)];
        if(allowAny)labels[0]=a.t("Any detailed category");for(int i=0;i<all.length();i++){JSONObject c=all.getJSONObject(i);labels[i+(allowAny?1:0)]=c.getString("code")+" — "+a.t(c.getString("name"));}
        new AlertDialog.Builder(a).setTitle(a.t("Confirm equipment category")).setItems(labels,(d,position)->{try{choose.choose(allowAny&&position==0?null:all.getJSONObject(position-(allowAny?1:0)).getString("code"));}catch(Exception e){a.showError(e);}}).setNegativeButton(a.t("Back"),null).show();
    }catch(Exception e){a.showError(e);}});}
    void requirementSummary(JSONObject r){
        a.label(r.optString("recyclerName")+" · "+(r.optBoolean("demoAccess")?a.t("Demo access only. Facility verification is pending."):a.t(r.optString("verificationStatus"))),14);
        a.label("₹"+r.optString("rate")+" / "+r.optString("unit")+" · "+a.t(r.optString("state")),17);
        a.label(a.t("Minimum ")+r.optString("minimum")+a.t(" · Remaining ")+(r.isNull("remaining")?a.t("Unlimited"):r.optString("remaining"))+" "+r.optString("unit"),14);
        a.label(a.t("Areas: ")+join(r.optJSONArray("areas"),", ")+a.t(" · Until ")+r.optString("validUntil"),14);
        a.label(r.optString("specification"),15);
    }
    String join(JSONArray array,String separator){List<String> items=new ArrayList<>();if(array!=null)for(int i=0;i<array.length();i++)items.add(array.optString(i));return String.join(separator,items);}
    void findMatches(){
        try{
            JSONObject saved=a.store.draft(a.account(),a.draft.getString("id"));if(!saved.optString("syncState").equals("synced")){a.showError(new Exception(a.t("Save this draft online before comparing current requirements.")));return;}
            JSONObject line=a.draft.getJSONArray("items").getJSONObject(a.itemIndex);
            String quantity=line.isNull("quantity")?"":line.optString("quantity");
            EditText amount=new EditText(a);amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);amount.setText(quantity);
            new AlertDialog.Builder(a).setTitle(a.t("Quantity to offer (")+line.optString("unit")+")").setView(amount).setPositiveButton(a.t("Find matches"),(d,w)->{
                try{String path="/matches?lotId="+a.draft.getString("id")+"&itemId="+line.getString("id")+"&quantity="+URLEncoder.encode(amount.getText().toString(),"UTF-8");
                    JSONObject selection=new JSONObject().put("lotId",a.draft.getString("id")).put("itemId",line.getString("id")).put("quantity",amount.getText().toString()).put("lotVersion",saved.getInt("serverVersion")).put("unit",line.getString("unit"));
                    a.store.cache(a.account(),"market-selection",selection);load("matches",path);
                }catch(Exception e){a.showError(e);}
            }).setNegativeButton(a.t("Back"),null).show();
        }catch(Exception e){a.showError(e);}
    }
    void matches(JSONObject d)throws Exception{
        a.label(a.t("Matching requirements"),23);a.label(a.t("Compare rates only within the same unit. Logistics is paid separately by the recycler."),15);
        JSONArray list=d.optJSONArray("matches");if(list==null||list.length()==0)a.label(a.t("No requirements loaded for this material. Your lot remains saved."),16);
        if(list!=null)for(int i=0;i<list.length();i++){
            JSONObject r=list.getJSONObject(i);a.label(r.getString("title"),20);requirementSummary(r);JSONArray why=r.optJSONArray("exclusions");
            if(why!=null&&why.length()>0)a.label(join(why,". "),15);
            else {if(r.optBoolean("detailedReviewRequired"))a.label(a.t("Recycler must confirm the detailed equipment code before acceptance."),14);
                a.button(a.t("Review request"),"market-review-"+r.getString("id"),()->{try{JSONObject review=Catalog.copy(a.store.cached(a.account(),"market-selection"));review.put("requirement",r);review.put("requestId",UUID.randomUUID().toString());review.put("mode",r.getJSONArray("modes").getString(0));show("review",review);}catch(Exception e){a.showError(e);}});
            }
        }more(d,"matches");
    }
    void review(JSONObject d)throws Exception{
        JSONObject r=d.getJSONObject("requirement");a.label(a.t("Review and share"),23);requirementSummary(r);
        a.label(a.t("Quantity: ")+d.getString("quantity")+" "+d.getString("unit"),18);
        BigDecimal estimated=new BigDecimal(d.getString("quantity")).multiply(new BigDecimal(r.getString("rate"))).setScale(2,java.math.RoundingMode.HALF_UP);
        a.label(a.t("Quoted material estimate: ₹")+estimated,18);a.label(a.t("Recycler pays logistics separately. Final price can be revised by agreement and requires a final invoice."),15);
        textField(d,"ask",a.t("Your proposed total material amount ₹ (optional)"),InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12);
        JSONArray modes=r.getJSONArray("modes");String[] names=new String[modes.length()];int selected=0;for(int i=0;i<names.length;i++){names[i]=modes.getString(i);if(names[i].equals(d.optString("mode")))selected=i;}
        a.choices(a.t("Handover option"),names,selected,pos->{put(d,"mode",names[pos]);persist();});
        a.label(a.t("Submitting shares this lot's photos, the selected material details, quantity and collection area with this recycler. Private lot notes are not shared."),15);
        a.button(a.t("Share photos and submit request"),"market-submit-request",()->{JSONObject input=Catalog.copy(d);put(input,"requirementId",r.optString("id"));put(input,"requirementVersion",r.optInt("version"));put(input,"sharePhotos",true);input.remove("requirement");change("/requests/"+d.optString("requestId"),"POST",input,"request");});
    }
    void requests(JSONObject d)throws Exception{
        a.label(a.session.getJSONObject("user").getString("role").equals("recycler")?a.t("Incoming requests"):a.t("My requests"),23);
        JSONArray list=d.optJSONArray("requests");if(list==null||list.length()==0)a.label(a.t("No requests loaded."),16);
        if(list!=null)for(int i=0;i<list.length();i++){JSONObject r=list.getJSONObject(i);a.label(r.getJSONObject("snapshot").optString("lotTitle")+" · "+r.getString("state"),18);a.label(r.getString("quantity")+" "+r.getString("unit"),15);a.button(a.t("Open request"),"market-request-"+r.getString("id"),()->load("request","/requests/"+r.optString("id")));}more(d,"requests");
    }
    void requestSummary(JSONObject r)throws Exception{
        JSONObject s=r.getJSONObject("snapshot");a.label(s.optString("lotTitle"),21);a.label(a.t(r.optString("state"))+" · "+r.optString("quantity")+" "+r.optString("unit")+" · "+a.t(r.optString("mode")),16);
        a.label(s.optString("description")+"\n"+s.optString("condition")+" · "+s.optString("locality"),16);
        a.label(a.t("Collector material proposal: ₹")+s.optString("collectorProposal"),18);a.label(a.t("Original quoted estimate: ₹")+s.optString("estimatedMaterial")+"\nReviewed: "+s.optString("reviewedAt"),14);
        a.label(a.t("Logistics is paid separately by recycler. No payment has been recorded."),14);
        JSONArray photos=s.optJSONArray("fileIds");if(photos!=null)for(int i=0;i<photos.length();i++){String photo=photos.getString(i);a.button(a.t("View shared photo ")+(i+1),"market-photo-"+i,()->viewPhoto(r.optString("id"),photo));}
    }
    void request(JSONObject d)throws Exception{
        JSONObject r=d.optJSONObject("request");a.label(a.t("Request details"),23);if(r==null){a.label(a.t("Connect to load this request."),16);return;}requestSummary(r);
        JSONObject order=d.optJSONObject("order");if(order!=null)a.button(a.t("Open shared order"),"market-open-order",()->load("order","/orders/"+order.optString("id")));
        boolean open=Arrays.asList("submitted","clarification").contains(r.optString("state")),recycler=a.account().equals(r.optString("recyclerId"));String base="/requests/"+r.getString("id");
        if(open){
            if(recycler){
                a.button(a.t("Confirm detailed category"),"market-confirm-category",()->chooseCategory(code->{JSONObject input=input(r.optInt("version"));put(input,"code",code);change(base+"/review-category","POST",input,"request");},false));
                a.button(a.t("Assess shared photo with Gemini"),"market-assess-shared",()->identify(null,r));
                a.button(a.t("Accept material proposal"),"market-accept",()->new AlertDialog.Builder(a).setTitle(a.t("Accept this request?")).setMessage(a.t("Accept ₹")+r.optJSONObject("snapshot").optString("collectorProposal")+a.t(" for material and reserve the requested quantity. You cover logistics separately. Price can still be revised by agreement.")).setPositiveButton(a.t("Accept"),(dialog,which)->change(base+"/accept","POST",input(r.optInt("version")),"order")).setNegativeButton(a.t("Back"),null).show());
                a.button(a.t("Reject with reason"),"market-reject",()->message(a.t("Reject request"),base+"/reject",r.optInt("version"),"request"));
            }else a.button(a.t("Withdraw request"),"market-withdraw",()->message(a.t("Withdraw request"),base+"/withdraw",r.optInt("version"),"request"));
            a.button(a.t("Ask or reply to clarification"),"market-clarify",()->message(a.t("Clarification"),base+"/clarify",r.optInt("version"),"request"));
        }events(d.optJSONArray("events"));
    }
    void orders(JSONObject d)throws Exception{
        a.label(a.t("Shared orders"),23);JSONArray list=d.optJSONArray("orders");if(list==null||list.length()==0)a.label(a.t("No accepted orders loaded."),16);
        if(list!=null)for(int i=0;i<list.length();i++){JSONObject o=list.getJSONObject(i);a.label(a.t("Order ")+o.getString("id").substring(0,8)+" · "+a.t(o.getString("state")),18);a.label(a.t("Material: ₹")+o.getString("materialAmount"),16);a.button(a.t("Open order"),"market-order-"+o.getString("id"),()->load("order","/orders/"+o.optString("id")));}more(d,"orders");
    }
    void order(JSONObject d)throws Exception{
        a.label(a.t("Shared order"),23);JSONObject o=d.optJSONObject("order");if(o==null){a.label(a.t("Connect to load this order."),16);return;}
        a.label(a.t("Order ")+o.getString("id").substring(0,8)+" · "+o.getString("state"),18);a.label(a.t("Acknowledged material amount: ₹")+o.getString("materialAmount"),20);
        a.label(o.optString("logistics")+"\nPayment: "+a.t(o.optString("paymentState"))+a.t("\nFinal invoice is still required."),15);
        a.button(a.t("Invoices & settlement"),"market-finance",()->finance.open(o.optString("id")));
        a.button(a.t("Pickup & receipt"),"market-logistics",()->logistics.open(o.optString("id")));
        if(d.optJSONObject("request")!=null)a.button(a.t("Original request and photos"),"market-original-request",()->load("request","/requests/"+o.optString("requestId")));
        JSONArray terms=d.optJSONArray("terms");if(terms!=null)for(int i=0;i<terms.length();i++){JSONObject term=terms.getJSONObject(i);a.label(a.t("Price revision ")+term.getInt("version")+" · ₹"+new BigDecimal(term.getLong("amountPaise")).movePointLeft(2)+" · "+a.t(term.getString("status")),16);a.label(term.getString("reason"),14);
            if(o.optString("state").equals("accepted")&&term.getString("status").equals("proposed")&&!a.account().equals(term.getString("proposedBy")))a.button(a.t("Acknowledge this price"),"market-acknowledge",()->{JSONObject input=input(o.optInt("version"));put(input,"termsVersion",term.optInt("version"));change("/orders/"+o.optString("id")+"/acknowledge-terms","POST",input,"order");});
        }
        if(o.optString("state").equals("accepted")){
            a.button(a.t("Propose revised material price"),"market-propose",()->{
                LinearLayout layout=new LinearLayout(a);layout.setOrientation(LinearLayout.VERTICAL);EditText amount=new EditText(a),reason=new EditText(a);amount.setHint(a.t("Material amount ₹"));amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);reason.setHint(a.t("Reason for revision"));layout.addView(amount);layout.addView(reason);
                new AlertDialog.Builder(a).setTitle(a.t("Propose price revision")).setView(layout).setPositiveButton(a.t("Propose"),(dialog,which)->{JSONObject input=input(o.optInt("version"));put(input,"amount",amount.getText().toString());put(input,"message",reason.getText().toString());change("/orders/"+o.optString("id")+"/propose-terms","POST",input,"order");}).setNegativeButton(a.t("Back"),null).show();
            });
            if(o.optBoolean("canCancel",true))a.button(a.t("Cancel before collection"),"market-cancel",()->message(a.t("Cancel and release reserved stock"),"/orders/"+o.optString("id")+"/cancel",o.optInt("version"),"order"));
        }events(d.optJSONArray("events"));
    }
    void events(JSONArray events)throws Exception{a.label(a.t("Recent activity"),20);if(events==null)return;for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);String message=e.optString("message");if(e.optString("kind").equals("category.confirmed")){JSONObject category=new JSONObject(message);message=a.t("Detailed category confirmed: ")+category.getString("code")+" — "+a.t(category.getString("name"));}a.label(a.t(e.optString("kind")).replace('.',' ')+" · "+a.localDate(e.optString("createdAt"))+"\n"+message,14);}}
    void more(JSONObject d,String key){if(d.isNull("nextCursor")||d.optString("nextCursor").isEmpty())return;
        a.button(a.t("Next page"),"market-next",()->{String path=state.optString("path").replaceAll("[?&]after=[^&]*","");load(view(),path+(path.contains("?")?"&":"?")+"after="+d.optString("nextCursor"));});
    }
    void viewPhoto(String requestId,String fileId){String token=a.token();a.task(()->a.api.sharedPhoto(requestId,fileId,token),bytes->{ImageView image=new ImageView(a);image.setImageBitmap(BitmapFactory.decodeByteArray(bytes,0,bytes.length));image.setAdjustViewBounds(true);image.setContentDescription(a.t("Photo shared with this request"));new AlertDialog.Builder(a).setTitle(a.t("Shared lot photo")).setView(image).setPositiveButton(a.t("Close"),null).show();});}
    void identify(JSONObject draft,JSONObject request){
        try{
            JSONArray files=(draft!=null?draft:request.getJSONObject("snapshot")).optJSONArray("fileIds");if(files==null||files.length()==0){a.showError(new Exception(a.t("Add a photo or continue with manual category selection.")));return;}
            String[] labels=new String[files.length()];for(int i=0;i<labels.length;i++)labels[i]=a.t("Photo ")+(i+1);
            new AlertDialog.Builder(a).setTitle(a.t("Choose a photo for identification")).setItems(labels,(dialog,index)->new AlertDialog.Builder(a).setTitle(a.t("Identify with Gemini?")).setMessage(a.t("Send the selected photo to Gemini for a category suggestion. Check the result before using it. You can always choose manually."))
                .setPositiveButton(a.t("Identify"),(d,w)->runAssessment(draft,request,files.optString(index))).setNegativeButton(a.t("Choose manually"),null).show()).setNegativeButton(a.t("Back"),null).show();
        }catch(Exception e){a.showError(e);}
    }
    void runAssessment(JSONObject draft,JSONObject request,String fileId){
        String owner=a.account(),token=a.token(),key="assessment:"+fileId+":"+(request==null?"broad":request.optString("id"));
        a.task(()->{
            JSONObject reference=a.store.cached(owner,key);if(reference==null){reference=new JSONObject().put("id",UUID.randomUUID().toString());a.store.cache(owner,key,reference);}
            else {try{JSONObject prior=a.api.request("GET","/assessments/"+reference.getString("id"),token,null);if(prior.optString("state").equals("ready"))return prior.getJSONObject("result");if(prior.optString("state").equals("failed")){reference=new JSONObject().put("id",UUID.randomUUID().toString());a.store.cache(owner,key,reference);}}catch(AccountApi.Failure error){if(error.status!=404)throw error;}}
            if(draft!=null&&!a.store.uploaded(owner,fileId)){a.api.upload(a.store.photo(owner,fileId),fileId,token);a.store.markUploaded(owner,fileId);}
            JSONObject input=new JSONObject().put("fileId",fileId).put("consent",true);if(request!=null)input.put("requestId",request.getString("id"));
            JSONObject result=a.api.request("POST","/assessments/"+reference.getString("id"),token,input);return result.getJSONObject("result");
        },result->{
            JSONArray items=result.optJSONArray("items");StringBuilder text=new StringBuilder(result.optString("description")).append("\n\n").append(result.optString("uncertainty")).append("\n").append(result.optString("nextPhoto"));
            if(items!=null)for(int i=0;i<items.length();i++)text.append("\n").append(items.optJSONObject(i).optString("code")).append(": ").append(items.optJSONObject(i).optString("evidence"));
            AlertDialog.Builder dialog=new AlertDialog.Builder(a).setTitle(a.t("Review identification")).setMessage(text.toString()).setNegativeButton(a.t("Keep manual selection"),null);
            if(items!=null&&items.length()>0)dialog.setPositiveButton(a.t("Review a suggested category"),(d,w)->{String[] choices=new String[items.length()];for(int i=0;i<choices.length;i++)choices[i]=items.optJSONObject(i).optString("code");new AlertDialog.Builder(a).setTitle(a.t("Confirm category")).setItems(choices,(di,pos)->{
                if(draft!=null){try{JSONObject current=a.store.draft(owner,draft.getString("id")),line=current.getJSONArray("items").getJSONObject(a.itemIndex);if(!line.optString("broadCode").equals(choices[pos]))line.put("detailedCode",JSONObject.NULL);line.put("broadCode",choices[pos]).put("reviewState","confirmed");a.store.save(owner,current);a.draft=current;a.editStep=1;a.screen="edit";a.render();}catch(Exception e){a.showError(e);}}
                else {JSONObject input=input(request.optInt("version"));put(input,"code",choices[pos]);change("/requests/"+request.optString("id")+"/review-category","POST",input,"request");}
            }).setNegativeButton(a.t("Back"),null).show();});dialog.show();
        });
    }
}
