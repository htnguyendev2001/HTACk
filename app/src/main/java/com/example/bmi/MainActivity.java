package com.example.bmi;

import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;
import com.example.bmi.data.HtvaApiClient;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class MainActivity extends AppCompatActivity {
    private LinearLayout root;
    private HtvaApiClient api;
    private String sessionToken;
    private String currentRole;
    private String currentDisplayName;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        root = findViewById(R.id.contentRoot);
        api = new HtvaApiClient(BuildConfig.HTVA_API_BASE_URL);
        showLogin();
    }

    private void showLogin() {
        root.removeAllViews();
        addText("HTVA Ck", 28, true);
        addText("Đăng nhập để làm bài kiểm tra hoặc chấm bài.", 15, false);
        EditText username = addInput("Tên đăng nhập", false);
        EditText password = addInput("Mật khẩu", true);
        Button login = addButton("Đăng nhập");
        TextView status = addText("", 14, false);
        login.setOnClickListener(v -> {
            String user = username.getText().toString().trim();
            String pass = password.getText().toString();
            if (user.isEmpty() || pass.isEmpty()) {
                status.setText("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
                return;
            }
            login.setEnabled(false);
            status.setText("Đang xác thực...");
            api.login(user, pass, new HtvaApiClient.Callback() {
                @Override public void onSuccess(JSONObject data) {
                    login.setEnabled(true);
                    password.setText("");
                    sessionToken = data.optString("token", "");
                    JSONObject account = data.optJSONObject("user");
                    if (sessionToken.isEmpty() || account == null) {
                        status.setText("Phản hồi đăng nhập không hợp lệ.");
                        return;
                    }
                    currentRole = account.optString("role", "");
                    currentDisplayName = account.optString("displayName", user);
                    if ("teacher".equals(currentRole)) loadTeacherInbox();
                    else if ("student".equals(currentRole)) loadStudentHome();
                    else {
                        sessionToken = null;
                        status.setText("Tài khoản chưa được cấp vai trò hợp lệ.");
                    }
                }
                @Override public void onError(String code, String message) {
                    login.setEnabled(true);
                    status.setText(message);
                }
            });
        });
    }

    private void loadStudentHome() {
        root.removeAllViews();
        addText("Xin chào, " + currentDisplayName, 22, true);
        addText("Bài kiểm tra", 19, true);
        TextView examStatus = addText("Đang tải danh sách...", 14, false);
        api.request("listExams", sessionToken, new JSONObject(), new HtvaApiClient.Callback() {
            @Override public void onSuccess(JSONObject data) {
                examStatus.setText("");
                JSONArray exams = data.optJSONArray("items");
                if (exams == null || exams.length() == 0) addText("Hiện chưa có bài kiểm tra được mở.", 14, false);
                else for (int i = 0; i < exams.length(); i++) {
                    JSONObject exam = exams.optJSONObject(i);
                    if (exam == null) continue;
                    addText(exam.optString("title", "Bài kiểm tra"), 17, true);
                    addText(exam.optString("description", ""), 14, false);
                    addButton("Làm bài").setOnClickListener(v -> showExam(exam));
                }
                addStudentHistorySection();
            }
            @Override public void onError(String code, String message) {
                examStatus.setText(message);
                addStudentHistorySection();
            }
        });
        addButton("Đăng xuất").setOnClickListener(v -> logout());
    }

    private void addStudentHistorySection() {
        addText("Lịch sử nộp bài", 19, true);
        TextView historyStatus = addText("Đang tải lịch sử...", 14, false);
        api.request("myHistory", sessionToken, new JSONObject(), new HtvaApiClient.Callback() {
            @Override public void onSuccess(JSONObject data) {
                historyStatus.setText("");
                JSONArray items = data.optJSONArray("items");
                if (items == null || items.length() == 0) addText("Bạn chưa có bài nộp nào.", 14, false);
                else for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) continue;
                    String state = "graded".equals(item.optString("status")) ? "Đã chấm" : "Chờ chấm";
                    String score = item.isNull("score") ? "" : " • Điểm: " + item.optString("score");
                    addText(item.optString("examId") + " • " + state + score, 14, false);
                    if (!item.optString("feedback", "").isEmpty()) addText("Nhận xét: " + item.optString("feedback"), 13, false);
                }
            }
            @Override public void onError(String code, String message) { historyStatus.setText(message); }
        });
    }

    private void showExam(JSONObject exam) {
        root.removeAllViews();
        String examId = exam.optString("examId", "");
        addText(exam.optString("title", "Bài kiểm tra"), 22, true);
        addText(exam.optString("description", ""), 14, false);
        JSONArray questions = exam.optJSONArray("questions");
        Map<String, View> answerViews = new HashMap<>();
        if (questions == null || questions.length() == 0) {
            addText("Bài kiểm tra chưa có câu hỏi.", 14, false);
            addButton("Quay lại").setOnClickListener(v -> loadStudentHome());
            return;
        }
        for (int i = 0; i < questions.length(); i++) {
            JSONObject question = questions.optJSONObject(i);
            if (question == null) continue;
            String questionId = question.optString("questionId", "q" + i);
            addText((i + 1) + ". " + question.optString("prompt", ""), 16, true);
            JSONArray options = question.optJSONArray("options");
            if (options != null && options.length() > 0) {
                RadioGroup group = new RadioGroup(this);
                group.setOrientation(LinearLayout.VERTICAL);
                for (int j = 0; j < options.length(); j++) {
                    Object option = options.opt(j);
                    String label = option instanceof JSONObject
                            ? ((JSONObject) option).optString("label", ((JSONObject) option).optString("value"))
                            : String.valueOf(option);
                    String value = option instanceof JSONObject
                            ? ((JSONObject) option).optString("value", label) : label;
                    RadioButton radio = new RadioButton(this);
                    radio.setText(label);
                    radio.setTag(value);
                    group.addView(radio);
                }
                root.addView(group);
                answerViews.put(questionId, group);
            } else answerViews.put(questionId, addInput("Nhập câu trả lời", false));
        }
        Button submit = addButton("Nộp bài");
        TextView status = addText("", 14, false);
        final String attemptId = UUID.randomUUID().toString().replace("-", "");
        final JSONObject[] pendingPayload = new JSONObject[1];
        submit.setOnClickListener(v -> {
            if (pendingPayload[0] != null) {
                submit.setEnabled(false);
                status.setText("Đang gửi lại bài...");
                api.request("submitAttempt", sessionToken, pendingPayload[0], new HtvaApiClient.Callback() {
                    @Override public void onSuccess(JSONObject data) {
                        Toast.makeText(MainActivity.this, "Nộp bài thành công.", Toast.LENGTH_LONG).show();
                        loadStudentHome();
                    }
                    @Override public void onError(String code, String message) {
                        submit.setEnabled(true);
                        status.setText(message);
                    }
                });
                return;
            }
            JSONObject answers = new JSONObject();
            try {
                for (Map.Entry<String, View> entry : answerViews.entrySet()) {
                    View view = entry.getValue();
                    String answer = "";
                    if (view instanceof EditText) answer = ((EditText) view).getText().toString();
                    else if (view instanceof RadioGroup) {
                        RadioGroup group = (RadioGroup) view;
                        int checkedId = group.getCheckedRadioButtonId();
                        RadioButton selected = checkedId == -1 ? null : group.findViewById(checkedId);
                        if (selected != null) answer = String.valueOf(selected.getTag());
                    }
                    answers.put(entry.getKey(), answer);
                }
            } catch (JSONException e) {
                status.setText("Không thể đóng gói câu trả lời.");
                return;
            }
            JSONObject payload = new JSONObject();
            try {
                payload.put("examId", examId);
                payload.put("attemptId", attemptId);
                payload.put("answers", answers);
            } catch (JSONException e) {
                status.setText("Dữ liệu bài làm không hợp lệ.");
                return;
            }
            pendingPayload[0] = payload;
            submit.setEnabled(false);
            status.setText("Đang gửi bài...");
            api.request("submitAttempt", sessionToken, pendingPayload[0], new HtvaApiClient.Callback() {
                @Override public void onSuccess(JSONObject data) {
                    Toast.makeText(MainActivity.this, "Nộp bài thành công.", Toast.LENGTH_LONG).show();
                    loadStudentHome();
                }
                @Override public void onError(String code, String message) {
                    submit.setEnabled(true);
                    status.setText(message);
                }
            });
        });
        addButton("Quay lại").setOnClickListener(v -> loadStudentHome());
    }

    private void loadTeacherInbox() {
        root.removeAllViews();
        addText("Khu vực giáo viên", 22, true);
        addText("Bài học sinh đã nộp", 18, true);
        TextView status = addText("Đang tải bài nộp...", 14, false);
        api.request("teacherSubmissions", sessionToken, new JSONObject(), new HtvaApiClient.Callback() {
            @Override public void onSuccess(JSONObject data) {
                status.setText("");
                JSONArray items = data.optJSONArray("items");
                if (items == null || items.length() == 0) addText("Chưa có bài cần chấm.", 14, false);
                else for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item != null) addSubmissionCard(item);
                }
            }
            @Override public void onError(String code, String message) { status.setText(message); }
        });
        addButton("Đăng xuất").setOnClickListener(v -> logout());
    }

    private void addSubmissionCard(JSONObject item) {
        addText(item.optString("studentName", "Học sinh") + " • " + item.optString("examId"), 17, true);
        addText("Mã lượt: " + item.optString("attemptId"), 12, false);
        JSONObject answers = item.optJSONObject("answers");
        JSONArray questions = item.optJSONArray("questions");
        if (questions != null && answers != null) {
            for (int i = 0; i < questions.length(); i++) {
                JSONObject question = questions.optJSONObject(i);
                if (question == null) continue;
                String questionId = question.optString("questionId", "");
                addText("Câu hỏi: " + question.optString("prompt", ""), 14, true);
                addText("Trả lời: " + answers.optString(questionId, "(chưa trả lời)"), 14, false);
            }
        } else if (answers != null) {
            try { addText("Câu trả lời: " + answers.toString(2), 13, false); }
            catch (JSONException ignored) { addText("Câu trả lời đã nhận.", 13, false); }
        }
        if ("graded".equals(item.optString("status"))) {
            addText("Đã chấm • Điểm: " + item.optString("score"), 14, true);
            return;
        }
        EditText score = addInput("Điểm (0 - 100)", false);
        score.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText feedback = addInput("Nhận xét của giáo viên", false);
        Button grade = addButton("Lưu kết quả chấm");
        TextView result = addText("", 13, false);
        grade.setOnClickListener(v -> {
            JSONObject payload = new JSONObject();
            try {
                payload.put("studentUid", item.optString("studentUid"));
                payload.put("attemptId", item.optString("attemptId"));
                payload.put("score", Double.parseDouble(score.getText().toString()));
                payload.put("feedback", feedback.getText().toString());
            } catch (Exception e) {
                result.setText("Vui lòng nhập điểm hợp lệ.");
                return;
            }
            grade.setEnabled(false);
            api.request("gradeSubmission", sessionToken, payload, new HtvaApiClient.Callback() {
                @Override public void onSuccess(JSONObject data) { loadTeacherInbox(); }
                @Override public void onError(String code, String message) {
                    grade.setEnabled(true);
                    result.setText(message);
                }
            });
        });
        addDivider();
    }

    private void logout() {
        if (sessionToken != null) api.request("logout", sessionToken, new JSONObject(), new HtvaApiClient.Callback() {
            @Override public void onSuccess(JSONObject data) { }
            @Override public void onError(String code, String message) { }
        });
        sessionToken = null;
        currentRole = null;
        showLogin();
    }

    private TextView addText(String value, int size, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        if (bold) text.setTypeface(null, android.graphics.Typeface.BOLD);
        text.setPadding(0, 10, 0, 8);
        root.addView(text, new LinearLayout.LayoutParams(-1, -2));
        return text;
    }

    private EditText addInput(String hint, boolean password) {
        EditText input = new EditText(this);
        input.setSingleLine(!password);
        input.setHint(hint);
        input.setInputType(password
                ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        root.addView(input, new LinearLayout.LayoutParams(-1, -2));
        return input;
    }

    private Button addButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = 8;
        root.addView(button, params);
        return button;
    }

    private void addDivider() {
        View divider = new View(this);
        divider.setBackgroundColor(0xFFDDDDDD);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, 1);
        params.topMargin = 12;
        params.bottomMargin = 12;
        root.addView(divider, params);
    }
}
