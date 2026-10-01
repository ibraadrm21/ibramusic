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
                        if (uriString.startsWith("https://ibrastream.resolve/")) {
                            android.net.Uri uri = dataSpec.uri;
                            String trackId = "";
                            if (uri.getPathSegments().size() > 0) {
                                trackId = uri.getPathSegments().get(0);
                            }
                            
                            String videoId = null;
                            if (trackId.startsWith("yt-")) {
                                videoId = trackId.substring(3);
                            } else {
                                String title = uri.getQueryParameter("title");
                                String artist = uri.getQueryParameter("artist");
                                Log.e(TAG, "Resolving video ID natively for non-YT track: " + title + " - " + artist);
                                videoId = resolveNativeVideoId(title, artist);
                            }
                            
                            if (videoId == null || videoId.isEmpty()) {
                                Log.e(TAG, "Native video ID resolution failed for trackId: " + trackId);
                                throw new java.io.IOException("Native video ID resolution failed");
                            }

                            Log.e(TAG, "Intercepted ibrastream URL. Resolving natively for videoId: " + videoId);
                            String resolvedUrl = resolveNativeStreamUrl(videoId);
                            if (resolvedUrl != null) {
                                uriString = resolvedUrl;
                                dataSpec = dataSpec.buildUpon().setUri(android.net.Uri.parse(resolvedUrl)).build();
                            } else {
                                Log.e(TAG, "Native stream resolution failed for: " + videoId);
                                throw new java.io.IOException("Native stream resolution failed");
                            }
                        }
                        java.util.Map<String, String> headers = new java.util.HashMap<>();
                        
                        String userAgent;
                        if (uriString.contains("googlevideo.com") || uriString.contains("youtube.com") || uriString.contains("youtubei")) {
                            userAgent = "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)";
                        } else {
                            userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                        }
                        
                        if (uriString.contains("cobalt") || uriString.contains("xenon.zone") || uriString.contains("kittycat.boo") || uriString.contains("qwkuns.me") || uriString.contains("mgytr.top") || uriString.contains("squair.xyz")) {
                            headers.put("Origin", "https://cobalt.tools");
                            headers.put("Referer", "https://cobalt.tools/");
                        } else if (uriString.contains("piped") || uriString.contains("kavin.rocks") || uriString.contains("private.coffee") || uriString.contains("lvk.li")) {
                            headers.put("Origin", "https://piped.video");
                            headers.put("Referer", "https://piped.video/");
                        }
                        
                        Log.e("IbraStreamService", "DataSource opening URL: " + uriString + " with UA: " + userAgent + " and headers: " + headers);
                        
                        androidx.media3.datasource.DefaultHttpDataSource.Factory factory = 
                            new androidx.media3.datasource.DefaultHttpDataSource.Factory()
                                .setUserAgent(userAgent)
                                .setDefaultRequestProperties(headers)
                                .setAllowCrossProtocolRedirects(true);
                                
                        activeDataSource = new androidx.media3.datasource.DefaultDataSource(PlaybackService.this, factory.createDataSource());
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
                    // Try native advance first — if queue has more items, ExoPlayer will
                    // call DataSource.open() for the next placeholder and Java resolves it
                    // without needing JavaScript at all.
                    int currentIdx = player.getCurrentMediaItemIndex();
                    int itemCount = player.getMediaItemCount();
                    Log.e(TAG, "ExoPlayer: Track ENDED. currentIdx=" + currentIdx + " itemCount=" + itemCount);
                    if (currentIdx + 1 < itemCount) {
                        Log.e(TAG, "ExoPlayer: Advancing natively to next item in queue.");
                        player.seekToNextMediaItem();
                        player.play();
                    } else {
                        Log.e(TAG, "ExoPlayer: No next native item. Sending JS broadcast.");
                        sendMediaCommand("next");
                    }
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

    private String resolveNativeStreamUrlDirect(String videoId) {
        java.net.HttpURLConnection conn = null;
        try {
            java.net.URL url = new java.net.URL("https://www.youtube.com/youtubei/v1/player");
            conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            org.json.JSONObject client = new org.json.JSONObject();
            client.put("clientName", "ANDROID_VR");
            client.put("clientVersion", "1.32.21");

            org.json.JSONObject context = new org.json.JSONObject();
            context.put("client", client);

            org.json.JSONObject body = new org.json.JSONObject();
            body.put("context", context);
            body.put("videoId", videoId);

            java.io.OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();

            int code = conn.getResponseCode();
            if (code == 200) {
                java.io.InputStream in = conn.getInputStream();
                java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                org.json.JSONObject response = new org.json.JSONObject(sb.toString());
                if (response.has("streamingData")) {
                    org.json.JSONObject streamingData = response.getJSONObject("streamingData");
                    if (streamingData.has("adaptiveFormats")) {
                        org.json.JSONArray formats = streamingData.getJSONArray("adaptiveFormats");
                        String fallbackUrl = null;
                        for (int i = 0; i < formats.length(); i++) {
                            org.json.JSONObject format = formats.getJSONObject(i);
                            String mimeType = format.optString("mimeType", "");
                            if (mimeType.startsWith("audio/")) {
                                String streamUrl = format.optString("url", "");
                                if (!streamUrl.isEmpty()) {
                                    if (mimeType.contains("audio/mp4")) {
                                        Log.e(TAG, "Native InnerTube resolved itag 140 URL successfully");
                                        return streamUrl;
                                    }
                                    fallbackUrl = streamUrl;
                                }
                            }
                        }
                        if (fallbackUrl != null) {
                            Log.e(TAG, "Native InnerTube resolved fallback audio URL successfully");
                            return fallbackUrl;
                        }
                    }
                }
            } else {
                Log.e(TAG, "InnerTube player returned response code: " + code);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to resolve stream via InnerTube", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String resolveNativeStreamUrl(String videoId) {
        String directUrl = resolveNativeStreamUrlDirect(videoId);
        if (directUrl != null && !directUrl.isEmpty()) {
            return directUrl;
        }

        String[] pipedHosts = {
            "https://pipedapi.synopy.io",
            "https://pipedapi.kavin.rocks",
            "https://api.piped.private.coffee",
            "https://pipedapi.lvk.li",
            "https://pipedapi.col.re",
            "https://pipedapi.fortyseven.rt.ht"
        };
        for (String host : pipedHosts) {
            java.net.HttpURLConnection conn = null;
            try {
                java.net.URL url = new java.net.URL(host + "/streams/" + videoId);
                conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                
                int code = conn.getResponseCode();
                if (code == 200) {
                    java.io.InputStream in = conn.getInputStream();
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    
                    String json = sb.toString();
                    int audioStreamsIdx = json.indexOf("audioStreams");
                    if (audioStreamsIdx != -1) {
                        int urlIdx = json.indexOf("\"url\":", audioStreamsIdx);
                        if (urlIdx != -1) {
                            int start = json.indexOf("\"", urlIdx + 6);
                            if (start != -1) {
                                int end = json.indexOf("\"", start + 1);
                                if (end != -1) {
                                    String resolvedUrl = json.substring(start + 1, end);
                                    resolvedUrl = resolvedUrl.replace("\\/", "/");
                                    Log.e(TAG, "Native Piped resolved URL successfully: " + resolvedUrl);
                                    return resolvedUrl;
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to resolve stream natively via Piped: " + host, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }

        String[] hosts = {
            "https://rue-cobalt.xenon.zone",
            "https://cobalt.alpha.wolfy.love",
            "https://api.qwkuns.me",
            "https://subito-c.meowing.de",
            "https://grapefruit.clxxped.lol",
            "https://api.cobalt.blackcat.sweeux.org"
        };
        
        for (String host : hosts) {
            java.net.HttpURLConnection conn = null;
            try {
                java.net.URL url = new java.net.URL(host);
                conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Origin", "https://cobalt.tools");
                conn.setRequestProperty("Referer", "https://cobalt.tools/");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                
                String jsonBody = "{\"url\":\"https://www.youtube.com/watch?v=" + videoId + "\",\"downloadMode\":\"audio\",\"audioFormat\":\"mp3\"}";
                java.io.OutputStream os = conn.getOutputStream();
                os.write(jsonBody.getBytes("UTF-8"));
                os.close();
                
                int code = conn.getResponseCode();
                if (code == 200) {
                    java.io.InputStream in = conn.getInputStream();
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    
                    String json = sb.toString();
                    int urlIdx = json.indexOf("\"url\":\"");
                    if (urlIdx != -1) {
                        int start = urlIdx + 7;
                        int end = json.indexOf("\"", start);
                        if (end != -1) {
                            String resolvedUrl = json.substring(start, end);
                            resolvedUrl = resolvedUrl.replace("\\/", "/");
                            Log.e(TAG, "Native Cobalt resolved URL successfully: " + resolvedUrl);
                            return resolvedUrl;
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to resolve stream natively via Cobalt host: " + host, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return null;
    }

    private String resolveNativeVideoIdDirect(String query) {
        java.net.HttpURLConnection conn = null;
        try {
            java.net.URL url = new java.net.URL("https://www.youtube.com/youtubei/v1/search");
            conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            org.json.JSONObject client = new org.json.JSONObject();
            client.put("clientName", "WEB");
            client.put("clientVersion", "2.20230622.01.00");

            org.json.JSONObject context = new org.json.JSONObject();
            context.put("client", client);

            org.json.JSONObject body = new org.json.JSONObject();
            body.put("context", context);
            body.put("query", query);

            java.io.OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();

            int code = conn.getResponseCode();
            if (code == 200) {
                java.io.InputStream in = conn.getInputStream();
                java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                String response = sb.toString();
                java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\"videoId\"\\s*:\\s*\"([^\"]+)\"");
                java.util.regex.Matcher matcher = pattern.matcher(response);
                if (matcher.find()) {
                    String videoId = matcher.group(1);
                    Log.e(TAG, "Native InnerTube search resolved videoId: " + videoId);
                    return videoId;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to resolve videoId via InnerTube search", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String resolveNativeVideoId(String title, String artist) {
        if (title == null || title.isEmpty()) return null;
        String cleanTitle = title
            .replaceAll("(?i)\\(feat\\..*?\\)", "")
            .replaceAll("(?i)\\[feat\\..*?\\]", "")
            .replaceAll("(?i)\\(with.*?\\)", "")
            .replaceAll("\\(.*?\\)", "")
            .trim();
        String query = (artist != null ? artist + " " : "") + cleanTitle;

        String directId = resolveNativeVideoIdDirect(query);
        if (directId != null && !directId.isEmpty()) {
            return directId;
        }
        
        String[] pipedHosts = {
            "https://pipedapi.synopy.io",
            "https://pipedapi.kavin.rocks",
            "https://api.piped.private.coffee",
            "https://pipedapi.lvk.li"
        };
        
        for (String host : pipedHosts) {
            java.net.HttpURLConnection conn = null;
            try {
                String searchUrl = host + "/search?q=" + java.net.URLEncoder.encode(query, "UTF-8") + "&filter=music_songs";
                java.net.URL url = new java.net.URL(searchUrl);
                conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                conn.setRequestProperty("Referer", "https://piped.video/");
                conn.setRequestProperty("Origin", "https://piped.video");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                
                int code = conn.getResponseCode();
                if (code == 200) {
                    java.io.InputStream in = conn.getInputStream();
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    
                    String json = sb.toString();
                    int watchIdx = json.indexOf("/watch?v=");
                    if (watchIdx != -1) {
                        int start = watchIdx + 9;
                        int end = start;
                        while (end < json.length()) {
                            char c = json.charAt(end);
                            if (c == '"' || c == '\\' || c == '&' || c == '\'') {
                                break;
                            }
                            end++;
                        }
                        if (end > start) {
                            String videoId = json.substring(start, end);
                            Log.e(TAG, "Native resolved videoId: " + videoId + " for search: " + query);
                            return videoId;
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to resolve video ID natively via Piped: " + host, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return null;
    }
}
