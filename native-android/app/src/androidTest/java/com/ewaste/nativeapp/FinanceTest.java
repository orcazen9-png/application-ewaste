package com.ewaste.nativeapp;
import android.content.Context;
import android.widget.*;
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
public class FinanceTest {
 final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
 void idle(ActivityScenario<AccountActivity> s)throws Exception{AtomicBoolean done=new AtomicBoolean();for(int i=0;i<150&&!done.get();i++){Thread.sleep(100);s.onActivity(a->done.set(!a.working));}assertTrue(done.get());}
 void signIn(FinApi api)throws Exception{new SessionVault(context).save(new JSONObject().put("token","ews_"+String.join("",Collections.nCopies(64,"d"))).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",api.user));AccountActivity.apiFactory=()->api;}
 @Test public void invoiceDraftSurvivesRestartAndLostReplyUsesSameCommand()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();FinApi api=new FinApi();signIn(api);
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   idle(s);s.onActivity(a->a.market.finance.open(api.order.optString("id")));idle(s);s.onActivity(a->a.root.findViewWithTag("finance-upload").performClick());
   s.onActivity(a->{for(String[] f:new String[][]{{"issuer","Test collector"},{"number","INV-1"},{"amount","10000"},{"reason","Issued invoice"}})((EditText)a.root.findViewWithTag("finance-"+f[0])).setText(f[1]);try{String doc=UUID.randomUUID().toString();try(FileOutputStream out=new FileOutputStream(a.market.finance.documentFile(a.account(),doc))){out.write("%PDF-1.7\nTest\n%%EOF".getBytes());}JSONObject d=a.market.data();d.put("documentId",doc).put("documentMime","application/pdf").put("documentName","Invoice.pdf");a.market.persist();}catch(Exception e){throw new AssertionError(e);}});
   s.recreate();idle(s);s.onActivity(a->{assertEquals("INV-1",a.market.data().optString("number"));a.root.findViewWithTag("finance-submit-invoice").performClick();});idle(s);onView(withText("OK")).inRoot(isDialog()).perform(click());s.recreate();idle(s);s.onActivity(a->a.root.findViewWithTag("market-retry").performClick());idle(s);
   assertEquals(1,api.writes);assertEquals(2,api.attempts);s.onActivity(a->assertEquals("finance",a.market.view()));
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void hindiAndMarathiKeepRoleBoundConfirmationAndTranslateNavigation()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();
  try{for(String lang:new String[]{"hi","mr"}){FinApi api=new FinApi();api.user.put("language",lang);signIn(api);try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   idle(s);s.onActivity(a->{assertEquals(lang.equals("hi")?"प्रोफ़ाइल":"प्रोफाइल",((Button)a.root.findViewWithTag("account-profile")).getText().toString());a.market.finance.open(api.order.optString("id"));});idle(s);s.onActivity(a->{assertNotNull(a.root.findViewWithTag("finance-confirm-0"));assertEquals(lang.equals("hi")?"पैसे मिलने की पुष्टि करें":"पैसे मिळाल्याची पुष्टी करा",((Button)a.root.findViewWithTag("finance-confirm-0")).getText().toString());});
  }}}finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void translatedCategorySelectionStoresCanonicalCodeAndLeavesEnteredTextUntouched()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();
  try{for(String lang:new String[]{"hi","mr"}){FinApi api=new FinApi();api.user.put("language",lang);signIn(api);try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   idle(s);s.onActivity(a->{a.createDraft();a.root.findViewWithTag("lot-next").performClick();{Spinner categories=(Spinner)a.root.findViewWithTag("account-category");assertEquals(lang.equals("hi")?"कंप्यूटर और लैपटॉप":"संगणक आणि लॅपटॉप",categories.getAdapter().getItem(1));categories.setSelection(1);}});idle(s);
   s.onActivity(a->{assertEquals("B01",a.draft.optJSONArray("items").optJSONObject(0).optString("broadCode"));a.label("pending",15);assertEquals("pending",((TextView)a.page.getChildAt(a.page.getChildCount()-1)).getText().toString());assertFalse(a.t("Notebook Computers").equals("Notebook Computers"));});
  }}}finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void olderInboxUsesEncodedCursorAndCanReturnToNewest()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();FinApi api=new FinApi();signIn(api);
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   idle(s);s.onActivity(a->a.market.load("inbox","/notifications"));idle(s);s.onActivity(a->{assertNotNull(a.root.findViewWithTag("inbox-older"));a.root.findViewWithTag("inbox-older").performClick();});idle(s);
   assertTrue(api.notificationPath.contains("%7C"));s.onActivity(a->{assertNull(a.root.findViewWithTag("inbox-older"));assertEquals("older",a.market.data().optJSONArray("notifications").optJSONObject(0).optString("id"));a.root.findViewWithTag("inbox-latest").performClick();});idle(s);assertEquals("/notifications",api.notificationPath);
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 static final class FinApi extends MarketplaceTest.MarketApi {
  int writes=0,attempts=0;String command="",notificationPath="";final JSONObject finance;
  FinApi()throws Exception{user.put("id",request.getString("collectorId")).put("role","collector");order.put("collectorId",user.getString("id")).put("recyclerId",request.getString("recyclerId"));finance=new JSONObject().put("order",order).put("accounts",new JSONArray()).put("invoices",new JSONArray()).put("paymentReviews",new JSONArray()).put("payments",new JSONArray().put(new JSONObject().put("id",UUID.randomUUID().toString()).put("account","material").put("amount_paise",400000).put("status","pending").put("method","upi").put("reference","Test-001").put("proof_id",JSONObject.NULL)));}
  @Override public void uploadDocument(File file,String order,String doc,String mime,String name,String token)throws Exception{assertTrue(file.length()>0);assertEquals("application/pdf",mime);}
  @Override public JSONObject request(String method,String path,String token,JSONObject input)throws Exception{
   if(path.startsWith("/notifications")){notificationPath=path;boolean older=path.contains("before=");return new JSONObject().put("notifications",new JSONArray().put(new JSONObject().put("id",older?"older":"newest").put("kind","finance.invoice").put("resource_id",order.getString("id")).put("title","Invoice and settlement update").put("body","Open the order").put("created_at","2025-01-01T00:00:00.000Z"))).put("nextCursor",older?JSONObject.NULL:"2025-01-01T00:00:00.000Z|00000000-0000-4000-8000-000000000001").put("hasMore",!older);}
   if(path.endsWith("/finance/invoice")){attempts++;assertFalse(input.has("documentMime"));assertEquals("INV-1",input.getString("number"));if(command.isEmpty()){command=input.getString("commandId");writes++;throw new IOException("Reply lost after saving");}assertEquals(command,input.getString("commandId"));return new JSONObject().put("id",order.getString("id")).put("version",2);}
   if(path.endsWith("/finance"))return finance;
   return super.request(method,path,token,input);
  }
 }
}
