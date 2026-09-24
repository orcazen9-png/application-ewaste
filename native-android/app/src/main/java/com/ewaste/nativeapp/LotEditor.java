package com.ewaste.nativeapp;

import android.graphics.*;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.File;
import java.math.BigDecimal;
import java.util.*;

/** Photo, details, review: each step retains the same autosaved draft identity. */
final class LotEditor {
    final AccountActivity a;final AccountDesign ui;boolean extra=false;
    LotEditor(AccountActivity activity){a=activity;ui=a.ui;}
    void render()throws Exception{
        a.editStep=Math.max(0,Math.min(2,a.editStep));if(ui.compact()){a.page.addView(ui.text(a.t("Create a lot"),24,AccountDesign.INK,true));ui.space(a.page,14);}else ui.heading(a.t("Create a lot"),"");steps();
        if(a.editStep==0)photos();else if(a.editStep==1)details();else review();footer();
    }
    void steps(){LinearLayout row=ui.row();a.page.addView(row);String[] labels={"Photos","Details","Review"};for(int i=0;i<3;i++){final int index=i;LinearLayout step=a.column();LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.rightMargin=a.dp(i==2?0:8);row.addView(step,p);TextView label=ui.text((i+1)+"  "+a.t(labels[i]),12,i==a.editStep?AccountDesign.GREEN:AccountDesign.MUTED,i==a.editStep);step.addView(label);ui.space(step,9);View line=new View(a);line.setBackground(ui.shape(i<=a.editStep?AccountDesign.GREEN:AccountDesign.LINE,3,0));step.addView(line,new LinearLayout.LayoutParams(-1,a.dp(4)));step.setContentDescription(a.t(labels[i]));if(i<a.editStep)step.setOnClickListener(v->{a.editStep=index;a.render();});}ui.space(a.page,24);}
    void photos()throws Exception{
        if(!ui.compact())a.page.addView(ui.text(a.t("Start with a photo"),24,AccountDesign.INK,true));ui.note(a.page,a.t("Photograph the whole item in good light."));ui.space(a.page,ui.compact()?4:12);
        JSONArray photos=a.draft.getJSONArray("fileIds");
        if(photos.length()==0){LinearLayout empty=ui.card(a.page,AccountDesign.SOFT),row=ui.row();empty.addView(row);row.addView(ui.iconView("camera",AccountDesign.GREEN,40),new LinearLayout.LayoutParams(a.dp(40),a.dp(40)));TextView title=ui.text(a.t("What are you collecting?"),19,AccountDesign.INK,true);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.leftMargin=a.dp(18);row.addView(title,p);}
        else for(int i=0;i<photos.length();i++){
            String id=photos.getString(i);LinearLayout card=ui.card(a.page,AccountDesign.WHITE);preview(card,id,180);final int index=i;
            ui.action(card,a.t("Remove photo"),"account-remove-photo-"+index,()->{try{JSONArray keep=new JSONArray();for(int j=0;j<photos.length();j++)if(j!=index)keep.put(photos.getString(j));a.draft.put("fileIds",keep);a.store.save(a.account(),a.draft);a.render();}catch(Exception e){a.showError(e);}},0);
        }
        if(photos.length()<10){LinearLayout row=ui.row();a.page.addView(row);Button take=ui.action(row,a.t("Take photo"),"account-take-photo",()->{try{a.cameraId=UUID.randomUUID().toString();a.cameraAccount=a.account();a.cameraDraft=a.draft.getString("id");a.camera.launch(FileProvider.getUriForFile(a,a.getPackageName()+".files",a.store.photo(a.cameraAccount,a.cameraId)));}catch(Exception e){a.showError(e);}},1);LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,-2,1);left.rightMargin=a.dp(6);take.setLayoutParams(left);Button upload=ui.action(row,a.t("Upload photo"),"account-choose-photo",()->a.gallery.launch(new String[]{"image/*"}),0);LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,-2,1);right.leftMargin=a.dp(6);upload.setLayoutParams(right);}
        if(photos.length()>0){ui.space(a.page,14);ui.action(a.page,a.t("Identify waste type"),"account-identify",()->a.market.identify(a.draft,null),1);ui.note(a.page,a.t("Review the suggested category before saving."));}
        else ui.note(a.page,a.t("You can also continue and choose the category yourself."));
    }
    void preview(LinearLayout parent,String id,int height){File file=a.store.photo(a.account(),id);BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=4;Bitmap bitmap=file.exists()?BitmapFactory.decodeFile(file.getPath(),options):null;if(bitmap!=null){ImageView image=new ImageView(a);image.setImageBitmap(bitmap);image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setBackground(ui.shape(AccountDesign.BG,12,0));image.setClipToOutline(true);image.setContentDescription(a.t("Lot photo"));parent.addView(image,new LinearLayout.LayoutParams(-1,a.dp(height)));}else ui.note(parent,a.t("Photo saved online"));}
    JSONObject line()throws Exception{JSONArray lines=a.draft.getJSONArray("items");a.itemIndex=Math.max(0,Math.min(a.itemIndex,lines.length()-1));return lines.getJSONObject(a.itemIndex);}
    void details()throws Exception{
        JSONObject item=line();JSONArray lines=a.draft.getJSONArray("items");a.page.addView(ui.text(a.t("Tell us about the material"),24,AccountDesign.INK,true));ui.note(a.page,a.t("Material line ")+(a.itemIndex+1)+a.t(" of ")+lines.length());
        if(lines.length()>1)for(int i=0;i<lines.length();i++){final int index=i;JSONObject other=lines.getJSONObject(i);ui.link(a.page,other.optString("name",category(other)),category(other)+" · "+other.optString("quantity")+" "+a.t(other.optString("unit")),"material-select-"+i,"box",()->{a.itemIndex=index;a.render();});}
        LinearLayout material=ui.card(a.page,AccountDesign.WHITE);ui.inside(material,()->{
            a.field(a.t("Item name"),item.optString("name"),"material-name",InputType.TYPE_CLASS_TEXT,120,v->a.saveField(item,"name",v));
            if(item.optBoolean("suggested"))ui.note(material,a.t("Suggested from your photo. Check the category, unit and estimated count. Enter measured weight for kg."));
            String[] names=new String[Catalog.NAMES.length+1];names[0]=a.t("Choose a category");System.arraycopy(Catalog.NAMES,0,names,1,Catalog.NAMES.length);int selected=0;for(int i=0;i<Catalog.NAMES.length;i++)if(Catalog.code(i).equals(item.optString("broadCode")))selected=i+1;
            a.choices(a.t("Waste category"),names,selected,pos->{Object code=pos==0?JSONObject.NULL:Catalog.code(pos-1);if(!Objects.equals(item.opt("broadCode"),code))a.saveField(item,"detailedCode",JSONObject.NULL);a.saveField(item,"broadCode",code);a.saveField(item,"reviewState",pos==0?"needs_review":"confirmed");}).setTag("account-category");
            LinearLayout row=ui.row();row.setGravity(Gravity.TOP);material.addView(row);LinearLayout quantity=a.column(),unit=a.column();LinearLayout.LayoutParams qp=new LinearLayout.LayoutParams(0,-2,1);qp.rightMargin=a.dp(8);row.addView(quantity,qp);row.addView(unit,new LinearLayout.LayoutParams(0,-2,1));
            ui.inside(quantity,()->a.field(a.t("Quantity"),item.isNull("quantity")?"":item.optString("quantity"),"account-lot-quantity",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL,12,v->a.saveField(item,"quantity",v)).setHint("0"));
            ui.inside(unit,()->a.choices(a.t("Unit"),new String[]{"kg","piece"},item.optString("unit").equals("piece")?1:0,pos->a.saveField(item,"unit",pos==0?"kg":"piece")));
            String[] conditions={"unknown","unsorted","sorted","damaged"};a.choices(a.t("Condition"),new String[]{"Not checked","Unsorted","Sorted","Damaged"},Math.max(0,Arrays.asList(conditions).indexOf(item.optString("condition"))),pos->a.saveField(item,"condition",conditions[pos]));
        });
        if(lines.length()>1)ui.action(a.page,a.t("Remove this material"),"material-remove",()->{try{JSONArray keep=new JSONArray();for(int j=0;j<lines.length();j++)if(j!=a.itemIndex)keep.put(lines.getJSONObject(j));a.draft.put("items",keep);a.store.save(a.account(),a.draft);a.itemIndex=0;a.render();}catch(Exception e){a.showError(e);}},0);
        if(item.optBoolean("suggested")){CheckBox confirm=new CheckBox(a);confirm.setText(a.t("I checked this item, category and quantity"));confirm.setChecked(item.optBoolean("suggestionConfirmed"));confirm.setMinHeight(a.dp(48));a.page.addView(confirm);confirm.setOnCheckedChangeListener((b,on)->a.saveField(item,"suggestionConfirmed",on));}
        if(lines.length()>1)ui.action(a.page,a.t("Next material line"),"account-next-line",()->{a.itemIndex=(a.itemIndex+1)%lines.length();a.render();},0);
        LinearLayout lot=ui.card(a.page,AccountDesign.WHITE);ui.inside(lot,()->{
            a.field(a.t("Lot name"),a.draft.optString("title"),"account-lot-title",InputType.TYPE_CLASS_TEXT,120,v->a.saveField(a.draft,"title",v)).setHint(a.t("For example, office laptops"));
            a.field(a.t("Collection area"),a.draft.optString("locality"),"account-lot-area",InputType.TYPE_CLASS_TEXT,120,v->a.saveField(a.draft,"locality",v));
        });
        ui.action(a.page,a.t(extra?"Hide optional details":"Add description or notes"),"lot-more-details",()->{extra=!extra;a.render();},0);
        if(extra){a.field(a.t("Description"),item.optString("description"),"account-lot-description",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,1000,v->a.saveField(item,"description",v));a.field(a.t("Notes"),a.draft.optString("notes"),"account-lot-notes",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,3000,v->a.saveField(a.draft,"notes",v));}
        if(lines.length()<20)ui.action(a.page,a.t("Add another material"),"account-add-line",()->{try{lines.put(new JSONObject().put("id",UUID.randomUUID().toString()).put("broadCode",JSONObject.NULL).put("detailedCode",JSONObject.NULL).put("description","").put("condition","unknown").put("unit","kg").put("quantity","").put("reviewState","needs_review"));a.store.save(a.account(),a.draft);a.itemIndex=lines.length()-1;a.render();}catch(Exception e){a.showError(e);}},0);
    }
    String category(JSONObject line){String code=line.optString("broadCode");for(int i=0;i<Catalog.NAMES.length;i++)if(Catalog.code(i).equals(code))return a.t(Catalog.NAMES[i]);return a.t("Choose a category");}
    void review()throws Exception{
        a.page.addView(ui.text(a.t("Review your lot"),24,AccountDesign.INK,true));ui.note(a.page,a.t("Check the details before saving online."));LinearLayout card=ui.card(a.page,AccountDesign.WHITE);JSONArray photos=a.draft.getJSONArray("fileIds");if(photos.length()>0){preview(card,photos.getString(0),150);ui.space(card,14);}
        card.addView(ui.text(a.draft.optString("title").isEmpty()?a.t("Untitled lot"):a.draft.optString("title"),22,AccountDesign.INK,true));ui.note(card,a.draft.optString("locality"));ui.divider(card);
        JSONArray lines=a.draft.getJSONArray("items");for(int i=0;i<lines.length();i++){JSONObject item=lines.getJSONObject(i);ui.keyValue(card,item.optString("name",category(item))+" · "+category(item),item.optString("quantity","")+" "+a.t(item.optString("unit")));}
        if(!a.draft.optString("notes").isEmpty())ui.note(card,a.draft.optString("notes"));ui.action(card,a.t("Edit details"),"lot-edit-details",()->{a.editStep=1;a.render();},0);ui.action(a.page,a.t("Edit photos"),"lot-edit-photos",()->{a.editStep=0;a.render();},0);
        JSONObject saved=a.store.draft(a.account(),a.draft.getString("id"));if(saved.optString("syncState").equals("synced")){ui.pill(a.page,a.t("Saved online"),AccountDesign.SOFT);ui.space(a.page,12);ui.action(a.page,a.t("Post for recyclers"),"lot-post",()->a.market.load("listing","/listings/"+a.draft.optString("id")),1);ui.action(a.page,a.t("Find recycler requirements for this line"),"account-find-matches",a.market::findMatches,1);}
        ui.note(a.page,a.t("Changes are saved on this phone as you type."));
    }
    boolean validDetails(){try{
        JSONObject current=line();String quantity=current.optString("quantity");if(current.isNull("broadCode")||current.optString("broadCode").isEmpty())throw new Exception(a.t("Choose a category for this material."));
        if(!(current.optString("unit").equals("piece")?quantity.matches("\\d{1,6}"):quantity.matches("\\d{1,6}(\\.\\d{1,3})?"))||new BigDecimal(quantity).signum()<=0){EditText field=a.root.findViewWithTag("account-lot-quantity");field.setError(a.t("Enter a valid quantity."));field.requestFocus();return false;}
        for(String[] spec:new String[][]{{"title","account-lot-title","Enter a lot name."},{"locality","account-lot-area","Enter a collection area."}})if(a.draft.optString(spec[0]).trim().isEmpty()){EditText field=a.root.findViewWithTag(spec[1]);field.setError(a.t(spec[2]));field.requestFocus();return false;}
        JSONArray lines=a.draft.getJSONArray("items");for(int i=0;i<lines.length();i++){JSONObject item=lines.getJSONObject(i);String q=item.optString("quantity");if(item.optBoolean("suggested")&&!item.optBoolean("suggestionConfirmed")||item.isNull("broadCode")||!(item.optString("unit").equals("piece")?q.matches("\\d{1,6}"):q.matches("\\d{1,6}(\\.\\d{1,3})?"))||new BigDecimal(q).signum()<=0){a.itemIndex=i;a.render();a.showError(new Exception(a.t("Complete each material before reviewing your lot.")));return false;}}
        for(int i=0;i<lines.length();i++)lines.getJSONObject(i).put("reviewState","confirmed");a.store.save(a.account(),a.draft);return true;
    }catch(Exception e){a.showError(e);return false;}}
    void footer()throws Exception{
        LinearLayout footer=a.column();footer.setPadding(a.dp(20),a.dp(8),a.dp(20),a.dp(10));footer.setBackgroundColor(AccountDesign.WHITE);a.root.addView(footer,new LinearLayout.LayoutParams(-1,-2));
        JSONObject saved=a.store.draft(a.account(),a.draft.getString("id"));boolean synced=saved.optString("syncState").equals("synced");TextView status=ui.text(a.t(synced?"Saved online":"Saved on this phone"),11,AccountDesign.MUTED,false);status.setGravity(Gravity.CENTER);footer.addView(status);
        if(a.editStep<2)ui.action(footer,a.t(a.editStep==0?"Continue to details":"Review lot"),"lot-next",()->{if(a.editStep==0||validDetails()){a.editStep++;a.render();}},1);
        else if(saved.optString("syncState").equals("conflict"))ui.action(footer,a.t("Review server changes"),"account-review-conflict",a::reviewConflict,1);
        else ui.action(footer,a.t(synced?"Back to my lots":"Save online"),synced?"account-back":"account-save-online",()->{if(synced){a.draft=null;a.screen="lots";a.render();}else a.saveCurrentLot();},1);
    }
}
