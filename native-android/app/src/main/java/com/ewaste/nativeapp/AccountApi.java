package com.ewaste.nativeapp;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Personal-account transport. Workspace pairing codes are never used on these routes. */
public class AccountApi {
    public static final class Failure extends IOException {
        public final int status;
        Failure(int status,String message){super(message);this.status=status;}
    }
    public JSONObject request(String method,String path,String token,JSONObject body)throws Exception {
        return new JSONObject(new String(send(method,path,token,body==null?null:body.toString().getBytes(StandardCharsets.UTF_8),"application/json"),StandardCharsets.UTF_8));
    }
    public void upload(File file,String fileId,String token)throws Exception {
        if(file.length()>2*1024*1024)throw new IOException("Photo must be below 2 MB.");
        send("PUT","/files/"+fileId,token,read(new FileInputStream(file),2*1024*1024),"image/jpeg");
    }
    public byte[] photo(String fileId,String token)throws Exception {return send("GET","/files/"+fileId,token,null,"image/jpeg");}
    public byte[] logisticsPhoto(String orderId,String fileId,String token)throws Exception {AccountStore.validId(orderId);AccountStore.validId(fileId);return send("GET","/orders/"+orderId+"/logistics/photos/"+fileId,token,null,"image/jpeg");}
    public byte[] listingPhoto(String lot,String file,String token)throws Exception{AccountStore.validId(lot);AccountStore.validId(file);return send("GET","/listings/"+lot+"/photos/"+file,token,null,"image/jpeg");}
    public byte[] sharedPhoto(String requestId,String fileId,String token)throws Exception {AccountStore.validId(requestId);AccountStore.validId(fileId);return send("GET","/requests/"+requestId+"/photos/"+fileId,token,null,"image/jpeg");}
    public void uploadDocument(File file,String order,String doc,String mime,String name,String token)throws Exception {AccountStore.validId(order);AccountStore.validId(doc);send("PUT","/orders/"+order+"/finance/documents/"+doc+"?name="+java.net.URLEncoder.encode(name,"UTF-8"),token,read(new FileInputStream(file),5242880),mime);}
    public byte[] document(String order,String doc,String token)throws Exception {AccountStore.validId(order);AccountStore.validId(doc);return send("GET","/orders/"+order+"/finance/documents/"+doc,token,null,"application/octet-stream");}
    public void uploadFacilityDocument(File file,String doc,String mime,String name,String token)throws Exception{AccountStore.validId(doc);send("PUT","/facility/documents/"+doc+"?name="+URLEncoder.encode(name,"UTF-8"),token,read(new FileInputStream(file),5242880),mime);}
    public byte[] facilityDocument(String doc,String token)throws Exception{AccountStore.validId(doc);return send("GET","/facility/documents/"+doc,token,null,"application/octet-stream");}
    private byte[] send(String method,String path,String token,byte[] data,String type)throws Exception {
        if(!path.startsWith("/")||path.contains("..")||path.contains(":"))throw new IOException("Invalid request path.");
        String origin=BuildConfig.ACCOUNT_API_ORIGIN;
        if(!origin.startsWith("https://"))throw new IOException("A secure server connection is required.");
        HttpURLConnection c=(HttpURLConnection)new URL(origin+"/api/v1"+path).openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setRequestMethod(method);c.setRequestProperty("Content-Type",type);
        if(token!=null&&!token.isEmpty()){
            if(!token.matches("ews_[a-f0-9]{64}"))throw new IOException("Sign in again to continue.");
            c.setRequestProperty("Authorization","Bearer "+token);
        }
        try {
            if(data!=null){c.setDoOutput(true);c.setFixedLengthStreamingMode(data.length);try(OutputStream out=c.getOutputStream()){out.write(data);}}
            int status=c.getResponseCode();InputStream stream=status>=200&&status<300?c.getInputStream():c.getErrorStream();
            byte[] result=stream==null?new byte[0]:read(stream,6*1024*1024);
            if(status<200||status>=300){String message="Could not complete the request ("+status+").";try{message=new JSONObject(new String(result,StandardCharsets.UTF_8)).optString("error",message);}catch(Exception ignored){}throw new Failure(status,message);}
            return result;
        } finally {c.disconnect();}
    }
    private static byte[] read(InputStream input,int maximum)throws IOException {
        try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;
            while((count=in.read(buffer))!=-1){if(out.size()+count>maximum)throw new IOException("Response is too large.");out.write(buffer,0,count);}
            return out.toByteArray();
        }
    }
}
