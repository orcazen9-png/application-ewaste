package com.ewaste.nativeapp;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;

public final class Catalog {
    private Catalog() {}
    public static final String[] NAMES={"Computers and laptops","Mobile phones and tablets","Printers and office machines","Telephones and networking equipment","UPS and inverters","Data storage devices","TVs, monitors and displays","Audio, video and cameras","Fridges, freezers and air conditioners","Washing, drying and cleaning machines","Kitchen and food appliances","Fans, heaters and air purifiers","Clothing-care and personal-care appliances","Lamps and lighting equipment","Solar panels and cells","Power tools and workshop equipment","Toys, games and sports electronics","Vending and dispensing machines","Sensors, controls and laboratory instruments","Medical equipment"};
    public static final String[] MATERIAL_IDS={"","cables","pcb","motors"};
    public static final String[] MATERIAL_NAMES={"Choose pricing material","Copper cables","Circuit boards","Electric motors"};
    public static final String[] LOCALITIES={"Mumbai","Thane","Navi Mumbai"};
    public static final String[] CONDITIONS={"unsorted","sorted","damaged"};
    public static String code(int i){return String.format(Locale.ROOT,"B%02d",i+1);}
    public static String name(String code){for(int i=0;i<NAMES.length;i++)if(code(i).equals(code))return NAMES[i];return code;}
    public static boolean valid(String code){for(int i=0;i<NAMES.length;i++)if(code(i).equals(code))return true;return false;}
    public static String material(String id){for(int i=1;i<MATERIAL_IDS.length;i++)if(MATERIAL_IDS[i].equals(id))return MATERIAL_NAMES[i];return "Unpriced equipment";}
    public static Set<String> codes(JSONArray array){Set<String> result=new LinkedHashSet<>();if(array!=null)for(int i=0;i<array.length();i++)if(valid(array.optString(i)))result.add(array.optString(i));return result;}
    public static Set<String> suggested(JSONObject assessment){Set<String> result=new LinkedHashSet<>();if(assessment!=null){JSONArray items=assessment.optJSONArray("items");if(items!=null)for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item!=null&&valid(item.optString("code")))result.add(item.optString("code"));}}return result;}
    public static String names(Set<String> codes){List<String> result=new ArrayList<>();for(String code:codes)result.add(name(code));return String.join(", ",result);}
    public static String title(JSONObject lot){JSONObject d=lot.optJSONObject("wasteDecision");Set<String> selected=d==null?Collections.emptySet():codes(d.optJSONArray("codes"));return selected.isEmpty()?material(lot.optString("materialId")):names(selected);}
    public static JSONObject copy(JSONObject value){try{return new JSONObject(value.toString());}catch(Exception e){throw new IllegalArgumentException(e);}}
    public static void put(JSONObject object,String key,Object value){try{object.put(key,value==null?JSONObject.NULL:value);}catch(Exception e){throw new IllegalArgumentException(e);}}
}

