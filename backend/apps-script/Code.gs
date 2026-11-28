/**
 * HTVA Ck API — Google Apps Script Web App
 * Android -> Apps Script -> Firebase Realtime Database.
 * No Firebase Authentication. Never expose this script's OAuth token to clients.
 */

const SESSION_TTL_SECONDS = 21600;
const PBKDF2_ITERATIONS = 120000;
const DB_ROOT = "htva";

function doPost(e) {
  try {
    const rawBody = (e && e.postData && e.postData.contents) || "{}";
    if (rawBody.length > 200000) throw apiError_("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên vượt quá giới hạn.");
    const request = JSON.parse(rawBody);
    const action = String(request.action || "");
    const payload = request.payload || {};
    if (action === "login") return json_(login_(payload));
    if (action === "health") return json_({ ok: true, data: { service: "htva-api", status: "ok" } });

    const actor = requireSession_(request.token);
    let data;
    switch (action) {
      case "logout":
        CacheService.getScriptCache().remove("session:" + request.token);
        data = { loggedOut: true };
        break;
      case "listExams":
        data = listExams_(actor);
        break;
      case "submitAttempt":
        data = submitAttempt_(actor, payload);
        break;
      case "myHistory":
        data = myHistory_(actor);
        break;
      case "teacherSubmissions":
        data = teacherSubmissions_(actor, payload);
        break;
      case "gradeSubmission":
        data = gradeSubmission_(actor, payload);
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

function login_(payload) {
  const username = normalizeUsername_(payload.username);
  const password = String(payload.password || "");
  if (!username || password.length < 1 || password.length > 256) {
    throw apiError_("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không hợp lệ.");
  }
  enforceLoginRateLimit_(username);
  const user = dbGet_("users/byUsername/" + username);
  if (!user || user.active !== true || !verifyPassword_(password, user.passwordSalt, user.passwordHash)) {
    throw apiError_("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng.");
  }
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  CacheService.getScriptCache().remove("loginfail:" + username);
  const sessionUser = { uid: user.uid, role: user.role, displayName: user.displayName || "" };
  CacheService.getScriptCache().put("session:" + token, JSON.stringify(sessionUser), SESSION_TTL_SECONDS);
  audit_(sessionUser.uid, "login", user.uid);
  return { ok: true, data: { token: token, expiresIn: SESSION_TTL_SECONDS, user: sessionUser } };
}

function requireSession_(token) {
  if (!token || String(token).length < 32) throw apiError_("UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.");
  const raw = CacheService.getScriptCache().get("session:" + token);
  if (!raw) throw apiError_("SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  return JSON.parse(raw);
}

function sanitizeExamForStudent_(exam) {
  const safeExam = JSON.parse(JSON.stringify(exam));
  stripSensitiveExamFields_(safeExam);
  return safeExam;
}

function stripSensitiveExamFields_(value) {
  const blocked = {
    answer: true,
    correct: true,
    iscorrect: true,
    correctanswer: true,
    answerkey: true,
    expectedanswer: true,
    solution: true,
    solutions: true,
    explanation: true,
    gradingrubric: true,
    correctanswers: true,
    teacherids: true
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

function listExams_(actor) {
  const all = dbGet_("exams") || {};
  const items = Object.keys(all).map(function(id) {
    const exam = all[id] || {};
    if (exam.status !== "published") return null;
    if (actor.role === "teacher" && (exam.teacherIds || []).indexOf(actor.uid) < 0) return null;
    const visibleExam = actor.role === "student" ? sanitizeExamForStudent_(exam) : exam;
    return Object.assign({ examId: id }, visibleExam);
  }).filter(Boolean);
  return { items: items };
}

function submitAttempt_(actor, payload) {
  requireRole_(actor, "student");
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

  const path = "submissions/" + actor.uid + "/" + attemptId;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let result;
  try {
    const existing = dbGet_(path);
    if (existing) {
      if (existing.examId !== examId) throw apiError_("ATTEMPT_CONFLICT", "Mã lượt làm bài đã được sử dụng.");
      return { attemptId: attemptId, status: existing.status || "submitted", duplicate: true };
    }
    const previous = dbGet_("submissions/" + actor.uid) || {};
    const maxAttempts = Math.max(1, Number(exam.maxAttempts || 1));
    const usedAttempts = Object.keys(previous).filter(function(id) {
      return previous[id] && previous[id].examId === examId;
    }).length;
    if (usedAttempts >= maxAttempts) throw apiError_("ATTEMPT_LIMIT", "Bạn đã sử dụng hết số lượt làm bài.");
    const submission = {
      uid: actor.uid, examId: examId, attemptId: attemptId,
      answers: payload.answers, submittedAt: now,
      status: "pending", score: null, feedback: "", gradedBy: null, gradedAt: null
    };
    dbPut_(path, submission);
    result = { attemptId: attemptId, status: "pending", duplicate: false };
  } finally {
    lock.releaseLock();
  }
  audit_(actor.uid, "submit_attempt", attemptId);
  return result;
}

function myHistory_(actor) {
  requireRole_(actor, "student");
  const items = dbGet_("submissions/" + actor.uid) || {};
  const history = Object.keys(items).map(function(id) {
    const item = items[id] || {};
    return {
      attemptId: id, examId: item.examId, submittedAt: item.submittedAt,
      status: item.status, score: item.score, feedback: item.feedback || ""
    };
  }).sort(function(a, b) { return Number(b.submittedAt || 0) - Number(a.submittedAt || 0); }).slice(0, 100);
  return { items: history };
}

function teacherSubmissions_(actor, payload) {
  requireRole_(actor, "teacher");
  const examId = payload.examId ? safeId_(payload.examId, "examId") : "";
  const exams = dbGet_("exams") || {};
  const allowed = {};
  Object.keys(exams).forEach(function(id) {
    if ((!examId || id === examId) && (exams[id].teacherIds || []).indexOf(actor.uid) >= 0) allowed[id] = true;
  });
  const users = dbGet_("users") || {};
  const result = [];
  Object.keys(users).forEach(function(uid) {
    if (uid === "byUsername") return;
    const submissions = dbGet_("submissions/" + uid) || {};
    Object.keys(submissions).forEach(function(attemptId) {
      const item = submissions[attemptId] || {};
      if (allowed[item.examId]) {
        result.push({
          studentUid: uid, studentName: users[uid].displayName || "",
          attemptId: attemptId, examId: item.examId,
          submittedAt: item.submittedAt, status: item.status,
          score: item.score, answers: item.answers,
          questions: exams[item.examId].questions || []
        });
      }
    });
  });
  result.sort(function(a, b) { return Number(b.submittedAt || 0) - Number(a.submittedAt || 0); });
  return { items: result.slice(0, 100) };
}

function gradeSubmission_(actor, payload) {
  requireRole_(actor, "teacher");
  const studentUid = safeId_(payload.studentUid, "studentUid");
  const attemptId = safeId_(payload.attemptId, "attemptId");
  const score = Number(payload.score);
  const feedback = String(payload.feedback || "").slice(0, 4000);
  if (!isFinite(score) || score < 0 || score > 100) throw apiError_("INVALID_SCORE", "Điểm phải nằm trong khoảng 0 đến 100.");
  const path = "submissions/" + studentUid + "/" + attemptId;
  const submission = dbGet_(path);
  if (!submission) throw apiError_("NOT_FOUND", "Không tìm thấy bài nộp.");
  const exam = dbGet_("exams/" + submission.examId);
  if (!exam || (exam.teacherIds || []).indexOf(actor.uid) < 0) {
    throw apiError_("FORBIDDEN", "Bạn không được phân công chấm bài này.");
  }
  submission.status = "graded";
  submission.score = score;
  submission.feedback = feedback;
  submission.gradedBy = actor.uid;
  submission.gradedAt = Date.now();
  dbPut_(path, submission);
  audit_(actor.uid, "grade_submission", attemptId);
  return { attemptId: attemptId, status: "graded", score: score };
}

function provisionAccount(username, password, role, displayName) {
  const normalized = normalizeUsername_(username);
  if (!normalized || !password || String(password).length < 12) {
    throw new Error("Username required; password must be at least 12 characters.");
  }
  if (role !== "student" && role !== "teacher") throw new Error("Role must be student or teacher.");
  const indexPath = "users/byUsername/" + normalized;
  if (dbGet_(indexPath)) throw new Error("Username already exists.");
  const uid = Utilities.getUuid().replace(/-/g, "");
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const user = {
    uid: uid, username: normalized, displayName: String(displayName || "").slice(0, 120),
    role: role, active: true, passwordSalt: salt, passwordHash: passwordHash_(password, salt),
    createdAt: Date.now()
  };
  dbPut_("users/" + uid, user);
  dbPut_(indexPath, user);
  return { uid: uid, username: normalized, role: role };
}

/**
 * Run manually in the Apps Script editor to create/update an exam.
 * teacherUidsJson and questionsJson must be valid JSON arrays.
 * startAtMs/endAtMs are Unix epoch milliseconds; pass 0 for no boundary.
 */
function provisionExam(examId, title, description, teacherUidsJson, questionsJson, startAtMs, endAtMs, maxAttempts) {
  const id = safeId_(examId, "examId");
  const teacherIds = JSON.parse(teacherUidsJson || "[]");
  const questions = JSON.parse(questionsJson || "[]");
  if (!Array.isArray(teacherIds) || teacherIds.length === 0) throw new Error("Assign at least one teacher UID.");
  if (!Array.isArray(questions) || questions.length === 0) throw new Error("An exam needs at least one question.");
  teacherIds.forEach(function(uid) {
    const teacher = dbGet_("users/" + safeId_(uid, "teacherUid"));
    if (!teacher || teacher.role !== "teacher" || teacher.active !== true) throw new Error("Invalid or inactive teacher UID: " + uid);
  });
  questions.forEach(function(question, index) {
    if (!question.questionId || !question.prompt) throw new Error("Question " + index + " needs questionId and prompt.");
  });
  const exam = {
    title: String(title || "").slice(0, 200),
    description: String(description || "").slice(0, 2000),
    teacherIds: teacherIds,
    questions: questions,
    startAt: Number(startAtMs || 0),
    endAt: Number(endAtMs || 0),
    maxAttempts: Math.max(1, Number(maxAttempts || 1)),
    status: "published",
    updatedAt: Date.now()
  };
  if (!exam.title) throw new Error("Exam title is required.");
  dbPut_("exams/" + id, exam);
  return { examId: id, status: exam.status, teacherIds: teacherIds };
}

function disableAccount(username) {
  const normalized = normalizeUsername_(username);
  const user = dbGet_("users/byUsername/" + normalized);
  if (!user) throw new Error("Account not found.");
  user.active = false;
  dbPut_("users/" + user.uid, user);
  dbPut_("users/byUsername/" + normalized, user);
  return { uid: user.uid, active: false };
}

function passwordHash_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty("HTVA_PASSWORD_PEPPER");
  if (!pepper || pepper.length < 32) throw new Error("Set a random HTVA_PASSWORD_PEPPER Script Property (at least 32 characters).");
  const key = Utilities.newBlob(String(password) + pepper).getBytes();
  const saltBytes = Utilities.newBlob(String(salt)).getBytes();
  let block = saltBytes.concat([0, 0, 0, 1]);
  let u = Utilities.computeHmacSha256Signature(block, key);
  let t = u.slice();
  for (let i = 1; i < PBKDF2_ITERATIONS; i++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (let j = 0; j < t.length; j++) t[j] = (t[j] ^ u[j]);
  }
  return bytesToHex_(t);
}

function verifyPassword_(password, salt, expected) {
  if (!salt || !expected) return false;
  const actual = passwordHash_(password, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function enforceLoginRateLimit_(username) {
  const cache = CacheService.getScriptCache();
  const key = "loginfail:" + username;
  const lock = LockService.getScriptLock();
  lock.waitLock(3000);
  try {
    const count = Number(cache.get(key) || 0);
    if (count >= 8) throw apiError_("RATE_LIMITED", "Bạn đăng nhập quá nhiều lần. Hãy thử lại sau.");
    cache.put(key, String(count + 1), 900);
  } finally {
    lock.releaseLock();
  }
}

function normalizeUsername_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
}

function safeId_(value, field) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw apiError_("INVALID_" + field.toUpperCase(), "Mã dữ liệu không hợp lệ.");
  return id;
}

function requireRole_(actor, role) {
  if (actor.role !== role) throw apiError_("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
}

function audit_(uid, action, targetId) {
  const id = Utilities.getUuid().replace(/-/g, "");
  dbPut_("audit/" + id, { uid: uid, action: action, targetId: String(targetId || ""), at: Date.now() });
}

function dbGet_(path) { return firebaseRequest_(path, "get"); }
function dbPut_(path, value) { return firebaseRequest_(path, "put", value); }

function getFirebaseAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("firebase:oauth");
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const serviceEmail = props.getProperty("FIREBASE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = String(props.getProperty("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
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
  const props = PropertiesService.getScriptProperties();
  const baseUrl = props.getProperty("FIREBASE_DATABASE_URL");
  if (!baseUrl) throw new Error("Missing FIREBASE_DATABASE_URL Script Property.");
  const token = getFirebaseAccessToken_();
  const url = baseUrl.replace(/\/$/, "") + "/" + DB_ROOT + "/" + path + ".json";
  const options = {
    method: method, contentType: "application/json", muteHttpExceptions: true,
    headers: { Accept: "application/json", Authorization: "Bearer " + token }
  };
  if (method === "put") options.payload = JSON.stringify(value);
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error("Firebase request failed with HTTP " + status);
  const text = response.getContentText();
  return text ? JSON.parse(text) : null;
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

function bytesToHex_(bytes) {
  return bytes.map(function(b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
}
