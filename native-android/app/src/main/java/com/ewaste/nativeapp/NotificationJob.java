package com.ewaste.nativeapp;

import android.Manifest;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.time.Instant;

/** Polls the durable inbox when Android permits. No claimed real-time push. */
public final class NotificationJob extends JobService {
    static final int JOB=4806,NOTICE=4807;static final String CHANNEL="order_updates";
    volatile boolean stopped;
    static void schedule(Context context){
        JobScheduler scheduler=(JobScheduler)context.getSystemService(JOB_SCHEDULER_SERVICE);
        scheduler.schedule(new JobInfo.Builder(JOB,new ComponentName(context,NotificationJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build());
    }
    static void cancel(Context context){((JobScheduler)context.getSystemService(JOB_SCHEDULER_SERVICE)).cancel(JOB);((NotificationManager)context.getSystemService(NOTIFICATION_SERVICE)).cancel(NOTICE);}
    @Override public boolean onStartJob(JobParameters params){stopped=false;new Thread(()->{
        try{
            JSONObject session=new SessionVault(this).read();if(session==null||Instant.parse(session.getString("expiresAt")).isBefore(Instant.now()))return;
            String owner=session.getJSONObject("user").getString("id"),token=session.getString("token"),language=session.getJSONObject("user").optString("language","en");JSONObject inbox=new AccountApi().request("GET","/notifications",token,null);JSONArray list=inbox.optJSONArray("notifications");
            if(stopped||list==null||list.length()==0||inbox.optInt("unread")==0)return;
            String latest="";for(int i=0;i<list.length();i++)if(list.getJSONObject(i).isNull("read_at")){latest=list.getJSONObject(i).getString("id");break;}
            SharedPreferences prefs=getSharedPreferences("inbox-notices",MODE_PRIVATE);if(latest.isEmpty()||latest.equals(prefs.getString(owner,"")))return;
            JSONObject current=new SessionVault(this).read();if(stopped||current==null||!current.optString("token").equals(token))return;
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);manager.createNotificationChannel(new NotificationChannel(CHANNEL,Translations.text(this,language,"Order updates"),NotificationManager.IMPORTANCE_DEFAULT));
            Intent intent=new Intent(this,AccountActivity.class).putExtra("openInbox",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent click=PendingIntent.getActivity(this,NOTICE,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            manager.notify(NOTICE,new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(com.ewaste.nativeapp.R.drawable.ic_ewaste).setContentTitle("E-Waste Marketplace").setContentText(Translations.text(this,language,"You have unread order updates. Open your inbox to review.")).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(click).build());prefs.edit().putString(owner,latest).apply();
        }catch(Exception ignored){/* Inbox remains available in the app; network and expiry retry later. */}
        finally{new Handler(Looper.getMainLooper()).post(()->{if(!stopped)jobFinished(params,false);});}
    },"ewaste-inbox").start();return true;}
    @Override public boolean onStopJob(JobParameters params){stopped=true;return true;}
}
