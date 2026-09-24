package com.ewaste.nativeapp;

import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.widget.*;
import org.json.*;

/** Account-scoped lot conversations. Poll only while this conversation is in the foreground. */
final class ChatScreens {
 final MarketplaceScreens m;final AccountActivity a;final AccountDesign ui;
 final Handler handler=new Handler(Looper.getMainLooper());boolean resumed=false,polling=false;
 final Runnable tick=()->poll();
 ChatScreens(MarketplaceScreens market){m=market;a=m.a;ui=a.ui;}
 void resume(){resumed=true;handler.removeCallbacks(tick);handler.postDelayed(tick,10000);}
 void pause(){resumed=false;handler.removeCallbacks(tick);}
 void start(String lotId,String recyclerId){JSONObject input=m.input(0);m.put(input,"lotId",lotId);m.put(input,"recyclerId",recyclerId);m.change("/conversations","POST",input,"chat-open");}
 void chooseLot(String recyclerId){try{JSONArray all=a.store.drafts(a.account());java.util.List<String> labels=new java.util.ArrayList<>(),ids=new java.util.ArrayList<>();for(int i=0;i<all.length();i++){JSONObject l=all.getJSONObject(i);if(l.optInt("serverVersion")>0){ids.add(l.getString("id"));labels.add(l.optString("title"));}}if(ids.isEmpty()){a.showError(new Exception(a.t("Save a lot online before starting a conversation.")));return;}new android.app.AlertDialog.Builder(a).setTitle(a.t("Choose a lot")).setItems(labels.toArray(new String[0]),(dialog,index)->start(ids.get(index),recyclerId)).setNegativeButton(a.t("Back"),null).show();}catch(Exception e){a.showError(e);}}
 void clearDraft(String id){a.store.cache(a.account(),"chat-draft-"+id,new JSONObject());}
 String draft(String id){try{JSONObject d=a.store.cached(a.account(),"chat-draft-"+id);return d==null?"":d.optString("message");}catch(Exception e){return "";}}
 void inbox(JSONObject d)throws Exception{
  ui.heading(a.t("Conversations"),a.t("Talk about the lot, pickup and your offer."));
  ui.action(a.page,a.t("View offers"),"chat-offers",()->m.load("requests","/requests"),0);
  JSONArray list=d.optJSONArray("conversations");if(list==null||list.length()==0)ui.note(a.page,a.t("No conversations yet. Open a posted lot or an offer to start chatting."));
  if(list!=null)for(int i=0;i<list.length();i++){JSONObject c=list.getJSONObject(i);String name=a.account().equals(c.optString("collector_id"))?c.optString("recyclerName"):c.optString("collectorName");ui.link(a.page,name,c.optString("lotTitle")+" · "+c.optString("locality"),"chat-open-"+i,"inbox",()->m.load("chat","/conversations/"+c.optString("id")));}
  if(d.has("nextPage")&&!d.isNull("nextPage"))ui.action(a.page,a.t("Next page"),"chat-next",()->m.load("chats","/conversations?page="+d.optInt("nextPage")),0);
 }
 void render(JSONObject d)throws Exception{
  JSONObject c=d.optJSONObject("conversation");if(c==null){ui.heading(a.t("Conversation"),a.t("Connect to load your messages."));return;}
  String id=c.getString("id"),name=a.account().equals(c.optString("collector_id"))?c.optString("recyclerName"):c.optString("collectorName");
  ui.heading(name,c.optString("lotTitle")+" · "+c.optString("locality"));
  ui.note(a.page,a.t("Messages refresh automatically while this screen is open."));
  JSONArray offers=d.optJSONArray("offers");if(offers!=null&&offers.length()>0){ui.section(a.t("Offers in this conversation"));for(int i=0;i<offers.length();i++){JSONObject r=offers.getJSONObject(i);LinearLayout card=ui.card(a.page,AccountDesign.WHITE);String amount=r.isNull("ask")?r.optJSONObject("snapshot").optString("collectorProposal"):r.optString("ask");card.addView(ui.text("₹"+amount+" · "+r.optString("quantity")+" "+a.t(r.optString("unit")),20,AccountDesign.INK,true));ui.note(card,a.t(r.optString("state")));boolean open=r.optString("state").equals("submitted")||r.optString("state").equals("clarification");if(open&&!a.account().equals(r.optString("proposedBy",r.optString("collectorId"))))ui.action(card,a.t("Accept offer"),"chat-accept-"+i,()->m.acceptOffer(r),1);else if(open)ui.note(card,a.t("Waiting for the other party to respond."));ui.action(card,a.t("Review or counter offer"),"chat-review-"+i,()->m.load("request","/requests/"+r.optString("id")),0);}}
  ui.section(a.t("Messages"));JSONArray messages=d.optJSONArray("messages");if(messages==null||messages.length()==0)ui.note(a.page,a.t("Send the first message about this lot."));
  if(!d.isNull("olderCursor")&&!d.optString("olderCursor").isEmpty())ui.action(a.page,a.t("Older messages"),"chat-older",()->m.load("chat","/conversations/"+id+"?before="+m.discovery.enc(d.optString("olderCursor"))),0);
  if(messages!=null)for(int i=0;i<messages.length();i++){JSONObject e=messages.getJSONObject(i);boolean mine=a.account().equals(e.optString("actorId"));LinearLayout bubble=ui.card(a.page,mine?AccountDesign.SOFT:AccountDesign.WHITE);ui.note(bubble,(mine?a.t("You"):name)+" · "+a.localDate(e.optString("createdAt")));bubble.addView(ui.text(e.optString("message"),16,AccountDesign.INK,false));}
  if(m.state.optString("path").contains("before="))ui.action(a.page,a.t("Latest messages"),"chat-latest",()->m.load("chat","/conversations/"+id),0);
  LinearLayout compose=a.column();compose.setPadding(a.dp(20),a.dp(6),a.dp(20),a.dp(6));compose.setBackgroundColor(AccountDesign.WHITE);a.root.addView(compose,new LinearLayout.LayoutParams(-1,-2));ui.inside(compose,()->a.field(a.t("Message"),draft(id),"chat-message",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,2000,value->{JSONObject saved=new JSONObject();m.put(saved,"message",value);a.store.cache(a.account(),"chat-draft-"+id,saved);}));
  ui.action(compose,a.t("Send message"),"chat-send",()->{String text=draft(id).trim();if(text.isEmpty())return;JSONObject input=m.input(0);m.put(input,"message",text);m.change("/conversations/"+id+"/messages","POST",input,"chat");},1);
 }
 void poll(){
  if(!resumed)return;handler.postDelayed(tick,10000);
  if(polling||a.working||a.session==null||!a.screen.equals("market")||!m.view().equals("chat")||m.state.optString("path").contains("before="))return;
  final String path=m.state.optString("path"),owner=a.account(),token=a.token();if(path.isEmpty())return;polling=true;
  a.tasks.submit(()->{try{JSONObject data=a.api.request("GET",path,token,null);a.runOnUiThread(()->{polling=false;if(!resumed||a.isDestroyed()||!owner.equals(a.account())||!a.screen.equals("market")||!m.view().equals("chat")||!path.equals(m.state.optString("path"))||a.working)return;EditText editor=a.root.findViewWithTag("chat-message");if(editor!=null&&editor.hasFocus())return;if(String.valueOf(data.optJSONArray("messages")).equals(String.valueOf(m.data().optJSONArray("messages")))&&String.valueOf(data.optJSONArray("offers")).equals(String.valueOf(m.data().optJSONArray("offers"))))return;int y=a.page.getParent() instanceof ScrollView?((ScrollView)a.page.getParent()).getScrollY():0;m.put(m.state,"data",data);m.persist();a.render();if(a.page.getParent() instanceof ScrollView){ScrollView scroll=(ScrollView)a.page.getParent();scroll.post(()->scroll.scrollTo(0,y));}});}catch(Exception ignored){a.runOnUiThread(()->polling=false);}});
 }
}
