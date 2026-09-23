package com.ewaste.nativeapp;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public class ApiClient {
    public static final String ORIGIN="https://ewaste-demo.ewaste-marketplace.workers.dev";
    public JSONObject json(String method,String path,String code,JSONObject body)throws Exception{
        byte[] response=send(method,path,code,body==null?null:body.toString().getBytes(StandardCharsets.UTF_8),"application/json");return new JSONObject(new String(response,StandardCharsets.UTF_8));
    }
    public void upload(File file,String photoId,String code)throws Exception{
        if(file.length()>2*1024*1024)throw new IOException("Photo must be below 2 MB.");
        send("PUT","/api/photos/"+photoId,code,read(new FileInputStream(file),2*1024*1024),"image/jpeg");
    }
    public void download(String photoId,String code,File destination)throws Exception{
        byte[] bytes=send("GET","/api/photos/"+photoId,code,null,"image/jpeg");
        try(FileOutputStream stream=new FileOutputStream(destination)){stream.write(bytes);}
    }
    private byte[] send(String method,String path,String code,byte[] body,String type)throws Exception{
        if(!code.matches("[a-f0-9]{48}"))throw new IOException("Connect the workspace first.");
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+path).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setRequestMethod(method);connection.setConnectTimeout(15000);connection.setReadTimeout(90000);connection.setRequestProperty("Authorization","Bearer "+code);connection.setRequestProperty("Content-Type",type);
        try{
            if(body!=null){connection.setDoOutput(true);connection.setFixedLengthStreamingMode(body.length);try(OutputStream stream=connection.getOutputStream()){stream.write(body);}}
            int status=connection.getResponseCode();InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();byte[] bytes=stream==null?new byte[0]:read(stream,8*1024*1024);
            if(status<200||status>=300){String message="Request failed ("+status+").";try{message=new JSONObject(new String(bytes,StandardCharsets.UTF_8)).optString("error",message);}catch(Exception ignored){}throw new IOException(message);}
            return bytes;
        }finally{connection.disconnect();}
    }
    private static byte[] read(InputStream source,int limit)throws IOException{
        try(InputStream stream=source;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int count;while((count=stream.read(buffer))!=-1){if(out.size()+count>limit)throw new IOException("Response is too large.");out.write(buffer,0,count);}return out.toByteArray();}
    }
}
