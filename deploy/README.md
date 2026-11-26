# CRM production deployment: Vercel + EC2 + Neon + Tailscale

## Architecture

- Vercel hosts the Next.js frontend and deploys it from the frontend GitHub repository.
- One Ubuntu EC2 instance runs the NestJS backend, RabbitMQ, n8n, and Caddy as Docker Compose services.
- Neon PostgreSQL stores CRM business data. n8n uses SQLite on a persistent Docker volume.
- The existing Docker Hub repository `tanhisme/crm-automation-backend` stores the backend runtime image and deployment-config bundle under separate immutable tags.
- GitHub Actions runs CI, publishes both images, and invokes AWS Systems Manager Run Command. EC2 pulls versioned images from Docker Hub; it does not clone the GitHub repository.
- Caddy is the public ingress for the API and the n8n webhook/form endpoints only.
- Tailscale runs on the EC2 host. Tailscale Serve exposes the n8n editor over HTTPS on tailnet port 8443 to authenticated devices only; this avoids sharing host port 443 with Caddy.

This is a cost-conscious single-instance deployment. EC2 remains a single point of failure and this is not a highly available architecture.

## Public and private endpoints

| Service | Access |
| --- | --- |
| CRM API | Public HTTPS through Caddy at `API_DOMAIN` |
| n8n production/test webhooks | Public HTTPS through Caddy at `N8N_WEBHOOK_DOMAIN`, limited to webhook/form paths |
| n8n Editor and REST API | Tailscale only at `N8N_EDITOR_BASE_URL` |
| RabbitMQ and RabbitMQ Management | Docker internal network only |
| Backend, n8n, and PostgreSQL ports | Not exposed to the public network |
| EC2 administration | AWS Systems Manager Session Manager / Run Command; optionally SSH over Tailscale |

Caddy returns 404 for the root path and every non-webhook/form path on the public n8n hostname. This keeps the editor and n8n REST API off the public ingress. The n8n container publishes port 5678 on host loopback only; Tailscale Serve listens on tailnet HTTPS port 8443 and proxies to that loopback port, leaving public Caddy HTTPS on 443.

The n8n editor and webhook URLs intentionally use different hostnames. This follows n8n's reverse-proxy guidance for separating the editor from public webhooks and forms. Do not add a catch-all reverse proxy for the n8n webhook hostname.

## EC2 requirements

- Ubuntu 26.04 x86_64.
- At least 4 GiB RAM; 8 GiB is recommended for comfortable headroom.
- At least 10 GiB free root disk; 30 GiB gp3 is a reasonable initial allocation.
- Docker Engine and Docker Compose v2.
- SSM Agent online in Systems Manager and an instance profile with `AmazonSSMManagedInstanceCore`.
- Tailscale installed by the bootstrap script, with the EC2 device authorized in your tailnet.
- Tailscale MagicDNS and HTTPS certificates / Serve enabled for your tailnet in the Tailscale admin console.
- Outbound HTTPS access to AWS Systems Manager, Docker Hub, Tailscale, and Neon.
- Security Group inbound TCP 80 and 443 only. Do not expose 3000, 5672, 15672, 5678, or 5432. Prefer no public SSH rule; use SSM or Tailscale SSH if needed.
- Use an Elastic IP if using `nip.io` for the public API and webhook hostnames.

## One-time EC2 bootstrap (no GitHub checkout)

The deployment-config image contains the production Compose file, Caddyfile, RabbitMQ definitions, environment checker, and deployment scripts. It is published into the existing Docker Hub repository using `config-*` tags.

Create the deployment directory:

```bash
sudo mkdir -p /opt/crm-automation-backend
```

After the deployment-config image has been published, run:

```bash
sudo docker pull tanhisme/crm-automation-backend:config-latest
sudo docker run --rm -v /opt/crm-automation-backend:/target tanhisme/crm-automation-backend:config-latest
sudo bash /opt/crm-automation-backend/deploy/bootstrap-ec2.sh
```

Run bootstrap from an interactive terminal (SSH over Tailscale or an SSM Session Manager shell). The script:

1. Preserves an existing non-placeholder `.env.production`; when migrating an older deployment it renames the legacy `N8N_DOMAIN` value to `N8N_WEBHOOK_DOMAIN`.
2. Installs and starts Tailscale on the EC2 host. The first run prints a Tailscale login URL; authorize the EC2 device in your tailnet.
3. Reads the EC2 node's MagicDNS name and configures `N8N_EDITOR_BASE_URL` to use that private Tailscale HTTPS hostname.
4. Prompts for public API/webhook domains, ACME email, frontend origin, Neon `DATABASE_URL`, and optional Gemini API key.
5. Generates unique RabbitMQ, JWT, n8n API, webhook, and n8n encryption secrets locally on EC2.
6. Selects container memory limits based on detected instance RAM and validates the production environment without printing secrets.
7. Pulls prebuilt images, starts Compose without building, configures Tailscale Serve, and checks the backend health, public API HTTPS, and n8n editor isolation.

When Tailscale first requests authorization, open the printed URL from a browser, approve the device, and allow HTTPS certificates / Serve for the tailnet if the admin console requests it. Install Tailscale on your laptop and sign in to the same tailnet to open the n8n editor URL printed at the end of bootstrap.

The bootstrap script preserves an existing non-placeholder `.env.production`. It never regenerates live secrets. Keep `/opt/crm-automation-backend/deploy/.env.production` root-only. Never paste its contents into chat or commit it. Preserve `N8N_ENCRYPTION_KEY` permanently after n8n has stored credentials; never run `docker compose down -v`.

## Vercel frontend configuration

In the Vercel project for the frontend, set the production API base URL to the public API endpoint:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.<EC2_PUBLIC_IP>.nip.io/api/v1
```

Use the actual `API_DOMAIN` selected during EC2 bootstrap (or your custom API domain), then redeploy the frontend so the Next.js build picks up the new public environment variable. In the backend `.env.production`, `FRONTEND_URL` must be the exact Vercel production origin only, for example `https://crm-automation-frontend.vercel.app` (no path).

## GitHub Actions configuration

In the backend repository, configure:

**Repository Variables**
- `DOCKERHUB_USERNAME=tanhisme`
- `AWS_REGION=ap-southeast-2` (or the AWS region where the EC2 instance is created)
- `AWS_EC2_INSTANCE_ID=<your EC2 instance ID>`
- `ENABLE_EC2_DEPLOY=false` until one-time bootstrap and public API / private n8n checks succeed.

**Repository Secrets**
- `DOCKERHUB_TOKEN` (Docker Hub access token with read/write access to `tanhisme/crm-automation-backend`)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The EC2 instance role must include `AmazonSSMManagedInstanceCore`. The GitHub IAM identity needs least-privilege SSM permissions for the target instance and `AWS-RunShellScript`, plus read-command-invocation permissions.

## CI/CD release flow

1. A PR runs CI (lint, build, unit tests, migrations, E2E, deployment Compose validation, Caddyfile validation, and deployment-bundle image validation).
2. After merge to `main`, the successful main-branch CI run triggers the publish workflow.
3. GitHub Actions builds and pushes two image variants into the same Docker Hub repository:
   - Runtime: `tanhisme/crm-automation-backend:sha-xxxxxxx`
   - Deployment config: `tanhisme/crm-automation-backend:config-sha-xxxxxxx`
   Both variants also receive `latest` and `config-latest` tags for one-time bootstrap convenience.
4. When `ENABLE_EC2_DEPLOY=true`, GitHub Actions invokes SSM. EC2 pulls the matching config bundle, installs deployment files while preserving `.env.production`, pulls the matching runtime image, runs migrations, updates Backend/n8n/Caddy, restarts Caddy with the new config, reapplies Tailscale Serve, and waits for the Backend health endpoint.
5. Stale CI runs are skipped if their commit is no longer the current `main` head.

EC2 does not need Git, GitHub credentials, or application source code. It only pulls versioned image tags from Docker Hub and receives deployment commands through SSM.

## Operations

```bash
sudo docker compose --env-file /opt/crm-automation-backend/deploy/.env.production -f /opt/crm-automation-backend/deploy/compose.production.yml ps
sudo docker compose --env-file /opt/crm-automation-backend/deploy/.env.production -f /opt/crm-automation-backend/deploy/compose.production.yml logs --tail=150 backend backend-migrate n8n rabbitmq caddy
sudo tailscale status
sudo tailscale serve status
```

Back up Neon and keep the EC2 Docker volumes (especially `n8n_data` and `rabbitmq_data`). Do not use `docker compose down -v`.
