package jp.todaysjobs.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Bundle;
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

import org.json.JSONObject;

import java.util.Collections;
import java.util.Locale;

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

    private WebView web;
    private String pendingCallbackId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

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
