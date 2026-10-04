# n8n Workflows for AI CRM Automation

Thư mục này chứa các workflow JSON của **n8n** để chạy tự động hóa các Use Case AI trong hệ thống CRM.

## 📋 Danh sách Workflows

| File | Use Case | Mô tả | Trạng thái |
|---|---|---|---|
| [`uc02-ai-lead-qualification.json`](./uc02-ai-lead-qualification.json) | **UC02 - AI Lead Qualification** | Lắng nghe event RabbitMQ `lead.qualification.requested`, lấy dữ liệu Lead từ NestJS API, gọi LLM phân tích B2B ICP & intent, áp dụng quy tắc confidence (>= 0.80 tự động duyệt, < 0.80 tạo Review Task), gọi callback về NestJS. | ✅ Hoàn thành (Mẫu chuẩn) |
| [`uc03-ai-lead-enrichment.json`](./uc03-ai-lead-enrichment.json) | **UC03 - AI Lead Enrichment** | Lắng nghe event RabbitMQ `lead.enrichment.requested`, lấy Lead từ API, chuẩn hóa email/domain, gọi service enrichment (với retry & timeout), chuẩn hóa và kiểm tra kết quả, gọi callback về NestJS lưu dữ liệu làm giàu và cập nhật Lead & WorkflowRun. | ✅ Hoàn thành |
| `uc04-ai-lead-scoring.json` | **UC04 - AI Lead Scoring** | Chấm điểm Lead từ 0 - 100, gắn nhãn HOT/WARM/COLD. (Member 2 phụ trách) | ⏳ Sắp làm |
| `uc06-follow-up-execution.json` | **UC06 - Execute Follow-up** | Gửi email/tin nhắn theo kịch bản và theo dõi tiến trình. (Member 3 phụ trách) | ⏳ Sắp làm |
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
