package com.ewaste.nativeapp;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.UUID;

/** Every local query and file path is scoped to the server-issued account id. */
public final class AccountStore extends SQLiteOpenHelper {
    private final Context context;
    public AccountStore(Context context){super(context.getApplicationContext(),"personal-accounts.sqlite",null,2);this.context=context.getApplicationContext();}
    @Override public void onConfigure(SQLiteDatabase db){db.setForeignKeyConstraintsEnabled(true);}
    @Override public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE drafts(account_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,local_revision INTEGER NOT NULL,server_version INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(account_id,id))");
        db.execSQL("CREATE TABLE outbox(account_id TEXT NOT NULL,command_id TEXT NOT NULL,lot_id TEXT NOT NULL,payload TEXT NOT NULL,local_revision INTEGER NOT NULL,PRIMARY KEY(account_id,command_id),UNIQUE(account_id,lot_id),FOREIGN KEY(account_id,lot_id) REFERENCES drafts(account_id,id))");
        db.execSQL("CREATE TABLE uploaded_files(account_id TEXT NOT NULL,file_id TEXT NOT NULL,PRIMARY KEY(account_id,file_id))");
        marketTables(db);
    }
    private void marketTables(SQLiteDatabase db){
        db.execSQL("CREATE TABLE market_cache(account_id TEXT NOT NULL,cache_key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(account_id,cache_key))");
        db.execSQL("CREATE TABLE market_pending(account_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){if(oldVersion<2)marketTables(db);}
    public synchronized JSONObject cached(String account,String key)throws Exception{
        validId(account);try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM market_cache WHERE account_id=? AND cache_key=?",new String[]{account,key})){return c.moveToFirst()?new JSONObject(c.getString(0)):null;}
    }
    public synchronized void cache(String account,String key,JSONObject value){validId(account);getWritableDatabase().execSQL("INSERT OR REPLACE INTO market_cache VALUES(?,?,?)",new Object[]{account,key,value.toString()});}
    public synchronized JSONObject pendingMarket(String account)throws Exception{
        validId(account);try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM market_pending WHERE account_id=?",new String[]{account})){return c.moveToFirst()?new JSONObject(c.getString(0)):null;}
    }
    public synchronized JSONObject queueMarket(String account,String method,String path,JSONObject input,String destination)throws Exception{
        validId(account);if(pendingMarket(account)!=null)throw new IllegalStateException("Retry the pending action before submitting another change.");
        JSONObject payload=new JSONObject(input.toString()).put("commandId",UUID.randomUUID().toString());
        JSONObject operation=new JSONObject().put("method",method).put("path",path).put("input",payload).put("destination",destination);
        getWritableDatabase().execSQL("INSERT INTO market_pending VALUES(?,?)",new Object[]{account,operation.toString()});return operation;
    }
    public synchronized void finishMarket(String account){validId(account);getWritableDatabase().delete("market_pending","account_id=?",new String[]{account});}
    public static String validId(String value){if(value==null||!value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw new IllegalArgumentException("Invalid account or draft reference");return value;}
    public synchronized JSONObject draft(String account,String id)throws Exception {
        validId(account);validId(id);
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload,local_revision,server_version,state FROM drafts WHERE account_id=? AND id=?",new String[]{account,id})){
            if(!c.moveToFirst())return null;
            return new JSONObject(c.getString(0)).put("localRevision",c.getInt(1)).put("serverVersion",c.getInt(2)).put("syncState",c.getString(3));
        }
    }
    public synchronized JSONArray drafts(String account)throws Exception {
        validId(account);JSONArray result=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id FROM drafts WHERE account_id=? ORDER BY updated_at DESC",new String[]{account})){
            while(c.moveToNext())result.put(draft(account,c.getString(0)));
        }return result;
    }
    private JSONObject payload(JSONObject source)throws Exception {
        JSONObject value=new JSONObject(source.toString());value.remove("localRevision");value.remove("serverVersion");value.remove("syncState");return value;
    }
    public synchronized void save(String account,JSONObject value)throws Exception {
        validId(account);String id=validId(value.getString("id"));JSONObject old=draft(account,id),clean=payload(value);
        if(old!=null&&payload(old).toString().equals(clean.toString()))return;
        ContentValues row=new ContentValues();row.put("account_id",account);row.put("id",id);row.put("payload",clean.toString());
        row.put("local_revision",old==null?1:old.getInt("localRevision")+1);row.put("server_version",old==null?0:old.getInt("serverVersion"));
        row.put("state",old!=null&&old.optString("syncState").equals("conflict")?"conflict":"local");row.put("updated_at",System.currentTimeMillis());
        if(old==null)getWritableDatabase().insertOrThrow("drafts",null,row);
        else getWritableDatabase().update("drafts",row,"account_id=? AND id=?",new String[]{account,id});
    }
    public synchronized JSONObject queue(String account,String id)throws Exception {
        JSONObject saved=draft(account,id);if(saved==null)throw new IllegalArgumentException("Draft not found");
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM outbox WHERE account_id=? AND lot_id=?",new String[]{account,id})){
            if(c.moveToFirst())return new JSONObject(c.getString(0));
        }
        if(saved.optString("syncState").equals("conflict"))throw new IllegalStateException("Review the server copy before syncing this draft.");
        String command=UUID.randomUUID().toString();JSONObject request=payload(saved).put("commandId",command).put("expectedVersion",saved.getInt("serverVersion"));
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            ContentValues row=new ContentValues();row.put("account_id",account);row.put("command_id",command);row.put("lot_id",id);row.put("payload",request.toString());row.put("local_revision",saved.getInt("localRevision"));db.insertOrThrow("outbox",null,row);
            db.execSQL("UPDATE drafts SET state='queued' WHERE account_id=? AND id=?",new Object[]{account,id});db.setTransactionSuccessful();
        }finally{db.endTransaction();}return request;
    }
    public synchronized JSONArray pending(String account)throws Exception {
        validId(account);JSONArray result=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT o.lot_id FROM outbox o JOIN drafts d ON d.account_id=o.account_id AND d.id=o.lot_id WHERE o.account_id=? AND d.state<>'conflict'",new String[]{account})){
            while(c.moveToNext())result.put(c.getString(0));
        }return result;
    }
    public synchronized void complete(String account,String command,int serverVersion)throws Exception {
        validId(account);validId(command);SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try(Cursor c=db.rawQuery("SELECT lot_id,local_revision FROM outbox WHERE account_id=? AND command_id=?",new String[]{account,command})){
            if(c.moveToFirst()){
                db.execSQL("UPDATE drafts SET server_version=?,state=CASE WHEN local_revision=? THEN 'synced' ELSE 'local' END WHERE account_id=? AND id=?",new Object[]{serverVersion,c.getInt(1),account,c.getString(0)});
                db.delete("outbox","account_id=? AND command_id=?",new String[]{account,command});
            }db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    public synchronized void conflict(String account,String id){validId(account);validId(id);getWritableDatabase().execSQL("UPDATE drafts SET state='conflict' WHERE account_id=? AND id=?",new Object[]{account,id});}
    public synchronized void attachPhoto(String account,String id,String fileId)throws Exception {
        validId(fileId);JSONObject saved=draft(account,id);
        if(saved==null)throw new IllegalArgumentException("Draft not found");
        JSONArray photos=saved.getJSONArray("fileIds");if(photos.length()>=10)throw new IllegalStateException("A lot can contain up to 10 photos.");
        photos.put(fileId);save(account,saved);
    }
    public synchronized void importServer(String account,JSONObject remote)throws Exception {
        String id=validId(remote.getString("id"));JSONObject local=draft(account,id);
        if(local!=null&&!local.optString("syncState").equals("synced"))return;
        JSONObject clean=payload(remote);clean.remove("version");clean.remove("createdAt");clean.remove("updatedAt");clean.remove("status");
        if(local==null)save(account,clean);
        getWritableDatabase().execSQL("UPDATE drafts SET payload=?,server_version=?,state='synced' WHERE account_id=? AND id=?",new Object[]{clean.toString(),remote.getInt("version"),account,id});
    }
    public synchronized void replaceFromServer(String account,JSONObject remote)throws Exception {
        String id=validId(remote.getString("id"));validId(account);SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            db.delete("outbox","account_id=? AND lot_id=?",new String[]{account,id});
            db.execSQL("UPDATE drafts SET state='synced' WHERE account_id=? AND id=?",new Object[]{account,id});
            importServer(account,remote);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    public synchronized boolean uploaded(String account,String fileId){validId(account);validId(fileId);try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM uploaded_files WHERE account_id=? AND file_id=?",new String[]{account,fileId})){return c.moveToFirst();}}
    public synchronized void markUploaded(String account,String fileId){validId(account);validId(fileId);getWritableDatabase().execSQL("INSERT OR IGNORE INTO uploaded_files VALUES (?,?)",new Object[]{account,fileId});}
    public File photo(String account,String fileId){
        validId(account);validId(fileId);File directory=new File(context.getFilesDir(),"photos/accounts/"+account);
        if(!directory.exists()&&!directory.mkdirs())throw new IllegalStateException("Photo storage is unavailable");return new File(directory,fileId+".jpg");
    }
}
