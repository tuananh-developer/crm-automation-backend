#!/bin/bash
set -e

# ============================================================
# KHỞI TẠO DATABASE CHO n8n (WORKFLOW AUTOMATION)
# ============================================================
# Kiến trúc database (xem docker-compose.yml):
#   - POSTGRES_DB=crm_backend      → database chính của CRM Backend
#   - N8N_DB_NAME=crm_db           → database riêng cho n8n
#
# Phân trách nhiệm:
#   • crm_backend: CRM Backend quản lý (TypeORM migration).
#   • crm_db:     n8n tự quản lý schema & migration khi n8n start.
#
# Vai trò của script này (chạy trong /docker-entrypoint-initdb.d/):
#   - Chỉ tạo database rỗng "crm_db" cho n8n NẾU chưa tồn tại.
#   - KHÔNG chạy migration, KHÔNG tạo bảng/schema của CRM.
#   - KHÔNG can thiệp vào crm_backend.
#   - Idempotent: chạy lại nhiều lần không lỗi, không tạo trùng.
#
# Luồng khởi tạo đầy đủ:
#   PostgreSQL container start
#       → auto-tạo crm_backend (từ POSTGRES_DB)
#       → chạy init-db.sh: tạo/kiểm tra crm_db
#       → Backend start
#           ↓
#           TypeORM migration
#           ↓
#           crm_backend
#       → n8n start     → tự migration trên crm_db
# ============================================================

N8N_DB="${N8N_DB_NAME:-crm_db}"

# Chỉ tạo DB thứ 2 nếu khác với DB chính (tránh tạo trùng khi config sai)
if [ -n "$N8N_DB" ] && [ "$N8N_DB" != "$POSTGRES_DB" ]; then
    echo "Ensuring database '$N8N_DB' exists for n8n automation..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE "$N8N_DB"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$N8N_DB')\gexec
EOSQL
fi
