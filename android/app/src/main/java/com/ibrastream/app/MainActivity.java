package com.ibrastream.app;

import android.content.ComponentName;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.BridgeActivity;
import com.google.common.util.concurrent.ListenableFuture;
import android.util.Log;
public class MainActivity extends BridgeActivity {
    public static boolean isAppInForeground = false;
    private ListenableFuture<MediaController> controllerFuture;

    public ListenableFuture<MediaController> getControllerFuture() {
        return controllerFuture;
    }

    @androidx.media3.common.util.UnstableApi
    private void setNativePlayerVolume(float volume) {
        if (PlaybackService.customPlayer != null) {
            try {
                float targetVol = (volume > 0f) ? PlaybackService.userVolume : 0f;
                PlaybackService.customPlayer.setVolume(targetVol);
                Log.e("IbraStreamMedia", "MainActivity: setNativePlayerVolume=" + targetVol);
            } catch (Exception e) {
                Log.e("IbraStreamMedia", "Failed to set native player volume", e);
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Media3SessionPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge display
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        // Set status bar icons to light (since app is dark)
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        // Disable WebView zoom
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }

        // Explicitly start the PlaybackService so it runs independently of Activity lifecycle
        try {
            android.content.Intent serviceIntent = new android.content.Intent(this, PlaybackService.class);
            startService(serviceIntent);
            Log.e("IbraStreamMedia", "MainActivity: PlaybackService started via startService");
        } catch (Exception e) {
            Log.e("IbraStreamMedia", "MainActivity: Failed to start PlaybackService", e);
        }

        // Request POST_NOTIFICATIONS permission on Android 13+ to ensure foreground service notifications are visible
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        SessionToken sessionToken = new SessionToken(this, new ComponentName(this, PlaybackService.class));
        controllerFuture = new MediaController.Builder(this, sessionToken).buildAsync();
    }

    @Override
    public void onPause() {
        super.onPause();
        isAppInForeground = false;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().onResume();
            getBridge().getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        isAppInForeground = false;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().onResume();
            getBridge().getWebView().resumeTimers();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        isAppInForeground = true;
    }

    @Override
    public void onDestroy() {
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
        }
        super.onDestroy();
    }
}
