package com.ewaste.nativeapp;

import android.widget.LinearLayout;
import android.widget.EditText;
import android.text.InputType;
import android.os.Bundle;
import org.json.JSONObject;

/** Explicit entry into either workspace; choosing a role never changes an account's permissions. */
final class AccountEntry {
    final AccountActivity a;
    String step="welcome",mode="login";
    boolean entered=false;
    String username="",name="",area="";
    AccountEntry(AccountActivity activity){a=activity;}
    boolean visible(){return a.session==null||!entered;}
    void open(){if(a.working)return;entered=false;step="welcome";a.selectedRole="";a.challengeId="";a.draft=null;a.screen="home";a.render();}
    void back(){if(mode.equals("attach")){entered=true;step="welcome";mode="login";a.screen="profile";a.render();}else if(step.equals("welcome"))a.finish();else{step=step.equals("roles")?"welcome":step.equals("credentials")?"form":step.equals("invitation")?"form":"roles";a.challengeId="";a.render();}}
    String roleName(){return a.t(a.selectedRole.equals("recycler")?"Recycler":"Aggregator");}
    void start(String next){mode=next;step="roles";username="";name="";area="";a.selectedRole="";a.render();}
    void select(String role){a.selectedRole=role;step="form";a.render();}
    void attach(){mode="attach";step="credentials";username="";a.selectedRole=a.session.optJSONObject("user").optString("role");entered=false;a.render();}
    void save(Bundle out){out.putString("entryUsername",username);out.putString("entryName",name);out.putString("entryArea",area);}
    void restore(Bundle saved){username=saved.getString("entryUsername","");name=saved.getString("entryName","");area=saved.getString("entryArea","");}
    void render()throws Exception{
        AccountDesign ui=a.ui;
        if(step.equals("welcome")){
            ui.heading(a.t("Waste has value.\nFind yours."),a.t("One marketplace for aggregators and recyclers."));
            LinearLayout hero=ui.card(a.page,AccountDesign.GREEN);
            hero.addView(ui.text(a.t("Collect. Connect. Recycle."),22,AccountDesign.WHITE,true));ui.space(hero,10);
            hero.addView(ui.text(a.t("Sell collected material or source it for your recycling business."),15,0xffd4e5d9,false));
            ui.space(hero,14);
            ui.action(hero,a.t("Log in"),"entry-login",()->start("login"),2);
            ui.action(a.page,a.t("Sign up"),"entry-signup",()->start("signup"),0);
            if(a.session!=null){
                JSONObject user=a.session.getJSONObject("user");String role=user.optString("role");
                ui.space(a.page,12);ui.note(a.page,a.t("Already signed in on this phone"));
                ui.link(a.page,a.t(role.equals("recycler")?"Continue as Recycler":"Continue as Aggregator"),user.optString("displayName"),"entry-continue","user",()->{entered=true;a.screen="home";a.render();a.refresh();});
            }
            ui.space(a.page,14);
            a.choices(a.t("Preferred language"),new String[]{"English","हिन्दी","मराठी"},java.util.Arrays.asList("en","hi","mr").indexOf(a.language()),p->{String next=new String[]{"en","hi","mr"}[p];if(!a.selectedLanguage.equals(next)){a.selectedLanguage=next;a.render();}});
            return;
        }
        if(step.equals("roles")){
            ui.heading(a.t(mode.equals("signup")?"Join the marketplace":"Welcome back"),a.t("Choose how you use E-Waste Marketplace."));
            roleCard("collector","Aggregator","I collect and sell material","Create lots, add photos and connect with recyclers.","truck");
            roleCard("recycler","Recycler","I buy and process material","Post buying needs, review lots and manage orders.","box");
            ui.note(a.page,a.t("Your account keeps its own lots, orders and payments."));
            return;
        }
        if(step.equals("invitation")){a.signIn();return;}
        form();
    }
    void form(){
        AccountDesign ui=a.ui;boolean signup=mode.equals("signup"),attach=mode.equals("attach");
        ui.pill(a.page,roleName(),AccountDesign.SOFT);ui.space(a.page,16);
        ui.heading(a.t(attach?"Set up your login":signup?"Create your account":"Log in"),a.t(attach?"Keep your existing lots and orders.":signup?"A few details to get started.":"Good to see you again."));
        if(signup&&step.equals("form")){
            a.field(a.t(a.selectedRole.equals("recycler")?"Business name":"Your name or business"),name,"entry-name",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_WORDS,100,v->name=v);
            a.field(a.t("City or collection area"),area,"entry-area",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_WORDS,120,v->area=v);
            if(a.selectedRole.equals("recycler"))ui.note(a.page,a.t("Your facility starts as unverified. Business verification is reviewed separately."));
            ui.space(a.page,12);ui.action(a.page,a.t("Continue"),"entry-details-next",()->{if(name.trim().isEmpty()||area.trim().isEmpty()){a.showError(new Exception(a.t("Enter your name and collection or facility area.")));return;}step="credentials";a.render();},1);return;
        }
        EditText user=a.field(a.t("Username"),username,"entry-username",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,32,v->username=v);user.setAutofillHints(android.view.View.AUTOFILL_HINT_USERNAME);
        ui.note(a.page,a.t("4–32 letters, numbers, dots, hyphens or underscores."));
        EditText pass=a.field(a.t("Password"),"","entry-password",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD,128,null);pass.setSaveEnabled(false);pass.setAutofillHints(android.view.View.AUTOFILL_HINT_PASSWORD);
        EditText repeat;
        if(signup||attach){ui.note(a.page,a.t("Use at least 15 characters. A phrase of several words works well."));repeat=a.field(a.t("Confirm password"),"","entry-confirm",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD,128,null);repeat.setSaveEnabled(false);}else repeat=null;
        ui.space(a.page,12);
        ui.action(a.page,a.t(attach?"Save login details":signup?"Create account":"Log in"),"entry-submit",()->{
            try{
                String secret=pass.getText().toString();if((signup||attach)&&!secret.equals(repeat.getText().toString()))throw new Exception(a.t("Passwords do not match."));
                if(secret.codePointCount(0,secret.length())<15)throw new Exception(a.t("Use at least 15 characters. A phrase of several words works well."));
                JSONObject input=new JSONObject().put("username",username.trim()).put("password",secret).put("role",a.selectedRole).put("language",a.selectedLanguage);
                if(signup)input.put("displayName",name.trim()).put("locality",area.trim());
                String path=attach?"/auth/credentials":signup?"/auth/register":"/auth/login",token=attach?a.token():"";
                a.task(()->a.api.request("POST",path,token,input),result->{try{if(attach){a.session.put("user",result.getJSONObject("user"));a.vault.save(a.session);entered=true;mode="login";step="welcome";a.screen="profile";a.render();}else{a.applySession(result);a.refresh();}}catch(Exception e){a.showError(e);}});
            }catch(Exception e){a.showError(e);}
        },1);
        if(!signup&&!attach){
            ui.action(a.page,a.t("Use an invitation"),"entry-invitation",()->{step="invitation";a.render();},0);
            ui.action(a.page,a.t("New here? Sign up"),"entry-new",()->{mode="signup";step="form";a.render();},0);
        }
        ui.note(a.page,a.t("Keep your password safe. Password recovery is not available in this demo."));
    }
    void roleCard(String role,String title,String subtitle,String detail,String icon){
        AccountDesign ui=a.ui;LinearLayout card=ui.card(a.page,AccountDesign.WHITE);
        if(!ui.compact()){card.addView(ui.iconView(icon,AccountDesign.GREEN,30),new LinearLayout.LayoutParams(a.dp(30),a.dp(30)));ui.space(card,12);}
        card.addView(ui.text(a.t(title),22,AccountDesign.INK,true));ui.space(card,5);card.addView(ui.text(a.t(subtitle),15,AccountDesign.INK,false));if(!ui.compact())ui.note(card,a.t(detail));
        ui.action(card,a.t(mode.equals("signup")?"Sign up":"Log in")+" · "+a.t(title),"entry-role-"+role,()->select(role),1);
    }
}
