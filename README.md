# HTVA Ck

HTVA Ck là ứng dụng Android hỗ trợ tổ chức bài kiểm tra, học sinh làm bài và nộp bài, giáo viên nhận bài và chấm điểm.

- **Android application ID:** `com.htanh.appck`
- **Nền tảng Android:** Native Java + XML
- **Lớp xử lý trung gian:** Google Apps Script Web App
- **Cơ sở dữ liệu:** Firebase Realtime Database
- **Đăng nhập người dùng:** Không yêu cầu tài khoản, username, password hoặc session.
- **Vùng dữ liệu:** Tất cả dữ liệu ứng dụng nằm dưới `HTVAData/` trong Firebase.

HTAVk là ứng dụng riêng biệt (`com.htanh.appvk`). Không tự ý tích hợp hoặc dùng chung dữ liệu với HTAVk.

## Luồng hệ thống

```
HTVA Ck Android -> Google Apps Script -> Firebase Realtime Database/HTVAData
```

Android gọi Apps Script qua HTTPS. Android không truy cập Firebase trực tiếp và không chứa service-account key, Firebase Admin credential, database secret hay access token đặc quyền.

## Hành vi không cần đăng nhập

- Mở ứng dụng là vào thẳng màn hình chính.
- Tất cả thiết bị xem cùng danh sách bài kiểm tra và dữ liệu bài nộp.
- Mỗi lần cài đặt tạo một mã thiết bị ngẫu nhiên lưu cục bộ để phân biệt lịch sử nộp bài trên thiết bị đó; mã này không phải tài khoản và không phải cơ chế xác thực bảo mật.
- Giáo viên mở khu vực chấm bài bằng mã truy cập chung. Mã được lưu trong Apps Script Script Properties với tên `HTVA_TEACHER_ACCESS_CODE`; không lưu trong source code hoặc APK.
- Không có đăng ký, đăng nhập, đăng xuất, user session, mật khẩu học sinh/giáo viên hay Firebase Authentication.

**Lưu ý:** Vì học sinh không đăng nhập, lịch sử của học sinh được gắn với mã cài đặt trên thiết bị. Cài lại ứng dụng hoặc chuyển sang thiết bị khác sẽ tạo mã mới và không tự khôi phục lịch sử cũ. Bài nộp vẫn nằm trong kho dữ liệu chung và giáo viên có thể xem trên mọi thiết bị.

Mã giáo viên chỉ bảo vệ thao tác xem/chấm bài ở mức cơ bản; endpoint vẫn công khai và mã có thể bị chia sẻ. Mã thiết bị không phải danh tính xác thực và có thể bị giả mạo. Không dùng mô hình này cho dữ liệu nhạy cảm hoặc kỳ thi cần định danh/chống gian lận nghiêm ngặt.

## Chức năng

- Học sinh xem bài kiểm tra đã xuất bản, làm câu hỏi trắc nghiệm/tự luận và nộp bài.
- Học sinh xem lịch sử nộp bài trên thiết bị hiện tại, trạng thái chấm, điểm và nhận xét.
- Giáo viên xem bài nộp từ tất cả thiết bị và lưu điểm/nhận xét sau khi nhập mã giáo viên.
- Retry cùng `attemptId` không tạo bản ghi trùng; server kiểm tra giới hạn lượt làm bài theo từng mã thiết bị.
- Nội dung đề gửi tới học sinh được lọc các trường đáp án/đáp án đúng/giải thích nội bộ.

Đây là milestone nền tảng. Chưa có hàng đợi nộp offline bền vững, giao diện tạo đề, đính kèm tệp, chống gian lận hoặc kiểm thử tải production.

## Android build

Cấu hình URL Web App của Google Apps Script trong Gradle property cục bộ:

```properties
HTVA_API_BASE_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Có thể đặt trong `~/.gradle/gradle.properties` trên máy build. Không commit URL môi trường thật nếu không cần thiết.

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

Script Properties bắt buộc:
- `FIREBASE_DATABASE_URL`: URL Realtime Database.
- `FIREBASE_SERVICE_ACCOUNT_EMAIL`: email service account.
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key PEM của service account.
- `HTVA_TEACHER_ACCESS_CODE`: mã giáo viên ngẫu nhiên, tối thiểu 8 ký tự.

Các giá trị trên chỉ lưu trong Script Properties, tuyệt đối không commit. Service account phải có quyền IAM Realtime Database phù hợp. Apps Script dùng JWT để lấy OAuth2 access token server-side; Firebase Rules tiếp tục chặn truy cập trực tiếp từ client. Chạy `testFirebaseConnection()` trong Apps Script editor để kiểm tra kết nối.

### Dữ liệu cũ

Phiên bản trước sử dụng root `htva/`. Nếu Firebase đã có dữ liệu ở root cũ, hãy cấu hình Service Account và chạy thủ công `migrateLegacyHtvaDataToHTVAData()` trong Apps Script editor trước khi triển khai phiên bản mới. Hàm chỉ sao chép `exams`, `submissions`, `audit`, không xóa dữ liệu cũ và sẽ dừng nếu `HTVAData/` đã có dữ liệu.

### Tạo bài kiểm tra

Chạy hàm:

```javascript
provisionExam(examId, title, description, questionsJson, startAtMs, endAtMs, maxAttempts)
```

`questionsJson` là JSON array; thời gian là Unix epoch milliseconds (0 nếu không giới hạn). Ví dụ cấu trúc câu hỏi:

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
- Gradle runtime JDK: 17.
- App source compatibility: Java 8; compileSdk 32, minSdk 21, targetSdk 32.
- XML layouts, Gradle Groovy DSL.
- Giữ nguyên applicationId `com.htanh.appck`; không đổi nhầm thành applicationId của HTAVk.

Không tuyên bố build/test thành công nếu chưa chạy và quan sát kết quả thực tế.

## Nhận diện thương hiệu

Giữ nguyên bộ nhận diện đã được tích hợp trên nhánh `main`: biểu tượng ứng dụng, artwork linh vật, bảng màu pastel cam/đào và hồng. Không thay thế hoặc xóa các tài nguyên launcher khi phát triển tính năng.
