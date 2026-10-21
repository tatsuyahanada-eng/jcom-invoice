package com.example.serverchecklist;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Hosts the checklist UI (assets/index.html) in a WebView. */
public class MainActivity extends Activity {
    static final int REQ_SAVE = 1, REQ_OPEN = 2;
    WebView web;
    boolean pageReady = false;
    byte[] pendingSave;
    byte[] pendingIncoming;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFFE4E4E7);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebViewClient(new Client(this));
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(this), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        handleIncoming(getIntent());
    }

    /** Delivers a file that arrived before the page finished loading. */
    static class Client extends WebViewClient {
        final MainActivity a;
        Client(MainActivity a) { this.a = a; }

        @Override
        public void onPageFinished(WebView view, String url) {
            a.pageReady = true;
            if (a.pendingIncoming != null) { a.deliver(a.pendingIncoming); a.pendingIncoming = null; }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncoming(intent);
    }

    /** A data file (.json / .xlsx) shared from LINE / mail / file manager. */
    private void handleIncoming(Intent intent) {
        if (intent == null) return;
        byte[] data = null;
        try {
            if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
                data = readUri(intent.getData());
            } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) data = readUri(u);
                else {
                    String t = intent.getStringExtra(Intent.EXTRA_TEXT);
                    if (t != null) data = t.getBytes(StandardCharsets.UTF_8);
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, "ファイルを読み込めませんでした", Toast.LENGTH_LONG).show();
        }
        if (data == null) return;
        intent.setAction(Intent.ACTION_MAIN); // don't re-import on rotation
        if (pageReady) deliver(data); else pendingIncoming = data;
    }

    /** Excel files are zip archives ("PK"); everything else is treated as text. */
    void deliver(byte[] data) {
        String js;
        if (data.length > 1 && data[0] == 'P' && data[1] == 'K') {
            js = "window.onImportXlsx && onImportXlsx(\"" + Base64.encodeToString(data, Base64.NO_WRAP) + "\")";
        } else {
            js = "window.onImportText && onImportText(" + JSONObject.quote(new String(data, StandardCharsets.UTF_8)) + ")";
        }
        web.evaluateJavascript(js, null);
    }

    private byte[] readUri(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        try {
            if (req == REQ_SAVE && pendingSave != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    o.write(pendingSave);
                }
                pendingSave = null;
                Toast.makeText(this, "保存しました", Toast.LENGTH_SHORT).show();
            } else if (req == REQ_OPEN) {
                deliver(readUri(data.getData()));
            }
        } catch (Exception e) {
            Toast.makeText(this, "ファイルの読み書きに失敗しました", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        // Let the page close dialogs / settings first.
        web.evaluateJavascript("window.onAndroidBack ? onAndroidBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    void shareBytes(String name, byte[] bytes, String mime) {
        try {
            File d = ShareProvider.dir(this);
            File[] old = d.listFiles();
            if (old != null) for (File f : old) f.delete();
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            try (FileOutputStream o = new FileOutputStream(new File(d, safe))) {
                o.write(bytes);
            }
            Uri uri = ShareProvider.uriFor(safe);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, uri);
            i.putExtra(Intent.EXTRA_SUBJECT, safe);
            i.setClipData(ClipData.newRawUri(safe, uri));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "共有先を選択"));
        } catch (Exception e) {
            Toast.makeText(this, "共有に失敗しました", Toast.LENGTH_LONG).show();
        }
    }

    void saveBytes(String name, byte[] bytes, String mime) {
        pendingSave = bytes;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(i, REQ_SAVE);
    }

    /** Storage, sharing and file access for the page. */
    static class Bridge {
        final MainActivity a;
        final SharedPreferences prefs;

        Bridge(MainActivity a) {
            this.a = a;
            this.prefs = a.getSharedPreferences("checklist", Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String load(String key) { return prefs.getString(key, null); }

        @JavascriptInterface
        public void save(String key, String value) { prefs.edit().putString(key, value).apply(); }

        /** Share plain text. */
        @JavascriptInterface
        public void share(String title, String text) {
            a.runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, text);
                a.startActivity(Intent.createChooser(i, title));
            });
        }

        @JavascriptInterface
        public void shareFile(String name, String text, String mime) {
            byte[] b = text.getBytes(StandardCharsets.UTF_8);
            a.runOnUiThread(() -> a.shareBytes(name, b, mime));
        }

        @JavascriptInterface
        public void shareFileB64(String name, String b64, String mime) {
            byte[] b = Base64.decode(b64, Base64.DEFAULT);
            a.runOnUiThread(() -> a.shareBytes(name, b, mime));
        }

        @JavascriptInterface
        public void saveFile(String name, String text, String mime) {
            byte[] b = text.getBytes(StandardCharsets.UTF_8);
            a.runOnUiThread(() -> a.saveBytes(name, b, mime));
        }

        @JavascriptInterface
        public void saveFileB64(String name, String b64, String mime) {
            byte[] b = Base64.decode(b64, Base64.DEFAULT);
            a.runOnUiThread(() -> a.saveBytes(name, b, mime));
        }

        /** Pick a file; it comes back through onImportText / onImportXlsx. */
        @JavascriptInterface
        public void openFile() {
            a.runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                a.startActivityForResult(i, REQ_OPEN);
            });
        }
    }
}
