package com.ibrastream.app;

import android.app.PendingIntent;
import android.content.Intent;
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
    private MediaSession mediaSession = null;
    private ExoPlayer player = null;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.e(TAG, "PlaybackService CREATED");
        
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();

        player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, false)
                .setHandleAudioBecomingNoisy(true)
                .build();
        
        player.setVolume(1f);
        player.setRepeatMode(Player.REPEAT_MODE_ALL);
        
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
                                .build();
                        return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                                .setAvailableSessionCommands(sessionCommands)
                                .setAvailablePlayerCommands(playerCommands)
                                .build();
                    }

                    @Override
                    public int onPlayerCommandRequest(MediaSession session, MediaSession.ControllerInfo controllerInfo, int playerCommand) {
                        if (playerCommand == Player.COMMAND_SEEK_TO_NEXT) {
                            Log.e(TAG, "Callback: Intercepted skip to next");
                            Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
                            intent.putExtra("command", "next");
                            sendBroadcast(intent);
                            return SessionResult.RESULT_SUCCESS;
                        }
                        if (playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS) {
                            Log.e(TAG, "Callback: Intercepted skip to previous");
                            Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
                            intent.putExtra("command", "previous");
                            sendBroadcast(intent);
                            return SessionResult.RESULT_SUCCESS;
                        }
                        return MediaSession.Callback.super.onPlayerCommandRequest(session, controllerInfo, playerCommand);
                    }
                })
                .build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        Log.e(TAG, "onGetSession requested by " + controllerInfo.getPackageName());
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        Log.e(TAG, "PlaybackService DESTROYED");
        customPlayer = null;
        if (mediaSession != null) {
            if (player != null) {
                player.release();
            }
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }
}
