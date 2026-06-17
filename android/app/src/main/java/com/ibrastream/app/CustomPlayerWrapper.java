package com.ibrastream.app;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
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
        long dur = super.getDuration();
        if (dur > 0) return dur;
        if (durationMs != C.TIME_UNSET && durationMs > 0) {
            return durationMs;
        }
        return dur;
    }

    @Override
    public long getCurrentPosition() {
        if (isPlaying() && super.getDuration() <= 0 && durationMs != C.TIME_UNSET) {
            long elapsed = System.currentTimeMillis() - lastUpdateMs;
            return Math.min(durationMs, positionMs + elapsed);
        }
        return super.getCurrentPosition();
    }

    @Override
    public void seekTo(int mediaItemIndex, long positionMs) {
        Log.e(TAG, "CustomPlayerWrapper: seekTo index=" + mediaItemIndex + ", positionMs=" + positionMs);
        this.positionMs = positionMs;
        this.lastUpdateMs = System.currentTimeMillis();
        
        // Broadcast the seek command to the web app
        sendMediaCommand("seek", positionMs / 1000.0);

        super.seekTo(mediaItemIndex, positionMs);
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
        sendMediaCommand("next", null);
    }

    @Override
    public void seekToPrevious() {
        Log.e(TAG, "CustomPlayerWrapper: seekToPrevious");
        sendMediaCommand("previous", null);
    }

    private void sendMediaCommand(String command, Double position) {
        Intent intent = new Intent("com.ibrastream.app.MEDIA_COMMAND");
        intent.putExtra("command", command);
        intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        if (position != null) {
            intent.putExtra("position", position);
        }
        context.sendBroadcast(intent);

        // Acquire a temporary WakeLock to help the WebView process the command
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IbraStream:CustomPlayerWakeLock");
                wakeLock.acquire(10000); // 10 seconds
                Log.e(TAG, "CustomPlayerWrapper: Acquired WakeLock for " + command);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
        }
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
    }

    public void setMockPosition(long positionMs) {
        Log.e(TAG, "CustomPlayerWrapper: setMockPosition=" + positionMs);
        this.positionMs = positionMs;
        this.lastUpdateMs = System.currentTimeMillis();
    }
}
