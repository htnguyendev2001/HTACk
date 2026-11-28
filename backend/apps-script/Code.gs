/**
 * HTVA Ck API — anonymous shared-data mode.
 * Android -> Google Apps Script -> Firebase Realtime Database.
 * No end-user accounts or login sessions. Teacher grading is protected by a server-side access code.
 */
const DB_ROOT = "HTVAData";
const MAX_SUBMISSIONS_PER_DEVICE_PER_WINDOW = 20;
const SUBMISSION_RATE_WINDOW_SECONDS = 900;

function doPost(e) {
  try {
    const rawBody = (e && e.postData && e.postData.contents) || "{}";
    if (rawBody.length > 200000) throw apiError_("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên vượt quá giới hạn.");
    const request = JSON.parse(rawBody);
    const action = String(request.action || "");
    const payload = request.payload || {};
    if (action === "health") return json_({ ok: true, data: { service: "htva-api", status: "ok" } });

    const deviceId = normalizeDeviceId_(request.deviceId);
    let data;
    switch (action) {
      case "listExams":
        data = listExams_();
        break;
      case "submitAttempt":
        data = submitAttempt_(deviceId, payload);
        break;
      case "myHistory":
        data = myHistory_(deviceId);
        break;
      case "teacherSubmissions":
        requireTeacherCode_(payload, deviceId);
        data = teacherSubmissions_();
        break;
      case "gradeSubmission":
        requireTeacherCode_(payload, deviceId);
        data = gradeSubmission_(payload, deviceId);
        break;
      default:
        throw apiError_("UNKNOWN_ACTION", "Yêu cầu không được hỗ trợ.");
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    const known = err && err.apiCode;
    return json_({
      ok: false,
      error: {
        code: known || "INTERNAL_ERROR",
        message: known ? err.message : "Không thể xử lý yêu cầu. Vui lòng thử lại."
      }
    });
  }
}

function listExams_() {
  const all = dbGet_("exams") || {};
  const items = Object.keys(all).map(function(id) {
    const exam = all[id] || {};
    if (exam.status !== "published") return null;
    return Object.assign({ examId: id }, sanitizeExamForStudent_(exam));
  }).filter(Boolean);
  return { items: items };
}

function sanitizeExamForStudent_(exam) {
  const safeExam = JSON.parse(JSON.stringify(exam));
  stripSensitiveExamFields_(safeExam);
  return safeExam;
}

function stripSensitiveExamFields_(value) {
  const blocked = {
    answer: true, correct: true, iscorrect: true, correctanswer: true,
    answerkey: true, expectedanswer: true, solution: true, solutions: true,
    explanation: true, gradingrubric: true, correctanswers: true, teacherids: true
  };
  if (Array.isArray(value)) {
    value.forEach(stripSensitiveExamFields_);
  } else if (value && typeof value === "object") {
    Object.keys(value).forEach(function(key) {
      if (blocked[key.toLowerCase()]) delete value[key];
      else stripSensitiveExamFields_(value[key]);
    });
  }
}

function submitAttempt_(deviceId, payload) {
  enforceSubmissionRateLimit_(deviceId);
  const examId = safeId_(payload.examId, "examId");
  const attemptId = safeId_(payload.attemptId, "attemptId");
  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    throw apiError_("INVALID_PAYLOAD", "Câu trả lời không hợp lệ.");
  }
  const exam = dbGet_("exams/" + examId);
  if (!exam || exam.status !== "published") throw apiError_("EXAM_NOT_AVAILABLE", "Bài kiểm tra không khả dụng.");
  const now = Date.now();
  if (exam.startAt && now < Number(exam.startAt)) throw apiError_("EXAM_NOT_STARTED", "Bài kiểm tra chưa bắt đầu.");
  if (exam.endAt && now > Number(exam.endAt)) throw apiError_("EXAM_CLOSED", "Bài kiểm tra đã kết thúc.");

  const questionIds = {};
  (exam.questions || []).forEach(function(question) { questionIds[String(question.questionId)] = true; });
  const answerIds = Object.keys(payload.answers);
  if (answerIds.length === 0 || answerIds.length > Object.keys(questionIds).length ||
      answerIds.some(function(id) { return !questionIds[id]; }) ||
      JSON.stringify(payload.answers).length > 50000 ||
      answerIds.some(function(id) {
        const value = payload.answers[id];
        return typeof value !== "string" || value.length > 5000;
      })) {
    throw apiError_("INVALID_ANSWERS", "Câu trả lời không hợp lệ hoặc vượt quá giới hạn.");
  }

  const path = "submissions/" + deviceId + "/" + attemptId;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let result;
  try {
    const existing = dbGet_(path);
    if (existing) {
      if (existing.examId !== examId) throw apiError_("ATTEMPT_CONFLICT", "Mã lượt làm bài đã được sử dụng.");
      return { attemptId: attemptId, status: existing.status || "pending", duplicate: true };
    }
    const previous = dbGet_("submissions/" + deviceId) || {};
    const maxAttempts = Math.max(1, Number(exam.maxAttempts || 1));
    const usedAttempts = Object.keys(previous).filter(function(id) {
      return previous[id] && previous[id].examId === examId;
    }).length;
    if (usedAttempts >= maxAttempts) throw apiError_("ATTEMPT_LIMIT", "Bạn đã sử dụng hết số lượt làm bài.");
    const submission = {
      deviceId: deviceId,
      examId: examId,
      examTitle: exam.title || examId,
      attemptId: attemptId,
      answers: payload.answers,
      submittedAt: now,
      status: "pending",
      score: null,
      feedback: "",
      gradedAt: null
    };
    dbPut_(path, submission);
    result = { attemptId: attemptId, status: "pending", duplicate: false };
  } finally {
    lock.releaseLock();
  }
  audit_(deviceId, "submit_attempt", attemptId);
  return result;
}

function myHistory_(deviceId) {
  const items = dbGet_("submissions/" + deviceId) || {};
  const history = Object.keys(items).map(function(id) {
    const item = items[id] || {};
    return {
      attemptId: id,
      examId: item.examId,
      examTitle: item.examTitle || item.examId,
      submittedAt: item.submittedAt,
      status: item.status,
      score: item.score,
      feedback: item.feedback || ""
    };
  }).sort(function(a, b) {
    return Number(b.submittedAt || 0) - Number(a.submittedAt || 0);
  }).slice(0, 100);
  return { items: history };
}

function teacherSubmissions_() {
  const all = dbGet_("submissions") || {};
  const exams = dbGet_("exams") || {};
  const result = [];
  Object.keys(all).forEach(function(deviceId) {
    const submissions = all[deviceId] || {};
    Object.keys(submissions).forEach(function(attemptId) {
      const item = submissions[attemptId] || {};
      const exam = exams[item.examId] || {};
      result.push({
        studentUid: deviceId,
        studentName: "Thiết bị " + deviceId.slice(0, 8),
        attemptId: attemptId,
        examId: item.examId,
        examTitle: item.examTitle || exam.title || item.examId,
        submittedAt: item.submittedAt,
        status: item.status,
        score: item.score,
        answers: item.answers || {},
        questions: exam.questions || []
      });
    });
  });
  result.sort(function(a, b) {
    return Number(b.submittedAt || 0) - Number(a.submittedAt || 0);
  });
  return { items: result.slice(0, 200) };
}

function gradeSubmission_(payload, teacherDeviceId) {
  const deviceId = normalizeDeviceId_(payload.studentUid);
  const attemptId = safeId_(payload.attemptId, "attemptId");
  const score = Number(payload.score);
  const feedback = String(payload.feedback || "").slice(0, 4000);
  if (!isFinite(score) || score < 0 || score > 100) {
    throw apiError_("INVALID_SCORE", "Điểm phải nằm trong khoảng 0 đến 100.");
  }
  const path = "submissions/" + deviceId + "/" + attemptId;
  const submission = dbGet_(path);
  if (!submission) throw apiError_("NOT_FOUND", "Không tìm thấy bài nộp.");
  submission.status = "graded";
  submission.score = score;
  submission.feedback = feedback;
  submission.gradedByDeviceId = teacherDeviceId;
  submission.gradedAt = Date.now();
  dbPut_(path, submission);
  audit_(teacherDeviceId, "grade_submission", attemptId);
  return { attemptId: attemptId, status: "graded", score: score };
}

function provisionExam(examId, title, description, questionsJson, startAtMs, endAtMs, maxAttempts) {
  const id = safeId_(examId, "examId");
  const questions = JSON.parse(questionsJson || "[]");
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 100) {
    throw new Error("An exam needs between 1 and 100 questions.");
  }
  const maxAttemptCount = Number(maxAttempts || 1);
  const startTime = Number(startAtMs || 0);
  const endTime = Number(endAtMs || 0);
  if (!isFinite(maxAttemptCount) || Math.floor(maxAttemptCount) !== maxAttemptCount ||
      maxAttemptCount < 1 || maxAttemptCount > 10) {
    throw new Error("maxAttempts must be an integer from 1 to 10.");
  }
  if (!isFinite(startTime) || !isFinite(endTime) ||
      (startTime > 0 && endTime > 0 && endTime <= startTime)) {
    throw new Error("Invalid exam start/end time.");
  }
  const seenQuestionIds = {};
  questions.forEach(function(question, index) {
    if (!question.questionId || !/^[A-Za-z0-9_-]{1,80}$/.test(String(question.questionId)) ||
        !question.prompt || String(question.prompt).length > 5000) {
      throw new Error("Question " + index + " needs a valid questionId and prompt.");
    }
    if (seenQuestionIds[question.questionId]) throw new Error("Duplicate questionId: " + question.questionId);
    seenQuestionIds[question.questionId] = true;
    if (question.options && (!Array.isArray(question.options) || question.options.length > 20)) {
      throw new Error("Question options must be an array with at most 20 items.");
    }
  });
  const exam = {
    title: String(title || "").slice(0, 200),
    description: String(description || "").slice(0, 2000),
    questions: questions,
    startAt: startTime,
    endAt: endTime,
    maxAttempts: maxAttemptCount,
    status: "published",
    updatedAt: Date.now()
  };
  if (!exam.title) throw new Error("Exam title is required.");
  dbPut_("exams/" + id, exam);
  return { examId: id, status: exam.status };
}

function normalizeDeviceId_(value) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
    throw apiError_("INVALID_DEVICE_ID", "Mã thiết bị không hợp lệ. Hãy khởi động lại ứng dụng.");
  }
  return id;
}

function enforceSubmissionRateLimit_(deviceId) {
  const cache = CacheService.getScriptCache();
  const key = "submit:" + deviceId;
  const lock = LockService.getScriptLock();
  lock.waitLock(3000);
  try {
    const count = Number(cache.get(key) || 0);
    if (count >= MAX_SUBMISSIONS_PER_DEVICE_PER_WINDOW) {
      throw apiError_("RATE_LIMITED", "Thiết bị đã gửi quá nhiều bài. Vui lòng thử lại sau.");
    }
    cache.put(key, String(count + 1), SUBMISSION_RATE_WINDOW_SECONDS);
  } finally {
    lock.releaseLock();
  }
}

function requireTeacherCode_(payload, deviceId) {
  const expected = PropertiesService.getScriptProperties().getProperty("HTVA_TEACHER_ACCESS_CODE");
  const supplied = String(payload.accessCode || "");
  if (!expected || expected.length < 8) {
    throw apiError_("TEACHER_NOT_CONFIGURED", "Chưa cấu hình mã truy cập giáo viên trên máy chủ.");
  }
  const cache = CacheService.getScriptCache();
  const failureKey = "teacherfail:" + deviceId;
  const failures = Number(cache.get(failureKey) || 0);
  if (failures >= 8) {
    throw apiError_("RATE_LIMITED", "Bạn đã nhập sai mã giáo viên quá nhiều lần. Vui lòng thử lại sau.");
  }
  let diff = supplied.length ^ expected.length;
  const length = Math.max(supplied.length, expected.length);
  for (let i = 0; i < length; i++) {
    diff |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  if (diff !== 0) {
    cache.put(failureKey, String(failures + 1), 900);
    throw apiError_("TEACHER_ACCESS_DENIED", "Mã truy cập giáo viên không đúng.");
  }
  cache.remove(failureKey);
}

function safeId_(value, field) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    throw apiError_("INVALID_" + field.toUpperCase(), "Mã dữ liệu không hợp lệ.");
  }
  return id;
}

function audit_(deviceId, action, targetId) {
  const id = Utilities.getUuid().replace(/-/g, "");
  dbPut_("audit/" + id, {
    deviceId: deviceId,
    action: action,
    targetId: String(targetId || ""),
    at: Date.now()
  });
}

function dbGet_(path) {
  return firebaseRequest_(path, "get");
}

function dbPut_(path, value) {
  return firebaseRequest_(path, "put", value);
}

function getFirebaseAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("firebase:oauth");
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const serviceEmail = props.getProperty("FIREBASE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = String(props.getProperty("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY") || "")
      .replace(/\\n/g, "\n");
  if (!serviceEmail || !privateKey) {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY Script Properties.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url_(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url_(JSON.stringify({
    iss: serviceEmail,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsignedJwt = header + "." + claims;
  const signature = Utilities.computeRsaSha256Signature(unsignedJwt, privateKey);
  const assertion = unsignedJwt + "." + base64Url_(signature);
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error("Unable to obtain Firebase service token.");
  }
  const tokenData = JSON.parse(response.getContentText());
  if (!tokenData.access_token) throw new Error("Firebase OAuth response did not contain an access token.");
  cache.put("firebase:oauth", tokenData.access_token, 3300);
  return tokenData.access_token;
}

function base64Url_(value) {
  return Utilities.base64EncodeWebSafe(value).replace(/=+$/g, "");
}

function firebaseRequest_(path, method, value) {
  return firebaseRequestAtRoot_(DB_ROOT, path, method, value);
}

function firebaseRequestAtRoot_(root, path, method, value) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = props.getProperty("FIREBASE_DATABASE_URL");
  if (!baseUrl) throw new Error("Missing FIREBASE_DATABASE_URL Script Property.");
  const token = getFirebaseAccessToken_();
  const cleanPath = path ? "/" + path : "";
  const url = baseUrl.replace(/\/$/, "") + "/" + root + cleanPath + ".json";
  const options = {
    method: method,
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { Accept: "application/json", Authorization: "Bearer " + token }
  };
  if (method === "put") options.payload = JSON.stringify(value);
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error("Firebase request failed with HTTP " + status);
  const text = response.getContentText();
  return text ? JSON.parse(text) : null;
}

/**
 * One-time, non-destructive migration from the previous /htva root.
 * Copies only exams, submissions and audit records; leaves legacy data untouched.
 * Run manually only after confirming the destination /HTVAData is empty.
 */
function migrateLegacyHtvaDataToHTVAData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const legacy = firebaseRequestAtRoot_("htva", "", "get");
    if (!legacy || typeof legacy !== "object") return { migrated: false, reason: "NO_LEGACY_DATA" };
    const current = firebaseRequestAtRoot_(DB_ROOT, "", "get");
    if (current && Object.keys(current).length > 0) {
      throw new Error("HTVAData is not empty; migration stopped to prevent overwriting data.");
    }
    const shared = {};
    if (legacy.exams) shared.exams = legacy.exams;
    if (legacy.submissions) shared.submissions = legacy.submissions;
    if (legacy.audit) shared.audit = legacy.audit;
    if (Object.keys(shared).length === 0) return { migrated: false, reason: "NO_SUPPORTED_DATA" };
    firebaseRequestAtRoot_(DB_ROOT, "", "put", shared);
    return { migrated: true, migratedSections: Object.keys(shared), legacyPreserved: true };
  } finally {
    lock.releaseLock();
  }
}

function testFirebaseConnection() {
  const token = getFirebaseAccessToken_();
  const value = dbGet_("meta/connectionTest");
  return { ok: true, tokenObtained: !!token, root: DB_ROOT, connectionTestValue: value };
}

function apiError_(code, message) {
  const error = new Error(message);
  error.apiCode = code;
  return error;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
      .setMimeType(ContentService.MimeType.JSON);
}
