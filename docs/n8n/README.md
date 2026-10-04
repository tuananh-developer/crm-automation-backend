# n8n Workflows for AI CRM Automation

Thư mục này chứa các workflow JSON của **n8n** để chạy tự động hóa các Use Case AI trong hệ thống CRM.

## 📋 Danh sách Workflows

| File | Use Case | Mô tả | Trạng thái |
|---|---|---|---|
| [`uc02-ai-lead-qualification.json`](./uc02-ai-lead-qualification.json) | **UC02 - AI Lead Qualification** | Lắng nghe event RabbitMQ `lead.qualification.requested`, lấy dữ liệu Lead từ NestJS API, gọi LLM phân tích B2B ICP & intent, áp dụng quy tắc confidence (>= 0.80 tự động duyệt, < 0.80 tạo Review Task), gọi callback về NestJS. | ✅ Hoàn thành (Mẫu chuẩn) |
| [`uc03-ai-lead-enrichment.json`](./uc03-ai-lead-enrichment.json) | **UC03 - AI Lead Enrichment** | Lắng nghe event RabbitMQ `lead.enrichment.requested`, lấy Lead từ API, chuẩn hóa email/domain, gọi service enrichment (với retry & timeout), chuẩn hóa và kiểm tra kết quả, gọi callback về NestJS lưu dữ liệu làm giàu và cập nhật Lead & WorkflowRun. | ✅ Hoàn thành |
| [`uc04-ai-lead-scoring.json`](./uc04-ai-lead-scoring.json) | **UC04 - AI Lead Scoring** | Lắng nghe event RabbitMQ `lead.scoring.requested`, lấy context tổng hợp (Lead, Qualification mới nhất, Enrichment mới nhất, Interactions), AI Scoring đa nhân tố, chuẩn hóa điểm (0 - 100) và nhãn (HOT/WARM/COLD), gọi callback lưu vào `lead_scores` bảo toàn lịch sử. | ✅ Hoàn thành |
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

---

## 📐 Kiến trúc Luồng UC04 — AI Lead Scoring

```
[ RabbitMQ Trigger ] (Queue: crm_events_queue, Routing Key: lead.scoring.requested)
       │
       ▼
[ Parse Event Payload ] (Xử lý chuỗi JSON trong content, bóc tách leadId & workflowRunId)
       │
       ▼
[ Filter Scoring Event ] (Lọc event hợp lệ với leadId khác rỗng)
       │
       ▼
[ Get Scoring Context ] (GET http://host.docker.internal:3000/api/v1/lead-intelligence/score/:id/context)
       │                 └─ Lead, Qualification, Enrichment, Touchpoint history, Features
       ▼
[ Prepare Scoring Prompt ] (Tạo prompt & tổng hợp dữ liệu đầu vào cho AI)
       │
       ▼
[ AI Scoring Engine ] (Chấm điểm đa nhân tố: Quyết định, Quy mô công ty, Trình trạng AI, Tương tác)
       │
       ▼
[ Validate Score Output ] (Validate Score: 0 - 100, Gán nhãn: HOT >= 70 | WARM 40-69 | COLD < 40)
       │
       ▼
[ Callback NestJS API ] (POST http://host.docker.internal:3000/api/v1/lead-intelligence/scoring/callback)
                         └─ Lưu bản ghi mới vào `lead_scores` (bảo toàn lịch sử) & cập nhật WorkflowRun
```

### Quy tắc phân loại điểm (Scoring Rules):
- **HOT (>= 70 điểm):** Nhu cầu cao, người ra quyết định cấp cao (C-Level/VP/Director), quy mô doanh nghiệp phù hợp (>= 50 nhân viên), có tương tác gần đây.
- **WARM (40 - 69 điểm):** Nhu cầu tiềm năng, doanh nghiệp vừa/nhỏ, có tương tác tiêu chuẩn.
- **COLD (< 40 điểm):** Bị Disqualified, thiếu thông tin doanh nghiệp/liên hệ, hoặc không có tương tác.

