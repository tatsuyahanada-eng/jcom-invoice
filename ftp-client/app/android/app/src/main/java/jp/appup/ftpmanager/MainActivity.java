package jp.appup.ftpmanager;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpPlugin.class);
        super.onCreate(savedInstanceState);
        // Back button: let the web UI decide (close dialog / go up a folder / leave app)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) getBridge().triggerWindowJSEvent("appback");
            }
        });
    }
}
