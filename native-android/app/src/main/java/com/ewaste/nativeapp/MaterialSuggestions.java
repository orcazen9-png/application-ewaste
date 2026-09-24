package com.ewaste.nativeapp;

import org.json.*;
import java.util.*;

/** A photo yields editable lines. Reusing a photo never silently adds its quantities again. */
final class MaterialSuggestions {
 static boolean used(JSONObject draft,String fileId){return draft.optJSONObject("appliedPhotos")!=null&&draft.optJSONObject("appliedPhotos").has(fileId);}
 static void apply(JSONObject draft,JSONArray suggestions,String fileId)throws Exception{
  if(used(draft,fileId))return;
  JSONArray old=draft.getJSONArray("items"),lines=new JSONArray();
  for(int i=0;i<old.length();i++){JSONObject line=old.getJSONObject(i);if(!line.optString("description").isEmpty()||!line.isNull("broadCode")&&!line.optString("broadCode").isEmpty()||!line.optString("quantity").isEmpty())lines.put(line);}
  if(lines.length()+suggestions.length()>20)throw new IllegalArgumentException("A lot can contain up to 20 material lines.");
  for(int i=0;i<suggestions.length();i++){
   JSONObject s=suggestions.getJSONObject(i);String unit=s.optString("suggestedUnit",s.isNull("approximateCount")?"kg":"piece");
   lines.put(new JSONObject().put("id",UUID.randomUUID().toString()).put("name",s.optString("name",s.optString("evidence")))
    .put("broadCode",s.getString("code")).put("detailedCode",JSONObject.NULL).put("description",s.optString("evidence"))
    .put("condition","unknown").put("unit",unit).put("quantity",unit.equals("piece")&&!s.isNull("approximateCount")?String.valueOf(s.optInt("approximateCount")):"")
    .put("reviewState","needs_review").put("suggested",true).put("sourcePhoto",fileId));
  }
  JSONObject photos=draft.optJSONObject("appliedPhotos");if(photos==null)photos=new JSONObject();photos.put(fileId,true);
  draft.put("items",lines).put("appliedPhotos",photos);
 }
}
