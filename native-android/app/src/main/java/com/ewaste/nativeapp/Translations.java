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
}
