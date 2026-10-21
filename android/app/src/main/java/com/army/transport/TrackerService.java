package com.army.transport.cms;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Foreground service that keeps tracking with the screen off or the app closed.
 *
 * - Reads GPS itself (no WebView / JS involved).
 * - Persists every fix to a file queue, then uploads batches to /api/trips/track
 *   with the login token. Unsent points survive network loss and process death.
 * - Everything runs on ONE worker thread, so there are no races.
 * - Stops itself when the server says the trip is no longer active (HTTP 409),
 *   e.g. after the 2-minute auto-stop or an admin force-stop.
 */
public class TrackerService extends Service implements LocationListener {

    private static final String PREFS = "tracker";
    private static final String CHANNEL = "tracking";
    private static final int NOTIF_ID = 4101;
    private static final long TICK_MS = 10_000;
    private static final long FLUSH_EVERY_MS = 4_000;
    private static final long HEARTBEAT_AFTER_MS = 15_000;

    static volatile TrackerService instance;

    private HandlerThread thread;
    private Handler handler;
    private PointQueue queue;
    private PowerManager.WakeLock wakeLock;
    private LocationManager lm;

    private volatile long tripId;
    private volatile String baseUrl = "";
    private volatile String token = "";
    private volatile boolean running;
    private volatile boolean stopped;
    private JSONObject lastFix;
    private long lastFixAt;
    private long lastFlushAt;

    /* ------------------------------------------------------------ lifecycle */

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        thread = new HandlerThread("mcte-tracker");
        thread.start();
        handler = new Handler(thread.getLooper());
        queue = new PointQueue(queueFile(this));
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        createChannel();

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mcte:tracker");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(24L * 60 * 60 * 1000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundNow(); // must happen within 5 s of startForegroundService()
        stopped = false;

        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && intent.hasExtra("tripId")) {
            long newTrip = intent.getLongExtra("tripId", 0);
            if (newTrip != sp.getLong("tripId", 0)) handler.post(queue::clear); // never mix trips
            sp.edit()
                    .putLong("tripId", newTrip)
                    .putString("baseUrl", intent.getStringExtra("baseUrl"))
                    .putString("token", intent.getStringExtra("token"))
                    .apply();
        }
        // A null intent means Android restarted us after killing the process: resume from prefs.
        tripId = sp.getLong("tripId", 0);
        baseUrl = sp.getString("baseUrl", "");
        token = sp.getString("token", "");

        if (tripId == 0 || baseUrl == null || baseUrl.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!running) {
            running = true;
            handler.post(this::startLocation);
            handler.postDelayed(this::tick, TICK_MS);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ------------------------------------------------------------------ GPS */

    @SuppressLint("MissingPermission")
    private void startLocation() {
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, this, handler.getLooper());
        } catch (Exception ignored) {
            // permission missing or GPS provider unavailable; heartbeat keeps the last fix alive
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        if (stopped) return;
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lng", l.getLongitude());
            if (l.hasSpeed()) o.put("speed", l.getSpeed() * 3.6);   // m/s -> km/h
            if (l.hasBearing()) o.put("heading", l.getBearing());
            if (l.hasAccuracy()) o.put("accuracy", l.getAccuracy());
            long now = System.currentTimeMillis();
            o.put("ts", l.getTime() > 0 ? l.getTime() : now);

            lastFix = o;
            lastFixAt = now;
            queue.append(o.toString());

            try { TrackerPlugin.emit(new JSObject(o.toString())); } catch (Exception ignored) { }

            if (now - lastFlushAt >= FLUSH_EVERY_MS) flush(10);
        } catch (Exception ignored) { }
    }

    // Must be implemented explicitly: they are abstract on older Android versions.
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }

    /* --------------------------------------------------------------- upload */

    /** Runs every 10 s: heartbeat for a parked vehicle + retry of anything unsent. */
    private void tick() {
        if (stopped) return;
        long now = System.currentTimeMillis();
        if (lastFix != null && now - lastFixAt > HEARTBEAT_AFTER_MS) {
            try {
                JSONObject o = new JSONObject(lastFix.toString());
                o.put("speed", 0);
                o.put("ts", now);
                queue.append(o.toString());
                lastFixAt = now;
            } catch (Exception ignored) { }
        }
        flush(10);
        if (!stopped) handler.postDelayed(this::tick, TICK_MS);
    }

    private void flush(int maxBatches) {
        lastFlushAt = System.currentTimeMillis();
        for (int i = 0; i < maxBatches && !stopped; i++) {
            List<String> lines = queue.peek(200);
            if (lines.isEmpty()) return;
            int status = post(lines);
            if (status >= 200 && status < 300) { queue.drop(lines.size()); continue; }
            if (status == 400) { queue.drop(lines.size()); continue; }   // bad batch, would never succeed
            if (status == 409) { shutdown(); return; }                    // trip ended on the server
            return; // 401 / 5xx / no network: keep the points, retry on the next tick
        }
    }

    private int post(List<String> lines) {
        HttpURLConnection c = null;
        try {
            StringBuilder b = new StringBuilder("{\"tripId\":").append(tripId).append(",\"points\":[");
            for (int i = 0; i < lines.size(); i++) {
                if (i > 0) b.append(',');
                b.append(lines.get(i));
            }
            b.append("]}");
            byte[] body = b.toString().getBytes(StandardCharsets.UTF_8);

            c = (HttpURLConnection) new URL(baseUrl + "/api/trips/track").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(body.length);
            c.setRequestProperty("Content-Type", "application/json");
            String t = token;
            if (t != null && !t.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + t);
            try (OutputStream os = c.getOutputStream()) { os.write(body); }

            int code = c.getResponseCode();
            try {
                InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                if (is != null) { byte[] buf = new byte[1024]; while (is.read(buf) >= 0) { } is.close(); }
            } catch (IOException ignored) { }
            return code;
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /* ----------------------------------------------------------------- stop */

    /** Flush what we can, stop everything, then call done (on the worker thread). */
    static void requestStop(final Runnable done) {
        final TrackerService s = instance;
        if (s == null) { done.run(); return; }
        s.handler.post(() -> {
            s.flush(2);
            s.shutdown();
            done.run();
        });
    }

    private void shutdown() {
        if (stopped) return;
        stopped = true;
        running = false;
        handler.removeCallbacksAndMessages(null);
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        wipe(this);
        stopForeground(true);
        stopSelf();
    }

    static void wipe(Context c) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
        queueFile(c).delete();
    }

    /* --------------------------------------------------------- notification */

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Movement tracking", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while this vehicle is being tracked");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    private void startForegroundNow() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Movement tracking ON")
                .setContentText("MCTE Transport is reporting this vehicle's position")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pi)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private static File queueFile(Context c) {
        return new File(c.getFilesDir(), "track-queue.jsonl");
    }

    /* ---------------------------------------------------------- disk queue */

    /** One JSON object per line. Capped at 5000 points (oldest dropped). */
    static final class PointQueue {
        private static final int MAX = 5000;
        private final File file;
        private int size = -1;

        PointQueue(File f) { file = f; }

        private List<String> readAll() {
            List<String> out = new ArrayList<>();
            if (!file.exists()) return out;
            try (BufferedReader r = new BufferedReader(new FileReader(file))) {
                String l;
                while ((l = r.readLine()) != null) if (!l.isEmpty()) out.add(l);
            } catch (IOException ignored) { }
            return out;
        }

        private void writeAll(List<String> lines) {
            File tmp = new File(file.getPath() + ".tmp");
            try (BufferedWriter w = new BufferedWriter(new FileWriter(tmp))) {
                for (String l : lines) { w.write(l); w.newLine(); }
            } catch (IOException e) { return; }
            if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file); }
            size = lines.size();
        }

        synchronized void append(String line) {
            if (size < 0) size = readAll().size();
            if (size >= MAX) {
                List<String> all = readAll();
                writeAll(new ArrayList<>(all.subList(all.size() - MAX + 1, all.size())));
            }
            try (FileWriter w = new FileWriter(file, true)) {
                w.write(line + "\n");
                size++;
            } catch (IOException ignored) { }
        }

        synchronized List<String> peek(int n) {
            List<String> all = readAll();
            return new ArrayList<>(all.subList(0, Math.min(n, all.size())));
        }

        synchronized void drop(int n) {
            List<String> all = readAll();
            writeAll(new ArrayList<>(all.subList(Math.min(n, all.size()), all.size())));
        }

        synchronized void clear() {
            file.delete();
            size = 0;
        }
    }
}
