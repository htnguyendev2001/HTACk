package com.example.bmi.data;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Minimal HTTPS client for the HTVA Ck Apps Script API.
 * The endpoint is supplied by local Gradle configuration; no Firebase credential is used here.
 */
public final class HtvaApiClient {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private final String endpoint;

    public interface Callback {
        void onSuccess(JSONObject data);
        void onError(String code, String message);
    }

    public HtvaApiClient(String endpoint) {
        this.endpoint = endpoint == null ? "" : endpoint.trim();
    }

    public void login(String username, String password, Callback callback) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("username", username);
            payload.put("password", password);
            request("login", null, payload, callback);
        } catch (Exception e) {
            callback.onError("INVALID_REQUEST", "Không thể tạo yêu cầu đăng nhập.");
        }
    }

    public void request(String action, String token, JSONObject payload, Callback callback) {
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                if (endpoint.isEmpty()) throw new IllegalStateException("Chưa cấu hình HTVA_API_BASE_URL.");
                URL url = new URL(endpoint);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(20000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Accept", "application/json");

                JSONObject body = new JSONObject();
                body.put("action", action);
                if (token != null) body.put("token", token);
                body.put("payload", payload == null ? new JSONObject() : payload);

                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }

                int status = connection.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == HttpURLConnection.HTTP_SEE_OTHER) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    if (location == null) throw new IllegalStateException("Máy chủ không trả về địa chỉ phản hồi.");
                    URL redirectUrl = new URL(location);
                    if (!"https".equalsIgnoreCase(redirectUrl.getProtocol()) ||
                            !"script.googleusercontent.com".equalsIgnoreCase(redirectUrl.getHost())) {
                        throw new IllegalStateException("Địa chỉ chuyển hướng không an toàn.");
                    }
                    connection = (HttpURLConnection) redirectUrl.openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(20000);
                    connection.setRequestProperty("Accept", "application/json");
                    status = connection.getResponseCode();
                }
                InputStream stream = status >= 200 && status < 400
                        ? connection.getInputStream() : connection.getErrorStream();
                String responseText = readAll(stream);
                JSONObject response = new JSONObject(responseText);
                if (!response.optBoolean("ok", false)) {
                    JSONObject error = response.optJSONObject("error");
                    String code = error == null ? "REQUEST_FAILED" : error.optString("code", "REQUEST_FAILED");
                    String message = error == null ? "Yêu cầu thất bại." : error.optString("message", "Yêu cầu thất bại.");
                    MAIN.post(() -> callback.onError(code, message));
                } else {
                    JSONObject data = response.optJSONObject("data");
                    MAIN.post(() -> callback.onSuccess(data == null ? new JSONObject() : data));
                }
            } catch (Exception e) {
                String message = e.getMessage() == null ? "Không thể kết nối máy chủ." : e.getMessage();
                MAIN.post(() -> callback.onError("NETWORK_ERROR", message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "{}";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }
}
