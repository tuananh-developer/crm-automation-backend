# EC2 single-node Docker Compose deployment

This deployment runs the CRM application on one Ubuntu EC2 instance:

- Caddy provides HTTPS for the CRM and n8n hostnames.
- Next.js serves the browser UI.
- NestJS serves the API and owns all CRM writes.
- PostgreSQL stores CRM and n8n data in separate databases and roles.
- RabbitMQ is private to the Docker network.
- n8n runs workflows and calls the backend over the private Docker network.

This is a practical single-node deployment, not a highly available architecture. The EC2 instance, its EBS volume, and its Availability Zone remain single points of failure. Keep independent database and n8n backups before relying on it for important data.

## 1. Prerequisites

- Ubuntu EC2 with Docker Engine and Docker Compose v2.
- The backend and frontend repositories checked out as sibling directories:
  
  ```text
  ~/Projects/
  ├── crm-automation-backend/
  └── crm-automation-frontend/
  ```

- Two DNS A records pointing to the EC2 public IPv4 address:
  - `CRM_DOMAIN`, for example `crm.your-domain.tld`
  - `N8N_DOMAIN`, for example `n8n.your-domain.tld`
- An AWS Security Group that permits inbound TCP 80 and 443 from the Internet. Do not expose 3000, 3001, 5432, 5672, 5678, or 15672. Keep Session Manager for administration.
- A stable public IP is recommended for DNS. An automatically assigned public IPv4 can change after a stop/start; update DNS or use an Elastic IP if a stable address is required.

## 2. Prepare secrets and domains

Run from the backend repository root:

```bash
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production
```

Replace the two example hostnames and ACME email with real values. Generate a different random value for every secret/password field. Use this command once per field and do not reuse its output:

```bash
openssl rand -hex 32
```

The following values must each be unique and at least 32 characters:

- `POSTGRES_ADMIN_PASSWORD`
- `LOCAL_DB_PASSWORD`
- `N8N_DB_PASSWORD`
- `LOCAL_RABBITMQ_PASSWORD`
- `JWT_SECRET`
- `N8N_API_KEY`
- `N8N_WEBHOOK_SECRET`
- `N8N_ENCRYPTION_KEY`

The application and n8n share `N8N_API_KEY` / `N8N_WEBHOOK_SECRET` for machine-to-machine callbacks. Keep the n8n encryption key stable: changing it without a planned credential migration can make previously stored n8n credentials unreadable.

Check the environment file:

```bash
bash deploy/check-env.sh
```

The script validates required values, hostnames, secret length and uniqueness, then restricts the file permissions to owner read/write. It never prints secret values. Keep `deploy/.env.production` out of Git and backups must be access-controlled.

## 3. Validate, build, and start

Run from the backend repository root. Use the same Compose file and environment file on every command:

```bash
docker compose \
  --env-file deploy/.env.production \
  -f deploy/compose.production.yml \
  config --quiet
```

Build the images sequentially to avoid simultaneous Next.js and NestJS build peaks on a 2-vCPU / 8-GiB instance:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build backend
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build frontend
```

Start the stack:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
```

The backend migration one-shot container runs after PostgreSQL is healthy and before the API starts. It uses the same production image and the explicitly enabled private Compose database mode. If migration exits unsuccessfully, the API is not started.

Inspect services and logs:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=150 backend backend-migrate
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=150 postgres rabbitmq n8n
```

Check the public application:

```bash
curl -fsS https://CRM_DOMAIN/api/v1/health
```

Replace `CRM_DOMAIN` with the real hostname from the environment file. Open `https://CRM_DOMAIN` for the CRM and `https://N8N_DOMAIN` for n8n.

## 4. Complete n8n setup

After first startup:

1. Open the n8n hostname and complete n8n owner setup.
2. Import the workflow JSON files from `integrations/n8n/workflows/` that belong to the deployment.
3. Configure the RabbitMQ connection credential for the private broker and the HTTP Header credential used by protected webhook nodes. Use the same values from the production environment file; do not put credentials into exported workflow JSON.
4. Import the shared error handler and select it as the Error Workflow for WF01, WF08, WF10, WF11 and WF12. Do not assign it to itself.
5. Confirm the RabbitMQ queues and each workflow independently with synthetic records before using real CRM data.
6. Configure Gemini and SMTP credentials as needed. AI workflows need a valid `GEMINI_API_KEY`; email delivery remains unavailable until the SMTP values and sender are configured.
7. WF11 external transcript processing remains disabled by default. Keep it disabled until data classification, provider terms and retention controls are approved.

The existing workflow exports use runtime environment variables for trusted internal calls. The n8n container receives only the variables it needs, but access to environment variables from n8n nodes is enabled for compatibility with those exports. Only import trusted workflow definitions and restrict n8n owner access.

## 5. Updates

After changes have been merged into `main`, update both sibling repositories:

```bash
cd ~/Projects/crm-automation-backend
git switch main
git pull --ff-only

cd ~/Projects/crm-automation-frontend
git switch main
git pull --ff-only
```

Then return to the backend root, validate and rebuild sequentially:

```bash
cd ~/Projects/crm-automation-backend
./deploy/check-env.sh
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build backend
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build frontend
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
```

Review migration logs and health status after every update. Back up the database before schema changes.

## 6. Backups and safety

Create a restricted backup directory:

```bash
mkdir -p ~/crm-backups
chmod 700 ~/crm-backups
```

Create PostgreSQL backups for both databases (run from the backend repository root):

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml exec -T postgres sh -c 'pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -Fc' > ~/crm-backups/crm_backend-$(date +%F-%H%M).dump

docker compose --env-file deploy/.env.production -f deploy/compose.production.yml exec -T postgres sh -c 'pg_dump -U "$N8N_DB_USER" -d "$N8N_DB_NAME" -Fc' > ~/crm-backups/crm_n8n-$(date +%F-%H%M).dump
```

Back up the environment file and the n8n data volume securely as well. The n8n PostgreSQL dump alone does not replace the encryption key; preserve the exact `N8N_ENCRYPTION_KEY`.

Never run `docker compose down -v` on this stack. The `-v` option deletes named volumes containing PostgreSQL, RabbitMQ and n8n state. A normal `docker compose down` preserves named volumes, but it causes downtime. Prefer `up -d` for routine updates.

Keep database dumps off the instance (for example, in a private encrypted backup location) and periodically verify a restore. EBS snapshots are useful but are not a replacement for application-consistent database backups.

## 7. Network and resource boundaries

Only Caddy publishes ports 80 and 443. PostgreSQL, RabbitMQ, n8n, backend and frontend use the private Compose network and have no host-published ports. The service memory limits are designed as an initial budget for a 8-GiB EC2 instance; monitor memory and disk use before raising limits or enabling additional worker concurrency.

The app uses a single PostgreSQL instance and a single RabbitMQ instance. There is no Multi-AZ failover or automatic horizontal scaling in this Compose deployment.
