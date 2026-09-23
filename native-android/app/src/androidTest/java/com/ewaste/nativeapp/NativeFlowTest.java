package com.ewaste.nativeapp;
import android.graphics.Bitmap;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class NativeFlowTest {
    private void assertNative(View view){
        assertFalse(view.getClass().getName().contains("WebView"));
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)assertNative(group.getChildAt(i));}
    }
    @Test public void photoAssessmentCorrectionAndDraftSurviveRecreation() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->{
                assertNative(a.root);
                View create=a.root.findViewWithTag("create-lot");assertNotNull(create);create.performClick();
                assertNotNull(a.root.findViewWithTag("take-photo"));assertNotNull(a.root.findViewWithTag("choose-photo"));
                a.workspaceCode="000000000000000000000000000000000000000000000000";
                a.api=new ApiClient(){
                    @Override public void upload(File f,String id,String code){assertTrue(f.exists());assertTrue(f.length()>0);assertTrue(f.length()<=2*1024*1024);}
                    @Override public JSONObject json(String method,String path,String code,JSONObject body)throws Exception{
                        assertEquals("/api/lot-assessments",path);
                        return new JSONObject().put("id","assessment-00000000-0000-4000-8000-000000000001").put("photoId",body.getString("photoId")).put("scope","broad").put("status","identified").put("description","A laptop computer").put("model","test-fixture").put("items",new JSONArray().put(new JSONObject().put("code","B01").put("evidence","Laptop screen and keyboard")));
                    }
                };
                try{
                    File source=new File(a.getCacheDir(),"fixture.jpg");Bitmap image=Bitmap.createBitmap(200,100,Bitmap.Config.ARGB_8888);image.eraseColor(0xff228844);try(FileOutputStream out=new FileOutputStream(source)){image.compress(Bitmap.CompressFormat.JPEG,90,out);}image.recycle();a.processPhoto(Uri.fromFile(source));
                }catch(Exception e){throw new AssertionError(e);}
            });
            AtomicBoolean ready=new AtomicBoolean(false);
            for(int i=0;i<150&&!ready.get();i++){Thread.sleep(100);scenario.onActivity(a->ready.set(a.draft!=null&&a.draft.has("wasteAssessment")&&!a.assessmentLoading));}
            assertTrue("Photo processing and assessment completed",ready.get());
            scenario.onActivity(a->{
                assertTrue(a.selectedCodes.contains("B01"));a.selectedCodes.clear();a.selectedCodes.add("B02");a.confirmCategories("categories");
                assertEquals("corrected",a.draft.optJSONObject("wasteDecision").optString("method"));
                a.root.findViewWithTag("save-draft").performClick();assertEquals("detail",a.screen);assertNative(a.root);
            });
            scenario.recreate();
            scenario.onActivity(a->{
                assertEquals("detail",a.screen);assertTrue(a.store.drafts().length()>0);
                JSONObject saved=a.store.drafts().optJSONObject(0);assertEquals("B02",saved.optJSONObject("wasteDecision").optJSONArray("codes").optString(0));
                assertTrue(a.store.photo(saved.optString("photoId")).exists());assertNative(a.root);
            });
        }
    }
}
