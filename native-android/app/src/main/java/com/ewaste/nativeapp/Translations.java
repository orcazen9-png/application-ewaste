package com.ewaste.nativeapp;
import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class Translations {
    private static JSONObject phrases;
    static synchronized String text(Context context,String language,String source){
        if(language.equals("en"))return source;
        try{if(phrases==null){try(InputStream in=context.getAssets().open("ui-translations.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);phrases=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));}}
            JSONArray translated=phrases.optJSONArray(source);return translated==null?source:translated.optString(language.equals("mr")?1:0,source);
        }catch(Exception ignored){return source;}
    }
    static String date(String language,String value){try{return DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a",Locale.forLanguageTag(language+"-IN")).format(Instant.parse(value).atZone(ZoneId.of("Asia/Kolkata")));}catch(Exception ignored){return value;}}
    static String error(Context context,String language,String value){
        String translated=text(context,language,value);if(!translated.equals(value)||language.equals("en"))return translated;
        // Compound validation failures contain complete fixed messages separated by sentences.
        // Translate only whole messages; never substitute inside a person's entered text.
        String[] sentences=value.split("(?<=[.!?])\\s+");StringBuilder result=new StringBuilder();
        boolean changed=false;for(String sentence:sentences){if(result.length()>0)result.append(' ');String next=text(context,language,sentence);changed|=!next.equals(sentence);result.append(next);}
        if(changed||value.matches("(?s).*[\\u0900-\\u097F].*"))return result.toString();
        return text(context,language,"Review the entered details and try again. Saved drafts are kept.");
    }
}
