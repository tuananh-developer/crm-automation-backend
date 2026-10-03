# n8n Workflows for AI CRM Automation

Thư mục này chứa các workflow JSON của **n8n** để chạy tự động hóa các Use Case AI trong hệ thống CRM.

## 📋 Danh sách Workflows

| File | Use Case | Mô tả | Trạng thái |
|---|---|---|---|
| [`uc02-ai-lead-qualification.json`](./uc02-ai-lead-qualification.json) | **UC02 - AI Lead Qualification** | Lắng nghe event RabbitMQ `lead.qualification.requested`, lấy dữ liệu Lead từ NestJS API, gọi LLM phân tích B2B ICP & intent, áp dụng quy tắc confidence (>= 0.80 tự động duyệt, < 0.80 tạo Review Task), gọi callback về NestJS. | ✅ Hoàn thành (Mẫu chuẩn) |
| `uc03-ai-lead-enrichment.json` | **UC03 - AI Lead Enrichment** | Làm giàu thông tin công ty từ domain/email qua external API. (Member 2 phụ trách) | ⏳ Sắp làm |
| `uc04-ai-lead-scoring.json` | **UC04 - AI Lead Scoring** | Chấm điểm Lead từ 0 - 100, gắn nhãn HOT/WARM/COLD. (Member 2 phụ trách) | ⏳ Sắp làm |
| `uc06-follow-up-execution.json` | **UC06 - Execute Follow-up** | Nhận Webhook từ NestJS (`POST /follow-up-execute`), validate payload, build message từ template, gửi Email/Message qua Communication Service, trả kết quả `success`/`error` về backend để lưu `FollowUpExecution` và retry. | ✅ Hoàn thành |
| `uc09-customer-segmentation.json` | **UC09 - Customer Segmentation** | Phân loại và gán segment cho khách hàng theo tiêu chí. (Member 3 phụ trách) | ⏳ Sắp làm |

---

## 🛠️ Hướng dẫn Sử dụng & Import vào n8n

1. **Mở n8n UI** (mặc định: `http://localhost:5678`).
2. Vào **Workflows** → Bấm **`+ Add Workflow`** (hoặc menu `...` ở góc phải) → Chọn **`Import from File...`**.
3. Chọn file `docs/n8n/uc02-ai-lead-qualification.json`.
4. Cấu hình Credentials:
   - **RabbitMQ Credentials:** Host `crm_rabbitmq` (hoặc `localhost`), User `guest`, Pass `guest`, Port `5672`.
   - **OpenAI Credentials (hoặc LLM Provider):** Nhập API Key của bạn.
5. Kích hoạt workflow (**Active: ON**).

---

## 📐 Kiến trúc Luồng UC02 (Chuẩn Blueprint cho cả team tham khảo)

```
[ RabbitMQ Trigger ] (Lắng nghe queue: crm_automation_queue)
       │
       ▼
[ Validate Event ] (Kiểm tra leadId hợp lệ)
       │
       ▼
[ Get Lead from NestJS ] (GET http://crm_backend:3000/api/v1/leads/:id)
       │
       ▼
[ Prepare AI Input ] (Chuẩn bị system prompt & user prompt)
       │
       ▼
[ AI / LLM Qualification ] (OpenAI gpt-4o / Claude / Gemini xuất JSON có cấu trúc)
       │
       ▼
[ Validate Structured Output ] (Kiểm tra Confidence score >= 0.80 vs < 0.80)
       │
       ▼
[ Callback NestJS API ] (POST http://crm_backend:3000/api/v1/lead-intelligence/qualification/callback)
```

---

## 📨 Kiến trúc Luồng UC06 - Execute Follow-up

```
[ Webhook ] (POST http://localhost:5678/webhook/follow-up-execute)
       │  { executionId, enrollmentId, stepId, recipient, message, channel }
       ▼
[ Validate Input ] (kiểm tra đủ trường bắt buộc, thiếu → trả lỗi cho backend retry)
       ▼
[ Build Message ] (chuẩn hóa channel, dựng payload gửi provider)
       ▼
[ Send Email/Message ] (POST $COMMUNICATION_SERVICE_URL/messages — nhánh lỗi đi qua error output)
       ▼
[ Build Response ] (success: providerMessageId | error: message + retryable)
       ▼
[ Respond to Webhook ] (HTTP 200, JSON kết quả cho NestJS)
```

**Payload NestJS gửi vào (đã render template ở backend):**

```json
{
  "executionId": "…",
  "enrollmentId": "…",
  "stepId": "…",
  "leadId": "…",
  "customerId": null,
  "channel": "EMAIL",
  "actionType": "SEND_EMAIL",
  "stepOrder": 1,
  "recipient": "john.doe@example.com",
  "subject": "…",
  "message": "Xin chào John,\nchúng tôi muốn trao đổi thêm…",
  "attempt": 1
}
```

**Response thành công (HTTP 200):**

```json
{
  "success": true,
  "providerMessageId": "EMAIL-…",
  "message": "Follow-up executed successfully"
}
```

**Response lỗi (HTTP 200, `success: false`) hoặc HTTP 5xx — backend lưu `errorMessage`, tăng `retryCount` và chuyển execution sang `RETRYING`:**

```json
{
  "success": false,
  "error": "SMTP connection refused",
  "retryable": true
}
```

> **Cấu hình:** đặt biến môi trường `COMMUNICATION_SERVICE_URL` trong n8n (mặc định `http://crm_communication_service:3000`).
> Đường dẫn webhook phải khớp với `N8N_FOLLOW_UP_WEBHOOK_PATH` trong `.env` của NestJS.
