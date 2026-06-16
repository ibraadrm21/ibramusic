package com.ibrastream.app;

import android.content.ComponentName;
import android.util.Log;
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
                String command = intent.getStringExtra("command");
                if (command != null) {
                    JSObject ret = new JSObject();
                    ret.put("command", command);
                    if ("seek".equals(command)) {
                        ret.put("position", intent.getDoubleExtra("position", 0.0));
                    }
                    notifyListeners("onNotificationCommand", ret);
                }
            }
        };
        android.content.IntentFilter filter = new android.content.IntentFilter("com.ibrastream.app.MEDIA_COMMAND");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(commandReceiver, filter, android.content.Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(commandReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (commandReceiver != null) {
            getContext().unregisterReceiver(commandReceiver);
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
}
