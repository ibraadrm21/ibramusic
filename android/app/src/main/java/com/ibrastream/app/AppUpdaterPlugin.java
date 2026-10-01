package com.ibrastream.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import android.util.Log;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String TAG = "AppUpdaterPlugin";

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            Context context = getContext();
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            String version = pInfo.versionName;
            long code = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                code = pInfo.getLongVersionCode();
            } else {
                code = pInfo.versionCode;
            }

            JSObject ret = new JSObject();
            ret.put("versionName", version);
            ret.put("versionCode", code);
            call.resolve(ret);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("Could not get package info", e);
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path parameter is required");
            return;
        }

        // Handle URL scheme formatting from Capacitor Filesystem if present
        if (path.startsWith("file://")) {
            path = path.substring(7);
        }

        File apkFile = new File(path);
        if (!apkFile.exists()) {
            call.reject("APK file does not exist at path: " + path);
            return;
        }

        Context context = getContext();

        // On Android 8.0+, verify REQUEST_INSTALL_PACKAGES permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.getPackageManager().canRequestPackageInstalls()) {
                JSObject ret = new JSObject();
                ret.put("status", "need_permission");
                call.resolve(ret);

                // Launch system settings activity to grant permission
                Uri packageUri = Uri.parse("package:" + context.getPackageName());
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, packageUri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return;
            }
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch package installer", e);
            call.reject("Failed to trigger installer: " + e.getMessage(), e);
        }
    }
}
