package com.ewaste.nativeapp;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.text.InputType;
import android.widget.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.util.*;

/** Recycler onboarding: private evidence, persistent draft and explicit review status. */
final class FacilityScreens {
 final MarketplaceScreens m;final AccountActivity a;final AccountDesign ui;
 FacilityScreens(MarketplaceScreens market){m=market;a=market.a;ui=a.ui;}
 void open(){m.load("facility","/facility");}
 void remember(JSONObject d){m.persist();a.store.cache(a.account(),"facility-draft",d);}
 String status(String s){switch(s){case "pending":return a.t("Awaiting review");case "approved":return a.t("Approved by Freedom Value");case "rejected":return a.t("Changes required");case "expired":return a.t("Review expired");default:return a.t("Not submitted");}}
 void render(JSONObject d)throws Exception{
  ui.heading(a.t("Your facility"),a.t("Manage your business details and review status."));
  if(!d.has("id")){ui.note(a.page,a.t("Connect to load facility details."));ui.action(a.page,a.t("Refresh"),"facility-refresh",this::open,0);return;}
  JSONObject p=d.getJSONObject("profile");String state=d.optString("status");
  LinearLayout hero=ui.card(a.page,state.equals("approved")?AccountDesign.GREEN:AccountDesign.WHITE);
  ui.pill(hero,status(state),state.equals("approved")?AccountDesign.LIME:AccountDesign.AMBER);ui.space(hero,16);
  hero.addView(ui.text(p.optString("name"),23,state.equals("approved")?AccountDesign.WHITE:AccountDesign.INK,true));
  hero.addView(ui.text(p.optString("locality"),14,state.equals("approved")?AccountDesign.WHITE:AccountDesign.MUTED,false));
  if(!d.isNull("validUntil"))ui.note(a.page,a.t("Review valid until")+": "+a.localDate(d.optString("validUntil")));
  ui.note(a.page,a.t(state.equals("pending")?"Your documents are with the operations team. Check here for their decision.":state.equals("approved")?"You can publish requirements within the reviewed material categories.":"Submit your facility details before publishing buying requirements."));
  ui.action(a.page,a.t(state.equals("draft")?"Complete facility setup":"Edit and resubmit"),"facility-edit",()->start(d),1);
  JSONArray reviews=d.optJSONArray("reviews");if(reviews!=null&&reviews.length()>0){ui.section(a.t("Review history"));for(int i=0;i<reviews.length();i++){JSONObject r=reviews.getJSONObject(i);LinearLayout card=ui.card(a.page,AccountDesign.WHITE);ui.pill(card,status(r.optString("decision")),AccountDesign.SOFT);ui.note(card,r.optString("reason"));ui.note(card,r.optString("reviewer")+" · "+a.localDate(r.optString("created_at")));}}
  ui.note(a.page,a.t("Freedom Value reviews submitted documents. This is not government certification."));
 }
 void start(JSONObject server){try{
  JSONObject saved=a.store.cached(a.account(),"facility-draft");
  if(saved!=null&&saved.has("profile")&&saved.optInt("version")==server.optInt("version")){m.show("facility-form",saved);return;}
  if(saved!=null&&saved.has("profile")){new AlertDialog.Builder(a).setTitle(a.t("Facility details changed" )).setMessage(a.t("The online record changed. Start from its current version to submit new changes.")).setPositiveButton(a.t("Use current details"),(d,w)->fresh(server)).setNegativeButton(a.t("Back"),null).show();return;}fresh(server);
 }catch(Exception e){a.showError(e);}}
 void fresh(JSONObject server){JSONObject d=Catalog.copy(server);m.put(d,"step",0);m.put(d,"localDocuments",new JSONArray());m.show("facility-form",d);remember(d);}
 void field(JSONObject d,String key,String title,int max){JSONObject p=d.optJSONObject("profile");a.field(a.t(title),p.optString(key),"facility-"+key,InputType.TYPE_CLASS_TEXT,max,v->{m.put(p,key,v);remember(d);});}
 void form(JSONObject d)throws Exception{
  JSONObject p=d.getJSONObject("profile");int step=d.optInt("step");ui.heading(a.t("Facility setup"),a.t("Changes are saved on this phone as you type."));
  String[] labels={"Business","Services","Documents"};LinearLayout row=ui.row();a.page.addView(row);for(int i=0;i<3;i++){TextView label=ui.text((i+1)+" · "+a.t(labels[i]),13,i==step?AccountDesign.GREEN:AccountDesign.MUTED,i==step);row.addView(label,new LinearLayout.LayoutParams(0,-2,1));}ui.space(a.page,20);
  LinearLayout card=ui.card(a.page,AccountDesign.WHITE);ui.inside(card,()->{
   if(step==0){field(d,"name","Company or facility name",120);field(d,"address","Facility address",600);field(d,"locality","City or area",120);field(d,"contact","Business contact",200);field(d,"phone","Business phone",30);field(d,"email","Business email",200);
    ui.action(card,a.t("Use facility location"),"facility-location",()->a.nearby.get(point->{m.put(p,"location",point);remember(d);a.render();}),0);if(p.optJSONObject("location")!=null){ui.note(card,a.t("Approximate location added"));ui.action(card,a.t("Remove location"),"facility-clear-location",()->{p.remove("location");remember(d);a.render();},0);}}
   if(step==1){CheckBox publish=new CheckBox(a);publish.setText(a.t("List these business details in the authorized recycler directory after verification"));publish.setChecked(p.optBoolean("directoryConsent"));card.addView(publish);publish.setOnCheckedChangeListener((b,on)->{m.put(p,"directoryConsent",on);remember(d);});field(d,"hours","Operating hours",200);field(d,"areas","Service areas",1000);CheckBox pickup=new CheckBox(a);pickup.setText(a.t("We can arrange pickup"));pickup.setChecked(p.optBoolean("pickup"));pickup.setMinHeight(a.dp(48));card.addView(pickup);pickup.setOnCheckedChangeListener((b,value)->{m.put(p,"pickup",value);remember(d);});
    Set<String> selected=Catalog.codes(p.optJSONArray("categories"));ui.note(card,selected.isEmpty()?a.t("Choose the materials your facility accepts."):categoryNames(selected));ui.action(card,a.t("Choose material categories"),"facility-categories",()->categories(d),0);
   }
   if(step==2){field(d,"authority","Document issuing authority",200);field(d,"registration","Registration or document reference",200);field(d,"documentExpiry","Document expiry (YYYY-MM-DD, optional)",10);ui.note(card,a.t("Attach registration or facility evidence. PDF, JPG or PNG, up to 5 MB each; five files maximum."));
    JSONArray ids=p.optJSONArray("documentIds");if(ids!=null)for(int i=0;i<ids.length();i++){String id=ids.getString(i);JSONObject doc=metadata(d,id);ui.link(card,doc.optString("name",a.t("Facility document")),a.t("Tap to open"),"facility-document-"+i,"box",()->view(d,id,doc));final int index=i;ui.action(card,a.t("Remove document"),"facility-remove-"+i,()->{JSONArray keep=new JSONArray();for(int j=0;j<ids.length();j++)if(j!=index)keep.put(ids.optString(j));m.put(p,"documentIds",keep);remember(d);a.render();},0);}
    if(ids==null||ids.length()<5)ui.action(card,a.t("Choose PDF or photo"),"facility-choose-document",()->a.facilityPicker.launch(new String[]{"application/pdf","image/jpeg","image/png"}),0);
   }
  });
  if(step==2){LinearLayout summary=ui.card(a.page,AccountDesign.SOFT);summary.addView(ui.text(p.optString("name"),18,AccountDesign.INK,true));ui.note(summary,p.optString("address")+" · "+p.optString("locality"));ui.note(summary,categoryNames(Catalog.codes(p.optJSONArray("categories"))));ui.note(a.page,a.t("Submitting changes starts a new review. Any previous approval ends until the new details are approved."));ui.action(a.page,a.t("Submit for review"),"facility-submit",()->submit(d),1);}
  else ui.action(a.page,a.t("Continue"),"facility-next",()->{if(valid(d,step)){m.put(d,"step",step+1);remember(d);a.render();}},1);
  if(step>0)ui.action(a.page,a.t("Previous step"),"facility-previous",()->{m.put(d,"step",step-1);remember(d);a.render();},0);
  ui.action(a.page,a.t("Save and close"),"facility-close",()->{remember(d);open();},0);
 }
 String categoryNames(Set<String> codes){List<String> names=new ArrayList<>();for(String code:codes)names.add(a.t(Catalog.name(code)));return String.join(", ",names);}
 void categories(JSONObject d){Set<String> selected=Catalog.codes(d.optJSONObject("profile").optJSONArray("categories"));String[] names=new String[Catalog.NAMES.length];boolean[] checked=new boolean[names.length];for(int i=0;i<names.length;i++){names[i]=a.t(Catalog.NAMES[i]);checked[i]=selected.contains(Catalog.code(i));}new AlertDialog.Builder(a).setTitle(a.t("Accepted materials")).setMultiChoiceItems(names,checked,(di,index,on)->checked[index]=on).setPositiveButton(a.t("Save"),(di,w)->{JSONArray codes=new JSONArray();for(int i=0;i<checked.length;i++)if(checked[i])codes.put(Catalog.code(i));m.put(d.optJSONObject("profile"),"categories",codes);remember(d);a.render();}).setNegativeButton(a.t("Back"),null).show();}
 boolean valid(JSONObject d,int step){JSONObject p=d.optJSONObject("profile");String[][] fields={{"name","address","locality","contact"},{"hours","areas"},{"authority","registration"}};for(String key:fields[step])if(p.optString(key).trim().isEmpty()){EditText field=a.root.findViewWithTag("facility-"+key);if(field!=null){field.setError(a.t("Complete this field."));field.requestFocus();}else a.showError(new Exception(a.t("Complete the business details first.")));return false;}if(step==1&&Catalog.codes(p.optJSONArray("categories")).isEmpty()){a.showError(new Exception(a.t("Choose at least one material category.")));return false;}return true;}
 void submit(JSONObject d){if(!valid(d,2))return;JSONObject p=d.optJSONObject("profile");if(p.optJSONArray("documentIds")==null||p.optJSONArray("documentIds").length()==0){a.showError(new Exception(a.t("Attach at least one facility document.")));return;}String expiry=p.optString("documentExpiry");try{if(!expiry.isEmpty()&&java.time.LocalDate.parse(expiry).isBefore(java.time.LocalDate.now()))throw new Exception();}catch(Exception e){a.showError(new Exception(a.t("Use a valid current expiry date in YYYY-MM-DD format.")));return;}JSONObject input=m.input(d.optInt("version"));m.put(input,"submit",true);m.put(input,"profile",p);m.put(input,"localDocuments",d.optJSONArray("localDocuments"));m.change("/facility","PUT",input,"facility");}
 JSONObject metadata(JSONObject d,String id){for(String key:new String[]{"localDocuments","documents"}){JSONArray list=d.optJSONArray(key);if(list!=null)for(int i=0;i<list.length();i++)if(list.optJSONObject(i).optString("id").equals(id))return list.optJSONObject(i);}return new JSONObject();}
 void document(Uri uri){if(uri==null||!m.view().equals("facility-form")||a.session==null)return;JSONObject d=m.data();String owner=a.account(),id=UUID.randomUUID().toString(),mime=a.getContentResolver().getType(uri);
  if(!Arrays.asList("application/pdf","image/jpeg","image/png").contains(mime)){a.showError(new Exception(a.t("Choose a PDF, JPG or PNG document.")));return;}
  a.task(()->{String name="Facility-document."+(mime.equals("application/pdf")?"pdf":mime.equals("image/png")?"png":"jpg");try(Cursor c=a.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())name=c.getString(0);}if(name==null||name.length()>150||name.matches(".*[\\r\\n/\\\\].*"))name="Facility-document";
   File file=m.finance.documentFile(owner,id);try(InputStream in=a.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(file)){if(in==null)throw new IOException(a.t("Document could not be opened."));byte[] buffer=new byte[8192];int n,total=0;while((n=in.read(buffer))!=-1){total+=n;if(total>5242880)throw new IOException(a.t("Choose a document up to 5 MB."));out.write(buffer,0,n);}if(total==0)throw new IOException(a.t("Document is empty."));}catch(Exception e){file.delete();throw e;}return new JSONObject().put("id",id).put("name",name).put("mime",mime);
  },doc->{try{JSONArray ids=d.getJSONObject("profile").optJSONArray("documentIds");if(ids==null)ids=new JSONArray();if(ids.length()>=5)throw new Exception(a.t("Attach up to five facility documents."));ids.put(id);m.put(d.getJSONObject("profile"),"documentIds",ids);JSONArray local=d.optJSONArray("localDocuments");if(local==null)local=new JSONArray();local.put(doc);m.put(d,"localDocuments",local);remember(d);a.render();}catch(Exception e){a.showError(e);}});
 }
 void upload(String owner,String token,JSONObject payload)throws Exception{JSONArray docs=payload.optJSONArray("localDocuments"),ids=payload.getJSONObject("profile").getJSONArray("documentIds");if(docs!=null)for(int i=0;i<docs.length();i++){JSONObject d=docs.getJSONObject(i);boolean used=false;for(int j=0;j<ids.length();j++)if(ids.getString(j).equals(d.getString("id")))used=true;if(used)a.api.uploadFacilityDocument(m.finance.documentFile(owner,d.getString("id")),d.getString("id"),d.getString("mime"),d.getString("name"),token);}payload.remove("localDocuments");}
 void view(JSONObject d,String id,JSONObject doc){String owner=a.account(),token=a.token();a.task(()->{File file=m.finance.documentFile(owner,id);if(!file.exists()||file.length()==0){byte[] bytes=a.api.facilityDocument(id,token);try(OutputStream out=new FileOutputStream(file)){out.write(bytes);}}return file;},file->{try{Uri uri=FileProvider.getUriForFile(a,a.getPackageName()+".files",file);a.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,doc.optString("mime")).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}catch(Exception e){a.showError(new Exception(a.t("Install a PDF or image viewer to open this document.")));}});}
}
