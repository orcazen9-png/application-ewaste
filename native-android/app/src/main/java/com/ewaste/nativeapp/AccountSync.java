package com.ewaste.nativeapp;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;

/** A persisted command is reused after a timeout, including after process restart. */
public final class AccountSync {
    private final AccountStore store;
    private final AccountApi api;
    public AccountSync(AccountStore store,AccountApi api){this.store=store;this.api=api;}
    public void save(String account,String token,String lotId)throws Exception {
        JSONObject command=store.queue(account,lotId);JSONArray files=command.getJSONArray("fileIds");
        for(int i=0;i<files.length();i++){
            String fileId=files.getString(i);
            if(!store.uploaded(account,fileId)){
                File file=store.photo(account,fileId);
                if(!file.exists())throw new IllegalStateException("A photo is missing from this phone. Restore it before syncing.");
                api.upload(file,fileId,token);store.markUploaded(account,fileId);
            }
        }
        try {
            JSONObject result=api.request("PUT","/lots/"+lotId,token,command);
            store.complete(account,command.getString("commandId"),result.getInt("version"));
        }catch(AccountApi.Failure error){if(error.status==410){store.removeDraft(account,lotId);return;}if(error.status==409)store.conflict(account,lotId);throw error;}
    }
    public void refresh(String account,String token)throws Exception {
        String after="";
        do {
            JSONObject page=api.request("GET","/lots"+(after.isEmpty()?"":"?after="+after),token,null);
            JSONArray removed=page.optJSONArray("deletedLots");if(removed!=null)for(int i=0;i<removed.length();i++)store.removeDraft(account,removed.getString(i));
            JSONArray lots=page.getJSONArray("lots");
            for(int i=0;i<lots.length();i++){
                JSONObject lot=lots.getJSONObject(i);store.importServer(account,lot);
                JSONArray photos=lot.getJSONArray("fileIds");for(int j=0;j<photos.length();j++)store.markUploaded(account,photos.getString(j));
            }
            after=page.isNull("nextCursor")?"":page.optString("nextCursor","");
        }while(!after.isEmpty());
    }
    public void retryPending(String account,String token)throws Exception {
        JSONArray pending=store.pending(account);for(int i=0;i<pending.length();i++)save(account,token,pending.getString(i));
    }
}
