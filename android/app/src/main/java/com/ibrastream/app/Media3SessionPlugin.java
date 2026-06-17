package com.ibrastream.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.google.common.util.concurrent.MoreExecutors;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;

@CapacitorPlugin(name = "Media3Session")
public class Media3SessionPlugin extends Plugin {
    private static final String TAG = "IbraStreamMedia";
    private android.content.BroadcastReceiver commandReceiver = null;

    private boolean isListenerRegistered = false;

    private void ensureControllerListener(MediaController controller) {
        if (isListenerRegistered) return;
        MainActivity activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            try {
                controller.addListener(new Player.Listener() {
                    @Override
                    public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                        JSObject ret = new JSObject();
                        ret.put("isPlaying", playWhenReady);
                        notifyListeners("onIsPlayingChanged", ret);
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        if (playbackState == Player.STATE_ENDED) {
                            JSObject ret = new JSObject();
                            ret.put("ended", true);
                            notifyListeners("onPlaybackEnded", ret);
                        } else if (playbackState == Player.STATE_READY) {
                            JSObject ret = new JSObject();
                            ret.put("ready", true);
                            notifyListeners("onPlaybackReady", ret);
                        }
                    }

                    @Override
                    public void onPlayerError(androidx.media3.common.PlaybackException error) {
                        Log.e(TAG, "Player Error: " + error.getMessage(), error);
                        JSObject ret = new JSObject();
                        ret.put("error", error.getMessage());
                        notifyListeners("onPlaybackError", ret);
                    }
                });
                isListenerRegistered = true;
                Log.e(TAG, "Media3 Player.Listener registered successfully.");
            } catch (Exception e) {
                Log.e(TAG, "Error setting up listener on controller", e);
            }
        });
    }

    @Override
    public void load() {
        super.load();
        
        commandReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(android.content.Context context, android.content.Intent intent) {
                // Acquire a temporary WakeLock to ensure the CPU stays on long enough
                // for the notification to be delivered to JavaScript.
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                PowerManager.WakeLock wakeLock = null;
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IbraStream:PluginReceiverWakeLock");
                    wakeLock.acquire(10000); // 10 seconds
                }

                String command = intent.getStringExtra("command");
                if (command != null) {
                    Log.e(TAG, "Plugin: RECEIVED COMMAND: " + command + " (Listeners: " + (hasListeners("onNotificationCommand") ? "YES" : "NO") + ")");
                    JSObject ret = new JSObject();
                    ret.put("command", command);
                    if ("seek".equals(command)) {
                        ret.put("position", intent.getDoubleExtra("position", 0.0));
                    }
                    
                    // Poke the WebView to ensure it's not suspended
                    getBridge().getWebView().post(() -> {
                        try {
                            if (!MainActivity.isAppInForeground) {
                                Log.e(TAG, "Plugin: Poking WebView timers for background command: " + command);
                                getBridge().getWebView().resumeTimers();
                            }
                            notifyListeners("onNotificationCommand", ret);
                        } catch (Exception e) {
                            Log.e(TAG, "Error notifying listeners", e);
                        }
                    });
                }

                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            }
        };
        android.content.IntentFilter filter = new android.content.IntentFilter("com.ibrastream.app.MEDIA_COMMAND");
        Context appContext = getContext().getApplicationContext();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(commandReceiver, filter, android.content.Context.RECEIVER_EXPORTED);
        } else {
            appContext.registerReceiver(commandReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (commandReceiver != null) {
            getContext().getApplicationContext().unregisterReceiver(commandReceiver);
            commandReceiver = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title");
        String artist = call.getString("artist");
        String artwork = call.getString("artwork");
        Double duration = call.getDouble("duration");
        String streamUrl = call.getString("streamUrl");
        Log.e(TAG, "Plugin: updateMetadata: " + title + ", streamUrl=" + streamUrl + ", duration=" + duration);

        MainActivity activity = (MainActivity) getActivity();
        if (activity.getControllerFuture() == null) {
            call.reject("Controller future is null");
            return;
        }

        activity.getControllerFuture().addListener(() -> {
            try {
                MediaController controller = activity.getControllerFuture().get();
                ensureControllerListener(controller);
                
                activity.runOnUiThread(() -> {
                    try {
                        if (duration != null && PlaybackService.customPlayer != null) {
                            PlaybackService.customPlayer.setMockDuration((long) (duration * 1000));
                            PlaybackService.customPlayer.setMockPosition(0);
                        }

                        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                                .setTitle(title)
                                .setArtist(artist);
                        
                        if (artwork != null && !artwork.isEmpty()) {
                            metaBuilder.setArtworkUri(android.net.Uri.parse(artwork));
                        }
                        
                        MediaItem.Builder mediaItemBuilder = new MediaItem.Builder()
                                .setMediaId("remote_audio")
                                .setMediaMetadata(metaBuilder.build());

                        if (streamUrl != null && !streamUrl.isEmpty()) {
                            mediaItemBuilder.setUri(streamUrl);
                        } else {
                            mediaItemBuilder.setUri("android.resource://" + activity.getPackageName() + "/" + R.raw.silent);
                        }
                        
                        controller.setMediaItem(mediaItemBuilder.build());
                        controller.prepare();
                        call.resolve();
                    } catch (Exception e) {
                        Log.e(TAG, "UI Thread error in updateMetadata", e);
                        call.reject(e.getMessage());
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Plugin error in updateMetadata", e);
                call.reject(e.getMessage());
            }
        }, MoreExecutors.directExecutor());
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        Log.e(TAG, "Plugin: setPlaybackState=" + isPlaying);

        MainActivity activity = (MainActivity) getActivity();
        if (activity.getControllerFuture() == null) {
            call.reject("Controller future is null");
            return;
        }

        activity.getControllerFuture().addListener(() -> {
            try {
                MediaController controller = activity.getControllerFuture().get();
                ensureControllerListener(controller);
                activity.runOnUiThread(() -> {
                    try {
                        if (isPlaying != null && isPlaying) {
                            if (controller.getMediaItemCount() == 0) {
                                MediaItem dummy = new MediaItem.Builder()
                                    .setUri("android.resource://" + activity.getPackageName() + "/" + R.raw.silent)
                                    .setMediaId("dummy")
                                    .build();
                                controller.setMediaItem(dummy);
                                controller.prepare();
                            } else if (controller.getPlaybackState() == Player.STATE_IDLE || controller.getPlaybackState() == Player.STATE_ENDED) {
                                controller.prepare();
                            }
                            controller.play();
                        } else {
                            controller.pause();
                        }
                        call.resolve();
                    } catch (Exception e) {
                        Log.e(TAG, "UI Thread error in setPlaybackState", e);
                        call.reject(e.getMessage());
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Plugin error in setPlaybackState", e);
                call.reject(e.getMessage());
            }
        }, MoreExecutors.directExecutor());
    }

    @PluginMethod
    public void getPlaybackInfo(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        if (activity.getControllerFuture() == null) {
            JSObject ret = new JSObject();
            ret.put("position", 0.0);
            ret.put("duration", 0.0);
            ret.put("isPlaying", false);
            call.resolve(ret);
            return;
        }

        activity.getControllerFuture().addListener(() -> {
            try {
                MediaController controller = activity.getControllerFuture().get();
                ensureControllerListener(controller);
                
                activity.runOnUiThread(() -> {
                    try {
                        JSObject ret = new JSObject();
                        ret.put("position", controller.getCurrentPosition() / 1000.0);
                        ret.put("duration", controller.getDuration() / 1000.0);
                        ret.put("isPlaying", controller.isPlaying());
                        call.resolve(ret);
                    } catch (Exception e) {
                        Log.e(TAG, "Error in UI thread getPlaybackInfo", e);
                        JSObject ret = new JSObject();
                        ret.put("position", 0.0);
                        ret.put("duration", 0.0);
                        ret.put("isPlaying", false);
                        call.resolve(ret);
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error in getPlaybackInfo", e);
                JSObject ret = new JSObject();
                ret.put("position", 0.0);
                ret.put("duration", 0.0);
                ret.put("isPlaying", false);
                call.resolve(ret);
            }
        }, MoreExecutors.directExecutor());
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double position = call.getDouble("position", 0.0);
        MainActivity activity = (MainActivity) getActivity();
        if (activity.getControllerFuture() == null) {
            call.reject("Controller future is null");
            return;
        }

        activity.getControllerFuture().addListener(() -> {
            try {
                MediaController controller = activity.getControllerFuture().get();
                ensureControllerListener(controller);
                activity.runOnUiThread(() -> {
                    try {
                        controller.seekTo((long) (position * 1000));
                        call.resolve();
                    } catch (Exception e) {
                        Log.e(TAG, "UI Thread error in seek", e);
                        call.reject(e.getMessage());
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Plugin error in seek", e);
                call.reject(e.getMessage());
            }
        }, MoreExecutors.directExecutor());
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume", 1.0);
        PlaybackService.userVolume = volume.floatValue();
        MainActivity activity = (MainActivity) getActivity();
        if (activity.getControllerFuture() == null) {
            call.reject("Controller future is null");
            return;
        }

        activity.getControllerFuture().addListener(() -> {
            try {
                MediaController controller = activity.getControllerFuture().get();
                ensureControllerListener(controller);
                activity.runOnUiThread(() -> {
                    try {
                        controller.setVolume(PlaybackService.userVolume);
                        call.resolve();
                    } catch (Exception e) {
                        Log.e(TAG, "UI Thread error in setVolume", e);
                        call.reject(e.getMessage());
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Plugin error in setVolume", e);
                call.reject(e.getMessage());
            }
        }, MoreExecutors.directExecutor());
    }

    private static final String NOTIF_CHANNEL_ID = "ibrastream_update";
    private static final int NOTIF_ID = 9001;

    private void ensureNotificationChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(NOTIF_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    NOTIF_CHANNEL_ID, "App Updates", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Download progress for app updates");
                nm.createNotificationChannel(ch);
            }
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        Log.e(TAG, "Starting APK download from: " + urlString);
        MainActivity activity = (MainActivity) getActivity();
        ensureNotificationChannel(activity);

        NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationCompat.Builder notifBuilder = new NotificationCompat.Builder(activity, NOTIF_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading update…")
            .setContentText("Preparing download")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setProgress(100, 0, true);
        nm.notify(NOTIF_ID, notifBuilder.build());

        new Thread(() -> {
            try {
                // Follow redirects manually (GitHub CDN uses HTTP→HTTPS redirects)
                URL url = new URL(urlString);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setRequestProperty("User-Agent", "IbraStream-Updater/1.0");
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.connect();

                int status = c.getResponseCode();
                while (status == HttpURLConnection.HTTP_MOVED_TEMP
                        || status == HttpURLConnection.HTTP_MOVED_PERM
                        || status == 307 || status == 308) {
                    String newUrl = c.getHeaderField("Location");
                    c.disconnect();
                    Log.e(TAG, "Redirect to: " + newUrl);
                    url = new URL(newUrl);
                    c = (HttpURLConnection) url.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("User-Agent", "IbraStream-Updater/1.0");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    c.connect();
                    status = c.getResponseCode();
                }

                if (status < 200 || status >= 300) {
                    nm.cancel(NOTIF_ID);
                    call.reject("Server returned HTTP " + status);
                    return;
                }

                long totalBytes = c.getContentLengthLong();

                File cacheDir = activity.getCacheDir();
                File apkFile = new File(cacheDir, "update.apk");
                if (apkFile.exists()) apkFile.delete();

                FileOutputStream fos = new FileOutputStream(apkFile);
                InputStream is = c.getInputStream();

                byte[] buffer = new byte[8192];
                long downloaded = 0;
                int len;
                int lastProgress = -1;

                while ((len = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, len);
                    downloaded += len;
                    if (totalBytes > 0) {
                        int progress = (int) (downloaded * 100 / totalBytes);
                        if (progress != lastProgress) {
                            lastProgress = progress;
                            long dlMb = downloaded / (1024 * 1024);
                            long totMb = totalBytes / (1024 * 1024);
                            notifBuilder
                                .setContentText(dlMb + " MB / " + totMb + " MB")
                                .setProgress(100, progress, false);
                            nm.notify(NOTIF_ID, notifBuilder.build());
                        }
                    }
                }
                fos.close();
                is.close();
                c.disconnect();

                Log.e(TAG, "APK downloaded to: " + apkFile.getAbsolutePath() + " (" + downloaded + " bytes)");

                // Cancel progress notification
                nm.cancel(NOTIF_ID);

                activity.runOnUiThread(() -> {
                    try {
                        Uri apkUri = FileProvider.getUriForFile(
                            activity,
                            activity.getPackageName() + ".fileprovider",
                            apkFile
                        );
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(intent);
                        call.resolve();
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to start installation intent", e);
                        call.reject("Failed to trigger installation: " + e.getMessage());
                    }
                });

            } catch (Exception e) {
                Log.e(TAG, "Error downloading APK", e);
                nm.cancel(NOTIF_ID);
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }
}
