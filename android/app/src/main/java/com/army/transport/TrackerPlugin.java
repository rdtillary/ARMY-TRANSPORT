package com.army.transport.cms;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Tracker")
public class TrackerPlugin extends Plugin {

    private static volatile TrackerPlugin instance;

    @Override
    public void load() { instance = this; }

    @Override
    protected void handleOnDestroy() { if (instance == this) instance = null; }

    /** Called by the service for every fix, so the open UI can draw the live position. */
    static void emit(JSObject data) {
        TrackerPlugin p = instance;
        if (p != null) p.notifyListeners("position", data);
    }

    /** start({ tripId, baseUrl, token }) — safe to call again (updates token, keeps running). */
    @PluginMethod
    public void start(PluginCall call) {
        Integer tripId = call.getInt("tripId");
        String baseUrl = call.getString("baseUrl");
        String token = call.getString("token", "");
        if (tripId == null || baseUrl == null || baseUrl.isEmpty()) {
            call.reject("tripId and baseUrl are required");
            return;
        }
        Context ctx = getContext();
        Intent i = new Intent(ctx, TrackerService.class)
                .putExtra("tripId", (long) tripId)
                .putExtra("baseUrl", baseUrl)
                .putExtra("token", token);
        ContextCompat.startForegroundService(ctx, i);

        // Android 13+: lets the "tracking ON" notification show. Service runs even if denied.
        if (Build.VERSION.SDK_INT >= 33
                && getActivity() != null
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
        call.resolve();
    }

    /** stop() — flushes unsent points, stops the service, then resolves. */
    @PluginMethod
    public void stop(PluginCall call) {
        if (TrackerService.instance == null) {
            TrackerService.wipe(getContext());
            call.resolve();
            return;
        }
        TrackerService.requestStop(call::resolve);
    }

    /** Asks Android to exempt the app from battery optimisation (Doze / OEM killers). */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        if (!ignoring) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) { }
        }
        JSObject r = new JSObject();
        r.put("ignoring", ignoring);
        call.resolve(r);
    }
}
