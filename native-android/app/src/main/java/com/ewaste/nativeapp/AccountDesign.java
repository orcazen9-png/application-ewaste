package com.ewaste.nativeapp;

import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import org.json.*;

/** Shared native presentation. Business state stays in the account and marketplace controllers. */
final class AccountDesign {
    static final int INK=0xff20372d, GREEN=0xff174d3c, MUTED=0xff68756d, BG=0xfff5f6f1,
        LINE=0xffe0e6dc, SOFT=0xffeaf0e5, LIME=0xffd8f49a, WHITE=0xffffffff, AMBER=0xfffbefcf;
    final AccountActivity a;
    AccountDesign(AccountActivity activity){a=activity;}
    int dp(int n){return a.dp(n);}
    boolean compact(){return a.getResources().getConfiguration().screenHeightDp<740||a.getResources().getConfiguration().fontScale>1.15f;}
    GradientDrawable shape(int color,int radius,int stroke){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(stroke!=0)d.setStroke(dp(1),stroke);return d;}
    TextView text(String value,int size,int color,boolean bold){TextView t=new TextView(a);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setFontFeatureSettings("kern");t.setTypeface(Typeface.create(bold?"sans-serif-medium":"sans-serif",Typeface.NORMAL));t.setIncludeFontPadding(false);t.setLineSpacing(dp(2),1.05f);return t;}
    void space(LinearLayout p,int height){p.addView(new View(a),new LinearLayout.LayoutParams(1,dp(height)));}
    LinearLayout row(){LinearLayout r=new LinearLayout(a);r.setGravity(Gravity.CENTER_VERTICAL);r.setOrientation(LinearLayout.HORIZONTAL);return r;}
    LinearLayout card(LinearLayout parent,int color){LinearLayout c=a.column();c.setPadding(dp(18),dp(18),dp(18),dp(18));c.setBackground(shape(color,20,color==WHITE?LINE:0));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(14);parent.addView(c,p);return c;}
    interface Content {void render()throws Exception;}
    void inside(LinearLayout p,Content content)throws Exception{LinearLayout previous=a.page;a.page=p;try{content.render();}finally{a.page=previous;}}
    void heading(String title,String subtitle){a.page.addView(text(title,28,INK,true));if(!subtitle.isEmpty()){space(a.page,8);a.page.addView(text(subtitle,14,MUTED,false));}space(a.page,22);}
    void section(String title){space(a.page,8);a.page.addView(text(title,18,INK,true));space(a.page,12);}
    void note(LinearLayout parent,String message){TextView t=text(message,13,MUTED,false);t.setPadding(0,dp(6),0,dp(8));parent.addView(t);}
    Button action(LinearLayout parent,String title,String tag,Runnable run,int style){
        int bg=style==1?GREEN:style==2?LIME:WHITE,fg=style==1?WHITE:GREEN;
        Button b=new Button(a);b.setText(title);b.setTag(tag);b.setAllCaps(false);b.setTextSize(15);b.setTypeface(Typeface.create("sans-serif-medium",0));b.setTextColor(fg);b.setMinHeight(dp(50));b.setMinimumHeight(dp(50));b.setPadding(dp(16),dp(11),dp(16),dp(11));b.setStateListAnimator(null);b.setBackgroundTintList(null);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x18174d3c),shape(bg,14,style==0?LINE:0),null));b.setEnabled(!a.working);b.setAlpha(a.working?.55f:1f);
        b.setOnClickListener(v->{if(!a.working)run.run();});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(6);lp.bottomMargin=dp(4);parent.addView(b,lp);return b;
    }
    void metric(LinearLayout parent,String title,String value,String icon){LinearLayout r=row();parent.addView(r);r.addView(iconView(icon,GREEN,22),new LinearLayout.LayoutParams(dp(22),dp(22)));TextView caption=text(title,13,MUTED,false);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.leftMargin=dp(9);r.addView(caption,cp);space(parent,12);parent.addView(text(value,26,INK,true));}
    void keyValue(LinearLayout parent,String key,String value){LinearLayout r=row();r.setPadding(0,dp(10),0,dp(10));TextView k=text(key,14,MUTED,false);r.addView(k,new LinearLayout.LayoutParams(0,-2,1));TextView v=text(value,16,INK,true);v.setGravity(Gravity.END);LinearLayout.LayoutParams vp=new LinearLayout.LayoutParams(-2,-2);vp.leftMargin=dp(12);r.addView(v,vp);parent.addView(r);}
    void divider(LinearLayout parent){View line=new View(a);line.setBackgroundColor(LINE);parent.addView(line,new LinearLayout.LayoutParams(-1,dp(1)));}
    void pill(LinearLayout parent,String value,int color){TextView p=text(value,11,color==GREEN?WHITE:GREEN,true);p.setPadding(dp(10),dp(6),dp(10),dp(6));p.setBackground(shape(color,20,0));parent.addView(p,new LinearLayout.LayoutParams(-2,-2));}
    void link(LinearLayout parent,String title,String detail,String tag,String icon,Runnable run){
        LinearLayout r=row();r.setPadding(dp(14),dp(14),dp(12),dp(14));r.setBackground(new RippleDrawable(ColorStateList.valueOf(SOFT),shape(WHITE,16,LINE),null));r.setTag(tag);r.setFocusable(true);r.setContentDescription(title+". "+detail);r.setOnClickListener(v->{if(!a.working)run.run();});
        FrameLayout badge=new FrameLayout(a);badge.setBackground(shape(SOFT,13,0));ImageView image=iconView(icon,GREEN,24);FrameLayout.LayoutParams ip=new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.CENTER);badge.addView(image,ip);r.addView(badge,new LinearLayout.LayoutParams(dp(46),dp(46)));
        LinearLayout words=a.column();LinearLayout.LayoutParams wp=new LinearLayout.LayoutParams(0,-2,1);wp.leftMargin=dp(14);wp.rightMargin=dp(6);r.addView(words,wp);words.addView(text(title,16,INK,true));if(!detail.isEmpty()){space(words,4);words.addView(text(detail,12,MUTED,false));}r.addView(iconView("right",MUTED,18),new LinearLayout.LayoutParams(dp(18),dp(18)));
        LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,-2);rp.bottomMargin=dp(10);parent.addView(r,rp);
    }
    void topBar(){
        LinearLayout bar=row();bar.setPadding(dp(16),dp(8),dp(12),dp(8));bar.setBackgroundColor(BG);a.root.addView(bar,new LinearLayout.LayoutParams(-1,-2));
        boolean back=a.entry.visible()?!a.entry.step.equals("welcome"):!a.screen.equals("home");
        if(back)iconButton(bar,"back",a.t("Back"),"app-back",a::goBack);else{ImageView mark=iconView("leaf",GREEN,25);mark.setBackground(shape(LIME,13,0));mark.setPadding(dp(10),dp(10),dp(10),dp(10));bar.addView(mark,new LinearLayout.LayoutParams(dp(44),dp(44)));}
        LinearLayout words=a.column();LinearLayout.LayoutParams wp=new LinearLayout.LayoutParams(0,-2,1);wp.leftMargin=dp(12);bar.addView(words,wp);words.addView(text("E-Waste Marketplace",16,INK,true));space(words,3);words.addView(text(a.t(a.entry.visible()?"By Freedom Value":a.session.optJSONObject("user").optString("role").equals("collector")?"Aggregator workspace":"Recycler workspace"),11,MUTED,false));
        if(!a.entry.visible())iconButton(bar,"bell",a.t("Notifications"),"account-inbox",()->a.market.load("inbox","/notifications"));
    }
    void iconButton(LinearLayout parent,String icon,String description,String tag,Runnable run){ImageButton b=new ImageButton(a);b.setImageDrawable(new Symbol(icon,GREEN,dp(23)));b.setBackground(new RippleDrawable(ColorStateList.valueOf(LINE),shape(BG,24,0),null));b.setContentDescription(description);b.setTag(tag);b.setPadding(dp(12),dp(12),dp(12),dp(12));b.setOnClickListener(v->{if(!a.working)run.run();});parent.addView(b,new LinearLayout.LayoutParams(dp(48),dp(48)));}
    void navigation(){
        LinearLayout bar=row();bar.setPadding(dp(4),dp(6),dp(4),dp(4));bar.setBackgroundColor(WHITE);a.root.addView(bar,new LinearLayout.LayoutParams(-1,-2));
        boolean collector=a.session.optJSONObject("user").optString("role").equals("collector");String view=a.screen.equals("market")?a.market.view():a.screen;
        nav(bar,"Home",a.screen.equals("market")?"market-home":"nav-home","home",view.equals("home"),()->{a.draft=null;a.screen="home";a.render();});
        nav(bar,collector?"My lots":"Buying",collector?"nav-lots":"account-portfolio","box",view.equals(collector?"lots":"portfolio"),()->{if(collector){a.screen="lots";a.render();}else a.market.load("portfolio","/requirements");});
        nav(bar,"Orders","account-orders","truck",view.equals("orders")||view.equals("order"),()->a.market.load("orders","/orders"));
        nav(bar,collector?"Earnings":"Payments","account-earnings","wallet",view.equals("earnings"),()->a.market.load("earnings","/earnings"));
        nav(bar,"Profile","account-profile","user",view.equals("profile"),()->{a.screen="profile";a.render();});
    }
    void nav(LinearLayout bar,String title,String tag,String icon,boolean selected,Runnable run){Button b=new Button(a);b.setText(a.t(title));b.setTag(tag);b.setAllCaps(false);b.setTextSize(10);b.setTextColor(selected?GREEN:MUTED);b.setTypeface(Typeface.create("sans-serif-medium",0));b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(58));b.setPadding(dp(2),dp(6),dp(2),dp(5));b.setStateListAnimator(null);b.setBackgroundTintList(null);b.setBackground(shape(selected?SOFT:WHITE,14,0));Symbol iconDrawable=new Symbol(icon,selected?GREEN:MUTED,dp(22));iconDrawable.setBounds(0,0,dp(22),dp(22));b.setCompoundDrawables(null,iconDrawable,null,null);b.setCompoundDrawablePadding(dp(5));b.setOnClickListener(v->{if(!a.working)run.run();});LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.leftMargin=dp(2);p.rightMargin=dp(2);bar.addView(b,p);}
    void home()throws Exception{
        JSONObject user=a.session.getJSONObject("user");boolean collector=user.optString("role").equals("collector");String name=user.optString("displayName");
        if(compact())heading(a.t("Your workspace"),name.isEmpty()?user.optString("locality"):name+" · "+user.optString("locality"));else{note(a.page,a.t("Welcome back")+(name.isEmpty()?"":", "+name));heading(a.t(collector?"Your collection.\nMore possibilities.":"Find your next\nmaterial supply."),user.optString("locality"));}
        LinearLayout hero=card(a.page,GREEN);if(!compact()){ImageView mark=iconView(collector?"camera":"box",LIME,30);hero.addView(mark,new LinearLayout.LayoutParams(dp(30),dp(30)));space(hero,16);}hero.addView(text(a.t(collector?"Turn your collection into a lot":"Tell collectors what you buy"),compact()?20:23,WHITE,true));if(!compact()){space(hero,8);hero.addView(text(a.t(collector?"Add a photo, confirm the material and connect with recyclers.":"Publish buying requirements and review incoming material."),14,0xffd4e5d9,false));}space(hero,14);action(hero,a.t(collector?"Create a lot":"Buying portfolio"),collector?"account-create":"home-portfolio",collector?a::createDraft:()->a.market.load("portfolio","/requirements"),2);
        if(!collector)link(a.page,a.t("Your facility"),a.t("Business details, documents and review"),"home-facility","user",a.market.facility::open);
        a.market.pending();
        if(collector){JSONArray lots=a.store.drafts(a.account());int pending=0;for(int i=0;i<lots.length();i++)if(!lots.getJSONObject(i).optString("syncState").equals("synced"))pending++;
            LinearLayout stats=row();a.page.addView(stats);LinearLayout left=card(stats,WHITE);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.rightMargin=dp(6);left.setLayoutParams(lp);metric(left,a.t("Saved lots"),String.valueOf(lots.length()),"box");LinearLayout right=card(stats,WHITE);LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(0,-2,1);rp.leftMargin=dp(6);right.setLayoutParams(rp);metric(right,a.t("Need to sync"),String.valueOf(pending),"sync");space(a.page,16);
        }
        section(a.t("Your workspace"));link(a.page,a.t(collector?"My requests":"Incoming requests"),a.t("Follow quotes and recycler responses"),"account-requests","inbox",()->a.market.load("requests","/requests"));link(a.page,a.t("Orders"),a.t("Track pickup, delivery and settlement"),"home-orders","truck",()->a.market.load("orders","/orders"));
        if(collector){section(a.t("Recent lots"));lots(false);}else note(a.page,a.t("Your requirements and orders stay connected with the operations team."));
    }
    void lots(boolean full)throws Exception{
        JSONArray lots=a.store.drafts(a.account());if(full){heading(a.t("My lots"),a.t("Your saved collection, ready for the next step."));action(a.page,a.t("Create a lot"),"account-create",a::createDraft,1);action(a.page,a.t("Sync saved drafts"),"account-sync",a::syncAll,0);space(a.page,12);}
        if(lots.length()==0){LinearLayout empty=card(a.page,WHITE);empty.addView(text(a.t("Your first lot starts here"),18,INK,true));note(empty,a.t("Take a photo or upload one to save your first lot."));return;}
        for(int i=0;i<(full?lots.length():Math.min(3,lots.length()));i++){JSONObject lot=lots.getJSONObject(i);String id=lot.getString("id"),title=lot.optString("title"),state=lot.optString("syncState");link(a.page,title.isEmpty()?a.t("Untitled lot"):title,a.t(state.equals("synced")?"Saved online":state.equals("conflict")?"Review needed":"Saved on this phone"),"account-open-"+id,"box",()->{try{a.draft=a.store.draft(a.account(),id);a.itemIndex=0;a.editStep=2;a.screen="edit";a.render();}catch(Exception e){a.showError(e);}});}
    }
    ImageView iconView(String icon,int color,int size){ImageView v=new ImageView(a);v.setImageDrawable(new Symbol(icon,color,dp(size)));v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
    static final class Symbol extends Drawable {
        final String name;final int color,size;final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
        Symbol(String name,int color,int size){this.name=name;this.color=color;this.size=size;}
        @Override public int getIntrinsicWidth(){return size;}@Override public int getIntrinsicHeight(){return size;}
        void line(Canvas c,float... xy){Path path=new Path();path.moveTo(xy[0],xy[1]);for(int i=2;i<xy.length;i+=2)path.lineTo(xy[i],xy[i+1]);c.drawPath(path,p);}
        @Override public void draw(Canvas c){c.save();c.translate(getBounds().left,getBounds().top);c.scale(getBounds().width()/24f,getBounds().height()/24f);p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.7f);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);
            switch(name){
                case "camera":c.drawRoundRect(3,7,21,20,3,3,p);line(c,7,7,9,4,15,4,17,7);c.drawCircle(12,13,3.5f,p);break;
                case "home":line(c,3,10,12,3,21,10);line(c,5,9,5,21,10,21,10,15,14,15,14,21,19,21,19,9);break;
                case "box":line(c,3,7,12,3,21,7,21,17,12,22,3,17,3,7,12,12,21,7);line(c,12,12,12,22);line(c,7,5,16,10);break;
                case "truck":c.drawRoundRect(2,6,15,17,1,1,p);line(c,15,9,19,9,22,13,22,17,15,17);c.drawCircle(6,18,2,p);c.drawCircle(18,18,2,p);break;
                case "wallet":c.drawRoundRect(3,5,21,20,3,3,p);c.drawRoundRect(14,10,22,16,1,1,p);c.drawCircle(17,13,.5f,p);break;
                case "user":c.drawCircle(12,7,4,p);c.drawArc(4,13,20,27,180,180,false,p);break;
                case "bell":line(c,4,17,6,14,6,9);c.drawArc(6,3,18,15,180,180,false,p);line(c,18,9,18,14,20,17,4,17);c.drawArc(9,17,15,23,0,180,false,p);break;
                case "back":line(c,15,5,8,12,15,19);break;
                case "right":line(c,9,5,16,12,9,19);break;
                case "sync":c.drawArc(4,4,20,20,35,285,false,p);line(c,19,3,20,8,15,7);break;
                case "leaf":line(c,5,20,15,10);Path leaf=new Path();leaf.moveTo(5,16);leaf.cubicTo(0,5,15,3,21,3);leaf.cubicTo(21,14,15,22,5,16);c.drawPath(leaf,p);break;
                case "check":line(c,5,12,10,17,20,6);break;
                default:c.drawRoundRect(3,5,21,20,3,3,p);line(c,3,13,8,13,10,16,14,16,16,13,21,13);
            }c.restore();}
        @Override public void setAlpha(int alpha){p.setAlpha(alpha);}@Override public void setColorFilter(ColorFilter filter){p.setColorFilter(filter);}@Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
    }
}
