# CRM production deployment: Vercel + EC2 + Neon

## Architecture

- Vercel hosts the Next.js frontend and deploys it from the frontend GitHub repository.
- One Ubuntu EC2 instance runs only the NestJS backend, RabbitMQ, n8n, and Caddy as separate Docker Compose services.
- Neon PostgreSQL stores the CRM database. n8n uses its default SQLite database on a persistent Docker volume.
- Docker Hub stores the backend image.
- GitHub Actions runs backend CI, publishes an immutable image tag, and deploys only the backend service through AWS Systems Manager Run Command.

This is a cost-conscious single-instance deployment for the current demo/workload. EC2 remains a single point of failure; it is not a highly available architecture.

## EC2 requirements

- Existing EC2 instance with Docker Engine, Docker Compose v2, Git, and SSM Agent.
- Instance profile includes `AmazonSSMManagedInstanceCore`; the instance must be Online in Systems Manager.
- GitHub IAM user may call `ssm:SendCommand` only for this EC2 instance and `AWS-RunShellScript`, and read command results.
- EC2 outbound HTTPS access to AWS Systems Manager, Docker Hub, Neon, and package/image registries.
- Security Group inbound TCP 80 and 443 only. Do not expose 3000, 5672, 15672, 5678, or 5432.
- Use an EC2 Elastic IP or a DNS name pointing to the EC2 public IP. For a demo without a purchased domain, `nip.io` hostnames can be used, for example `api.<EC2_PUBLIC_IP>.nip.io` and `n8n.<EC2_PUBLIC_IP>.nip.io`.

## Neon database

Use the existing Neon PostgreSQL database for the CRM API. Set `DATABASE_URL` to its connection string and keep TLS enabled with `sslmode=require`. Prefer the direct Neon endpoint for the migration runner.

No second Neon database is needed for n8n. Self-hosted n8n uses SQLite by default; its database file and encryption settings are persisted in the `n8n_data` Docker volume. Keep that volume intact across container updates.

## Prepare the EC2 environment

From AWS Systems Manager Session Manager:

```bash
sudo mkdir -p /opt
sudo git clone --depth 1 --branch main \
  https://github.com/tuananh-developer/crm-automation-backend.git \
  /opt/crm-automation-backend
cd /opt/crm-automation-backend
sudo cp deploy/.env.production.example deploy/.env.production
sudo chown root:root deploy/.env.production
sudo chmod 600 deploy/.env.production
sudo nano deploy/.env.production
```

Fill every placeholder:
- `API_DOMAIN=api.<EC2_PUBLIC_IP>.nip.io`
- `N8N_DOMAIN=n8n.<EC2_PUBLIC_IP>.nip.io`
- `FRONTEND_URL`: exact production origin shown by the Vercel project.
- `ACME_EMAIL`: an email address for Caddy/Let's Encrypt.
- `DATABASE_URL`: Neon CRM database connection string with `sslmode=require`.
- Generate unique secrets for RabbitMQ, JWT, n8n API, webhook, and encryption key. Keep `N8N_ENCRYPTION_KEY` stable after n8n has started. No n8n database credentials are needed.

Generate a value without printing it to the terminal history:

```bash
openssl rand -hex 32
```

Set:
- `NODE_ENV=production`
- `ALLOW_LOCAL_INFRA_IN_PRODUCTION=true`
- `USE_LOCAL_DB=false` (Neon)
- `USE_LOCAL_AMQP=true` (private RabbitMQ container)
- `USE_CLOUD_AMQP=false`
- `RABBITMQ_URL=` (empty)
- `LOCAL_RABBITMQ_HOST=rabbitmq`
- `N8N_BASE_URL=http://n8n:5678`
- `N8N_WEBHOOK_BASE_URL=http://n8n:5678/webhook`

Validate the file:

```bash
sudo bash deploy/check-env.sh deploy/.env.production
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
```

The compose stack runs RabbitMQ, n8n, the backend migration one-shot container, Backend API, and Caddy. Frontend and PostgreSQL are not run on EC2.

## First start

After the backend image has been published to Docker Hub and the repository is readable from EC2:

```bash
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml pull
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d --no-build
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=100 backend backend-migrate n8n rabbitmq caddy
```

The migration service runs before Backend starts. If migrations fail, Backend will not start.

## Vercel configuration

In the Vercel project for the frontend, set the Production environment variable:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.<EC2_PUBLIC_IP>.nip.io/api/v1
```

Set the same value in Preview only if preview deployments should call the same demo backend. Redeploy the Vercel project after changing this build-time variable.

The backend's `FRONTEND_URL` must contain the exact Vercel production origin, without a path. If using a custom Vercel domain, use that origin instead.

## GitHub Actions

In the backend repository, retain:
- Variables: `DOCKERHUB_USERNAME=tanhisme`, `AWS_REGION=ap-southeast-2`, `AWS_EC2_INSTANCE_ID=<existing-instance-id>`.
- Secrets: `DOCKERHUB_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

Keep `ENABLE_EC2_DEPLOY` unset/false until the initial stack is healthy.

After first start succeeds, set `ENABLE_EC2_DEPLOY=true` in the backend repository only. The backend workflow will build/push the exact commit's `sha-xxxxxxx` image, invoke SSM, pull that tag, run migrations, recreate only the Backend container, and wait for the health check.

The frontend repository remains on Vercel. It does not need a Docker Hub publish or EC2 deploy job.

## Operations and safety

```bash
cd /opt/crm-automation-backend
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
sudo docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=150 backend n8n rabbitmq caddy
```

Never run `docker compose down -v`; that deletes named volumes, including RabbitMQ and n8n persistent state.

Back up Neon and preserve `N8N_ENCRYPTION_KEY`. Keep RabbitMQ and n8n ports private. Only Caddy publishes 80/443.
