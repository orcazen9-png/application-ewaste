package com.ewaste.nativeapp;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.view.ViewGroup;
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

@RunWith(AndroidJUnit4.class)
public class AccountFoundationTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private String id(){return UUID.randomUUID().toString();}
    private JSONObject draft(String lot)throws Exception {
        return new JSONObject().put("id",lot).put("title","Saved laptop").put("locality","Mumbai").put("notes","")
            .put("taxonomyVersion","106-draft-v1").put("fileIds",new JSONArray()).put("items",new JSONArray().put(new JSONObject()
            .put("id",id()).put("broadCode","B01").put("detailedCode",JSONObject.NULL).put("description","Laptop")
            .put("condition","unknown").put("quantity","1").put("unit","piece").put("reviewState","confirmed")));
    }
    private void nativeOnly(View view){assertFalse(view.getClass().getName().contains("WebView"));if(view instanceof ViewGroup){ViewGroup g=(ViewGroup)view;for(int i=0;i<g.getChildCount();i++)nativeOnly(g.getChildAt(i));}}
    private void waitIdle(ActivityScenario<AccountActivity> scenario)throws Exception {
        AtomicBoolean idle=new AtomicBoolean(false);for(int i=0;i<150&&!idle.get();i++){Thread.sleep(100);scenario.onActivity(a->idle.set(!a.working));}assertTrue("Native operation completed",idle.get());
    }
    private byte[] shellOutput(String command)throws Exception {
        ParcelFileDescriptor descriptor=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(descriptor);ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);return output.toByteArray();
        }
    }

    @Test public void draftsAndOutboxSurviveRestartWithoutCrossAccountAccess()throws Exception {
        String a=id(),b=id(),lot=id(),command;AccountStore first=new AccountStore(context);JSONObject original=draft(lot);
        first.save(a,original);command=first.queue(a,lot).getString("commandId");first.close();
        try(AccountStore second=new AccountStore(context)){
            assertEquals(1,second.drafts(a).length());assertEquals(0,second.drafts(b).length());assertNull(second.draft(b,lot));
            assertEquals(command,second.queue(a,lot).getString("commandId"));
            JSONObject edit=second.draft(a,lot).put("title","Edited while offline");second.save(a,edit);
            assertEquals("Saved laptop",second.queue(a,lot).getString("title"));
            second.complete(a,command,1);assertEquals("Edited while offline",second.draft(a,lot).getString("title"));
            assertEquals("local",second.draft(a,lot).getString("syncState"));
            JSONObject next=second.queue(a,lot);assertNotEquals(command,next.getString("commandId"));assertEquals(1,next.getInt("expectedVersion"));
            String file=id();assertNotEquals(second.photo(a,file).getCanonicalPath(),second.photo(b,file).getCanonicalPath());
            try{second.photo("../other",file);fail("Path traversal rejected");}catch(IllegalArgumentException expected){}
        }
    }

    @Test public void lostResponseReusesCommandAndConflictPreservesLocalDraft()throws Exception {
        String owner=id(),lot=id();List<String> commands=new ArrayList<>();
        try(AccountStore store=new AccountStore(context)){
            store.save(owner,draft(lot));
            AccountApi api=new AccountApi(){@Override public JSONObject request(String method,String path,String token,JSONObject payload)throws Exception{
                commands.add(payload.getString("commandId"));if(commands.size()==1)throw new IOException("Connection interrupted after server commit");
                return new JSONObject().put("version",1);
            }};
            AccountSync sync=new AccountSync(store,api);try{sync.save(owner,"token",lot);fail("Transport failed");}catch(IOException expected){}
            assertEquals(1,store.pending(owner).length());sync.retryPending(owner,"token");assertEquals(commands.get(0),commands.get(1));assertEquals("synced",store.draft(owner,lot).getString("syncState"));
            store.save(owner,store.draft(owner,lot).put("notes","Keep my offline correction"));
            AccountApi conflict=new AccountApi(){@Override public JSONObject request(String m,String p,String t,JSONObject b)throws Exception{throw new AccountApi.Failure(409,"Changed on another device");}};
            try{new AccountSync(store,conflict).save(owner,"token",lot);fail("Conflict expected");}catch(AccountApi.Failure expected){}
            assertEquals("conflict",store.draft(owner,lot).getString("syncState"));assertEquals("Keep my offline correction",store.draft(owner,lot).getString("notes"));assertEquals(0,store.pending(owner).length());
        }
    }

    @Test public void sessionIsEncryptedAndOfflineLogoutRetainsOnlyEncryptedRevocation()throws Exception {
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();String token="ews_"+String.join("",Collections.nCopies(64,"b"));
        try {
            JSONObject session=new JSONObject().put("token",token).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",new JSONObject().put("id",id()).put("role","collector"));
            vault.save(session);String raw=context.getSharedPreferences("ewaste-personal-session",Context.MODE_PRIVATE).getString("encrypted","");assertFalse(raw.contains(token));assertEquals(token,new SessionVault(context).read().getString("token"));
            vault.queueRevocation(token);vault.clear();assertNull(vault.read());
            assertFalse(context.getSharedPreferences("ewaste-personal-session",Context.MODE_PRIVATE).getString("revocations","").contains(token));
            vault.revoked(token);
        }finally{if(previous==null)vault.clear();else vault.save(previous);}
    }

    @Test public void nativeSignInPhotoDraftAndServerSyncSurviveActivityRecreation()throws Exception {
        SessionVault vault=new SessionVault(context);JSONObject previous=vault.read();vault.clear();FakeApi fake=new FakeApi();AccountActivity.apiFactory=()->fake;
        try(ActivityScenario<AccountActivity> scenario=ActivityScenario.launch(AccountActivity.class)){
            scenario.onActivity(a->{nativeOnly(a.root);((EditText)a.root.findViewWithTag("account-phone")).setText("9000000001");a.root.findViewWithTag("account-send-code").performClick();});waitIdle(scenario);
            scenario.onActivity(a->{((EditText)a.root.findViewWithTag("account-code")).setText("123456");a.root.findViewWithTag("account-verify").performClick();});waitIdle(scenario);
            scenario.onActivity(a->{assertEquals(fake.user.optString("id"),a.account());a.root.findViewWithTag("account-create").performClick();
                assertNull("Photo actions precede the form",a.root.findViewWithTag("account-lot-title"));
                assertNotNull(a.root.findViewWithTag("account-take-photo"));assertNotNull(a.root.findViewWithTag("account-choose-photo"));
                try{File image=new File(a.getCacheDir(),"account-test-photo.jpg");Bitmap bitmap=Bitmap.createBitmap(100,60,Bitmap.Config.ARGB_8888);bitmap.eraseColor(0xff125b46);try(FileOutputStream out=new FileOutputStream(image)){bitmap.compress(Bitmap.CompressFormat.JPEG,90,out);}bitmap.recycle();a.processPhoto(Uri.fromFile(image),a.account(),a.draft.getString("id"));}catch(Exception e){throw new AssertionError(e);}
            });waitIdle(scenario);scenario.recreate();waitIdle(scenario);
            scenario.onActivity(a->{assertEquals(1,a.draft.optJSONArray("fileIds").length());assertEquals(0,a.editStep);a.root.findViewWithTag("lot-next").performClick();((EditText)a.root.findViewWithTag("account-lot-title")).setText("My native laptop draft");((EditText)a.root.findViewWithTag("account-lot-quantity")).setText("1");((android.widget.Spinner)a.root.findViewWithTag("account-category")).setSelection(1);});waitIdle(scenario);
            scenario.onActivity(a->{a.root.findViewWithTag("lot-next").performClick();assertEquals(2,a.editStep);a.root.findViewWithTag("account-save-online").performClick();});waitIdle(scenario);
            scenario.onActivity(a->{try{assertEquals("synced",a.store.draft(a.account(),a.draft.getString("id")).getString("syncState"));assertEquals(1,fake.uploads);nativeOnly(a.root);}catch(Exception e){throw new AssertionError(e);}});
            scenario.recreate();waitIdle(scenario);scenario.onActivity(a->{assertEquals("My native laptop draft",a.draft.optString("title"));assertEquals(fake.user.optString("id"),a.account());});
            // Keep the CI screenshot outside app storage, which test cleanup can remove.
            // UiAutomation executes argv directly; shell quoting and compound commands do not apply.
            shellOutput("screencap -p /sdcard/account-draft.png");
            try(DataInputStream screenshot=new DataInputStream(new ByteArrayInputStream(shellOutput("cat /sdcard/account-draft.png")))){
                assertEquals("Native screen captured as PNG for CI review",0x89504e470d0a1a0aL,screenshot.readLong());
            }
        }finally{AccountActivity.apiFactory=AccountApi::new;if(previous==null)vault.clear();else vault.save(previous);}
    }

    static final class FakeApi extends AccountApi {
        final JSONObject user;
        final Map<String,JSONObject> lots=new LinkedHashMap<>();int uploads=0;
        FakeApi()throws Exception{user=new JSONObject().put("id",UUID.randomUUID().toString()).put("role","collector").put("mobile","+919000000001").put("language","en").put("displayName","").put("locality","Mumbai").put("version",1);}
        @Override public JSONObject request(String method,String path,String token,JSONObject body)throws Exception {
            if(path.equals("/auth/challenges"))return new JSONObject().put("challengeId",UUID.randomUUID().toString()).put("resendAfterSeconds",60);
            if(path.equals("/auth/verify"))return new JSONObject().put("token","ews_"+String.join("",Collections.nCopies(64,"a"))).put("expiresAt",Instant.now().plusSeconds(3600).toString()).put("user",user);
            if(path.equals("/auth/logout"))return new JSONObject().put("signedOut",true);
            if(path.equals("/me"))return new JSONObject().put("user",user).put("facilities",new JSONArray());
            if(path.equals("/lots"))return new JSONObject().put("lots",new JSONArray(lots.values())).put("nextCursor",JSONObject.NULL);
            if(path.startsWith("/lots/")&&method.equals("PUT")){JSONObject lot=new JSONObject(body.toString());lot.put("version",body.getInt("expectedVersion")+1);lot.remove("commandId");lot.remove("expectedVersion");lots.put(lot.getString("id"),lot);return new JSONObject().put("version",lot.getInt("version"));}
            throw new IOException("Unexpected test request: "+method+" "+path);
        }
        @Override public void upload(File file,String fileId,String token){assertTrue(file.exists());assertTrue(file.length()>0);uploads++;}
    }
}
