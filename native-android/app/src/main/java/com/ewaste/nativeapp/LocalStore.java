package com.ewaste.nativeapp;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

public final class LocalStore {
    private final Context context;
    private final AtomicFile file;
    private JSONObject data;
    private static final String KEY="ewaste-workspace-code";
    public LocalStore(Context context)throws Exception{
        this.context=context;file=new AtomicFile(new File(context.getFilesDir(),"native-lots.json"));
        data=file.getBaseFile().exists()?new JSONObject(new String(file.readFully(),StandardCharsets.UTF_8)):new JSONObject();
    }
    public synchronized JSONObject shared(){JSONObject value=data.optJSONObject("shared");return value==null?new JSONObject():Catalog.copy(value);}
    public synchronized JSONArray drafts(){JSONArray value=data.optJSONArray("drafts");try{return new JSONArray(value==null?"[]":value.toString());}catch(Exception e){throw new IllegalStateException(e);}}
    public synchronized void setShared(JSONObject shared)throws Exception{Catalog.put(data,"shared",shared);persist();}
    public synchronized void saveDraft(JSONObject lot)throws Exception{
        JSONArray old=drafts(),next=new JSONArray();next.put(Catalog.copy(lot));
        for(int i=0;i<old.length();i++)if(!old.getJSONObject(i).optString("id").equals(lot.optString("id")))next.put(old.getJSONObject(i));
        Catalog.put(data,"drafts",next);persist();
    }
    public synchronized void removeDraft(String id)throws Exception{JSONArray old=drafts(),next=new JSONArray();for(int i=0;i<old.length();i++)if(!old.getJSONObject(i).optString("id").equals(id))next.put(old.getJSONObject(i));Catalog.put(data,"drafts",next);persist();}
    private void persist()throws Exception{FileOutputStream stream=null;try{stream=file.startWrite();stream.write(data.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);}catch(Exception e){if(stream!=null)file.failWrite(stream);throw e;}}
    public File photo(String photoId){if(!photoId.matches("photo-[a-f0-9-]{36}"))throw new IllegalArgumentException("Invalid photo reference");File dir=new File(context.getFilesDir(),"photos");if(!dir.exists()&&!dir.mkdirs())throw new IllegalStateException("Photo storage unavailable");return new File(dir,photoId+".jpg");}
    private SecretKey secretKey()throws Exception{
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        if(!keys.containsAlias(KEY)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
        return ((KeyStore.SecretKeyEntry)keys.getEntry(KEY,null)).getSecretKey();
    }
    public synchronized String code()throws Exception{
        String raw=context.getSharedPreferences("workspace",Context.MODE_PRIVATE).getString("encrypted","");if(raw.isEmpty())return "";
        JSONObject saved=new JSONObject(raw);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secretKey(),new GCMParameterSpec(128,Base64.decode(saved.getString("iv"),Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(saved.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
    public synchronized void setCode(String code)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secretKey());JSONObject value=new JSONObject();value.put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP));value.put("data",Base64.encodeToString(cipher.doFinal(code.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        if(!context.getSharedPreferences("workspace",Context.MODE_PRIVATE).edit().putString("encrypted",value.toString()).commit())throw new IOException("Could not save workspace connection");
    }
}
