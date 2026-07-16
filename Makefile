SHELL := /bin/sh
COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help env dev dev-low-memory provision refresh-live backfill-history ps logs down clean reset \
	test test-backend test-web test-e2e test-full-stack smoke lint compose-check images backup backup-once

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Restless Pacific\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

env: ## Create a local .env from the documented defaults
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env"; else echo ".env already exists"; fi

dev: env ## Build and launch the complete local stack, seed data, and provision Metabase
	-$(COMPOSE) stop scheduler
	$(COMPOSE) up --detach --wait --wait-timeout 120 postgres
	$(COMPOSE) build backend
	$(COMPOSE) --profile tools run --rm backend-seed
	$(COMPOSE) up --detach --wait --wait-timeout 300 backend metabase
	$(COMPOSE) --profile tools run --rm metabase-bootstrap
	$(COMPOSE) up --detach --build --wait --wait-timeout 180 web caddy scheduler
	@echo "Journey:   http://www.localhost"
	@echo "API:       http://api.localhost/healthz"
	@echo "Analytics: http://analytics.localhost"

dev-low-memory: ## Launch the local stack with an approximately 4 GB container-memory budget
	$(MAKE) COMPOSE="docker compose -f docker-compose.yml -f docker-compose.low-memory.yml" dev

provision: ## Load deterministic fixtures and idempotently provision Metabase resources
	-$(COMPOSE) stop scheduler
	$(COMPOSE) --profile tools run --rm backend-seed
	$(COMPOSE) --profile tools run --rm metabase-bootstrap
	$(COMPOSE) up --detach scheduler

refresh-live: ## Refresh all supported upstream datasets (network required)
	$(COMPOSE) --profile tools run --rm backend-ingest-live

backfill-history: ## Backfill USGS M5+ events in bounded yearly windows since 1960
	$(COMPOSE) --profile tools run --rm backend-ingest-live clojure -M:ingest usgs-history

ps: ## Show container and health status
	$(COMPOSE) ps

logs: ## Follow application logs
	$(COMPOSE) logs --follow --tail=150

down: ## Stop the stack without deleting data
	$(COMPOSE) down --remove-orphans

clean: ## Remove build containers and local application caches, preserving databases
	$(COMPOSE) down --remove-orphans
	rm -rf web/.next web/playwright-report web/test-results backend/target

reset: ## Delete local databases and regenerate the stack (DESTRUCTIVE=1 required)
	@test "$(DESTRUCTIVE)" = "1" || (echo "Refusing to delete data. Re-run with DESTRUCTIVE=1."; exit 1)
	$(COMPOSE) down --volumes --remove-orphans
	$(MAKE) dev

test: test-backend test-web ## Run backend and frontend test suites

test-backend: ## Run Clojure tests
	cd backend && clojure -M:test

test-web: ## Run frontend unit checks and production build
	cd web && npm run lint && npm run typecheck && npm test && npm run build

test-e2e: ## Run Playwright against the local stack
	cd web && npm run test:e2e

test-full-stack: ## Run browser flows including the live Metabase guest embed
	set -a; . ./.env; set +a; cd backend && TEST_DATABASE_URL="jdbc:postgresql://localhost:$${POSTGRES_PORT:-5432}/ring_data" TEST_DATABASE_USER=ring_writer TEST_DATABASE_PASSWORD="$$RING_WRITER_PASSWORD" TEST_METABASE_READER_PASSWORD="$$METABASE_READER_PASSWORD" clojure -M:test
	cd web && FULL_STACK=1 PLAYWRIGHT_BASE_URL=http://www.localhost npm run test:e2e

smoke: ## Verify public health, provenance, token denial, and read-only DB access
	./infra/scripts/smoke

lint: ## Validate Clojure, TypeScript, and repository configuration
	cd backend && clojure -M:test
	cd web && npm run lint
	$(MAKE) compose-check

compose-check: env ## Render and validate the Compose model
	$(COMPOSE) config --quiet

images: env ## Build production container images
	$(COMPOSE) build backend web backup

backup: env ## Start the encrypted daily-backup service
	@test -n "$$(grep '^BACKUP_AGE_RECIPIENT=age1' .env)" || (echo "Set BACKUP_AGE_RECIPIENT to an age public key first."; exit 1)
	$(COMPOSE) --profile ops up --detach --build backup

backup-once: env ## Write one encrypted backup immediately
	@test -n "$$(grep '^BACKUP_AGE_RECIPIENT=age1' .env)" || (echo "Set BACKUP_AGE_RECIPIENT to an age public key first."; exit 1)
	$(COMPOSE) --profile ops run --rm backup /usr/local/bin/backup-once
