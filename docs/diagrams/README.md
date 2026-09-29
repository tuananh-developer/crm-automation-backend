# System Diagrams & Architecture

Thư mục này dùng để lưu trữ các sơ đồ thiết kế hệ thống, sơ đồ quan hệ thực thể (ERD), kiến trúc và các luồng kịch bản tự động hóa (n8n workflows).

## 1. Danh sách Sơ đồ hiện có

| Tên sơ đồ | Định dạng nguồn | File ảnh / xuất bản | Mô tả |
| :--- | :--- | :--- | :--- |
| **Database ERD (V2)** | [`erd.puml`](./erd.puml) | [`erd.png`](./erd.png) | Sơ đồ toàn bộ các bảng trong cơ sở dữ liệu CRM Automation |

## 2. Cách xem & chỉnh sửa PlantUML (`.puml`)

- **VS Code / Cursor / Windsurf**: Cài extension `PlantUML` (jebbs.plantuml) và bấm `Alt + D` để preview trực tiếp.
- **Online**: Copy nội dung file `.puml` vào [PlantText](https://www.planttext.com/) hoặc [PlantUML Server](https://www.plantuml.com/plantuml/uml/).

## 3. Định hướng mở rộng

Khi phát triển thêm tính năng, bạn có thể lưu trữ tiếp vào thư mục này:
- Sơ đồ kiến trúc luồng dữ liệu: `NestJS <-> RabbitMQ <-> n8n <-> Postgres`
- Sơ đồ các kịch bản n8n workflows (Lead Intelligence, Follow-up, Review, Notification).
