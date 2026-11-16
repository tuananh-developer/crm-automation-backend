#!/bin/sh
set -eu

TARGET_DIR="${TARGET_DIR:-/target}"
DEPLOY_DIR="$TARGET_DIR/deploy"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Target directory is not mounted: $TARGET_DIR" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR/rabbitmq"

cp /bundle/compose.production.yml "$DEPLOY_DIR/compose.production.yml"
cp /bundle/Caddyfile "$DEPLOY_DIR/Caddyfile"
cp /bundle/rabbitmq/rabbitmq.conf "$DEPLOY_DIR/rabbitmq/rabbitmq.conf"
cp /bundle/rabbitmq/definitions.json "$DEPLOY_DIR/rabbitmq/definitions.json"
cp /bundle/check-env.sh "$DEPLOY_DIR/check-env.sh"
cp /bundle/ssm-deploy-image.sh "$DEPLOY_DIR/ssm-deploy-image.sh"
cp /bundle/bootstrap-ec2.sh "$DEPLOY_DIR/bootstrap-ec2.sh"
cp /bundle/.env.production.example "$DEPLOY_DIR/.env.production.example"

chmod 0644 "$DEPLOY_DIR/compose.production.yml" "$DEPLOY_DIR/Caddyfile" "$DEPLOY_DIR/rabbitmq/rabbitmq.conf" "$DEPLOY_DIR/rabbitmq/definitions.json" "$DEPLOY_DIR/.env.production.example"
chmod 0755 "$DEPLOY_DIR/check-env.sh" "$DEPLOY_DIR/ssm-deploy-image.sh" "$DEPLOY_DIR/bootstrap-ec2.sh"

# Never replace live production secrets or service configuration.
if [ ! -f "$DEPLOY_DIR/.env.production" ]; then
  cp /bundle/.env.production.example "$DEPLOY_DIR/.env.production"
  chmod 0600 "$DEPLOY_DIR/.env.production"
fi

echo "Deployment bundle installed into $DEPLOY_DIR"
