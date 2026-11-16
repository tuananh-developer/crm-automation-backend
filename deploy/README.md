# CRM production deployment: Vercel + EC2 + Neon

## Architecture

- Vercel hosts the Next.js frontend and deploys it from the frontend GitHub repository.
- One Ubuntu EC2 instance runs the NestJS backend, RabbitMQ, n8n, and Caddy as Docker Compose services.
- Neon PostgreSQL stores CRM business data. n8n uses SQLite on a persistent Docker volume.
- Docker Hub stores two immutable images for each release: the backend runtime image and a deployment-config bundle image.
- GitHub Actions runs CI, publishes both images using the same commit-SHA tag, and invokes AWS Systems Manager Run Command. EC2 pulls deployment config and application images from Docker Hub; it does not clone or pull the GitHub repository.

This is a cost-conscious single-instance deployment. EC2 remains a single point of failure and this is not a highly available architecture.

## EC2 requirements

- Ubuntu 26.04 x86_64 with Docker Engine and Docker Compose v2 already installed.
- At least 4 GiB RAM; 8 GiB is recommended for the configured service limits.
- At least 10 GiB free root disk.
- SSM Agent online in Systems Manager and an instance profile with `AmazonSSMManagedInstanceCore`.
- GitHub's AWS IAM identity can call `ssm:SendCommand` for this EC2 instance and read command results.
- Outbound HTTPS access to AWS Systems Manager, Docker Hub, and Neon.
- Security Group inbound TCP 80 and 443 only. Do not expose 3000, 5672, 15672, 5678, or 5432.
- Use an Elastic IP if using `nip.io` hostnames so public DNS does not change when the instance is stopped and started.

## One-time EC2 bootstrap (no GitHub checkout)

The Docker Hub deployment-config image contains the production Compose file, Caddyfile, RabbitMQ definitions, environment checker, and bootstrap/deploy scripts. The image is versioned alongside the backend image.

Create the deployment directory:

```bash
sudo mkdir -p /opt/crm-automation-backend
```

After the PR that introduces the deployment-config image has been merged and its CI workflow has published the images, run:

```bash
sudo docker pull tanhisme/crm-automation-deploy-config:latest
sudo docker run --rm -v /opt/crm-automation-backend:/target tanhisme/crm-automation-deploy-config:latest
sudo bash /opt/crm-automation-backend/deploy/bootstrap-ec2.sh
```

The bootstrap script:
- Preserves an existing non-placeholder `.env.production`; otherwise backs up the template and prompts for the public IP/domains, ACME email, frontend origin, and Neon `DATABASE_URL`.
- Generates unique RabbitMQ, JWT, n8n API, webhook, and n8n encryption secrets locally on EC2.
- Validates the production environment without printing secrets.
- Pulls the prebuilt backend and supporting service images, runs migrations, starts Compose without building, and checks the backend health endpoint and public API HTTPS endpoint.

For initial HTTPS issuance, configure the EC2 Security Group to allow inbound TCP 80 and 443 from the intended clients (for a public demo, `0.0.0.0/0`; restrict further when possible). DNS/nip.io must resolve both configured hostnames to the EC2 public IP. The frontend origin must be the exact Vercel production origin.

Keep `/opt/crm-automation-backend/deploy/.env.production` root-only. Never paste its contents into chat or commit it. Preserve `N8N_ENCRYPTION_KEY` permanently after n8n has stored credentials; never run `docker compose down -v`.

## GitHub Actions configuration

In the backend repository, configure:

**Repository Variables**
- `DOCKERHUB_USERNAME=tanhisme`
- `AWS_REGION=ap-southeast-2`
- `AWS_EC2_INSTANCE_ID=<your EC2 instance ID>`
- `ENABLE_EC2_DEPLOY=false` until the one-time bootstrap and public API health check are successful.

**Repository Secrets**
- `DOCKERHUB_TOKEN` (Docker Hub access token with read/write access to the two repositories)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The EC2 instance role must include `AmazonSSMManagedInstanceCore`. The GitHub IAM identity needs least-privilege SSM permissions for the target instance and `AWS-RunShellScript`, plus read-command-invocation permissions.

## CI/CD release flow

1. A PR runs CI (lint, build, unit tests, migrations, E2E, deployment Compose validation).
2. After merge to `main`, the successful main-branch CI run triggers the publish workflow.
3. GitHub Actions builds and pushes:
   - `tanhisme/crm-automation-backend:sha-xxxxxxx`
   - `tanhisme/crm-automation-deploy-config:sha-xxxxxxx`
   Both also receive the `latest` tag for one-time bootstrap convenience.
4. When `ENABLE_EC2_DEPLOY=true`, GitHub Actions invokes SSM. EC2 pulls the matching deployment-config image from Docker Hub, installs only deployment files (preserving `.env.production`), pulls the matching backend image, runs migrations, recreates only the backend service, and waits for its health endpoint.
5. Stale CI runs are skipped if their commit is no longer the current `main` head.

EC2 does not need Git, GitHub credentials, or application source code. It only pulls versioned images from Docker Hub and receives deployment commands through SSM.

## Operations

```bash
sudo docker compose --env-file /opt/crm-automation-backend/deploy/.env.production -f /opt/crm-automation-backend/deploy/compose.production.yml ps
sudo docker compose --env-file /opt/crm-automation-backend/deploy/.env.production -f /opt/crm-automation-backend/deploy/compose.production.yml logs --tail=150 backend backend-migrate n8n rabbitmq caddy
```

Back up Neon and keep the EC2 Docker volumes (especially `n8n_data` and `rabbitmq_data`). Do not use `docker compose down -v`.
