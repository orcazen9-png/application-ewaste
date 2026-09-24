package com.ewaste.nativeapp;

import android.app.AlertDialog;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.text.*;
import android.view.*;
import android.widget.*;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import org.json.*;
import java.io.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;

/** Native account/onboarding and private draft workspace for the foundation milestone. */
public class AccountActivity extends AppCompatActivity {
    static Supplier<AccountApi> apiFactory=AccountApi::new;
    AccountApi api;
    AccountStore store;
    SessionVault vault;
    MarketplaceScreens market;
    AccountDesign ui;
    LotEditor lotEditor;
    int editStep=0;
    int itemIndex=0;
    JSONObject session,draft;
    LinearLayout root,page;
    String screen="home",challengeId="",phone="",selectedRole="collector",selectedLanguage="en";
    String cameraId="",cameraAccount="",cameraDraft="";
    long resendAt=0;
    boolean working=false;
    private int epoch=0;
    final ExecutorService tasks=Executors.newSingleThreadExecutor();
    private static final String TAXONOMY="106-draft-v1";
    private static final int GREEN=0xff125b46,INK=0xff1e3028,BG=0xfff4f7f4;
    final ActivityResultLauncher<String> notificationPermission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),allowed->{if(allowed)NotificationJob.schedule(this);});
    final ActivityResultLauncher<String[]> documentPicker=registerForActivityResult(new ActivityResultContracts.OpenDocument(),uri->{if(market!=null)market.finance.document(uri);});
    final ActivityResultLauncher<String[]> gallery=registerForActivityResult(new ActivityResultContracts.OpenDocument(),uri->{if(uri!=null)processPhoto(uri,account(),screen.equals("market")&&market.view().equals("evidence")?market.logistics.context():draft==null?"":draft.optString("id"));});
    final ActivityResultLauncher<Uri> camera=registerForActivityResult(new ActivityResultContracts.TakePicture(),ok->{if(ok&&!cameraId.isEmpty())processPhoto(Uri.fromFile(store.photo(cameraAccount,cameraId)),cameraAccount,cameraDraft);});

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);api=apiFactory.get();store=new AccountStore(this);vault=new SessionVault(this);ui=new AccountDesign(this);lotEditor=new LotEditor(this);market=new MarketplaceScreens(this);
        try {
            try{session=vault.read();}catch(Exception unreadableSession){vault.clear();session=null;}
            if(session!=null&&Instant.parse(session.getString("expiresAt")).isBefore(Instant.now())){vault.clear();session=null;}
            if(saved!=null){
                screen=saved.getString("screen","home");challengeId=saved.getString("challenge","");phone=saved.getString("phone","");
                selectedRole=saved.getString("role","collector");selectedLanguage=saved.getString("language","en");resendAt=saved.getLong("resendAt",0);
                cameraId=saved.getString("cameraId","");cameraAccount=saved.getString("cameraAccount","");cameraDraft=saved.getString("cameraDraft","");
                String draftId=saved.getString("draftId","");if(session!=null&&!draftId.isEmpty())draft=store.draft(account(),draftId);
                editStep=saved.getInt("editStep",0);itemIndex=saved.getInt("itemIndex",0);if(session!=null&&screen.equals("market"))market.restore();
            }
            getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){goBack();}});
            drainRevocations();render();if(session!=null){NotificationJob.schedule(this);if(getIntent().getBooleanExtra("openInbox",false))market.load("inbox","/notifications");else refresh();}
        }catch(Exception error){showError(error);}
    }
    @Override protected void onSaveInstanceState(Bundle out){
        super.onSaveInstanceState(out);out.putString("screen",screen);out.putString("challenge",challengeId);out.putString("phone",phone);
        out.putString("role",selectedRole);out.putString("language",selectedLanguage);out.putLong("resendAt",resendAt);
        out.putString("cameraId",cameraId);out.putString("cameraAccount",cameraAccount);out.putString("cameraDraft",cameraDraft);
        if(draft!=null)out.putString("draftId",draft.optString("id"));
        out.putInt("editStep",editStep);out.putInt("itemIndex",itemIndex);if(screen.equals("market"))market.persist();
    }
    @Override protected void onDestroy(){tasks.submit(()->store.close());tasks.shutdown();super.onDestroy();}
    String account(){return session==null?"":session.optJSONObject("user").optString("id");}
    String token(){return session==null?"":session.optString("token");}
    String language(){return session==null?selectedLanguage:session.optJSONObject("user").optString("language","en");}
    String t(String source){return Translations.text(this,language(),source);}
    String f(String pattern,Object... values){return String.format(java.util.Locale.forLanguageTag(language()+"-IN"),t(pattern),values);}
    String localDate(String value){return Translations.date(language(),value);}
    int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    LinearLayout column(){LinearLayout value=new LinearLayout(this);value.setOrientation(LinearLayout.VERTICAL);return value;}
    void goBack(){if(session!=null&&screen.equals("edit")&&editStep>0){editStep--;render();}else if(session!=null&&!screen.equals("home")){draft=null;screen="home";render();}else finish();}
    void label(String value,int size){TextView text=ui.text(value,size,size<16?AccountDesign.MUTED:AccountDesign.INK,size>=18);text.setPadding(0,dp(size>=20?8:6),0,dp(10));page.addView(text);}
    void button(String title,String tag,Runnable run){boolean primary=tag.matches("account-redeem|account-verify|account-send-code|account-save-profile|finance-submit-invoice|finance-confirm-.*|finance-approve-.*|market-accept|market-submit|market-retry|.*save.*");ui.action(page,title,tag,run,primary?1:0);}
    EditText field(String title,String value,String tag,int type,int limit,Consumer<String> changed){
        TextView label=ui.text(title,13,AccountDesign.INK,true);label.setPadding(0,dp(10),0,dp(8));page.addView(label);
        EditText input=new EditText(this);input.setTag(tag);input.setId(View.generateViewId());label.setLabelFor(input.getId());input.setInputType(type);input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)});
        input.setText(value);input.setTextSize(16);input.setTextColor(AccountDesign.INK);input.setSingleLine((type&InputType.TYPE_TEXT_FLAG_MULTI_LINE)==0);input.setMinHeight(dp(52));input.setPadding(dp(14),dp(13),dp(14),dp(13));input.setBackgroundTintList(null);
        android.graphics.drawable.StateListDrawable background=new android.graphics.drawable.StateListDrawable();background.addState(new int[]{android.R.attr.state_focused},ui.shape(AccountDesign.WHITE,12,AccountDesign.GREEN));background.addState(new int[]{},ui.shape(AccountDesign.WHITE,12,AccountDesign.LINE));input.setBackground(background);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(6);page.addView(input,lp);
        if(changed!=null)input.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){}public void afterTextChanged(Editable s){changed.accept(s.toString());}});
        return input;
    }
    Spinner choices(String title,String[] names,int selected,IntConsumer changed){
        String[] localized=new String[names.length];for(int i=0;i<names.length;i++)localized[i]=t(names[i]);
        TextView label=ui.text(title,13,AccountDesign.INK,true);label.setPadding(0,dp(10),0,dp(8));page.addView(label);
        Spinner spinner=new Spinner(this);spinner.setId(View.generateViewId());label.setLabelFor(spinner.getId());spinner.setBackground(ui.shape(AccountDesign.WHITE,12,AccountDesign.LINE));
        ArrayAdapter<String> adapter=new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,localized){
            @Override public View getView(int position,View convert,ViewGroup parent){LinearLayout row=ui.row();row.setPadding(dp(14),dp(14),dp(12),dp(14));row.setMinimumHeight(dp(52));TextView text=ui.text(getItem(position),16,AccountDesign.INK,false);row.addView(text,new LinearLayout.LayoutParams(0,-2,1));TextView arrow=ui.text("⌄",20,AccountDesign.MUTED,true);row.addView(arrow);return row;}
            @Override public View getDropDownView(int position,View convert,ViewGroup parent){TextView text=ui.text(getItem(position),16,AccountDesign.INK,false);text.setPadding(dp(18),dp(14),dp(18),dp(14));text.setMinHeight(dp(48));return text;}
        };
        spinner.setAdapter(adapter);spinner.setSelection(Math.max(0,selected));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(6);page.addView(spinner,lp);
        spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,View v,int position,long id){changed.accept(position);}public void onNothingSelected(AdapterView<?> p){}});return spinner;
    }
    void render(){
        if(isFinishing())return;
        root=column();root.setFocusableInTouchMode(true);root.setBackgroundColor(AccountDesign.BG);setContentView(root);root.requestFocus();
        ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});ViewCompat.requestApplyInsets(root);
        ui.topBar();if(working){ProgressBar progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(AccountDesign.GREEN));progress.setContentDescription(t("Connecting…"));root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));}
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setClipToPadding(false);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));page=column();page.setPadding(dp(20),dp(20),dp(20),dp(24));scroll.addView(page);
        try {
            if(session==null){signIn();return;}
            if(screen.equals("edit")&&draft!=null)editor();else if(screen.equals("lots"))ui.lots(true);else if(screen.equals("profile"))profile();else if(screen.equals("market"))market.render();else home();
        }catch(Exception error){label(t("Your saved drafts are kept. ")+message(error),15);}
        if(session!=null&&!screen.equals("edit"))ui.navigation();
    }
    void signIn(){
        if(BuildConfig.INVITATION_SIGN_IN){
            choices(t("Preferred language"),new String[]{"English","हिन्दी","मराठी"},Arrays.asList("en","hi","mr").indexOf(selectedLanguage),position->{String next=new String[]{"en","hi","mr"}[position];if(!selectedLanguage.equals(next)){selectedLanguage=next;render();}});
            label(t("Sign in with your invitation"),21);
            label(t("Use the personal invitation supplied by Freedom Value. Your account role is already assigned."),16);
            EditText invite=field(t("Invitation code"),"","account-invitation",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD,68,null);invite.setSaveEnabled(false);
            button(t("Sign in"),"account-redeem",()->{try{
                JSONObject input=new JSONObject().put("code",invite.getText().toString().trim()).put("language",selectedLanguage);
                task(()->api.request("POST","/auth/invitation","",input),result->{try{applySession(result);refresh();}catch(Exception e){showError(e);}});
            }catch(Exception e){showError(e);}});
            label(t("Invitations work once. If you sign out or change phones, request a new invitation. Mobile number verification is not enabled in this demo."),14);return;
        }
        label(challengeId.isEmpty()?t("Sign in with your mobile number"):t("Enter the code sent to your phone"),21);
        if(challengeId.isEmpty()){
            field(t("Mobile number"),phone,"account-phone",InputType.TYPE_CLASS_PHONE,24,value->phone=value);
            choices(t("I am a"),new String[]{t("Local collector"),t("Recycler")},selectedRole.equals("collector")?0:1,position->selectedRole=position==0?"collector":"recycler");
            choices(t("Preferred language"),new String[]{"English","हिन्दी","मराठी"},Arrays.asList("en","hi","mr").indexOf(selectedLanguage),position->selectedLanguage=new String[]{"en","hi","mr"}[position]);
            button(t("Send verification code"),"account-send-code",this::sendCode);
        }else{
            label(phone,16);EditText code=field(t("Verification code"),"","account-code",InputType.TYPE_CLASS_NUMBER,10,null);
            code.setSaveEnabled(false);
            button(t("Verify and sign in"),"account-verify",()->{
                try {JSONObject input=new JSONObject().put("challengeId",challengeId).put("code",code.getText().toString());
                    task(()->api.request("POST","/auth/verify","",input),result->{try{applySession(result);refresh();}catch(Exception e){showError(e);}});
                }catch(Exception e){showError(e);}
            });
            button(t("Resend code"),"account-resend",()->{if(System.currentTimeMillis()<resendAt){showError(new Exception(t("Please wait before requesting another code.")));return;}sendCode();});
            button(t("Change number"),"account-change-number",()->{challengeId="";render();});
        }
        if(working)label(t("Connecting…"),14);
    }
    void sendCode(){
        try {JSONObject input=new JSONObject().put("mobile",phone).put("role",selectedRole).put("language",selectedLanguage);
            task(()->api.request("POST","/auth/challenges","",input),result->{challengeId=result.optString("challengeId");resendAt=System.currentTimeMillis()+result.optInt("resendAfterSeconds",60)*1000L;render();});
        }catch(Exception e){showError(e);}
    }
    void applySession(JSONObject value)throws Exception {
        AccountStore.validId(value.getJSONObject("user").getString("id"));
        vault.save(value);session=value;challengeId="";draft=null;screen="home";epoch++;NotificationJob.schedule(this);render();
    }
    void home()throws Exception {ui.home();}
    void createDraft(){try{
        JSONObject item=new JSONObject().put("id",UUID.randomUUID().toString()).put("broadCode",JSONObject.NULL).put("detailedCode",JSONObject.NULL)
            .put("description","").put("condition","unknown").put("unit","kg").put("quantity","").put("reviewState","needs_review");
        draft=new JSONObject().put("id",UUID.randomUUID().toString()).put("title","").put("locality",session.getJSONObject("user").optString("locality"))
            .put("notes","").put("taxonomyVersion",TAXONOMY).put("items",new JSONArray().put(item)).put("fileIds",new JSONArray());
        store.save(account(),draft);itemIndex=0;editStep=0;screen="edit";render();
    }catch(Exception e){showError(e);}}
    void saveField(JSONObject target,String key,Object value){try{if(!Objects.equals(target.opt(key),value)){target.put(key,value);store.save(account(),draft);}}catch(Exception e){showError(e);}}
    void editor()throws Exception {lotEditor.render();}
    void saveCurrentLot(){final String owner=account(),auth=token(),id=draft.optString("id");task(()->{new AccountSync(store,api).save(owner,auth,id);return store.draft(owner,id);},saved->{draft=saved;render();Toast.makeText(this,t("Saved online"),Toast.LENGTH_SHORT).show();});}
    void takeEvidencePhoto(String context){
        try{cameraId=UUID.randomUUID().toString();cameraAccount=account();cameraDraft=context;camera.launch(FileProvider.getUriForFile(this,getPackageName()+".files",store.photo(cameraAccount,cameraId)));}catch(Exception e){showError(e);}
    }
    void processPhoto(Uri uri,String accountId,String draftId){
        if(session==null||!account().equals(accountId)||draftId.isEmpty())return;
        task(()->{
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
            try(InputStream in=getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,bounds);}
            if(bounds.outWidth<=0||bounds.outHeight<=0)throw new IOException(t("Choose a readable photo."));
            BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;
            while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>1600)options.inSampleSize*=2;
            Bitmap bitmap;try(InputStream in=getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in,null,options);}
            if(bitmap==null)throw new IOException(t("Could not read this photo."));
            int orientation=ExifInterface.ORIENTATION_NORMAL;
            try(InputStream in=getContentResolver().openInputStream(uri)){orientation=new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);}catch(IOException ignored){}
            Matrix matrix=new Matrix();
            switch(orientation){
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:matrix.setScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_180:matrix.setRotate(180);break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL:matrix.setScale(1,-1);break;
                case ExifInterface.ORIENTATION_TRANSPOSE:matrix.setRotate(90);matrix.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_90:matrix.setRotate(90);break;
                case ExifInterface.ORIENTATION_TRANSVERSE:matrix.setRotate(-90);matrix.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_270:matrix.setRotate(-90);break;
            }
            if(!matrix.isIdentity()){Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);if(rotated!=bitmap){bitmap.recycle();bitmap=rotated;}}
            String fileId=UUID.randomUUID().toString();File output=store.photo(accountId,fileId);
            try(FileOutputStream out=new FileOutputStream(output)){if(!bitmap.compress(Bitmap.CompressFormat.JPEG,85,out))throw new IOException(t("Could not save photo."));}finally{bitmap.recycle();}
            if(output.length()>2*1024*1024)throw new IOException(t("Choose a smaller photo."));
            if(draftId.startsWith("evidence:")){
                JSONObject evidence=store.cached(accountId,draftId);if(evidence==null)throw new IOException(t("Evidence draft was not found."));JSONArray photos=evidence.getJSONArray("fileIds");if(photos.length()>=5)throw new IOException(t("Use at most five evidence photos."));photos.put(fileId);store.cache(accountId,draftId,evidence);
            }else store.attachPhoto(accountId,draftId,fileId);return draftId;
        },savedId->{try{if(savedId.startsWith("evidence:")){market.show("evidence",store.cached(accountId,savedId));}else{draft=store.draft(accountId,savedId);screen="edit";render();}}catch(Exception e){showError(e);}});
    }
    void profile()throws Exception {
        JSONObject user=session.getJSONObject("user");ui.heading(t("Profile"),t(user.optString("role").equals("collector")?"Collector workspace":"Recycler workspace"));
        EditText name=field(t("Name"),user.optString("displayName"),"account-profile-name",InputType.TYPE_CLASS_TEXT,100,null);
        EditText area=field(t("Area"),user.optString("locality"),"account-profile-area",InputType.TYPE_CLASS_TEXT,120,null);
        final String[] language={user.optString("language","en")};
        choices(t("Preferred language"),new String[]{"English","हिन्दी","मराठी"},Arrays.asList("en","hi","mr").indexOf(language[0]),p->language[0]=new String[]{"en","hi","mr"}[p]);
        button(t("Save profile"),"account-save-profile",()->{
            try {JSONObject input=new JSONObject().put("displayName",name.getText().toString()).put("locality",area.getText().toString()).put("language",language[0]).put("expectedVersion",user.getInt("version"));String auth=token();
                task(()->api.request("PUT","/me",auth,input),result->{try{session.put("user",result.getJSONObject("user"));vault.save(session);screen="home";render();}catch(Exception e){showError(e);}});
            }catch(Exception e){showError(e);}
        });ui.section(t("Notifications"));button(t("Enable phone notifications"),"account-notifications-enable",()->{if(android.os.Build.VERSION.SDK_INT>=33)notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS);else NotificationJob.schedule(this);});ui.space(page,20);button(t("Sign out"),"account-logout",()->new AlertDialog.Builder(this).setTitle(t("Sign out?")).setMessage(t("You will need a new invitation to sign in again. Your saved records will stay on this phone.")).setPositiveButton(t("Sign out"),(d,w)->logout()).setNegativeButton(t("Back"),null).show());
    }
    void refresh(){
        String owner=account(),auth=token();boolean collector=session.optJSONObject("user").optString("role").equals("collector");
        task(()->{JSONObject profile=api.request("GET","/me",auth,null);if(collector){AccountSync sync=new AccountSync(store,api);sync.retryPending(owner,auth);sync.refresh(owner,auth);}return profile;},result->{
            try{session.put("user",result.getJSONObject("user"));vault.save(session);if(draft!=null)draft=store.draft(owner,draft.getString("id"));render();}catch(Exception e){showError(e);}
        });
    }
    void syncAll(){
        final String owner=account(),auth=token();
        task(()->{
            AccountSync sync=new AccountSync(store,api);JSONArray lots=store.drafts(owner);int count=0;
            for(int i=0;i<lots.length();i++){JSONObject lot=lots.getJSONObject(i);if(!lot.optString("syncState").equals("synced")&&!lot.optString("syncState").equals("conflict")){sync.save(owner,auth,lot.getString("id"));count++;}}
            sync.refresh(owner,auth);return count;
        },count->{try{if(draft!=null)draft=store.draft(owner,draft.getString("id"));render();Toast.makeText(this,t("Drafts synced"),Toast.LENGTH_SHORT).show();}catch(Exception e){showError(e);}});
    }
    void reviewConflict(){
        String owner=account(),auth=token(),lotId=draft.optString("id");
        task(()->api.request("GET","/lots/"+lotId,auth,null),result->{
            JSONObject remote=result.optJSONObject("lot");
            new AlertDialog.Builder(this).setTitle(t("Draft changed on another device")).setMessage(t("Online: ")+remote.optString("title")+"\n"+remote.optString("locality")+"\n"+remote.optString("notes")+t("\n\nKeep your local changes as a separate draft and restore the updated online copy alongside it."))
                .setPositiveButton(t("Keep a separate copy"),(d,w)->{try{JSONObject copy=new JSONObject(draft.toString());copy.put("id",UUID.randomUUID().toString());copy.remove("serverVersion");copy.remove("localRevision");copy.remove("syncState");store.save(owner,copy);store.replaceFromServer(owner,remote);draft=copy;render();}catch(Exception e){showError(e);}})
                .setNeutralButton(t("Keep reviewing"),null).show();
        });
    }
    void logout(){
        try{vault.queueRevocation(token());vault.clear();NotificationJob.cancel(this);session=null;draft=null;screen="home";epoch++;render();drainRevocations();}catch(Exception e){showError(e);}
    }
    void drainRevocations(){
        tasks.submit(()->{try{JSONArray tokens=vault.pendingRevocations();for(int i=0;i<tokens.length();i++){
            String token=tokens.getString(i);try{api.request("POST","/auth/logout",token,new JSONObject());vault.revoked(token);}
            catch(AccountApi.Failure error){if(error.status==401)vault.revoked(token);}
            catch(Exception ignored){/* Kept encrypted for the next online attempt. */}
        }}catch(Exception ignored){/* Local sign-out is independent of network availability. */}});
    }
    <T> void task(Callable<T> operation,Consumer<T> done){
        if(working)return;working=true;final int started=epoch;render();
        tasks.submit(()->{try{T value=operation.call();runOnUiThread(()->{if(isDestroyed()||isFinishing()||started!=epoch)return;working=false;done.accept(value);});}
            catch(Exception error){runOnUiThread(()->{if(isDestroyed()||isFinishing()||started!=epoch)return;working=false;
                if(error instanceof AccountApi.Failure&&((AccountApi.Failure)error).status==401&&session!=null){try{vault.clear();}catch(Exception ignored){}session=null;draft=null;epoch++;}
                render();showError(error);});}});
    }
    String message(Throwable error){return error.getMessage()==null?t("Please try again."):Translations.error(this,language(),error.getMessage());}
    void showError(Throwable error){if(isFinishing())return;String detail=error.getMessage(),localized=message(error);android.app.AlertDialog.Builder dialog=new AlertDialog.Builder(this).setTitle(t("Could not complete this action")).setMessage(localized).setPositiveButton(t("OK"),null);if(detail!=null&&!detail.equals(localized))dialog.setNeutralButton(t("Technical details"),(d,w)->new AlertDialog.Builder(this).setTitle(t("Technical details")).setMessage(detail).setPositiveButton(t("OK"),null).show());dialog.show();}
}
