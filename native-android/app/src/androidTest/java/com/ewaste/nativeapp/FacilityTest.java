package com.ewaste.nativeapp;

import android.content.Context;
import android.widget.EditText;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.time.Instant;
import java.util.UUID;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
import static androidx.test.espresso.action.ViewActions.*;
import static org.hamcrest.Matchers.is;

@RunWith(AndroidJUnit4.class)
public class FacilityTest {
 final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();final NativeDesignTest design=new NativeDesignTest();
 void set(AccountActivity a,String name,String value){((EditText)a.root.findViewWithTag("facility-"+name)).setText(value);}
 static class Api extends AccountApi {
  JSONObject user,record;int uploads=0,submits=0;String command;
  Api()throws Exception{user=new JSONObject().put("id",UUID.randomUUID().toString()).put("role","recycler").put("displayName","Mumbai Recycling").put("language","en").put("locality","Mumbai").put("version",1);record=new JSONObject().put("id",UUID.randomUUID().toString()).put("version",0).put("status","draft").put("validUntil",JSONObject.NULL).put("reviews",new JSONArray()).put("documents",new JSONArray()).put("profile",new JSONObject().put("name","Mumbai Recycling").put("locality","Mumbai").put("categories",new JSONArray()).put("documentIds",new JSONArray()));}
  @Override public JSONObject request(String method,String path,String token,JSONObject body)throws Exception{
   if(path.equals("/me"))return new JSONObject().put("user",user);
   if(path.equals("/facility")&&method.equals("GET"))return Catalog.copy(record);
   if(path.equals("/facility")&&method.equals("PUT")){assertFalse(body.has("localDocuments"));assertTrue(body.getBoolean("submit"));assertEquals(0,body.getInt("expectedVersion"));assertEquals(1,body.getJSONObject("profile").getJSONArray("documentIds").length());submits++;if(command==null)command=body.getString("commandId");else assertEquals(command,body.getString("commandId"));record.put("profile",body.getJSONObject("profile")).put("version",1).put("status","pending");if(submits==1)throw new IOException("Connection lost after submission");return new JSONObject().put("id",record.getString("id")).put("version",1);}
   throw new IOException("Unexpected request "+path);
  }
  @Override public void uploadFacilityDocument(File file,String doc,String mime,String name,String token)throws Exception{assertTrue(file.length()>0);assertEquals("application/pdf",mime);assertTrue(name.endsWith(".pdf"));uploads++;}
 }
 @Test public void recyclerFacilityDraftSurvivesRecreationAndSubmissionRetriesWithSameCommand()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();Api api=new Api();AccountActivity.apiFactory=()->api;
  vault.save(new JSONObject().put("user",api.user).put("token","ews_"+"a".repeat(64)).put("expiresAt",Instant.now().plusSeconds(3600).toString()));
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   s.onActivity(a->a.root.findViewWithTag("entry-continue").performClick());design.idle(s);s.onActivity(a->a.root.findViewWithTag("home-facility").performClick());design.idle(s);s.onActivity(a->a.root.findViewWithTag("facility-edit").performClick());
   s.onActivity(a->{set(a,"address","12 Industrial Road");set(a,"contact","Facility desk · 9876543210");});design.capture("facility-business");
   onView(withTagValue(is("facility-next"))).perform(scrollTo(),click());s.recreate();design.idle(s);s.onActivity(a->{assertEquals(1,a.market.data().optInt("step"));assertEquals("12 Industrial Road",a.market.data().optJSONObject("profile").optString("address"));set(a,"hours","Mon–Sat, 9 am–6 pm");set(a,"areas","Mumbai, Thane");a.market.put(a.market.data().optJSONObject("profile"),"categories",new JSONArray().put("B01"));a.market.facility.remember(a.market.data());a.render();});design.capture("facility-services");
   onView(withTagValue(is("facility-next"))).perform(scrollTo(),click());
   s.onActivity(a->{set(a,"authority","Example issuing authority");set(a,"registration","DEMO-001");try{File dir=new File(a.getFilesDir(),"documents/"+a.account());assertTrue(dir.exists()||dir.mkdirs());File file=new File(dir,"Registration.pdf");try(FileOutputStream out=new FileOutputStream(file)){out.write("%PDF-1.7\n%%EOF".getBytes());}a.market.facility.document(FileProvider.getUriForFile(a,a.getPackageName()+".files",file));}catch(Exception e){throw new AssertionError(e);}});design.idle(s);s.recreate();design.idle(s);s.onActivity(a->{assertEquals(1,a.market.data().optJSONObject("profile").optJSONArray("documentIds").length());assertEquals("DEMO-001",a.market.data().optJSONObject("profile").optString("registration"));});design.capture("facility-documents");
   onView(withTagValue(is("facility-submit"))).perform(scrollTo(),click());design.idle(s);onView(withText("OK")).inRoot(isDialog()).perform(click());s.onActivity(a->{try{assertNotNull(a.store.pendingMarket(a.account()));}catch(Exception e){throw new AssertionError(e);}a.market.retry();});design.idle(s);
   s.onActivity(a->{assertEquals("facility",a.market.view());assertEquals("pending",a.market.data().optString("status"));try{assertNull(a.store.pendingMarket(a.account()));assertFalse(a.store.cached(a.account(),"facility-draft").has("profile"));}catch(Exception e){throw new AssertionError(e);}});assertEquals(2,api.submits);assertEquals(2,api.uploads);design.capture("facility-pending");
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
}
