package com.ibrastream.app;

import android.content.ComponentName;
import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.BridgeActivity;
import com.google.common.util.concurrent.ListenableFuture;

public class MainActivity extends BridgeActivity {
    private ListenableFuture<MediaController> controllerFuture;

    public ListenableFuture<MediaController> getControllerFuture() {
        return controllerFuture;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Media3SessionPlugin.class);
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        SessionToken sessionToken = new SessionToken(this, new ComponentName(this, PlaybackService.class));
        controllerFuture = new MediaController.Builder(this, sessionToken).buildAsync();
    }

    @Override
    public void onPause() {
        super.onPause();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
            this.bridge.getWebView().onResume();
        }
    }

    @Override
    public void onDestroy() {
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        super.onDestroy();
    }
}
