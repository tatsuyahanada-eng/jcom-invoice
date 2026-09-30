package jp.todaysjobs.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Collections;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Callable;

/**
 * Today's Jobs: assets 内のWebアプリをWebViewで表示するだけの薄いラッパー。
 * - 地図/電話/SMS/他アプリへのリンクは端末の対応アプリで開く
 * - Googleカレンダーの認可は端末標準のGoogleログイン(play-services-auth)を使い、JSへ橋渡しする
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final String CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
    private static final int REQ_AUTH = 1001;
    private static final int REQ_CAL = 1002;

    private WebView web;
    private String pendingCallbackId;
    private Runnable pendingAfterPermission;
    private String pendingPermissionCallbackId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setNavigationBarColor(0xFFD3D7DB);
        getWindow().setStatusBarColor(0xFFD3D7DB);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "TJNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                openExternal(uri.toString());
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__tjBack ? window.__tjBack() : false)", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    /* ---------- 外部アプリ起動 ---------- */

    private void openExternal(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.startsWith("file:") || lower.startsWith("content:")
                || lower.startsWith("javascript:") || lower.startsWith("data:")) {
            return;
        }
        Intent intent = null;
        try {
            if (lower.startsWith("intent:")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // アプリ未インストール: intent: に付いているブラウザ用URLがあればそちらを開く
            String fb = intent != null ? intent.getStringExtra("browser_fallback_url") : null;
            if (fb != null && fb.toLowerCase(Locale.ROOT).startsWith("http")) openExternal(fb);
            else toast("開けるアプリが見つかりません");
        } catch (Exception e) {
            toast("開けませんでした");
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /* ---------- Googleカレンダー認可（JSから呼ばれる） ---------- */

    private class Bridge {
        @JavascriptInterface
        public void requestToken(final String callbackId) {
            runOnUiThread(() -> startAuth(callbackId));
        }

        @JavascriptInterface
        public boolean hasCalendarPermission() {
            return checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
        }

        /** 端末に同期されているカレンダーの一覧（JSON配列）を返す */
        @JavascriptInterface
        public void listCalendars(final String callbackId) {
            deviceCall(callbackId, MainActivity.this::doListCalendars);
        }

        /** 指定日（yyyy-MM-dd）の予定（JSON配列）を返す。idsJson が空配列なら表示中の全カレンダー */
        @JavascriptInterface
        public void queryEvents(final String callbackId, final String date, final String idsJson) {
            deviceCall(callbackId, () -> doQueryEvents(date, idsJson));
        }
    }

    /* ---------- 端末のカレンダー（CalendarContract） ---------- */

    private void deviceCall(final String callbackId, final Callable<String> job) {
        runOnUiThread(() -> withCalendarPermission(callbackId, () -> new Thread(() -> {
            try {
                deliverResult(callbackId, job.call(), null);
            } catch (Exception e) {
                deliverResult(callbackId, null, String.valueOf(e.getMessage()));
            }
        }).start()));
    }

    private void withCalendarPermission(String callbackId, Runnable action) {
        if (checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
            action.run();
            return;
        }
        pendingAfterPermission = action;
        pendingPermissionCallbackId = callbackId;
        requestPermissions(new String[]{Manifest.permission.READ_CALENDAR}, REQ_CAL);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_CAL) return;
        Runnable action = pendingAfterPermission;
        String cb = pendingPermissionCallbackId;
        pendingAfterPermission = null;
        pendingPermissionCallbackId = null;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted && action != null) action.run();
        else if (cb != null) deliverResult(cb, null, "PERMISSION_DENIED");
    }

    private String doListCalendars() throws Exception {
        JSONArray out = new JSONArray();
        String[] proj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.VISIBLE,
                CalendarContract.Calendars.CALENDAR_COLOR,
        };
        try (Cursor c = getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null,
                CalendarContract.Calendars.ACCOUNT_NAME + ", " + CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)) {
            while (c != null && c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("visible", c.getInt(3) == 1);
                o.put("color", c.getInt(4));
                out.put(o);
            }
        }
        return out.toString();
    }

    private String doQueryEvents(String date, String idsJson) throws Exception {
        String[] ymd = date.split("-");
        Calendar cal = Calendar.getInstance();
        cal.clear();
        cal.set(Integer.parseInt(ymd[0]), Integer.parseInt(ymd[1]) - 1, Integer.parseInt(ymd[2]), 0, 0, 0);
        long dayStart = cal.getTimeInMillis();
        cal.add(Calendar.DAY_OF_MONTH, 1);
        long dayEnd = cal.getTimeInMillis();
        long margin = 14L * 60 * 60 * 1000; // 終日予定はUTC基準なので、前後に余裕を持って取得してから絞り込む

        StringBuilder sel = new StringBuilder();
        JSONArray ids = new JSONArray(idsJson == null || idsJson.isEmpty() ? "[]" : idsJson);
        if (ids.length() > 0) {
            sel.append(CalendarContract.Instances.CALENDAR_ID).append(" IN (");
            for (int i = 0; i < ids.length(); i++) {
                if (i > 0) sel.append(',');
                sel.append(ids.getLong(i));
            }
            sel.append(')');
        } else {
            sel.append(CalendarContract.Instances.VISIBLE).append("=1");
        }

        android.net.Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, dayStart - margin);
        ContentUris.appendId(b, dayEnd + margin);
        String[] proj = {
                CalendarContract.Instances.EVENT_ID,      // 0
                CalendarContract.Instances.TITLE,         // 1
                CalendarContract.Instances.BEGIN,         // 2
                CalendarContract.Instances.END,           // 3
                CalendarContract.Instances.ALL_DAY,       // 4
                CalendarContract.Instances.EVENT_LOCATION,// 5
                CalendarContract.Instances.DESCRIPTION,   // 6
                CalendarContract.Instances.SELF_ATTENDEE_STATUS, // 7
                CalendarContract.Instances.CALENDAR_DISPLAY_NAME, // 8
        };
        SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        utc.setTimeZone(TimeZone.getTimeZone("UTC"));

        JSONArray out = new JSONArray();
        try (Cursor c = getContentResolver().query(b.build(), proj, sel.toString(), null,
                CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                long begin = c.getLong(2);
                long end = c.getLong(3);
                boolean allDay = c.getInt(4) == 1;
                if (c.getInt(7) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue; // 辞退した予定は除く
                if (allDay) {
                    String from = utc.format(begin);
                    String to = utc.format(end); // 終了は翌日0時(UTC)
                    if (!(from.compareTo(date) <= 0 && date.compareTo(to) < 0)) continue;
                } else {
                    boolean overlaps = end > dayStart && begin < dayEnd;
                    boolean point = end <= begin && begin >= dayStart && begin < dayEnd;
                    if (!overlaps && !point) continue;
                }
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0) + "@" + begin);
                o.put("title", c.getString(1));
                o.put("start", begin);
                o.put("end", end);
                o.put("allDay", allDay);
                o.put("location", c.getString(5));
                o.put("description", c.getString(6));
                o.put("calendar", c.getString(8));
                out.put(o);
            }
        }
        return out.toString();
    }

    private void deliverResult(String id, String data, String error) {
        final String js = "window.__tjNativeResult(" + JSONObject.quote(id) + ","
                + (data == null ? "null" : JSONObject.quote(data)) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private void startAuth(String callbackId) {
        pendingCallbackId = callbackId;
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(CALENDAR_SCOPE)))
                .build();
        Identity.getAuthorizationClient(this)
                .authorize(request)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution()) {
                        PendingIntent pi = result.getPendingIntent();
                        try {
                            startIntentSenderForResult(pi.getIntentSender(), REQ_AUTH, null, 0, 0, 0);
                        } catch (IntentSender.SendIntentException e) {
                            deliver(null, "ログイン画面を開けませんでした");
                        }
                    } else {
                        deliver(result.getAccessToken(), null);
                    }
                })
                .addOnFailureListener(e -> deliver(null, "Googleログインに失敗しました: " + e.getMessage()));
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_AUTH) return;
        if (resultCode != RESULT_OK || data == null) {
            deliver(null, "ログインがキャンセルされました");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data);
            deliver(result.getAccessToken(), null);
        } catch (ApiException e) {
            deliver(null, "Googleログインに失敗しました: " + e.getMessage());
        }
    }

    private void deliver(String token, String error) {
        final String id = pendingCallbackId;
        pendingCallbackId = null;
        if (id == null) return;
        final String js = "window.__tjNativeToken(" + JSONObject.quote(id) + ","
                + (token == null ? "null" : JSONObject.quote(token)) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
