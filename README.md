# HTVA Ck

**HTVA Ck** là ứng dụng Android riêng tư giúp chủ sở hữu sắp xếp và ghi nhớ những thông tin, kế hoạch và kỷ niệm liên quan đến mối quan hệ của mình.

- **Tên ứng dụng:** HTVA Ck
- **Android application ID:** com.htanh.appck
- **Ứng dụng liên quan:** HTVA Vk
- **Application ID của HTVA Vk:** com.htanh.appvk

> HTVA Ck và HTVA Vk là hai ứng dụng riêng biệt. Không dùng nhầm application ID của ứng dụng này cho ứng dụng kia. Việc tích hợp hoặc chia sẻ dữ liệu giữa hai ứng dụng chưa được mặc định cho phép.

## Định hướng sản phẩm

HTVA Ck hướng đến việc quản lý thông tin một cách tích cực, tôn trọng và có trách nhiệm, ví dụ:

- Ngày kỷ niệm, ngày quan trọng và lời nhắc.
- Kế hoạch chung, ý tưởng hẹn hò và hoạt động.
- Ghi chú về sở thích hoặc những điều đối phương tự nguyện chia sẻ.
- Những khoảnh khắc và kỷ niệm đáng nhớ.

Các mục trên là định hướng sản phẩm, **không phải cam kết rằng những tính năng này đã được triển khai**. Hãy kiểm tra source code trước khi mô tả một tính năng là đã hoạt động.

## Quyền riêng tư và sự đồng thuận

- Mặc định dữ liệu là riêng tư; chỉ thu thập dữ liệu thực sự cần thiết.
- Phân biệt rõ dữ liệu do chủ ứng dụng tự nhập với dữ liệu được đối phương chủ động chia sẻ.
- Không xây dựng tính năng theo dõi vị trí bí mật, đọc trộm tin nhắn, ghi âm/ghi hình ẩn, truy cập tài khoản trái phép hoặc giám sát không có sự đồng thuận.
- Mọi cơ chế chia sẻ với HTVA Vk trong tương lai phải minh bạch, có sự đồng ý rõ ràng và có thể thu hồi.
- Không thêm backend, cloud, analytics, Firebase, Supabase hoặc SDK bên thứ ba khi chưa có quyết định kiến trúc rõ ràng.

## Trạng thái kỹ thuật hiện tại

Repository hiện là một Android Native starter project:

- Java và Android XML.
- Gradle Groovy DSL.
- Android Gradle Plugin 7.2.2.
- compileSdk 32, minSdk 21, targetSdk 32.
- Các dependency hiện có gồm AndroidX AppCompat, Material Components và ConstraintLayout.

Giao diện/source hiện tại vẫn có nguồn gốc từ ứng dụng BMI mẫu. Việc đổi tên package và nhãn ứng dụng không đồng nghĩa với việc các màn hình nghiệp vụ HTVA Ck đã được xây dựng.

### Build

Nếu repository có Gradle wrapper:

```bash
./gradlew :app:assembleDebug
```

Chạy unit tests:

```bash
./gradlew :app:test
```

Nếu wrapper không có trong repository, mở project bằng Android Studio và dùng Gradle được cấu hình tại máy.

## Hướng dẫn cho AI coding agent

Trước khi sửa code, đọc:

- [AGENTS.md](AGENTS.md) — quy trình và quy tắc làm việc trong repository.
- [Relationship App Skill](.agents/skills/relationship-app/SKILL.md) — nguyên tắc sản phẩm, quyền riêng tư và hướng dẫn kỹ thuật chuyên biệt.

Ưu tiên thay đổi nhỏ, có thể kiểm chứng; giữ Java/XML hiện có và không tự ý thay đổi kiến trúc lớn.
