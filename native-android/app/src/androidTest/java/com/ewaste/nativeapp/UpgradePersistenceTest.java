package com.ewaste.nativeapp;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Invoked twice around an actual adb install -r of the distributed release APK. */
@RunWith(AndroidJUnit4.class)
public class UpgradePersistenceTest {
    private static final String PHOTO = "photo-00000000-0000-4000-8000-000000000003";
    private static final String DRAFT = "upgrade-test-draft";
    private static final String CODE = "000000000000000000000000000000000000000000003333";

    @Test public void draftPhotoAndEncryptedPairingSurviveUpdate() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("upgradePhase", "");
        assumeTrue(phase.equals("seed") || phase.equals("verify"));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        LocalStore store = new LocalStore(context);
        if (phase.equals("seed")) {
            long version=context.getPackageManager().getPackageInfo(context.getPackageName(), 0).getLongVersionCode();
            assertTrue("Upgrade baseline must be the v2 fixture or actual v3 release",version==2||version==3);
            store.setCode(CODE);
            store.saveDraft(new JSONObject().put("id", DRAFT).put("photoId", PHOTO).put("title", "Laptop awaiting review"));
            try (FileOutputStream out = new FileOutputStream(store.photo(PHOTO))) {
                out.write("saved-photo-fixture".getBytes(StandardCharsets.UTF_8));
            }
        } else {
            assertTrue(context.getPackageManager().getPackageInfo(context.getPackageName(), 0).getLongVersionCode() > 2);
            assertEquals("The actual release APK must be installed", 0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE);
            assertEquals(CODE, store.code());
            assertEquals(DRAFT, store.drafts().getJSONObject(0).getString("id"));
            assertEquals("Laptop awaiting review", store.drafts().getJSONObject(0).getString("title"));
            assertEquals("saved-photo-fixture", new String(Files.readAllBytes(store.photo(PHOTO).toPath()), StandardCharsets.UTF_8));
            store.removeDraft(DRAFT);
            assertTrue(store.photo(PHOTO).delete());
            store.setCode("");
        }
    }
}
