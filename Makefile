COMPOSE_FILES = -f docker-compose.yml -f docker-compose.full.yml

.PHONY: stack-up stack-down stack-rebuild stack-ps stack-logs

stack-up:
	docker compose $(COMPOSE_FILES) up -d --build

stack-down:
	docker compose $(COMPOSE_FILES) down

stack-rebuild:
	docker compose $(COMPOSE_FILES) build --no-cache

stack-ps:
	docker compose $(COMPOSE_FILES) ps

stack-logs:
	docker compose $(COMPOSE_FILES) logs -f --tail=100 backend frontend n8n
