package com.ewaste.nativeapp;

import android.content.Context;
import android.graphics.Rect;
import android.os.ParcelFileDescriptor;
import android.view.*;
import android.widget.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeDesignTest {
    final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    void idle(ActivityScenario<AccountActivity> scenario)throws Exception{AtomicBoolean done=new AtomicBoolean();for(int i=0;i<150&&!done.get();i++){Thread.sleep(100);scenario.onActivity(a->done.set(!a.working));}assertTrue(done.get());InstrumentationRegistry.getInstrumentation().waitForIdleSync();}
    void visible(AccountActivity a,String tag){View v=a.root.findViewWithTag(tag);assertNotNull(tag,v);Rect bounds=new Rect();assertTrue(tag+" is visible",v.getGlobalVisibleRect(bounds));assertEquals(tag+" has its full touch target",v.getHeight(),bounds.height());assertTrue(tag+" meets minimum touch height",bounds.height()>=a.dp(48));}
    void capture(String name)throws Exception{String prefix=InstrumentationRegistry.getArguments().getString("screenshotPrefix","ui");ParcelFileDescriptor fd=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /sdcard/"+prefix+"-"+name+".png");try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(fd)){byte[] b=new byte[4096];while(in.read(b)!=-1){}}}
    @Test public void photoFirstFlowAndPersistentNavigationRenderWithoutClippedActions()throws Exception{
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();String userId=UUID.randomUUID().toString();
        JSONObject user=new JSONObject().put("id",userId).put("role","collector").put("displayName","Collector").put("locality","Mumbai").put("language","en").put("mobile","invited:test").put("version",1);
        AccountActivity.apiFactory=()->new AccountApi(){@Override public JSONObject request(String method,String path,String token,JSONObject body)throws Exception{
            if(path.equals("/me"))return new JSONObject().put("user",user);
            if(path.equals("/lots"))return new JSONObject().put("lots",new JSONArray()).put("nextCursor",JSONObject.NULL);
            if(path.equals("/earnings"))return new JSONObject().put("role","collector").put("expected","0.00").put("pending","0.00").put("confirmed","0.00").put("approved","0.00").put("outstanding","0.00").put("orders",new JSONArray());
            if(path.equals("/auth/logout"))return new JSONObject();throw new IOException("Unexpected request "+path);
        }};
        vault.save(new JSONObject().put("token","visual-test-only").put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",user));
        try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
            idle(s);s.onActivity(a->{visible(a,"account-create");visible(a,"account-profile");});capture("home");
            s.onActivity(a->a.root.findViewWithTag("account-create").performClick());idle(s);s.onActivity(a->{visible(a,"account-take-photo");visible(a,"account-choose-photo");visible(a,"lot-next");assertNull(a.root.findViewWithTag("account-lot-title"));});capture("photos");
            s.onActivity(a->a.root.findViewWithTag("lot-next").performClick());idle(s);s.onActivity(a->{visible(a,"lot-next");assertNotNull(a.root.findViewWithTag("account-category"));((EditText)a.root.findViewWithTag("account-lot-title")).setText("Office laptops");});
            s.recreate();idle(s);s.onActivity(a->{assertEquals(1,a.editStep);assertEquals("Office laptops",a.draft.optString("title"));});capture("details");
            s.onActivity(a->{a.draft=null;a.screen="home";a.render();a.root.findViewWithTag("account-earnings").performClick();});idle(s);s.onActivity(a->{visible(a,"account-earnings");visible(a,"account-profile");assertEquals("0.00",a.market.data().optString("confirmed"));});capture("earnings");
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }
}
