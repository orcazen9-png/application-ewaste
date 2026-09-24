package com.ewaste.nativeapp;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.time.Instant;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DiscoveryTest {
 final NativeDesignTest helper=new NativeDesignTest();
 final android.content.Context context=helper.context;
 void idle(ActivityScenario<AccountActivity> s)throws Exception{helper.idle(s);}
 void capture(String name)throws Exception{helper.capture(name);}
 void visible(AccountActivity a,String tag){helper.visible(a,tag);}
 @Test public void differentComputerTypesCreateTwoEditableLinesAndSurviveRecreation()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();MarketplaceTest.MarketApi api=new MarketplaceTest.MarketApi();api.user.put("role","collector");AccountActivity.apiFactory=()->api;
  vault.save(new JSONObject().put("token","suggestion-ui-test").put("user",api.user).put("expiresAt",Instant.now().plusSeconds(3600).toString()));
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());idle(s);
   s.onActivity(a->{try{a.createDraft();JSONArray items=new JSONArray().put(new JSONObject().put("code","B01").put("name","Desktop computer").put("evidence","One desktop tower").put("suggestedUnit","piece").put("approximateCount",1)).put(new JSONObject().put("code","B01").put("name","Laptop").put("evidence","Two laptops").put("suggestedUnit","piece").put("approximateCount",2));MaterialSuggestions.apply(a.draft,items,"photo-reference");MaterialSuggestions.apply(a.draft,items,"photo-reference");assertEquals(2,a.draft.getJSONArray("items").length());a.store.save(a.account(),a.draft);a.editStep=1;a.render();assertNotNull(a.root.findViewWithTag("material-select-1"));}catch(Exception e){throw new AssertionError(e);}});
   idle(s);s.onActivity(a->visible(a,"lot-next"));capture("suggested-materials");s.recreate();idle(s);s.onActivity(a->{assertEquals(2,a.draft.optJSONArray("items").length());assertEquals("piece",a.draft.optJSONArray("items").optJSONObject(1).optString("unit"));assertEquals("2",a.draft.optJSONArray("items").optJSONObject(1).optString("quantity"));a.root.findViewWithTag("material-select-1").performClick();assertEquals(1,a.itemIndex);});
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void directoryAndPostedLotsRenderNativeControls()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();MarketplaceTest.MarketApi api=new MarketplaceTest.MarketApi(){@Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{if(path.startsWith("/directory?"))return new JSONObject().put("recyclers",new JSONArray().put(new JSONObject().put("id",UUID.randomUUID().toString()).put("name","Example authorized recycler").put("locality","Mumbai").put("pickup",true).put("distanceKm",8))).put("nextPage",JSONObject.NULL);return super.request(method,path,token,input);}};api.user.put("role","collector");AccountActivity.apiFactory=()->api;vault.save(new JSONObject().put("token","directory-ui-test").put("user",api.user).put("expiresAt",Instant.now().plusSeconds(3600).toString()));
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());idle(s);s.onActivity(a->a.root.findViewWithTag("home-discover").performClick());idle(s);s.onActivity(a->{assertEquals("directory",a.market.view());assertNotNull(a.root.findViewWithTag("discovery-open-0"));assertNotNull(a.root.findViewWithTag("discovery-gps"));});capture("directory");
   s.onActivity(a->{try{a.session.getJSONObject("user").put("role","recycler");a.market.show("discover",new JSONObject().put("lots",new JSONArray().put(new JSONObject().put("id",UUID.randomUUID().toString()).put("title","Office computers and laptops").put("locality","Mumbai").put("distanceKm",4))).put("nextPage",JSONObject.NULL));assertNotNull(a.root.findViewWithTag("discovery-open-0"));}catch(Exception e){throw new AssertionError(e);}});capture("posted-lots");
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
}
