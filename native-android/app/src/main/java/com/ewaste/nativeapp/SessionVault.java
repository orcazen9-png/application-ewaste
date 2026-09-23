package com.ewaste.nativeapp;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Separate alias/preferences preserve the older workspace connection unchanged. */
public final class SessionVault {
    private final Context context;
    private static final String ALIAS="ewaste-personal-session";
    public SessionVault(Context context){this.context=context.getApplicationContext();}
    private SecretKey key()throws Exception {
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        if(!keys.containsAlias(ALIAS)){
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry)keys.getEntry(ALIAS,null)).getSecretKey();
    }
    public synchronized JSONObject read()throws Exception {
        return readValue("encrypted");
    }
    private JSONObject readValue(String name)throws Exception {
        String encoded=context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE).getString(name,"");
        if(encoded.isEmpty())return null;
        JSONObject value=new JSONObject(encoded);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(value.getString("iv"),Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(value.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    public synchronized void save(JSONObject session)throws Exception {
        saveValue("encrypted",session);
    }
    private void saveValue(String name,JSONObject session)throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        JSONObject value=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        if(!context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE).edit().putString(name,value.toString()).commit())throw new IOException("Could not save sign-in.");
    }
    public synchronized void clear()throws IOException {
        if(!context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE).edit().remove("encrypted").commit())throw new IOException("Could not sign out on this phone.");
    }
    public synchronized JSONArray pendingRevocations()throws Exception {
        JSONObject value=readValue("revocations");return value==null?new JSONArray():value.getJSONArray("tokens");
    }
    public synchronized void queueRevocation(String token)throws Exception {
        JSONArray old=pendingRevocations();for(int i=0;i<old.length();i++)if(old.getString(i).equals(token))return;
        old.put(token);saveValue("revocations",new JSONObject().put("tokens",old));
    }
    public synchronized void revoked(String token)throws Exception {
        JSONArray old=pendingRevocations(),next=new JSONArray();for(int i=0;i<old.length();i++)if(!old.getString(i).equals(token))next.put(old.getString(i));
        saveValue("revocations",new JSONObject().put("tokens",next));
    }
}
