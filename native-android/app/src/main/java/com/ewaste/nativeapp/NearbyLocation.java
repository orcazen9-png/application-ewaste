package com.ewaste.nativeapp;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.util.function.Consumer;

/** Foreground, one-shot location; no background tracking. */
final class NearbyLocation {
 final AccountActivity a;final Handler handler=new Handler(Looper.getMainLooper());
 final ActivityResultLauncher<String[]> permission;
 Consumer<JSONObject> callback;LocationManager manager;LocationListener listener;Runnable timeout;String owner;
 NearbyLocation(AccountActivity activity){a=activity;permission=a.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(),granted->{if(allowed())read();else fail("Location permission was denied. Search by city or area instead.");});}
 boolean allowed(){return ContextCompat.checkSelfPermission(a,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
 void get(Consumer<JSONObject> next){cancel();owner=a.account();callback=next;if(allowed())read();else permission.launch(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION});}
 void read(){try{
  manager=(LocationManager)a.getSystemService(android.content.Context.LOCATION_SERVICE);
  listener=new LocationListener(){public void onLocationChanged(Location location){finish(location);}public void onProviderEnabled(String p){}public void onProviderDisabled(String p){}public void onStatusChanged(String p,int status,Bundle extras){}};
  boolean requested=false;for(String provider:manager.getProviders(true)){if(provider.equals(LocationManager.PASSIVE_PROVIDER))continue;try{manager.requestLocationUpdates(provider,0,0,listener,Looper.getMainLooper());requested=true;}catch(SecurityException ignored){}}
  if(!requested){fail("Turn on location, or search by city or area.");return;}
  android.widget.Toast.makeText(a,a.t("Finding your location…"),android.widget.Toast.LENGTH_SHORT).show();
  timeout=()->fail("Location was not available. Try outdoors or search by city or area.");handler.postDelayed(timeout,15000);
 }catch(Exception e){fail("Location was not available. Try outdoors or search by city or area.");}}
 void finish(Location location){if(callback==null)return;try{Consumer<JSONObject> next=callback;String requestedOwner=owner;JSONObject point=new JSONObject().put("latitude",Math.round(location.getLatitude()*100)/100.0).put("longitude",Math.round(location.getLongitude()*100)/100.0);cancel();if(a.session!=null&&a.account().equals(requestedOwner)&&!a.isFinishing())next.accept(point);}catch(Exception e){a.showError(e);}}
 void fail(String text){cancel();if(!a.isFinishing())a.showError(new Exception(a.t(text)));}
 void cancel(){if(manager!=null&&listener!=null)try{manager.removeUpdates(listener);}catch(SecurityException ignored){}if(timeout!=null)handler.removeCallbacks(timeout);listener=null;callback=null;}
}
