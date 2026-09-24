package com.ewaste.nativeapp;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
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
public class LogisticsTest {
    final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    void idle(ActivityScenario<AccountActivity> s)throws Exception{AtomicBoolean done=new AtomicBoolean();for(int i=0;i<150&&!done.get();i++){Thread.sleep(100);s.onActivity(a->done.set(!a.working));}assertTrue(done.get());}
    void enter(ActivityScenario<AccountActivity> s,LogApi api)throws Exception{s.onActivity(a->a.market.load("order","/orders/"+api.order.optString("id")));idle(s);s.onActivity(a->a.root.findViewWithTag("market-logistics").performClick());idle(s);}
    void signIn(LogApi api)throws Exception{new SessionVault(context).save(new JSONObject().put("token","ews_"+String.join("",Collections.nCopies(64,"e"))).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",api.user));AccountActivity.apiFactory=()->api;}
    @Test public void collectorEvidenceSurvivesRestartUploadsOnceAndRetriesLostHandoverResponse()throws Exception{
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();LogApi api=new LogApi(true);signIn(api);
        try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
            s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());
            idle(s);enter(s,api);s.onActivity(a->a.root.findViewWithTag("logistics-pickup").performClick());
            s.onActivity(a->{((EditText)a.root.findViewWithTag("evidence-quantity")).setText("200");((EditText)a.root.findViewWithTag("evidence-condition")).setText("Sorted computers");((EditText)a.root.findViewWithTag("evidence-location")).setText("Mumbai gate 2");((EditText)a.root.findViewWithTag("evidence-message")).setText("Weight checked together");});
            File image=File.createTempFile("handover",".jpg",context.getCacheDir());try(FileOutputStream out=new FileOutputStream(image)){Bitmap bitmap=Bitmap.createBitmap(20,20,Bitmap.Config.ARGB_8888);bitmap.compress(Bitmap.CompressFormat.JPEG,85,out);bitmap.recycle();}
            s.onActivity(a->a.processPhoto(Uri.fromFile(image),a.account(),a.market.logistics.context()));idle(s);s.recreate();idle(s);
            s.onActivity(a->{assertEquals("200",a.market.data().optString("quantity"));assertEquals(1,a.market.data().optJSONArray("fileIds").length());a.root.findViewWithTag("evidence-submit").performClick();});onView(withText("Submit")).inRoot(isDialog()).perform(click());idle(s);
            onView(withText("OK")).inRoot(isDialog()).perform(click());
            s.recreate();idle(s);s.onActivity(a->a.root.findViewWithTag("market-retry").performClick());idle(s);
            assertEquals(1,api.uploads);assertEquals(1,api.writes);assertEquals(2,api.attempts);
            s.onActivity(a->{assertEquals("logistics",a.market.view());assertEquals("picked_up",a.market.data().optJSONObject("logistics").optString("state"));assertEquals("Not recorded",a.market.data().optJSONObject("order").optString("paymentState"));assertNull(a.root.findViewWithTag("logistics-pickup"));});
            try(InputStream capture=new ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /sdcard/logistics.png"))){byte[] b=new byte[8192];while(capture.read(b)!=-1){}}
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }
    @Test public void recyclerAcknowledgesSeparateLogisticsChargeAndRecordsReceiptWithoutMarkingPaid()throws Exception{
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();LogApi api=new LogApi(false);api.j.put("costAcknowledged",false).put("state","picked_up").put("pickup",new JSONObject().put("quantity","200"));signIn(api);
        try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
            s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());
            idle(s);enter(s,api);s.onActivity(a->a.root.findViewWithTag("logistics-ack-cost").performClick());onView(withText("Acknowledge")).inRoot(isDialog()).perform(click());idle(s);
            s.onActivity(a->a.root.findViewWithTag("logistics-receipt").performClick());
            s.onActivity(a->{((EditText)a.root.findViewWithTag("evidence-quantity")).setText("180");((EditText)a.root.findViewWithTag("evidence-condition")).setText("Sorted");((EditText)a.root.findViewWithTag("evidence-location")).setText("Mumbai receiving bay");((EditText)a.root.findViewWithTag("evidence-message")).setText("20 kg missing");((EditText)a.root.findViewWithTag("evidence-noPhotoReason")).setText("Camera unavailable; weight slip reference 12");a.root.findViewWithTag("evidence-submit").performClick();});onView(withText("Submit")).inRoot(isDialog()).perform(click());idle(s);
            assertEquals("180",api.j.getJSONObject("receipt").getString("quantity"));assertEquals("Not recorded",api.order.getString("paymentState"));assertTrue(api.j.getBoolean("costAcknowledged"));assertEquals(0,api.uploads);
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }
    static final class LogApi extends MarketplaceTest.MarketApi {
        final JSONObject j;int writes=0,attempts=0,uploads=0;String savedCommand="";final boolean collector;
        LogApi(boolean collector)throws Exception{this.collector=collector;if(collector)user.put("id",request.getString("collectorId")).put("role","collector");order.put("collectorId",request.getString("collectorId")).put("recyclerId",request.getString("recyclerId"));j=new JSONObject().put("state","scheduled").put("unit","kg").put("mode","pickup").put("requested","200").put("acceptedQuantity",JSONObject.NULL).put("returnedQuantity","0").put("costVersion",1).put("costAcknowledged",true).put("cost",new JSONObject().put("amount","1000.00").put("basis","estimate").put("payee","Local transport")).put("schedule",new JSONObject().put("partnerName","Local transport").put("partnerContact","Dispatch desk").put("start","2026-09-25T09:00:00Z").put("end","2026-09-25T11:00:00Z").put("instructions","Loading gate 2"));}
        @Override public void upload(File file,String id,String token)throws Exception{assertTrue(file.length()>0);uploads++;}
        @Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{
            String base="/orders/"+order.getString("id")+"/logistics";
            if(path.equals(base))return new JSONObject().put("order",order).put("logistics",j).put("records",new JSONArray()).put("cases",new JSONArray());
            if(path.equals(base+"/acknowledge-cost")){assertEquals(1,input.getInt("costVersion"));j.put("costAcknowledged",true);order.put("version",order.getInt("version")+1);return new JSONObject().put("id",order.getString("id"));}
            if(path.equals(base+"/pickup")||path.equals(base+"/receipt")){
                attempts++;if(!savedCommand.equals(input.getString("commandId"))){assertEquals(order.getInt("version"),input.getInt("expectedVersion"));assertEquals("manual",input.getString("locationSource"));savedCommand=input.getString("commandId");writes++;j.put(collector?"pickup":"receipt",input).put("state",collector?"picked_up":"received");order.put("version",order.getInt("version")+1);if(collector)throw new IOException("Simulated response lost after handover saved");}
                return new JSONObject().put("id",order.getString("id"));
            }
            return super.request(method,path,token,input);
        }
    }
}
