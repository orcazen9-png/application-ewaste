package com.ewaste.nativeapp;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import android.widget.EditText;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.time.Instant;
import java.util.UUID;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
import static androidx.test.espresso.action.ViewActions.click;

@RunWith(AndroidJUnit4.class)
public class ChatDeletionTest {
 final NativeDesignTest helper=new NativeDesignTest();
 @Test public void recyclerMessagesAndAcceptsReceivedOfferFromConversation()throws Exception{
  SessionVault vault=new SessionVault(helper.context);JSONObject previous=vault.read();String chatId=UUID.randomUUID().toString();final int[] sent={0};
  MarketplaceTest.MarketApi api=new MarketplaceTest.MarketApi(){final JSONArray messages=new JSONArray();@Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{
   if(path.equals("/conversations"))return new JSONObject().put("id",chatId);
   if(path.equals("/conversations/"+chatId+"/messages")){sent[0]++;messages.put(new JSONObject().put("actorId",user.getString("id")).put("message",input.getString("message")).put("createdAt",Instant.now().toString()));return new JSONObject().put("id",chatId);}
   if(path.equals("/conversations/"+chatId))return new JSONObject().put("conversation",new JSONObject().put("id",chatId).put("lotTitle","Office laptops").put("locality","Virar").put("collector_id",request.getString("collectorId")).put("collectorName","Virar aggregator").put("recyclerName","Navi Mumbai recycler")).put("messages",messages).put("offers",new JSONArray().put(request)).put("olderCursor",JSONObject.NULL);
   return super.request(method,path,token,input);
  }};api.request.put("lotId",api.lot.getString("id")).put("proposedBy",api.request.getString("collectorId")).put("offerVersion",1);AccountActivity.apiFactory=()->api;vault.save(new JSONObject().put("token","chat-ui-test").put("user",api.user).put("expiresAt",Instant.now().plusSeconds(3600).toString()));
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());helper.idle(s);s.onActivity(a->a.market.chat.start(api.lot.optString("id"),api.user.optString("id")));helper.idle(s);
   s.onActivity(a->{assertNotNull(a.root.findViewWithTag("chat-accept-0"));helper.visible(a,"chat-send");((EditText)a.root.findViewWithTag("chat-message")).setText("Can we arrange pickup tomorrow?");});s.recreate();helper.idle(s);
   s.onActivity(a->{assertEquals("Can we arrange pickup tomorrow?",((EditText)a.root.findViewWithTag("chat-message")).getText().toString());a.root.findViewWithTag("chat-send").performClick();});helper.idle(s);assertEquals(1,sent[0]);helper.capture("conversation");
   s.onActivity(a->{assertEquals("",((EditText)a.root.findViewWithTag("chat-message")).getText().toString());a.root.findViewWithTag("chat-accept-0").performClick();});onView(withText("Accept")).inRoot(isDialog()).perform(click());helper.idle(s);assertEquals(1,api.accepts);
   s.onActivity(a->{assertEquals("order",a.market.view());try{api.request.put("state","submitted").put("proposedBy",a.account());a.market.show("chat",api.request("GET","/conversations/"+chatId,"",null));assertNull(a.root.findViewWithTag("chat-accept-0"));}catch(Exception e){throw new AssertionError(e);}});
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void aggregatorDeletesSavedAndLocalLotsAndRefreshDoesNotRestoreDeletedLot()throws Exception{
  SessionVault vault=new SessionVault(helper.context);JSONObject previous=vault.read();final int[] deleted={0};
  MarketplaceTest.MarketApi api=new MarketplaceTest.MarketApi(){@Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{if(method.equals("DELETE")&&path.equals("/lots/"+lot.getString("id"))){assertEquals(1,input.getInt("expectedVersion"));deleted[0]++;lot.put("deletedAt",Instant.now().toString());return new JSONObject().put("id",lot.getString("id")).put("deleted",true);}return super.request(method,path,token,input);}};
  api.user.put("role","collector");AccountActivity.apiFactory=()->api;vault.save(new JSONObject().put("token","delete-ui-test").put("user",api.user).put("expiresAt",Instant.now().plusSeconds(3600).toString()));
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());helper.idle(s);s.onActivity(a->a.root.findViewWithTag("nav-lots").performClick());helper.idle(s);s.onActivity(a->helper.visible(a,"account-delete-"+api.lot.optString("id")));helper.capture("lot-delete-button");s.onActivity(a->a.root.findViewWithTag("account-delete-"+api.lot.optString("id")).performClick());onView(withText("Delete lot")).inRoot(isDialog()).perform(click());helper.idle(s);assertEquals(1,deleted[0]);
   s.onActivity(a->{assertEquals("lots",a.screen);a.refresh();});helper.idle(s);s.onActivity(a->{try{assertNull(a.store.draft(a.account(),api.lot.optString("id")));a.createDraft();a.editStep=2;a.render();a.root.findViewWithTag("lot-delete").performClick();}catch(Exception e){throw new AssertionError(e);}});onView(withText("Delete lot")).inRoot(isDialog()).perform(click());helper.idle(s);assertEquals(1,deleted[0]);s.onActivity(a->{assertNull(a.draft);assertEquals("lots",a.screen);});helper.capture("deleted-lots");
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
}
