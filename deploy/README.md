# EC2 single-node Docker Compose deployment

This deployment runs the CRM application on one Ubuntu EC2 instance:

- Caddy provides HTTPS for the CRM and n8n hostnames.
- Next.js serves the browser UI.
- NestJS serves the API and owns all CRM writes.
- PostgreSQL stores CRM and n8n data in separate databases and roles.
- RabbitMQ is private to the Docker network.
- n8n runs workflows and calls the backend over the private Docker network.
- GitHub Actions builds and publishes immutable Docker Hub image tags after CI succeeds, then deploys the changed app through AWS Systems Manager Run Command.

This is a practical single-node deployment, not a highly available architecture. The EC2 instance, its EBS volume, and its Availability Zone remain single points of failure. Keep independent database and n8n backups before relying on it for important data.

## 1. Prerequisites

- Ubuntu EC2 with Docker Engine, Docker Compose v2, Git, and an online Systems Manager Agent.
- The backend deployment repository is bootstrapped by the first SSM deployment under `/opt/crm-automation-backend` (root-owned). The frontend source checkout is not needed on EC2 because the frontend image is pulled from Docker Hub.
- The EC2 instance profile has `AmazonSSMManagedInstanceCore` and the instance is Online in Systems Manager Managed nodes.
- The GitHub IAM user has only the `ssm:SendCommand` permission for this EC2 instance and `AWS-RunShellScript`, plus `ssm:GetCommandInvocation` for command status.
- Both Docker Hub repositories are readable by EC2. Public repositories need no Docker login; for private repositories configure a Docker Hub read-only credential on EC2 outside GitHub workflow command parameters.
- Two DNS A records point to the EC2 public IPv4 address: `CRM_DOMAIN` and `N8N_DOMAIN`.
- The EC2 Security Group permits inbound TCP 80 and 443 only for the public application. Do not expose 3000, 3001, 5432, 5672, 5678, or 15672. Keep Session Manager for administration.
- A stable public IP is recommended for DNS. An automatically assigned public IPv4 can change after a stop/start; update DNS or use an Elastic IP if a stable address is required.

## 2. Prepare secrets and domains

Run from the backend repository root:

```bash
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production
```

Replace the example hostnames and ACME email with real values. Generate a different random value for every secret/password field with `openssl rand -hex 32`.

Required unique secrets include `POSTGRES_ADMIN_PASSWORD`, `LOCAL_DB_PASSWORD`, `N8N_DB_PASSWORD`, `LOCAL_RABBITMQ_PASSWORD`, `JWT_SECRET`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`, and `N8N_ENCRYPTION_KEY`. Keep the n8n encryption key stable; changing it without a planned credential migration can make stored credentials unreadable.

Run:

```bash
bash deploy/check-env.sh
```

The script validates required values, hostnames, secret length and uniqueness, then restricts file permissions. Keep `deploy/.env.production` out of Git.

## 3. First-time stack start

Configure initial image tags in `deploy/.env.production` (normally `latest` for the first deployment):

```dotenv
BACKEND_IMAGE_TAG=latest
FRONTEND_IMAGE_TAG=latest
```

Validate and pull images:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml pull
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d --no-build
```

The backend migration one-shot container runs after PostgreSQL is healthy and before the API starts. It uses the same published backend image. If migrations fail, the API is not started.

Inspect services:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=150 backend backend-migrate
```

## 4. GitHub Actions configuration

Set these repository variables in both backend and frontend repositories:

- `DOCKERHUB_USERNAME=tanhisme`
- `ENABLE_EC2_DEPLOY=true` only after `/opt/crm-automation-backend/deploy/.env.production` is configured and EC2 is ready; leave unset or false before that.
- `AWS_REGION=ap-southeast-2`
- `AWS_EC2_INSTANCE_ID=i-05f96c4993945b4e9`

Set these repository secrets in both repositories:

- `DOCKERHUB_TOKEN`: Docker Hub token with Read & Write access.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: credentials for the restricted `github-actions-ssm` IAM user.

After the normal CI workflow succeeds on a push to `main`, the publish workflow builds `linux/amd64` and pushes `latest` and `sha-<7-character-commit>` tags. The deploy job runs only when `ENABLE_EC2_DEPLOY=true`; it bootstraps `/opt/crm-automation-backend` and invokes AWS Systems Manager Run Command. EC2 pulls the exact SHA tag and updates only the affected service. The workflow waits for SSM completion and the container health check.

Before enabling automatic deployment, confirm the instance appears Online in Systems Manager Managed nodes. The EC2 instance profile must include `AmazonSSMManagedInstanceCore` and its outbound HTTPS connectivity to Systems Manager endpoints must work.

## 5. Updates

Normal application updates are automatic after a successful push/merge to `main`. The EC2 deployment script uses a shared file lock, updates only the corresponding image tag in `.env.production`, pulls the immutable tag, and recreates only `backend` or `frontend`. Backend updates run the migration dependency first. PostgreSQL, RabbitMQ, n8n, Caddy and named volumes are not intentionally recreated by app-only updates.

To manually inspect or recover:

```bash
cd /opt/crm-automation-backend
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=150 backend frontend
```

Never run `docker compose down -v`; it deletes named volumes containing PostgreSQL, RabbitMQ and n8n state.

## 6. Complete n8n setup

After first startup, complete n8n owner setup, import trusted workflow JSON from `integrations/n8n/workflows/`, configure RabbitMQ and protected HTTP credentials, and test with synthetic records before processing real CRM data. Configure Gemini and SMTP credentials as required. Keep WF11 external transcript processing disabled until data classification, provider terms and retention controls are approved.

## 7. Backups and safety

Create a restricted backup directory:

```bash
mkdir -p ~/crm-backups
chmod 700 ~/crm-backups
```

Back up both PostgreSQL databases and n8n data volume, preserve the exact `N8N_ENCRYPTION_KEY`, store backups off-instance in an encrypted location, and periodically verify restores. EBS snapshots complement but do not replace application-consistent database backups.

## 8. Network and resource boundaries

Only Caddy publishes ports 80 and 443. PostgreSQL, RabbitMQ, n8n, backend and frontend use the private Compose network and have no host-published ports. The single EC2, PostgreSQL and RabbitMQ instances are single points of failure; this is not a Multi-AZ or horizontally scaled deployment.