package com.ewaste.nativeapp;

import android.content.Context;
import android.widget.EditText;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
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
public class AccountEntryTest {
 final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
 final NativeDesignTest design=new NativeDesignTest();
 void set(AccountActivity a,String tag,String value){((EditText)a.root.findViewWithTag(tag)).setText(value);}
 static class Api extends AccountApi {
  JSONObject user;String role="collector";int signups=0;boolean reject=false,expired=false;
  JSONObject session(String role)throws Exception{this.role=role;user=new JSONObject().put("id",UUID.randomUUID().toString()).put("role",role).put("username",role+".demo").put("identityMethod","password").put("displayName",role.equals("recycler")?"Mumbai Recycling":"Mumbai Collection").put("language","en").put("locality","Mumbai").put("version",1);return new JSONObject().put("user",user).put("token","ews_"+(role.equals("recycler")?"b":"a").repeat(64)).put("expiresAt",Instant.now().plusSeconds(3600).toString());}
  @Override public JSONObject request(String method,String path,String token,JSONObject body)throws Exception{
   if(path.equals("/auth/register")||path.equals("/auth/login")){assertTrue(token.isEmpty());assertEquals(role,body.getString("role"));if(reject)throw new Failure(401,"Username or password is incorrect.");if(path.endsWith("register")){signups++;assertEquals("Mumbai",body.getString("locality"));}return session(role);}
   if(path.equals("/me")){if(expired)throw new Failure(401,"Your session has ended.");return new JSONObject().put("user",user).put("facilities",new JSONArray());}
   if(path.equals("/lots"))return new JSONObject().put("lots",new JSONArray()).put("nextCursor",JSONObject.NULL);
   if(path.equals("/auth/logout"))return new JSONObject();throw new java.io.IOException("Unexpected request "+path);
  }
 }
 @Test public void bothRolesRegisterFromNeutralWelcomeAndReachTheirOwnWorkspace()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();
  try{for(String role:new String[]{"collector","recycler"}){vault.clear();Api api=new Api();api.role=role;AccountActivity.apiFactory=()->api;
   try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
    s.onActivity(a->{assertEquals("",a.selectedRole);assertNull(a.root.findViewWithTag("account-create"));design.visible(a,"entry-login");design.visible(a,"entry-signup");});if(role.equals("collector"))design.capture("welcome");
    s.onActivity(a->a.root.findViewWithTag("entry-signup").performClick());if(role.equals("collector"))design.capture("roles");
    s.onActivity(a->{assertNotNull(a.root.findViewWithTag("entry-role-collector"));assertNotNull(a.root.findViewWithTag("entry-role-recycler"));a.root.findViewWithTag("entry-role-"+role).performClick();set(a,"entry-name","Demo business");set(a,"entry-area","Mumbai");});if(role.equals("recycler"))design.capture("signup");
    s.onActivity(a->{a.root.findViewWithTag("entry-details-next").performClick();set(a,"entry-username",role+".demo");set(a,"entry-password","a long testing password");set(a,"entry-confirm","a long testing password");});
    s.recreate();s.onActivity(a->{assertEquals(role,a.selectedRole);assertEquals(role+".demo",((EditText)a.root.findViewWithTag("entry-username")).getText().toString());assertEquals("",((EditText)a.root.findViewWithTag("entry-password")).getText().toString());set(a,"entry-password","a long testing password");set(a,"entry-confirm","a long testing password");a.root.findViewWithTag("entry-submit").performClick();});design.idle(s);
    s.onActivity(a->{assertEquals(role,a.session.optJSONObject("user").optString("role"));assertNotNull(a.root.findViewWithTag(role.equals("collector")?"account-create":"home-portfolio"));assertNull(a.root.findViewWithTag(role.equals("collector")?"home-portfolio":"account-create"));});assertEquals(1,api.signups);if(role.equals("recycler"))design.capture("recycler-home");
   }
  }}finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
 @Test public void existingAccountRequiresExplicitContinueAndFailedSwitchKeepsItsSession()throws Exception{
  SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();Api api=new Api();JSONObject existing=api.session("collector");vault.save(existing);AccountActivity.apiFactory=()->api;
  try(ActivityScenario<AccountActivity> s=ActivityScenario.launch(AccountActivity.class)){
   s.onActivity(a->{assertNull(a.root.findViewWithTag("account-create"));assertNotNull(a.root.findViewWithTag("entry-continue"));a.root.findViewWithTag("entry-continue").performClick();});design.idle(s);
   s.onActivity(a->{a.root.findViewWithTag("account-profile").performClick();a.root.findViewWithTag("account-switch").performClick();a.root.findViewWithTag("entry-login").performClick();a.root.findViewWithTag("entry-role-recycler").performClick();});design.capture("login");
   api.role="recycler";api.reject=true;s.onActivity(a->{set(a,"entry-username","recycler.demo");set(a,"entry-password","a wrong testing password");a.root.findViewWithTag("entry-submit").performClick();});design.idle(s);onView(withText("OK")).inRoot(isDialog()).perform(click());
   assertEquals(existing.optString("token"),vault.read().optString("token"));
   s.onActivity(a->{a.goBack();a.goBack();a.root.findViewWithTag("entry-continue").performClick();});design.idle(s);s.onActivity(a->{assertNotNull(a.root.findViewWithTag("account-create"));assertEquals(existing.optJSONObject("user").optString("id"),a.account());});
   api.expired=true;s.onActivity(AccountActivity::refresh);design.idle(s);onView(withText("OK")).inRoot(isDialog()).perform(click());
   s.onActivity(a->{assertNull(a.session);assertEquals("",a.selectedRole);assertNotNull(a.root.findViewWithTag("entry-login"));assertNotNull(a.root.findViewWithTag("entry-signup"));});assertNull(vault.read());
  }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
 }
}
