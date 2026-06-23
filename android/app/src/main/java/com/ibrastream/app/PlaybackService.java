package com.ibrastream.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionResult;

public class PlaybackService extends MediaSessionService {
    private static final String TAG = "IbraStreamService";
    public static CustomPlayerWrapper customPlayer = null;
    public static float userVolume = 1f;
    public static PlaybackService instance = null;
    private android.media.audiofx.Equalizer equalizer = null;
    private int equalizerSessionId = 0;
    private String currentEqPreset = "flat";
    private MediaSession mediaSession = null;
    private ExoPlayer player = null;
    private PowerManager.WakeLock wakeLock = null;
    private WifiManager.WifiLock wifiLock = null;

    @Override
    public void onCreate() {
        super.onCreate();
        PlaybackService.instance = this;
        Log.e(TAG, "PlaybackService CREATED");
        
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IbraStream:ServiceWakeLock");
        }
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "IbraStream:WifiLock");
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();

        androidx.media3.datasource.DataSource.Factory dataSourceFactory = new androidx.media3.datasource.DataSource.Factory() {
            private final androidx.media3.datasource.DefaultHttpDataSource.Factory ytHttpFactory = 
                new androidx.media3.datasource.DefaultHttpDataSource.Factory()
                    .setUserAgent("com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)")
                    .setAllowCrossProtocolRedirects(true);
            
            private final androidx.media3.datasource.DefaultHttpDataSource.Factory defaultHttpFactory = 
                new androidx.media3.datasource.DefaultHttpDataSource.Factory()
                    .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .setAllowCrossProtocolRedirects(true);

            @Override
            public androidx.media3.datasource.DataSource createDataSource() {
                return new androidx.media3.datasource.DataSource() {
                    private androidx.media3.datasource.DataSource activeDataSource = null;

                    @Override
                    public void addTransferListener(androidx.media3.datasource.TransferListener transferListener) {
                    }

                    @Override
                    public long open(androidx.media3.datasource.DataSpec dataSpec) throws java.io.IOException {
                        String uriString = dataSpec.uri.toString();
                        if (uriString.contains("googlevideo.com")) {
                            Log.e("IbraStreamService", "Using YouTube iOS User-Agent for: " + uriString);
                            activeDataSource = new androidx.media3.datasource.DefaultDataSource(PlaybackService.this, ytHttpFactory.createDataSource());
                        } else {
                            Log.e("IbraStreamService", "Using default Browser User-Agent for: " + uriString);
                            activeDataSource = new androidx.media3.datasource.DefaultDataSource(PlaybackService.this, defaultHttpFactory.createDataSource());
                        }
                        return activeDataSource.open(dataSpec);
                    }

                    @Override
                    public int read(byte[] buffer, int offset, int length) throws java.io.IOException {
                        return activeDataSource != null ? activeDataSource.read(buffer, offset, length) : 0;
                    }

                    @Override
                    @Nullable
                    public android.net.Uri getUri() {
                        return activeDataSource != null ? activeDataSource.getUri() : null;
                    }

                    @Override
                    public void close() throws java.io.IOException {
                        if (activeDataSource != null) {
                            activeDataSource.close();
                            activeDataSource = null;
                        }
                    }
                };
            }
        };
        
        androidx.media3.exoplayer.source.DefaultMediaSourceFactory mediaSourceFactory = 
            new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(this)
                .setDataSourceFactory(dataSourceFactory);

        player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .setMediaSourceFactory(mediaSourceFactory)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build();
        
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    Log.e(TAG, "ExoPlayer: Track ENDED. Sending auto-advance broadcast.");
                    sendMediaCommand("next");
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(1000 * 60 * 60); // 1 hour safety
                    if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
                } else {
                    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                    if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
                }
            }

            @Override
            public void onAudioSessionIdChanged(int audioSessionId) {
                Log.e(TAG, "ExoPlayer: onAudioSessionIdChanged = " + audioSessionId);
                applyEqualizerPreset(currentEqPreset);
            }
        });
        
        player.setVolume(1f);
        player.setRepeatMode(Player.REPEAT_MODE_OFF);
        
        customPlayer = new CustomPlayerWrapper(player, this);
        
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        mediaSession = new MediaSession.Builder(this, customPlayer)
                .setSessionActivity(pendingIntent)
                .setCallback(new MediaSession.Callback() {
                    @Override
                    public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controllerInfo) {
                        MediaSession.ConnectionResult connectionResult = MediaSession.Callback.super.onConnect(session, controllerInfo);
                        androidx.media3.session.SessionCommands sessionCommands = connectionResult.availableSessionCommands;
                        Player.Commands playerCommands = connectionResult.availablePlayerCommands.buildUpon()
                                .add(Player.COMMAND_SEEK_TO_NEXT)
                                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                                .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                                .build();
                        return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                                .setAvailableSessionCommands(sessionCommands)
                                .setAvailablePlayerCommands(playerCommands)
                                .build();
                    }

                    @Override
                    public int onPlayerCommandRequest(MediaSession session, MediaSession.ControllerInfo controllerInfo, int playerCommand) {
                        if (playerCommand == Player.COMMAND_SEEK_TO_NEXT || playerCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM) {
                            sendMediaCommand("next");
                            return SessionResult.RESULT_SUCCESS;
                        }
                        if (playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS || playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                            sendMediaCommand("previous");
                            return SessionResult.RESULT_SUCCESS;
                        }
                        return MediaSession.Callback.super.onPlayerCommandRequest(session, controllerInfo, playerCommand);
                    }
                })
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    private void sendMediaCommand(String command) {
        Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
        intent.putExtra("command", command);
        intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        sendBroadcast(intent);

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock transitionWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IbraStream:TransitionWakeLock");
                transitionWakeLock.acquire(30000); // 30 seconds for network + JS
                Log.e(TAG, "Acquired 30s transition WakeLock for: " + command);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire transition wake lock", e);
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        customPlayer = null;
        if (equalizer != null) {
            equalizer.release();
            equalizer = null;
        }
        PlaybackService.instance = null;
        if (mediaSession != null) {
            if (player != null) player.release();
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    public void applyEqualizerPreset(String preset) {
        currentEqPreset = preset;
        if (player == null) return;
        int sessionId = player.getAudioSessionId();
        if (sessionId == 0) { // AudioManager.AUDIO_SESSION_ID_GENERATE / not initialized
            return;
        }

        try {
            if (equalizer == null || equalizerSessionId != sessionId) {
                if (equalizer != null) {
                    equalizer.release();
                }
                equalizer = new android.media.audiofx.Equalizer(0, sessionId);
                equalizerSessionId = sessionId;
            }

            if ("flat".equals(preset)) {
                equalizer.setEnabled(false);
                Log.e(TAG, "Equalizer: DISABLED (flat preset)");
                return;
            }

            equalizer.setEnabled(true);
            short bands = equalizer.getNumberOfBands();
            Log.e(TAG, "Equalizer: applying preset: " + preset + " for session: " + sessionId + " with " + bands + " bands");

            short[] range = equalizer.getBandLevelRange();
            short minLevel = range[0];
            short maxLevel = range[1];

            for (short i = 0; i < bands; i++) {
                int centerFreq = equalizer.getCenterFreq(i) / 1000; // in Hz
                short level = 0;
                if ("bass".equals(preset)) {
                    // Boost frequencies below 300Hz
                    if (centerFreq < 300) {
                        level = (short) (maxLevel * 0.7); // 70% of max boost
                    }
                } else if ("vocal".equals(preset)) {
                    // Boost mid-range frequencies between 300Hz and 3000Hz (vocals range)
                    if (centerFreq >= 300 && centerFreq <= 3000) {
                        level = (short) (maxLevel * 0.6);
                    } else if (centerFreq < 300) {
                        level = (short) (minLevel * 0.2); // slight cut on bass
                    }
                } else if ("electronic".equals(preset)) {
                    // V-shape boost
                    if (centerFreq < 200) {
                        level = (short) (maxLevel * 0.6); // bass boost
                    } else if (centerFreq > 3000) {
                        level = (short) (maxLevel * 0.5); // treble boost
                    } else {
                        level = (short) (minLevel * 0.15); // slight mid cut
                    }
                }
                
                equalizer.setBandLevel(i, level);
                Log.e(TAG, "Band " + i + " (" + centerFreq + "Hz) set to level: " + level);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error applying equalizer preset", e);
        }
    }
}
