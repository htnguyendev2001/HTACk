# HTVA Ck

HTVA Ck là ứng dụng Android hỗ trợ tổ chức bài kiểm tra, học sinh làm bài và nộp bài, giáo viên nhận bài và chấm điểm.

- **Android application ID:** `com.htanh.appck`
- **Nền tảng Android:** Native Java + XML
- **Lớp xử lý trung gian:** Google Apps Script Web App
- **Cơ sở dữ liệu:** Firebase Realtime Database
- **Firebase Authentication:** Không sử dụng
- **Dự án Backend riêng:** Không có; Google Apps Script là lớp xử lý server-side được phê duyệt.

HTAVk là ứng dụng riêng biệt (`com.htanh.appvk`). Không tự ý tích hợp hoặc dùng chung dữ liệu với HTAVk.

## Luồng hệ thống đã phê duyệt

```
HTVA Ck Android -> Google Apps Script -> Firebase Realtime Database
```

Android chỉ gọi Apps Script qua HTTPS. Android không được truy cập Firebase trực tiếp và không chứa service-account key, Firebase Admin credential, database secret hay password pepper. Apps Script xác thực tài khoản HTVA, phát hành session ngắn hạn, kiểm tra vai trò/quyền sở hữu và thao tác Firebase bằng service-account token được tạo server-side.

## Chức năng trong milestone hiện tại

- Đăng nhập tài khoản HTVA với vai trò `student` hoặc `teacher`.
- Học sinh xem bài kiểm tra đã xuất bản, làm câu hỏi trắc nghiệm/tự luận và nộp bài.
- Học sinh xem lịch sử nộp bài, trạng thái chấm, điểm và nhận xét.
- Giáo viên xem bài nộp thuộc bài kiểm tra được phân công và lưu điểm/nhận xét.
- Server gắn bài nộp với UID từ session; không tin UID do Android gửi lên.
- Retry cùng `attemptId` không tạo bản ghi trùng; giới hạn số lượt theo `maxAttempts`.

Đây là milestone nền tảng. Chưa có giao diện tạo đề/ quản lý tài khoản, hàng đợi nộp offline bền vững, đính kèm tệp, khôi phục tài khoản hoặc kiểm thử tải production.

## Android build

Yêu cầu cấu hình URL Web App của Google Apps Script trong Gradle property cục bộ:

```properties
HTVA_API_BASE_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Có thể đặt trong `~/.gradle/gradle.properties` trên máy build. Không commit URL môi trường thật vào repository.

Build:

```bash
./gradlew :app:assembleDebug
```

Unit tests:

```bash
./gradlew :app:test
```

## Cấu hình Google Apps Script và Firebase

Xem [HTVA Exam Backend Architecture](docs/architecture/HTVA_EXAM_BACKEND_ARCHITECTURE.md) và mã tại `backend/apps-script/`.

Các Script Properties bắt buộc:
- `FIREBASE_DATABASE_URL`: URL Realtime Database.
- `HTVA_PASSWORD_PEPPER`: chuỗi ngẫu nhiên bí mật tối thiểu 32 ký tự.
- `FIREBASE_SERVICE_ACCOUNT_EMAIL`: email service account.
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key PEM của service account.

Các giá trị trên chỉ lưu trong Script Properties, tuyệt đối không commit. Service account phải có quyền IAM Realtime Database phù hợp. Apps Script dùng JWT để lấy OAuth2 access token server-side; Firebase Rules phải chặn truy cập trực tiếp từ client. Tham khảo tài liệu xác thực REST chính thức của Firebase và kiểm tra kết nối thực tế trước khi triển khai cho học sinh.

## Tài khoản và đề kiểm tra

Tạo tài khoản bằng hàm `provisionAccount(username, password, role, displayName)` trong Apps Script editor. Vai trò chỉ nhận `student` hoặc `teacher`.

Tạo đề bằng `provisionExam(examId, title, description, teacherUidsJson, questionsJson, startAtMs, endAtMs, maxAttempts)`. `teacherUidsJson` và `questionsJson` là JSON array; thời gian là Unix epoch milliseconds (0 nếu không giới hạn). UID giáo viên được lấy từ kết quả `provisionAccount`.

Ví dụ cấu trúc câu hỏi:

```json
[
  {
    "questionId": "q1",
    "prompt": "Thủ đô của Việt Nam là gì?",
    "options": [
      {"label": "Hà Nội", "value": "hanoi"},
      {"label": "Huế", "value": "hue"}
    ]
  },
  {
    "questionId": "q2",
    "prompt": "Giải thích ngắn gọn...",
    "type": "essay"
  }
]
```

Nếu không có `options`, ứng dụng hiển thị ô nhập câu trả lời tự luận. Chấm điểm hiện là thủ công.

## Engineering baseline

- Android Gradle Plugin 7.2.2, Gradle wrapper 7.3.3.
- compileSdk 32, minSdk 21, targetSdk 32.
- Java 8, XML layouts, Gradle Groovy DSL.
- Giữ nguyên applicationId `com.htanh.appck`; không đổi nhầm thành applicationId của HTAVk.

Không tuyên bố build/test thành công nếu chưa chạy và quan sát kết quả thực tế.
