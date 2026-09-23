package com.ewaste.nativeapp;
import android.view.View;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static androidx.test.espresso.action.ViewActions.*;
import static org.hamcrest.Matchers.is;
@RunWith(AndroidJUnit4.class)
public class CollectorFlowTest {
    static final String CODE="000000000000000000000000000000000000000000000000";
    JSONObject fixture()throws Exception{try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("market-fixture.json")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));}}
    void awaitIdle(ActivityScenario<MainActivity> scenario)throws Exception{AtomicBoolean ready=new AtomicBoolean(false);for(int i=0;i<100&&!ready.get();i++){Thread.sleep(100);scenario.onActivity(a->ready.set(!a.working));}assertTrue(ready.get());}
    @Test public void marketplaceContactOrderAndNativeDestinations()throws Exception{
        JSONObject f=fixture();AtomicReference<String> state=new AtomicReference<>("initial");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{try{a.store.setPendingMarket(null);a.shared=f.getJSONObject("initial");a.store.setShared(a.shared);a.workspaceCode=CODE;a.api=new ApiClient(){@Override public JSONObject json(String method,String path,String code,JSONObject body)throws Exception{
                if(method.equals("GET"))return new JSONObject().put("state",f.getJSONObject(state.get()));String type=body.getJSONObject("command").getString("type");
                if(type.equals("market_contact")){state.set("contacted");return new JSONObject().put("result",f.getJSONObject("contact"));}
                assertEquals("market_order",type);JSONObject input=body.getJSONObject("command").getJSONObject("input");assertEquals("2",input.getString("quantity"));assertTrue(input.getBoolean("materialConfirmed"));assertEquals("piece",input.getString("unit"));state.set("ordered");return new JSONObject().put("result",f.getJSONObject("order"));
            };a.screen="home";a.render();assertNotNull(a.root.findViewWithTag("nav-create"));a.root.findViewWithTag("requirement-requirement-phones").performClick();a.root.findViewWithTag("contact-recycler").performClick();}catch(Exception e){throw new AssertionError(e);}});
            awaitIdle(scenario);scenario.onActivity(a->{assertEquals("contacts",a.screen);assertEquals(1,a.market.array("contacts").length());a.root.findViewWithTag("resume-contact").performClick();a.root.findViewWithTag("create-order").performClick();});
            onView(withTagValue(is("order-quantity"))).perform(typeText("2"),closeSoftKeyboard());onView(withTagValue(is("material-confirmation"))).perform(click());onView(withText("Request order")).perform(click());
            awaitIdle(scenario);scenario.onActivity(a->{assertEquals("order",a.screen);assertEquals(100000,a.market.find("orders",a.market.orderId).optInt("estimatedTotalPaise"));assertNull(a.store.pendingMarket());a.root.findViewWithTag("nav-profile").performClick();assertNotNull(a.root.findViewWithTag("edit-profile"));a.root.findViewWithTag("profile-safety").performClick();assertNotNull(a.root.findViewWithTag("safety-source"));a.market.go("order");});
            scenario.recreate();scenario.onActivity(a->{assertEquals("order",a.screen);assertEquals(1,a.market.array("orders").length());});
        }
    }
    @Test public void interruptedActionRetainsOperationIdAcrossRecreation()throws Exception{
        JSONObject f=fixture();AtomicReference<String> operation=new AtomicReference<>();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{try{a.store.setPendingMarket(null);a.workspaceCode=CODE;a.shared=f.getJSONObject("initial");a.api=new ApiClient(){@Override public JSONObject json(String method,String path,String code,JSONObject body)throws Exception{operation.set(body.getString("operationId"));throw new IOException("Simulated lost response");}};a.market.submit("market_contact",a.market.object("requirementId","requirement-phones"),"contacts");}catch(Exception e){throw new AssertionError(e);}});
            awaitIdle(scenario);scenario.onActivity(a->assertNotNull(a.store.pendingMarket()));scenario.recreate();
            scenario.onActivity(a->{a.workspaceCode=CODE;a.api=new ApiClient(){@Override public JSONObject json(String method,String path,String code,JSONObject body)throws Exception{if(method.equals("GET"))return new JSONObject().put("state",f.getJSONObject("contacted"));assertEquals(operation.get(),body.getString("operationId"));return new JSONObject().put("result",f.getJSONObject("contact"));}};a.market.retry();});
            awaitIdle(scenario);scenario.onActivity(a->{assertNull(a.store.pendingMarket());assertEquals("contacts",a.screen);assertEquals(1,a.market.array("contacts").length());});
        }
    }
}
