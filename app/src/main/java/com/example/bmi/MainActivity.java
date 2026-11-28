package com.example.bmi;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import android.os.Bundle;
import android.text.InputType;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.content.SharedPreferences;
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
import java.util.Iterator;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

public class MainActivity extends AppCompatActivity {
    private LinearLayout root;
    private HtvaApiClient api;
    private String deviceId;
    private String teacherAccessCode = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        root = findViewById(R.id.contentRoot);

        deviceId = getSharedPreferences("htva_device", MODE_PRIVATE)
                .getString("device_id", "");
        if (deviceId.isEmpty()) {
            deviceId = UUID.randomUUID().toString().replace("-", "");
            getSharedPreferences("htva_device", MODE_PRIVATE)
                    .edit().putString("device_id", deviceId).apply();
        }

        api = new HtvaApiClient(BuildConfig.HTVA_API_BASE_URL, deviceId);
        showHome();
    }

    private void showHome() {
        root.removeAllViews();
        addText("HTVA Ck", 28, true);
        addText("Không cần tài khoản. Đề kiểm tra và bài nộp được đồng bộ giữa các thiết bị.", 15, false);
        addButton("Bài kiểm tra / Học sinh").setOnClickListener(v -> loadStudentHome());
        addButton("Khu vực giáo viên").setOnClickListener(v -> promptTeacherAccessCode());
    }

    private void promptTeacherAccessCode() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("Mã truy cập giáo viên");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);

        new AlertDialog.Builder(this)
                .setTitle("Mở khu vực giáo viên")
                .setMessage("Nhập mã do quản trị viên cung cấp. Không cần tài khoản đăng nhập.")
                .setView(input)
                .setNegativeButton("Hủy", (dialog, which) -> { })
                .setPositiveButton("Tiếp tục", (dialog, which) -> {
                    String code = input.getText().toString();
                    if (code.length() < 8) {
                        Toast.makeText(this, "Mã truy cập không hợp lệ.", Toast.LENGTH_LONG).show();
                        return;
                    }
                    teacherAccessCode = code;
                    loadTeacherInbox();
                })
                .show();
    }

    private JSONObject teacherPayload() {
        JSONObject payload = new JSONObject();
        try {
            payload.put("accessCode", teacherAccessCode);
        } catch (JSONException ignored) { }
        return payload;
    }

    private void loadStudentHome() {
        root.removeAllViews();
        addText("Bài kiểm tra", 23, true);
        addButton("Làm mới danh sách").setOnClickListener(v -> loadStudentHome());
        addButton("Lịch sử nộp bài").setOnClickListener(v -> loadStudentHistory());
        TextView examStatus = addText("Đang tải danh sách...", 14, false);

        api.request("listExams", new JSONObject(), new HtvaApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject data) {
                examStatus.setText("");
                JSONArray exams = data.optJSONArray("items");
                if (exams == null || exams.length() == 0) {
                    addText("Hiện chưa có bài kiểm tra được mở.", 14, false);
                } else {
                    for (int i = 0; i < exams.length(); i++) {
                        JSONObject exam = exams.optJSONObject(i);
                        if (exam == null) continue;
                        addText(exam.optString("title", "Bài kiểm tra"), 17, true);
                        addText(exam.optString("description", ""), 14, false);
                        addButton("Làm bài").setOnClickListener(v -> showExam(exam));
                        addDivider();
                    }
                }
            }

            @Override
            public void onError(String code, String message) {
                examStatus.setText(message);
            }
        });

        addButton("Trang chủ").setOnClickListener(v -> showHome());
    }

    private void loadStudentHistory() {
        root.removeAllViews();
        addText("Lịch sử nộp bài", 23, true);
        addText("Lịch sử được lưu trên máy chủ và gắn với thiết bị này.", 14, false);
        addButton("Làm mới lịch sử").setOnClickListener(v -> loadStudentHistory());
        TextView historyStatus = addText("Đang tải lịch sử...", 14, false);

        api.request("myHistory", new JSONObject(), new HtvaApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject data) {
                historyStatus.setText("");
                JSONArray items = data.optJSONArray("items");
                if (items == null || items.length() == 0) {
                    addText("Thiết bị này chưa có bài nộp nào.", 15, false);
                    return;
                }
                SimpleDateFormat dateFormat = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault());
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) continue;
                    String state = "graded".equals(item.optString("status")) ? "Đã chấm" : "Đang chờ chấm";
                    long submittedAt = item.optLong("submittedAt", 0L);
                    String date = submittedAt > 0 ? dateFormat.format(new Date(submittedAt)) : "Không rõ thời gian";
                    addText(item.optString("examTitle", item.optString("examId")), 17, true);
                    addText("Thời gian nộp: " + date, 13, false);
                    addText("Trạng thái: " + state, 14, false);
                    if (!item.isNull("score")) addText("Điểm: " + item.optString("score"), 15, true);
                    if (!item.optString("feedback", "").isEmpty()) {
                        addText("Nhận xét: " + item.optString("feedback"), 14, false);
                    }
                    addDivider();
                }
            }

            @Override
            public void onError(String code, String message) {
                historyStatus.setText("Không tải được lịch sử: " + message);
            }
        });
        addButton("Quay lại danh sách bài kiểm tra").setOnClickListener(v -> loadStudentHome());
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

        SharedPreferences draftPrefs = getSharedPreferences("htva_exam_drafts", MODE_PRIVATE);
        String draftKey = "draft_" + examId;
        JSONObject savedDraft;
        try {
            savedDraft = new JSONObject(draftPrefs.getString(draftKey, "{}"));
        } catch (JSONException e) {
            savedDraft = new JSONObject();
        }
        String existingAttemptId = savedDraft.optString("attemptId", "");
        final String attemptId = existingAttemptId.isEmpty()
                ? UUID.randomUUID().toString().replace("-", "") : existingAttemptId;
        JSONObject savedAnswers = savedDraft.optJSONObject("answers");

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
                    radio.setId(View.generateViewId());
                    radio.setText(label);
                    radio.setTag(value);
                    group.addView(radio);
                    if (savedAnswers != null && value.equals(savedAnswers.optString(questionId))) {
                        group.check(radio.getId());
                    }
                }
                root.addView(group);
                answerViews.put(questionId, group);
                group.setOnCheckedChangeListener((radioGroup, checkedId) ->
                        saveExamDraft(draftPrefs, draftKey, attemptId, answerViews));
            } else {
                EditText input = addInput("Nhập câu trả lời", false, false);
                if (savedAnswers != null) input.setText(savedAnswers.optString(questionId, ""));
                answerViews.put(questionId, input);
                input.addTextChangedListener(new TextWatcher() {
                    @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
                    @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
                        saveExamDraft(draftPrefs, draftKey, attemptId, answerViews);
                    }
                    @Override public void afterTextChanged(Editable value) { }
                });
            }
        }

        saveExamDraft(draftPrefs, draftKey, attemptId, answerViews);
        Button submit = addButton("Nộp bài");
        TextView status = addText("", 14, false);
        final String stableAttemptId = attemptId;

        submit.setOnClickListener(v -> {
            JSONObject answers = collectAnswers(answerViews);
            if (answers == null) {
                status.setText("Không thể đọc câu trả lời. Vui lòng kiểm tra lại.");
                return;
            }
            Iterator<String> questionIds = answers.keys();
            while (questionIds.hasNext()) {
                String questionId = questionIds.next();
                if (answers.optString(questionId).trim().isEmpty()) {
                    status.setText("Vui lòng trả lời tất cả câu hỏi trước khi nộp bài.");
                    return;
                }
            }

            JSONObject payload = new JSONObject();
            try {
                payload.put("examId", examId);
                payload.put("attemptId", stableAttemptId);
                payload.put("answers", answers);
            } catch (JSONException e) {
                status.setText("Dữ liệu bài làm không hợp lệ.");
                return;
            }
            saveExamDraft(draftPrefs, draftKey, stableAttemptId, answerViews);
            submit.setEnabled(false);
            status.setText("Đang gửi bài...");
            api.request("submitAttempt", payload, new HtvaApiClient.Callback() {
                @Override
                public void onSuccess(JSONObject data) {
                    draftPrefs.edit().remove(draftKey).apply();
                    Toast.makeText(MainActivity.this, "Nộp bài thành công.", Toast.LENGTH_LONG).show();
                    loadStudentHistory();
                }

                @Override
                public void onError(String code, String message) {
                    submit.setEnabled(true);
                    status.setText(message + " Bài làm đã được giữ trên thiết bị; bạn có thể thử nộp lại.");
                }
            });
        });

        addButton("Lưu nháp và quay lại").setOnClickListener(v -> {
            saveExamDraft(draftPrefs, draftKey, stableAttemptId, answerViews);
            loadStudentHome();
        });
    }

    private JSONObject collectAnswers(Map<String, View> answerViews) {
        JSONObject answers = new JSONObject();
        try {
            for (Map.Entry<String, View> entry : answerViews.entrySet()) {
                View view = entry.getValue();
                String answer = "";
                if (view instanceof EditText) {
                    answer = ((EditText) view).getText().toString();
                } else if (view instanceof RadioGroup) {
                    RadioGroup group = (RadioGroup) view;
                    int checkedId = group.getCheckedRadioButtonId();
                    RadioButton selected = checkedId == -1 ? null : group.findViewById(checkedId);
                    if (selected != null) answer = String.valueOf(selected.getTag());
                }
                answers.put(entry.getKey(), answer);
            }
            return answers;
        } catch (JSONException e) {
            return null;
        }
    }

    private void saveExamDraft(SharedPreferences preferences, String key, String attemptId,
                               Map<String, View> answerViews) {
        JSONObject draft = new JSONObject();
        JSONObject answers = collectAnswers(answerViews);
        try {
            draft.put("attemptId", attemptId);
            draft.put("answers", answers == null ? new JSONObject() : answers);
            preferences.edit().putString(key, draft.toString()).apply();
        } catch (JSONException ignored) { }
    }

    private void loadTeacherInbox() {
        root.removeAllViews();
        addText("Khu vực giáo viên", 22, true);
        addText("Danh sách bài đã nộp trên tất cả thiết bị", 15, false);
        addButton("Làm mới danh sách").setOnClickListener(v -> loadTeacherInbox());
        TextView status = addText("Đang tải bài nộp...", 14, false);

        api.request("teacherSubmissions", teacherPayload(), new HtvaApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject data) {
                status.setText("");
                JSONArray items = data.optJSONArray("items");
                if (items == null || items.length() == 0) {
                    addText("Chưa có bài cần chấm.", 14, false);
                } else {
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject item = items.optJSONObject(i);
                        if (item != null) addSubmissionCard(item);
                    }
                }
            }

            @Override
            public void onError(String code, String message) {
                status.setText(message);
                if ("TEACHER_ACCESS_DENIED".equals(code) || "TEACHER_NOT_CONFIGURED".equals(code)) {
                    teacherAccessCode = "";
                    addButton("Nhập lại mã giáo viên").setOnClickListener(v -> promptTeacherAccessCode());
                }
            }
        });

        addButton("Trang chủ").setOnClickListener(v -> showHome());
    }

    private void addSubmissionCard(JSONObject item) {
        addText(item.optString("studentName", "Thiết bị") + " • " +
                item.optString("examTitle", item.optString("examId")), 17, true);
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
        }

        if ("graded".equals(item.optString("status"))) {
            addText("Đã chấm • Điểm: " + item.optString("score"), 14, true);
            if (!item.optString("feedback", "").isEmpty()) {
                addText("Nhận xét: " + item.optString("feedback"), 13, false);
            }
            addDivider();
            return;
        }

        EditText score = addInput("Điểm (0 - 100)", false);
        score.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText feedback = addInput("Nhận xét của giáo viên", false, false);
        Button grade = addButton("Lưu kết quả chấm");
        TextView result = addText("", 13, false);

        grade.setOnClickListener(v -> {
            JSONObject payload = teacherPayload();
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
            api.request("gradeSubmission", payload, new HtvaApiClient.Callback() {
                @Override
                public void onSuccess(JSONObject data) {
                    Toast.makeText(MainActivity.this, "Đã lưu kết quả chấm.", Toast.LENGTH_SHORT).show();
                    loadTeacherInbox();
                }

                @Override
                public void onError(String code, String message) {
                    grade.setEnabled(true);
                    result.setText(message);
                    if ("TEACHER_ACCESS_DENIED".equals(code)) {
                        teacherAccessCode = "";
                        promptTeacherAccessCode();
                    }
                }
            });
        });
        addDivider();
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
        return addInput(hint, password, true);
    }

    private EditText addInput(String hint, boolean password, boolean singleLine) {
        EditText input = new EditText(this);
        input.setSingleLine(singleLine);
        input.setHint(hint);
        input.setInputType(password
                ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_CLASS_TEXT | (singleLine ? 0 : InputType.TYPE_TEXT_FLAG_MULTI_LINE));
        if (!singleLine && !password) input.setMinLines(3);
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
