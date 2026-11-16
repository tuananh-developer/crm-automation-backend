#!/bin/sh
set -eu

TARGET_DIR="${TARGET_DIR:-/target}"
DEPLOY_DIR="$TARGET_DIR/deploy"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Target directory is not mounted: $TARGET_DIR" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR/rabbitmq"

install -m 0644 /bundle/compose.production.yml "$DEPLOY_DIR/compose.production.yml"
install -m 0644 /bundle/Caddyfile "$DEPLOY_DIR/Caddyfile"
install -m 0644 /bundle/rabbitmq/rabbitmq.conf "$DEPLOY_DIR/rabbitmq/rabbitmq.conf"
install -m 0644 /bundle/rabbitmq/definitions.json "$DEPLOY_DIR/rabbitmq/definitions.json"
install -m 0755 /bundle/check-env.sh "$DEPLOY_DIR/check-env.sh"
install -m 0755 /bundle/ssm-deploy-image.sh "$DEPLOY_DIR/ssm-deploy-image.sh"
install -m 0755 /bundle/bootstrap-ec2.sh "$DEPLOY_DIR/bootstrap-ec2.sh"
install -m 0644 /bundle/.env.production.example "$DEPLOY_DIR/.env.production.example"

# Never replace live production secrets or service configuration.
if [ ! -f "$DEPLOY_DIR/.env.production" ]; then
  install -m 0600 /bundle/.env.production.example "$DEPLOY_DIR/.env.production"
fi

echo "Deployment bundle installed into $DEPLOY_DIR"
