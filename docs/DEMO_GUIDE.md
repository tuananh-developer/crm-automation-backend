# CRM Automation System - Complete Demo & Verification Guide

Hướng dẫn chi tiết kịch bản demo hệ thống CRM Automation bao gồm toàn bộ luồng 9 Use Cases (UC01 - UC09) tích hợp giữa NestJS Backend, PostgreSQL, RabbitMQ, n8n và Next.js Frontend.

---

## 1. Môi trường & Khởi chạy hệ thống

### 1.1 Docker Infrastructure
Khởi động hạ tầng cơ sở dữ liệu và message queue:
```bash
cd crm-automation-backend
docker compose up -d
```
Trạng thái các container:
- **PostgreSQL 18**: `localhost:5432` (`crm_postgres`, DB: `crm_backend`, `crm_db`)
- **RabbitMQ 4.3**: `localhost:5672` (AMQP), Management: `http://localhost:15672` (`guest`/`guest`)
- **n8n Workflow Automation**: `http://localhost:5678` (`crm_n8n`)

### 1.2 Backend Service (NestJS)
```bash
cd crm-automation-backend
pnpm install
pnpm migration:run   # Đảm bảo migrations đã áp dụng
pnpm seed:fresh      # Nạp sạch và đồng bộ lại 18 bảng dữ liệu mẫu
pnpm start:dev       # Khởi động Backend tại http://localhost:3000
```
Swagger API Documentation: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

### 1.3 Frontend Service (Next.js)
```bash
cd crm-automation-frontend
pnpm install
pnpm dev             # Khởi động Web App tại http://localhost:3001
```

### 1.4 Tài khoản đăng nhập Demo (Đã mã hóa Bcrypt)
| Role | Email | Mật khẩu | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@crm.local` | `Password123!` | Quản trị toàn quyền, xem Audit Logs, cấu hình Sequences |
| **Sales Rep** | `sales@crm.local` | `Password123!` | Quản lý Leads, Hộp thư duyệt Review Inbox, thực hiện Follow-up |

---

## 2. Kịch bản Demo 9 Use Cases (End-to-End Business Flow)

### 🔹 Bước 1: UC01 - Tạo Lead mới (Create Lead)
- **Giao diện:** Truy cập `http://localhost:3001/leads` $\rightarrow$ Nhấn **"Add Lead"**.
- **Hành động:** Điền thông tin lead doanh nghiệp:
  - Tên: `Katherine Johnson`
  - Email: `katherine.j@innovate-tech.io`
  - Doanh nghiệp: `InnovateTech Systems`
  - Quy mô: `250` nhân sự
  - Nguồn: `Website Form`
- **Kết quả:** Lead được lưu vào database với trạng thái `NEW`. Sự kiện `lead.created` được bắn vào RabbitMQ.

---

### 🔹 Bước 2: UC02 - Đánh giá sơ bộ bằng AI (AI Lead Qualification)
- **Cơ chế:** n8n Workflow bắt sự kiện từ RabbitMQ hoặc Webhook NestJS, gửi prompt sang Google Gemini phân tích tiêu chuẩn BANT/CHAMP.
- **Kết quả:**
  - Điểm tự tin (Confidence) $\ge 0.80$: Lead tự động chuyển trạng thái `QUALIFIED`.
  - Điểm tự tin $< 0.80$: Hệ thống tạo một tác vụ duyệt `ReviewTask` (UC07) đưa vào hàng chờ duyệt con người.

---

### 🔹 Bước 3: UC03 - Làm giàu dữ liệu Lead bằng AI & External API (AI Lead Enrichment)
- **Giao diện:** Trang chi tiết Lead $\rightarrow$ Khối **"Company Enrichment"**.
- **Hành động:** Hệ thống tự động kích hoạt truy vấn hoặc nhân viên bấm **"Re-enrich"**.
- **Kết quả:** 
  - Tự động bổ sung thông tin: Ngành nghề (`Cloud Infrastructure`), Doanh thu ước tính, Trang LinkedIn công ty, Website chính thức.
  - Cập nhật trực quan trên Lead Detail Card.

---

### 🔹 Bước 4: UC04 - Chấm điểm tiềm năng Lead bằng AI (AI Lead Scoring)
- **Giao diện:** Khối **"Lead Score"** trên trang Lead Detail.
- **Hành động:** AI tổng hợp dữ liệu nhân khẩu học, quy mô công ty, lịch sử tương tác để chấm điểm trên thang 0 - 100:
  - **Điểm:** `92/100` $\rightarrow$ Phân loại: **`HOT` (Màu xanh lá)**
  - Kèm giải thích chi tiết: *"Quy mô doanh nghiệp lớn, ngân sách phù hợp, người liên hệ giữ chức vụ quyết định."*
  - Lưu trữ lịch sử chấm điểm (Score History) vào bảng `lead_scores`.

---

### 🔹 Bước 5: UC05 - Ghi danh Lead vào Kịch bản chăm sóc (Enroll Follow-up Sequence)
- **Giao diện:** `http://localhost:3001/follow-ups` & Trang Lead Detail.
- **Hành động:**
  - Xem danh sách kịch bản: `Enterprise High-Touch Cadence` (gồm 3 bước: Welcome Email $\rightarrow$ Product Intro $\rightarrow$ Meeting Invite).
  - Nhấn **"Enroll Lead"** $\rightarrow$ Chọn Lead `Katherine Johnson`.
- **Kết quả:** Tạo bản ghi `LeadFollowUpEnrollment` với trạng thái `ACTIVE`, đặt lịch cho Bước 1.

---

### 🔹 Bước 6: UC06 - Thực thi kịch bản chăm sóc tự động (Execute Follow-up)
- **Cơ chế:** Cron job chạy định kỳ hoặc trigger thủ công xử lý các bước đến hạn:
  - Render nội dung email cá nhân hóa từ template: `"Kính gửi Katherine, giải pháp cho InnovateTech Systems..."`.
  - Gửi qua n8n webhook / email provider.
- **Kết quả:** Lưu bản ghi `FollowUpExecution` với trạng thái `COMPLETED`, tự động chuyển sang bước tiếp theo trong chuỗi.

---

### 🔹 Bước 7: UC07 - Duyệt xét bởi con người (Human-in-the-Loop Review)
- **Giao diện:** Truy cập `http://localhost:3001/review` (Review Inbox).
- **Hành động:**
  - Nhân viên Sales thấy các tác vụ cần duyệt (Confidence thấp hoặc lead có ngân sách đặc biệt).
  - Nhấn vào tác vụ $\rightarrow$ Mở Drawer xem chi tiết lý do AI đề xuất.
  - Chọn quyết định: **APPROVE**, **REJECT** hoặc **MODIFY**.
- **Kết quả:** Trạng thái tác vụ chuyển sang `RESOLVED`, ghi nhận thông báo Notification và lưu Audit Log.

---

### 🔹 Bước 8: UC08 - Chuyển đổi Lead thành Khách hàng (Convert Lead to Customer)
- **Giao diện:** Trang chi tiết Lead `Katherine Johnson` (trạng thái `QUALIFIED`) $\rightarrow$ Nhấn **"Convert to Customer"**.
- **Hành động:** Xác nhận chuyển đổi.
- **Kết quả:**
  - Tự động tạo bản ghi mới trong bảng `customers` (hoặc liên kết nếu khách hàng đã tồn tại chống trùng lặp).
  - Trạng thái Lead cập nhật thành `CONVERTED`.
  - Ghi nhận Audit Log hành vi chuyển đổi.

---

### 🔹 Bước 9: UC09 - Phân khúc khách hàng tự động (Customer Segmentation)
- **Giao diện:** Truy cập `http://localhost:3001/segments`.
- **Hành động:**
  - Xem phân khúc: `Enterprise VIP Segment` (Điều kiện: Quy mô $> 100$ hoặc ARR lớn).
  - Nhấn **"Evaluate Customers"**.
- **Kết quả:**
  - Khách hàng mới chuyển đổi từ Lead trên tự động được xếp vào phân khúc `Enterprise VIP Segment`.
  - Tạo bản ghi trong `customer_segments` với loại gán `RULE` và độ tin cậy `1.0`.

---

## 3. Lệnh kiểm thử tự động (Automated Verification)

Chạy bộ kiểm thử tự động toàn diện:
```bash
# 1. Chạy toàn bộ 190 Unit Tests
pnpm test

# 2. Chạy toàn bộ 15 End-to-End Integration Tests (Bao gồm UC01-UC09 Pipeline)
pnpm test:e2e

# 3. Kiểm tra định dạng code & linting
pnpm lint
```
Tất cả các kiểm thử đều đạt kết quả **100% PASS** sẵn sàng cho buổi bảo vệ đồ án!
