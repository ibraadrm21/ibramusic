package com.ibrastream.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;

public class CustomPlayerWrapper extends ForwardingPlayer {
    private static final String TAG = "IbraStreamMedia";
    private final Context context;
    private long positionMs = 0;
    private long durationMs = C.TIME_UNSET;
    private long lastUpdateMs = System.currentTimeMillis();

    public CustomPlayerWrapper(Player player, Context context) {
        super(player);
        this.context = context;
    }

    @Override
    public long getDuration() {
        if (durationMs != C.TIME_UNSET && durationMs > 0) {
            return durationMs;
        }
        return super.getDuration();
    }

    @Override
    public long getCurrentPosition() {
        if (durationMs == C.TIME_UNSET || durationMs <= 0) {
            return super.getCurrentPosition();
        }
        if (isPlaying()) {
            long elapsed = System.currentTimeMillis() - lastUpdateMs;
            return Math.min(durationMs, positionMs + elapsed);
        }
        return positionMs;
    }

    @Override
    public void seekTo(int mediaItemIndex, long positionMs) {
        Log.e(TAG, "CustomPlayerWrapper: seekTo index=" + mediaItemIndex + ", positionMs=" + positionMs);
        this.positionMs = positionMs;
        this.lastUpdateMs = System.currentTimeMillis();
        
        // Broadcast the seek command to the web app
        Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
        intent.putExtra("command", "seek");
        intent.putExtra("position", positionMs / 1000.0);
        context.sendBroadcast(intent);

        // Keep the underlying silent audio player at a safe position (0)
        super.seekTo(mediaItemIndex, 0);
    }

    @Override
    public Commands getAvailableCommands() {
        return super.getAvailableCommands().buildUpon()
                .add(COMMAND_SEEK_TO_NEXT)
                .add(COMMAND_SEEK_TO_PREVIOUS)
                .build();
    }

    @Override
    public void seekToNext() {
        Log.e(TAG, "CustomPlayerWrapper: seekToNext");
        Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
        intent.putExtra("command", "next");
        context.sendBroadcast(intent);
    }

    @Override
    public void seekToPrevious() {
        Log.e(TAG, "CustomPlayerWrapper: seekToPrevious");
        Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
        intent.putExtra("command", "previous");
        context.sendBroadcast(intent);
    }

    @Override
    public void seekToNextMediaItem() {
        seekToNext();
    }

    @Override
    public void seekToPreviousMediaItem() {
        seekToPrevious();
    }

    public void setMockDuration(long durationMs) {
        Log.e(TAG, "CustomPlayerWrapper: setMockDuration=" + durationMs);
        this.durationMs = durationMs;
        // Trigger a seek to 0 on the underlying player to force a UI/timeline refresh
        super.seekTo(0);
    }

    public void setMockPosition(long positionMs) {
        Log.e(TAG, "CustomPlayerWrapper: setMockPosition=" + positionMs);
        this.positionMs = positionMs;
        this.lastUpdateMs = System.currentTimeMillis();
        // Trigger a seek to 0 on the underlying player to force a UI/timeline refresh
        super.seekTo(0);
    }
}
