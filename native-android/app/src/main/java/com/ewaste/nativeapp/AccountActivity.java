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
        super.onCreate(saved);api=apiFactory.get();store=new AccountStore(this);vault=new SessionVault(this);market=new MarketplaceScreens(this);
        try {
            try{session=vault.read();}catch(Exception unreadableSession){vault.clear();session=null;}
            if(session!=null&&Instant.parse(session.getString("expiresAt")).isBefore(Instant.now())){vault.clear();session=null;}
            if(saved!=null){
                screen=saved.getString("screen","home");challengeId=saved.getString("challenge","");phone=saved.getString("phone","");
                selectedRole=saved.getString("role","collector");selectedLanguage=saved.getString("language","en");resendAt=saved.getLong("resendAt",0);
                cameraId=saved.getString("cameraId","");cameraAccount=saved.getString("cameraAccount","");cameraDraft=saved.getString("cameraDraft","");
                String draftId=saved.getString("draftId","");if(session!=null&&!draftId.isEmpty())draft=store.draft(account(),draftId);
                itemIndex=saved.getInt("itemIndex",0);if(session!=null&&screen.equals("market"))market.restore();
            }
            getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){if(session!=null&&!screen.equals("home")){draft=null;screen="home";render();}else finish();}});
            drainRevocations();render();if(session!=null){NotificationJob.schedule(this);if(getIntent().getBooleanExtra("openInbox",false))market.load("inbox","/notifications");else refresh();}
        }catch(Exception error){showError(error);}
    }
    @Override protected void onSaveInstanceState(Bundle out){
        super.onSaveInstanceState(out);out.putString("screen",screen);out.putString("challenge",challengeId);out.putString("phone",phone);
        out.putString("role",selectedRole);out.putString("language",selectedLanguage);out.putLong("resendAt",resendAt);
        out.putString("cameraId",cameraId);out.putString("cameraAccount",cameraAccount);out.putString("cameraDraft",cameraDraft);
        if(draft!=null)out.putString("draftId",draft.optString("id"));
        out.putInt("itemIndex",itemIndex);if(screen.equals("market"))market.persist();
    }
    @Override protected void onDestroy(){tasks.submit(()->store.close());tasks.shutdown();super.onDestroy();}
    String account(){return session==null?"":session.optJSONObject("user").optString("id");}
    String token(){return session==null?"":session.optString("token");}
    String language(){return session==null?selectedLanguage:session.optJSONObject("user").optString("language","en");}
    String t(String source){return Translations.text(this,language(),source);}
    String localDate(String value){return Translations.date(language(),value);}
    int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    LinearLayout column(){LinearLayout value=new LinearLayout(this);value.setOrientation(LinearLayout.VERTICAL);return value;}
    void label(String value,int size){TextView text=new TextView(this);text.setText(value);text.setTextColor(INK);text.setTextSize(size);text.setPadding(0,dp(8),0,dp(8));page.addView(text);}
    void button(String title,String tag,Runnable run){
        Button button=new Button(this);button.setText(title);button.setTag(tag);button.setAllCaps(false);button.setMinHeight(dp(52));button.setTextColor(GREEN);
        button.setOnClickListener(v->{if(!working)run.run();});page.addView(button,new LinearLayout.LayoutParams(-1,-2));
    }
    EditText field(String title,String value,String tag,int type,int limit,Consumer<String> changed){
        label(title,14);EditText input=new EditText(this);input.setTag(tag);input.setInputType(type);input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)});
        input.setText(value);input.setTextColor(INK);input.setSingleLine((type&InputType.TYPE_TEXT_FLAG_MULTI_LINE)==0);page.addView(input,new LinearLayout.LayoutParams(-1,-2));
        if(changed!=null)input.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){}public void afterTextChanged(Editable s){changed.accept(s.toString());}});
        return input;
    }
    void choices(String title,String[] names,int selected,IntConsumer changed){
        label(title,14);Spinner spinner=new Spinner(this);ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names);spinner.setAdapter(adapter);spinner.setSelection(selected);page.addView(spinner);
        spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,View v,int position,long id){changed.accept(position);}public void onNothingSelected(AdapterView<?> p){}});
    }
    void render(){
        if(isFinishing())return;
        root=column();root.setBackgroundColor(BG);setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});ViewCompat.requestApplyInsets(root);
        ScrollView scroll=new ScrollView(this);root.addView(scroll,new LinearLayout.LayoutParams(-1,-1));page=column();page.setPadding(dp(20),dp(20),dp(20),dp(30));scroll.addView(page);
        label("E-Waste Marketplace",24);
        try {
            if(session==null){signIn();return;}
            if(screen.equals("edit")&&draft!=null)editor();else if(screen.equals("profile"))profile();else if(screen.equals("market"))market.render();else home();
        }catch(Exception error){label(t("Your saved drafts are kept. ")+message(error),15);}
        if(working)label(t("Connecting…"),14);
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
    void home()throws Exception {
        JSONObject user=session.getJSONObject("user");boolean collector=user.getString("role").equals("collector");
        label(collector?t("Your lots"):t("Recycler account"),23);
        label(user.optString("displayName","").isEmpty()?user.getString("mobile"):user.getString("displayName"),16);
        button(t("Profile"),"account-profile",()->{screen="profile";render();});
        market.pending();
        button(t("Earnings & payments"),"account-earnings",()->market.load("earnings","/earnings"));
        button(t("Notifications"),"account-inbox",()->market.load("inbox","/notifications"));
        button(t("Enable phone notifications"),"account-notifications-enable",()->{if(android.os.Build.VERSION.SDK_INT>=33)notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS);else NotificationJob.schedule(this);});
        button(t("Orders"),"account-orders",()->market.load("orders","/orders"));
        button(collector?t("My requests"):t("Incoming requests"),"account-requests",()->market.load("requests","/requests"));
        if(collector){
            button(t("＋ Create a lot"),"account-create",this::createDraft);
            button(t("Sync saved drafts"),"account-sync",this::syncAll);
            JSONArray lots=store.drafts(account());if(lots.length()==0)label(t("Take a photo or upload one to save your first lot."),16);
            for(int i=0;i<lots.length();i++){
                JSONObject lot=lots.getJSONObject(i);String id=lot.getString("id"),title=lot.optString("title");
                String state=lot.optString("syncState");label((title.isEmpty()?t("Untitled lot"):title)+" · "+(state.equals("synced")?t("Saved online"):state.equals("conflict")?t("Review needed"):t("Saved on this phone")),17);
                button(t("Open lot"),"account-open-"+id,()->{try{draft=store.draft(account(),id);screen="edit";render();}catch(Exception e){showError(e);}});
            }
        }else button(t("Buying portfolio"),"account-portfolio",()->market.load("portfolio","/requirements"));
        button(t("Sign out"),"account-logout",this::logout);
    }
    void createDraft(){try{
        JSONObject item=new JSONObject().put("id",UUID.randomUUID().toString()).put("broadCode",JSONObject.NULL).put("detailedCode",JSONObject.NULL)
            .put("description","").put("condition","unknown").put("unit","kg").put("quantity","").put("reviewState","needs_review");
        draft=new JSONObject().put("id",UUID.randomUUID().toString()).put("title","").put("locality",session.getJSONObject("user").optString("locality"))
            .put("notes","").put("taxonomyVersion",TAXONOMY).put("items",new JSONArray().put(item)).put("fileIds",new JSONArray());
        store.save(account(),draft);itemIndex=0;screen="edit";render();
    }catch(Exception e){showError(e);}}
    void saveField(JSONObject target,String key,Object value){try{if(!Objects.equals(target.opt(key),value)){target.put(key,value);store.save(account(),draft);}}catch(Exception e){showError(e);}}
    void editor()throws Exception {
        label(t("Create a lot"),23);label(t("Changes are saved on this phone as you type."),14);
        field(t("Lot name"),draft.optString("title"),"account-lot-title",InputType.TYPE_CLASS_TEXT,120,v->saveField(draft,"title",v));
        field(t("Collection area"),draft.optString("locality"),"account-lot-area",InputType.TYPE_CLASS_TEXT,120,v->saveField(draft,"locality",v));
        JSONArray lines=draft.getJSONArray("items");itemIndex=Math.max(0,Math.min(itemIndex,lines.length()-1));
        label(t("Material line ")+(itemIndex+1)+" of "+lines.length(),18);
        if(lines.length()>1)button(t("Next material line"),"account-next-line",()->{itemIndex=(itemIndex+1)%lines.length();render();});
        if(lines.length()<20)button(t("Add another material"),"account-add-line",()->{try{JSONObject next=new JSONObject().put("id",UUID.randomUUID().toString()).put("broadCode",JSONObject.NULL).put("detailedCode",JSONObject.NULL).put("description","").put("condition","unknown").put("unit","kg").put("quantity","").put("reviewState","needs_review");lines.put(next);store.save(account(),draft);itemIndex=lines.length()-1;render();}catch(Exception e){showError(e);}});
        JSONObject item=lines.getJSONObject(itemIndex);
        String[] categories=new String[Catalog.NAMES.length+1];categories[0]=t("Choose a category");System.arraycopy(Catalog.NAMES,0,categories,1,Catalog.NAMES.length);
        int selected=0;for(int i=0;i<Catalog.NAMES.length;i++)if(Catalog.code(i).equals(item.optString("broadCode")))selected=i+1;
        choices(t("Waste category"),categories,selected,pos->{Object code=pos==0?JSONObject.NULL:Catalog.code(pos-1);if(!Objects.equals(item.opt("broadCode"),code))saveField(item,"detailedCode",JSONObject.NULL);saveField(item,"broadCode",code);saveField(item,"reviewState",pos==0?"needs_review":"confirmed");});
        choices(t("Unit"),new String[]{"kg","piece"},item.optString("unit").equals("piece")?1:0,pos->saveField(item,"unit",pos==0?"kg":"piece"));
        field(t("Quantity"),item.isNull("quantity")?"":item.optString("quantity"),"account-lot-quantity",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12,v->saveField(item,"quantity",v));
        field(t("Description"),item.optString("description"),"account-lot-description",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,1000,v->saveField(item,"description",v));
        String[] conditions={"unknown","unsorted","sorted","damaged"};choices(t("Condition"),conditions,Math.max(0,Arrays.asList(conditions).indexOf(item.optString("condition"))),pos->saveField(item,"condition",conditions[pos]));
        field(t("Notes"),draft.optString("notes"),"account-lot-notes",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,3000,v->saveField(draft,"notes",v));
        button(t("Take photo"),"account-take-photo",()->{
            try {cameraId=UUID.randomUUID().toString();cameraAccount=account();cameraDraft=draft.getString("id");
                camera.launch(FileProvider.getUriForFile(this,getPackageName()+".files",store.photo(cameraAccount,cameraId)));
            }catch(Exception e){showError(e);}
        });
        button(t("Upload photo"),"account-choose-photo",()->gallery.launch(new String[]{"image/*"}));
        JSONArray photos=draft.getJSONArray("fileIds");label(photos.length()+" photo(s)",14);
        if(photos.length()>0)button(t("Identify a photo with Gemini"),"account-identify",()->market.identify(draft,null));
        for(int i=0;i<photos.length();i++){
            String photo=photos.getString(i);File file=store.photo(account(),photo);
            if(file.exists()){
                BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=4;Bitmap bitmap=BitmapFactory.decodeFile(file.getPath(),options);
                if(bitmap!=null){ImageView preview=new ImageView(this);preview.setImageBitmap(bitmap);preview.setContentDescription(t("Lot photo"));preview.setScaleType(ImageView.ScaleType.CENTER_INSIDE);page.addView(preview,new LinearLayout.LayoutParams(-1,dp(150)));}
            }else label(t("Photo saved online"),14);
            button(t("Remove this photo from lot"),"account-remove-photo-"+i,()->{try{JSONArray keep=new JSONArray();for(int j=0;j<photos.length();j++)if(!photos.optString(j).equals(photo))keep.put(photos.optString(j));draft.put("fileIds",keep);store.save(account(),draft);render();}catch(Exception e){showError(e);}});
        }
        JSONObject saved=store.draft(account(),draft.getString("id"));
        if(saved.optString("syncState").equals("conflict"))button(t("Review server changes"),"account-review-conflict",this::reviewConflict);
        else button(t("Save online"),"account-save-online",this::syncAll);
        button(t("Find recycler requirements for this line"),"account-find-matches",market::findMatches);
        button(t("Back to my lots"),"account-back",()->{draft=null;screen="home";render();});
    }
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
        JSONObject user=session.getJSONObject("user");label(t("Profile"),23);label(user.getString("mobile")+" · "+user.getString("role"),15);
        EditText name=field(t("Name"),user.optString("displayName"),"account-profile-name",InputType.TYPE_CLASS_TEXT,100,null);
        EditText area=field(t("Area"),user.optString("locality"),"account-profile-area",InputType.TYPE_CLASS_TEXT,120,null);
        final String[] language={user.optString("language","en")};
        choices(t("Preferred language"),new String[]{"English","हिन्दी","मराठी"},Arrays.asList("en","hi","mr").indexOf(language[0]),p->language[0]=new String[]{"en","hi","mr"}[p]);
        button(t("Save profile"),"account-save-profile",()->{
            try {JSONObject input=new JSONObject().put("displayName",name.getText().toString()).put("locality",area.getText().toString()).put("language",language[0]).put("expectedVersion",user.getInt("version"));String auth=token();
                task(()->api.request("PUT","/me",auth,input),result->{try{session.put("user",result.getJSONObject("user"));vault.save(session);screen="home";render();}catch(Exception e){showError(e);}});
            }catch(Exception e){showError(e);}
        });button(t("Back"),"account-profile-back",()->{screen="home";render();});
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
            new AlertDialog.Builder(this).setTitle(t("Draft changed on another device")).setMessage(t("Online: ")+remote.optString("title")+"\n"+remote.optString("locality")+"\n"+remote.optString("notes")+"\n\nKeep your local changes as a separate draft and restore the updated online copy alongside it.")
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
    String message(Throwable error){return error.getMessage()==null?t("Please try again."):error.getMessage();}
    void showError(Throwable error){if(!isFinishing())new AlertDialog.Builder(this).setTitle(t("Could not complete this action")).setMessage(message(error)).setPositiveButton("OK",null).show();}
}
