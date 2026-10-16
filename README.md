# AI CRM Automation System — Backend Service

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="100" alt="NestJS Logo" />
</p>

<p align="center">
  <b>Hệ thống Backend cho Nền tảng Tự động hóa CRM ứng dụng Trí tuệ Nhân tạo</b><br>
  Xây dựng trên nền tảng <b>NestJS</b>, <b>Clean Architecture</b>, <b>TypeORM</b>, <b>PostgreSQL</b>, <b>RabbitMQ</b> và tích hợp tự động hóa qua <b>n8n & Gemini AI</b>.
</p>

---

## 📌 1. Giới thiệu tổng quan

**CRM Automation Backend** là dịch vụ lõi chịu trách nhiệm quản trị toàn bộ dữ liệu khách hàng tiềm năng (Leads), khách hàng chính thức (Customers), luồng xử lý phân tích AI (Đánh giá sơ bộ, Làm giàu dữ liệu, Chấm điểm tiềm năng), chuỗi kịch bản chăm sóc khách hàng tự động (Follow-up Cadences), hộp thư duyệt xét con người (Human-in-the-loop Review) và tác vụ dọn dẹp dữ liệu thông minh (AI CRM Data Cleaning Agent).

---

## 🚀 2. Công nghệ cốt lõi

- **Framework**: [NestJS 12](https://nestjs.com/) (Node.js >= 20, TypeScript 5, Express platform).
- **Kiến trúc**: Clean Architecture, Phân tầng Controllers $\rightarrow$ Services $\rightarrow$ Mappers/DTOs $\rightarrow$ Dedicated Interfaces $\rightarrow$ TypeORM Entities.
- **Cơ sở dữ liệu**: PostgreSQL 18, [TypeORM](https://typeorm.io/) với Migration có khả năng Revert & Seed script tự động hóa.
- **Message Broker & Event-Driven**: RabbitMQ 4.3 (AMQP connection manager) phục vụ bắn sự kiện bất đồng bộ (`lead.created`, `lead.qualified`, v.v.).
- **Workflow & AI Engine**: [n8n](https://n8n.io/) tích hợp Google Gemini AI 1.5 Pro.
- **Bảo mật & Phân quyền**: JWT Token, Passport JWT Strategy, Bcrypt Password Hashing, RBAC Role Guards (`ADMIN`, `SALES`).
- **Tài liệu API**: [Swagger OpenAPI](https://swagger.io/) (`/api/docs`).
- **Kiểm thử**: Jest (Node ESM VM modules) với 24 Test Suites (243/243 Unit Tests Pass) và 15 End-to-End Integration Tests.

---

## 🎯 3. Danh mục 10 Use Cases nghiệp vụ (UC01 - UC10)

| Mã Use Case | Tên chức năng | Module Backend | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- |
| **UC01** | **Create & Manage Lead** | `leads` | Tiếp nhận và quản lý Lead đa nguồn (Website Form, Referral, Event...), quản lý trạng thái vòng đời Lead. |
| **UC02** | **AI Lead Qualification** | `lead-intelligence` | Đánh giá sơ bộ chất lượng Lead tự động bằng Google Gemini theo tiêu chuẩn BANT/CHAMP qua n8n. Tự duyệt nếu điểm $\ge 0.8$, chuyển Review nếu $< 0.8$. |
| **UC03** | **AI Lead Enrichment** | `lead-intelligence` | Tự động làm giàu hồ sơ doanh nghiệp (quy mô, website, ngành nghề) và người liên hệ qua external providers. |
| **UC04** | **AI Lead Scoring** | `lead-intelligence` | Chấm điểm tiềm năng Lead theo thang 0 - 100, phân loại nhãn `HOT`, `WARM`, `COLD` dựa trên dữ liệu nhân khẩu học và lịch sử tương tác. |
| **UC05** | **Enroll Follow-up Cadence** | `follow-up` | Định nghĩa chuỗi kịch bản nuôi dưỡng nhiều bước (Email/SMS/Webhook) và ghi danh Lead vào kịch bản. |
| **UC06** | **Execute Follow-up** | `follow-up` | Cron job & Webhook thực thi tự động các bước chăm sóc đến hạn, quản lý lịch sử gửi, cơ chế Retry lũy tiến khi gặp sự cố. |
| **UC07** | **Human-in-the-Loop Review** | `review`, `notifications` | Hộp thư cho nhân viên kinh doanh xét duyệt quyết định AI (`APPROVE`, `REJECT`, `MODIFY`) và gửi thông báo Notification. |
| **UC08** | **Convert Lead to Customer** | `leads`, `customers` | Chuyển đổi Lead đủ điều kiện sang Khách hàng, tự động chống trùng lặp theo Email/SĐT và ghi Audit Log. |
| **UC09** | **Customer Segmentation** | `customers` | Phân khúc khách hàng tự động dựa theo bộ lọc quy tắc JSON linh hoạt (`RULE`) hoặc gắn thủ công (`MANUAL`). |
| **UC10** | **AI CRM Data Cleaning Agent**| `data-cleaning` | Agent AI quét và phát hiện các bất thường (email sai cú pháp, SĐT sai mã vùng, tên dính ký tự lạ) và áp dụng chuẩn hóa hàng loạt. |

---

## 📁 4. Cấu trúc thư mục dự án

```text
crm-automation-backend/
├── docs/                      # Sơ đồ thiết kế kiến trúc (ERD V3, Sequence, Class diagrams)
│   └── diagrams/erd/erd.puml  # Thiết kế cơ sở dữ liệu chuẩn hóa 18 thực thể
├── docker/                    # Script khởi tạo hạ tầng Docker
├── src/
│   ├── common/                # Tiện ích chung: Guards, Pipes, Interceptors, Filters, Base DTOs
│   ├── config/                # Cấu hình TypeORM, RabbitMQ, Swagger
│   ├── database/
│   │   ├── migrations/        # TypeORM DDL Migrations (InitialSchema 18 bảng)
│   │   └── seeds/             # Seed Script nạp dữ liệu mẫu 18 bảng chuẩn hóa
│   ├── modules/               # Các Feature Modules
│   │   ├── audit/             # Ghi nhận nhật ký kiểm toán (Audit Logs)
│   │   ├── auth/              # Xác thực JWT, đăng nhập, bảo mật mật khẩu
│   │   ├── customers/         # Khách hàng & Phân khúc (Segments)
│   │   ├── data-cleaning/     # UC10 AI CRM Data Cleaning Agent
│   │   ├── follow-up/         # UC05 & UC06 Chuỗi kịch bản & Thực thi tự động
│   │   ├── lead-intelligence/ # UC02, UC03, UC04 AI Qualification, Enrichment & Scoring
│   │   ├── leads/             # UC01 Quản lý Lead, Nguồn Lead, Tương tác
│   │   ├── notifications/     # Hệ thống thông báo người dùng nội bộ
│   │   ├── review/            # UC07 Duyệt xét tác vụ con người (Human Review)
│   │   ├── users/             # Quản lý tài khoản người dùng & phân quyền
│   │   └── workflow/          # Tracing các phiên thực thi n8n Workflow Runs
│   ├── app.module.ts
│   ├── data-source.ts         # TypeORM CLI DataSource configuration
│   └── main.ts                # Bootstrap ứng dụng, Swagger & Global Validation Pipes
├── test/                      # Bộ kiểm thử tích hợp tự động E2E (UC01-UC09 Pipeline)
├── docker-compose.yml         # Container PostgreSQL 18, RabbitMQ 4.3, n8n
├── package.json
└── tsconfig.json
```

---

## 🛠️ 5. Yêu cầu môi trường & Cài đặt

### Yêu cầu tiên quyết:
- **Node.js**: `>= 20.x`
- **Package Manager**: `pnpm` (khuyên dùng `>= 9.x`)
- **Docker & Docker Compose**: Để chạy cụm PostgreSQL, RabbitMQ và n8n cục bộ

### Bước 1: Khởi động Hạ tầng Docker (Local Stack)
```bash
# Khởi động cụm PostgreSQL, RabbitMQ và n8n
docker compose up -d
```
Trạng thái các container sau khi khởi động:
- **PostgreSQL 18**: `localhost:5432` (`crm_postgres`)
- **RabbitMQ Management**: `http://localhost:15672`
- **RabbitMQ AMQP**: `amqp://localhost:5672`
- **n8n Workflow Automation**: `http://localhost:5678`

### Bước 2: Cài đặt Dependencies
```bash
pnpm install
```

### Bước 3: Cấu hình Biến môi trường (`.env`)
Sao chép cấu hình từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
> [!NOTE]
> Mở file `.env` và tùy chỉnh các tham số cần thiết (các giá trị mặc định trong `.env.example` đã được cấu hình sẵn sàng để kết nối trực tiếp với cụm Docker local).

### Bước 4: Chạy Migration & Nạp dữ liệu mẫu
```bash
# 1. Áp dụng toàn bộ migrations vào cơ sở dữ liệu
pnpm migration:run

# 2. Nạp dữ liệu mẫu chuẩn hóa 18 bảng cho đồ án demo
pnpm seed:fresh
```

### Bước 5: Khởi động Backend Service
```bash
# Chế độ phát triển (Live reload)
pnpm start:dev
```
- **Backend API**: `http://localhost:3000`
- **Swagger OpenAPI Docs**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## 🧪 6. Kiểm thử & Đảm bảo chất lượng

```bash
# 1. Chạy toàn bộ 243 Unit Tests
pnpm test

# 2. Chạy bộ 15 End-to-End Integration Tests (Toàn bộ luồng UC01 - UC09)
pnpm test:e2e

# 3. Kiểm tra và tự động sửa định dạng code (ESLint)
pnpm lint

# 4. Kiểm tra biên dịch TypeScript toàn dự án
pnpm build
```

---

## 📄 7. Bản quyền & Giấy phép
Dự án được phát triển phục vụ đồ án môn học / giải pháp tự động hóa CRM ứng dụng Trí tuệ Nhân tạo.
