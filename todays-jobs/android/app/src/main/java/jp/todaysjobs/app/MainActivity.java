package jp.todaysjobs.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
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
        getWindow().setNavigationBarColor(0xFF122136);
        getWindow().setStatusBarColor(0xFF122136);

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

        /** 売上のCSVなどを、共有シート（Drive・メール・ファイルへ保存など）で出力する */
        @JavascriptInterface
        public boolean shareFile(final String name, final String mime, final String base64) {
            try {
                byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                File f = exportFile(name);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
                shareExport(f, mime);
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> toast("出力できませんでした"));
                return false;
            }
        }

        /** 売上のPDFを作成して共有シートで出力する（json: {title, lines[], rows[[日付,案件,種別,金額]]}） */
        @JavascriptInterface
        public boolean sharePdf(final String name, final String json) {
            try {
                File f = exportFile(name);
                writeSalesPdf(f, new JSONObject(json));
                shareExport(f, "application/pdf");
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> toast("PDFを作成できませんでした"));
                return false;
            }
        }
    }

    /* ---------- 売上の出力（CSV / PDF） ---------- */

    private File exportFile(String name) {
        File dir = new File(getCacheDir(), "exports");
        if (!dir.exists()) dir.mkdirs();
        String safe = name == null ? "export" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return new File(dir, safe);
    }

    private void shareExport(File f, String mime) {
        final Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
        runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("export", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                startActivity(Intent.createChooser(send, "売上を出力"));
            } catch (ActivityNotFoundException e) {
                toast("共有できるアプリがありません");
            }
        });
    }

    private void writeSalesPdf(File out, JSONObject d) throws Exception {
        final int pw = 595, ph = 842, mx = 40, bottom = 800;
        PdfDocument doc = new PdfDocument();
        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setTextSize(18f); title.setTypeface(Typeface.DEFAULT_BOLD);
        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setTextSize(10.5f);
        Paint bold = new Paint(Paint.ANTI_ALIAS_FLAG);
        bold.setTextSize(10.5f); bold.setTypeface(Typeface.DEFAULT_BOLD);
        Paint right = new Paint(body); right.setTextAlign(Paint.Align.RIGHT);
        Paint line = new Paint(); line.setStrokeWidth(0.6f); line.setColor(0xFF888888);

        JSONArray lines = d.optJSONArray("lines");
        JSONArray rows = d.optJSONArray("rows");
        int pageNo = 1;
        PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(pw, ph, pageNo).create());
        android.graphics.Canvas c = page.getCanvas();
        float y = 56;
        c.drawText(d.optString("title", "売上"), mx, y, title);
        y += 26;
        if (lines != null) {
            for (int i = 0; i < lines.length(); i++) { c.drawText(lines.optString(i), mx, y, i == 0 ? bold : body); y += 17; }
        }
        y += 8;
        c.drawLine(mx, y, pw - mx, y, line);
        y += 15;
        c.drawText("日付", mx, y, bold); c.drawText("案件", mx + 60, y, bold); c.drawText("種別", mx + 350, y, bold);
        right.setTypeface(Typeface.DEFAULT_BOLD); c.drawText("金額（税込）", pw - mx, y, right); right.setTypeface(Typeface.DEFAULT);
        y += 6; c.drawLine(mx, y, pw - mx, y, line); y += 14;
        if (rows != null) {
            for (int i = 0; i < rows.length(); i++) {
                if (y > bottom) {
                    c.drawText(String.valueOf(pageNo), pw / 2f, ph - 24, body);
                    doc.finishPage(page);
                    pageNo++;
                    page = doc.startPage(new PdfDocument.PageInfo.Builder(pw, ph, pageNo).create());
                    c = page.getCanvas();
                    y = 56;
                }
                JSONArray r = rows.optJSONArray(i);
                if (r == null) continue;
                c.drawText(r.optString(0), mx, y, body);
                String t = r.optString(1);
                int n = body.breakText(t, true, 280f, null);
                c.drawText(n < t.length() ? t.substring(0, n) + "…" : t, mx + 60, y, body);
                c.drawText(r.optString(2), mx + 350, y, body);
                c.drawText(r.optString(3), pw - mx, y, right);
                y += 16;
            }
        }
        c.drawText(String.valueOf(pageNo), pw / 2f, ph - 24, body);
        doc.finishPage(page);
        try (FileOutputStream o = new FileOutputStream(out)) { doc.writeTo(o); }
        doc.close();
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
