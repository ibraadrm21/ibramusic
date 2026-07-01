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
    public androidx.media3.common.Timeline getCurrentTimeline() {
        final androidx.media3.common.Timeline timeline = super.getCurrentTimeline();
        if (timeline.isEmpty()) {
            return timeline;
        }
        return new androidx.media3.common.Timeline() {
            @Override
            public int getWindowCount() {
                return timeline.getWindowCount();
            }

            @Override
            public Window getWindow(int windowIndex, Window window, long defaultPositionProjectionUs) {
                timeline.getWindow(windowIndex, window, defaultPositionProjectionUs);
                if (durationMs != C.TIME_UNSET && durationMs > 0) {
                    window.durationUs = durationMs * 1000;
                }
                window.isSeekable = true;
                window.isDynamic = false;
                window.isPlaceholder = false;
                return window;
            }

            @Override
            public int getPeriodCount() {
                return timeline.getPeriodCount();
            }

            @Override
            public Period getPeriod(int periodIndex, Period period, boolean setIds) {
                timeline.getPeriod(periodIndex, period, setIds);
                if (durationMs != C.TIME_UNSET && durationMs > 0) {
                    period.durationUs = durationMs * 1000;
                }
                period.isPlaceholder = false;
                return period;
            }

            @Override
            public int getIndexOfPeriod(Object uid) {
                return timeline.getIndexOfPeriod(uid);
            }

            @Override
            public Object getUidOfPeriod(int periodIndex) {
                return timeline.getUidOfPeriod(periodIndex);
            }
        };
    }

    @Override
    public boolean isCurrentMediaItemSeekable() {
        return true;
    }

    @Override
    public boolean isCurrentMediaItemLive() {
        return false;
    }

    @Override
    public boolean isCurrentMediaItemDynamic() {
        return false;
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
                .add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .add(COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                .build();
    }

    @Override
    public void seekToNext() {
        Log.e(TAG, "CustomPlayerWrapper: seekToNext. count=" + getMediaItemCount() + ", current=" + getCurrentMediaItemIndex());
        if (getMediaItemCount() > 1 && getCurrentMediaItemIndex() < getMediaItemCount() - 1) {
            super.seekToNext();
        } else {
            sendMediaCommand("next", null);
        }
    }

    @Override
    public void seekToPrevious() {
        long currentPos = getCurrentPosition();
        Log.e(TAG, "CustomPlayerWrapper: seekToPrevious. position=" + currentPos + ", count=" + getMediaItemCount() + ", current=" + getCurrentMediaItemIndex());
        if (currentPos >= 3000) {
            seekTo(getCurrentMediaItemIndex(), 0);
        } else {
            if (getMediaItemCount() > 1 && getCurrentMediaItemIndex() > 0) {
                super.seekToPrevious();
            } else {
                sendMediaCommand("previous", null);
            }
        }
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
