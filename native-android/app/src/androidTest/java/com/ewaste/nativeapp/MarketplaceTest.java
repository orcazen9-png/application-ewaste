package com.ewaste.nativeapp;

import android.content.Context;
import android.os.ParcelFileDescriptor;
import android.widget.EditText;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
import static androidx.test.espresso.action.ViewActions.click;

@RunWith(AndroidJUnit4.class)
public class MarketplaceTest {
    final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    String id(){return UUID.randomUUID().toString();}
    void idle(ActivityScenario<AccountActivity> scenario)throws Exception{AtomicBoolean done=new AtomicBoolean();for(int i=0;i<150&&!done.get();i++){Thread.sleep(100);scenario.onActivity(a->done.set(!a.working));}assertTrue(done.get());}
    @Test public void uncertainCommercialCommandSurvivesRestartAndIsScopedToItsActor()throws Exception{
        String actor=id(),other=id(),request=id(),command;
        try(AccountStore store=new AccountStore(context)){
            JSONObject queued=store.queueMarket(actor,"POST","/requests/"+request,new JSONObject().put("quantity","200"),"request");command=queued.getJSONObject("input").getString("commandId");
            try{store.queueMarket(actor,"POST","/requests/"+id(),new JSONObject(),"request");fail("An uncertain action must be retried before another is submitted");}catch(IllegalStateException expected){}
            store.cache(actor,"market-ui",new JSONObject().put("view","review"));
        }
        try(AccountStore store=new AccountStore(context)){
            assertEquals(command,store.pendingMarket(actor).getJSONObject("input").getString("commandId"));assertNull(store.pendingMarket(other));assertNull(store.cached(other,"market-ui"));
            store.finishMarket(actor);assertNull(store.pendingMarket(actor));
        }
    }
    @Test public void recyclerEditsPortfolioAcceptsRequestAndReopensNativeSharedOrder()throws Exception{
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();MarketApi api=new MarketApi();AccountActivity.apiFactory=()->api;
        vault.save(new JSONObject().put("token","ews_"+String.join("",Collections.nCopies(64,"c"))).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",api.user));
        try(ActivityScenario<AccountActivity> scenario=ActivityScenario.launch(AccountActivity.class)){
            idle(scenario);scenario.onActivity(a->a.root.findViewWithTag("account-portfolio").performClick());idle(scenario);
            scenario.onActivity(a->a.root.findViewWithTag("market-edit-"+api.requirement.optString("id")).performClick());idle(scenario);
            scenario.onActivity(a->{((EditText)a.root.findViewWithTag("market-rate")).setText("55.25");((EditText)a.root.findViewWithTag("market-reason")).setText("Updated buying quote");a.root.findViewWithTag("market-save-requirement").performClick();});idle(scenario);
            assertEquals("55.25",api.requirement.getString("rate"));assertEquals(1,api.requirementWrites);
            scenario.onActivity(a->{a.root.findViewWithTag("market-home").performClick();a.root.findViewWithTag("account-requests").performClick();});idle(scenario);
            scenario.onActivity(a->a.root.findViewWithTag("market-request-"+api.request.optString("id")).performClick());idle(scenario);
            scenario.onActivity(a->a.root.findViewWithTag("market-accept").performClick());onView(withText("Accept")).inRoot(isDialog()).perform(click());idle(scenario);
            scenario.onActivity(a->{assertEquals("order",a.market.view());assertEquals("10000.00",a.market.data().optJSONObject("order").optString("materialAmount"));assertNull(a.root.findViewWithTag("mark-paid"));});
            scenario.recreate();idle(scenario);
            scenario.onActivity(a->{assertEquals("order",a.market.view());assertNotNull(a.root.findViewWithTag("market-propose"));assertNotNull(a.root.findViewWithTag("market-cancel"));});
            assertEquals(1,api.accepts);
            try(InputStream capture=new ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /sdcard/market-order.png"))){byte[] buffer=new byte[8192];while(capture.read(buffer)!=-1){}}
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }
    @Test public void collectorComparesRequirementReviewsAndSubmitsOneNativeRequest()throws Exception{
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();MarketApi api=new MarketApi();
        api.user.put("id",api.request.getString("collectorId")).put("role","collector");AccountActivity.apiFactory=()->api;
        vault.save(new JSONObject().put("token","ews_"+String.join("",Collections.nCopies(64,"d"))).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",api.user));
        try(ActivityScenario<AccountActivity> scenario=ActivityScenario.launch(AccountActivity.class)){
            idle(scenario);scenario.onActivity(a->a.root.findViewWithTag("account-open-"+api.lot.optString("id")).performClick());
            scenario.onActivity(a->{try{assertEquals("synced",a.store.draft(a.account(),a.draft.getString("id")).getString("syncState"));}catch(Exception e){throw new AssertionError(e);}a.root.findViewWithTag("account-find-matches").performClick();});onView(withText("Find matches")).inRoot(isDialog()).perform(click());idle(scenario);
            scenario.onActivity(a->a.root.findViewWithTag("market-review-"+api.requirement.optString("id")).performClick());
            scenario.onActivity(a->a.root.findViewWithTag("market-submit-request").performClick());idle(scenario);
            scenario.onActivity(a->{assertEquals("request",a.market.view());assertEquals("submitted",a.market.data().optJSONObject("request").optString("state"));});
            assertEquals(1,api.submissions);scenario.recreate();idle(scenario);assertEquals(1,api.submissions);
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }
    static final class MarketApi extends AccountApi {
        final JSONObject user,requirement,request,order,lot;int requirementWrites=0,accepts=0,submissions=0;
        MarketApi()throws Exception{
            String recycler=UUID.randomUUID().toString(),collector=UUID.randomUUID().toString(),rid=UUID.randomUUID().toString(),sid=UUID.randomUUID().toString();
            user=new JSONObject().put("id",recycler).put("role","recycler").put("displayName","Test recycler").put("mobile","+919000000002").put("locality","Mumbai").put("language","en").put("version",1);
            requirement=new JSONObject().put("id",rid).put("title","Computers wanted").put("specification","Sorted computers").put("broadCode","B01").put("detailedCode",JSONObject.NULL).put("unit","kg").put("rate","50.00").put("ratePaise",5000).put("minimum","10").put("target","500").put("remaining","500").put("areas",new JSONArray().put("Mumbai")).put("modes",new JSONArray().put("pickup")).put("state","active").put("version",1).put("validUntil",Instant.now().plusSeconds(864000).toString()).put("recyclerName","Test recycler").put("verificationStatus","verified");
            JSONObject snapshot=new JSONObject().put("lotTitle","Sorted computer lot").put("description","Used computers").put("condition","sorted").put("locality","Mumbai").put("collectorProposal","10000.00").put("estimatedMaterial","10000.00").put("fileIds",new JSONArray()).put("requirement",requirement).put("reviewedAt",Instant.now().toString());
            request=new JSONObject().put("id",sid).put("recyclerId",recycler).put("collectorId",collector).put("quantity","200").put("unit","kg").put("mode","pickup").put("state","submitted").put("version",1).put("snapshot",snapshot);
            order=new JSONObject().put("id",UUID.randomUUID().toString()).put("requestId",sid).put("state","accepted").put("version",1).put("materialAmount","10000.00").put("logistics","Not arranged; recycler pays separately").put("paymentState","Not recorded");
            lot=new JSONObject().put("id",UUID.randomUUID().toString()).put("title","Computer lot").put("locality","Mumbai").put("notes","").put("taxonomyVersion","106-draft-v1").put("version",1).put("fileIds",new JSONArray()).put("items",new JSONArray().put(new JSONObject().put("id",UUID.randomUUID().toString()).put("broadCode","B01").put("detailedCode",JSONObject.NULL).put("description","Computers").put("condition","sorted").put("quantity","200").put("unit","kg").put("reviewState","confirmed")));
        }
        @Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{
            if(path.equals("/me"))return new JSONObject().put("user",user).put("facilities",new JSONArray());
            if(path.equals("/lots"))return new JSONObject().put("lots",new JSONArray().put(lot)).put("nextCursor",JSONObject.NULL);
            if(path.startsWith("/matches?"))return new JSONObject().put("matches",new JSONArray().put(new JSONObject(requirement.toString()).put("exclusions",new JSONArray()))).put("lotVersion",1);
            if(path.equals("/catalogue"))return new JSONObject().put("categories",new JSONArray().put(new JSONObject().put("code","ITEW3").put("name","Laptop computers")));
            if(path.equals("/requirements"))return new JSONObject().put("requirements",new JSONArray().put(requirement)).put("nextCursor",JSONObject.NULL);
            if(path.equals("/requirements/"+requirement.getString("id"))&&method.equals("PUT")){assertEquals(1,input.getInt("expectedVersion"));assertFalse(input.getString("commandId").isEmpty());requirement.put("rate",input.getString("rate")).put("version",2);requirementWrites++;return new JSONObject().put("id",requirement.getString("id")).put("version",2);}
            if(path.equals("/requests"))return new JSONObject().put("requests",new JSONArray().put(request));
            if(path.startsWith("/requests/")&&path.substring("/requests/".length()).indexOf('/')<0&&method.equals("POST")){
                assertEquals(lot.getString("id"),input.getString("lotId"));assertEquals(1,input.getInt("requirementVersion"));assertEquals("200",input.getString("quantity"));assertTrue(input.getBoolean("sharePhotos"));submissions++;request.put("id",path.substring("/requests/".length()));return new JSONObject().put("id",request.getString("id")).put("version",1);
            }
            if(path.equals("/requests/"+request.getString("id")))return new JSONObject().put("request",request).put("events",new JSONArray()).put("order",accepts>0?order:JSONObject.NULL);
            if(path.equals("/requests/"+request.getString("id")+"/accept")){assertEquals(1,input.getInt("expectedVersion"));accepts++;request.put("state","accepted");return new JSONObject().put("id",order.getString("id")).put("version",1);}
            if(path.equals("/orders/"+order.getString("id")))return new JSONObject().put("order",order).put("request",request).put("terms",new JSONArray()).put("events",new JSONArray());
            throw new IOException("Unexpected market test request: "+method+" "+path);
        }
    }
}
