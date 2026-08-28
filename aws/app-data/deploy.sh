#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STACK_NAME="${STACK_NAME:-ezway-app-data}"
PRODUCTION_ORIGIN="${PRODUCTION_ORIGIN:-https://ezwaypro.theartistcut.com}"
AMPLIFY_ORIGIN="${AMPLIFY_ORIGIN:-https://main.d1wu55zn1feotm.amplifyapp.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/template.yaml"

for command in aws sam node curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done

ACCOUNT_ID="$(aws sts get-caller-identity --region "$REGION" --query Account --output text)"
echo "AWS account: $ACCOUNT_ID"
echo "Region: $REGION"
echo "Stack: $STACK_NAME"

VPC_ID="$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "No default VPC found in $REGION." >&2
  exit 1
fi

mapfile -t SUBNETS < <(aws ec2 describe-subnets \
  --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].SubnetId' \
  --output text | tr '\t' '\n' | awk 'NF')
if (( ${#SUBNETS[@]} < 2 )); then
  echo "Aurora requires at least two subnets in the selected VPC." >&2
  exit 1
fi
SUBNET_CSV="$(IFS=,; echo "${SUBNETS[*]}")"

echo "Building SAM application..."
sam build --template-file "$TEMPLATE"

echo "Deploying AWS app-data stack..."
sam deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "VpcId=$VPC_ID" \
    "SubnetIds=$SUBNET_CSV" \
    "ProductionOrigin=$PRODUCTION_ORIGIN" \
    "AmplifyOrigin=$AMPLIFY_ORIGIN"

stack_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue | [0]" \
    --output text
}

EZWAY_API_BASE="$(stack_output EzwayApiBase)"
DB_CLUSTER_ARN="$(stack_output DatabaseClusterArn)"
DB_SECRET_ARN="$(stack_output DatabaseSecretArn)"
DB_NAME="$(stack_output DatabaseName)"
USER_POOL_ID="$(stack_output UserPoolId)"
USER_POOL_CLIENT_ID="$(stack_output UserPoolClientId)"

if [[ -z "$EZWAY_API_BASE" || "$EZWAY_API_BASE" == "None" ]]; then
  echo "Stack did not return EzwayApiBase." >&2
  exit 1
fi

echo "Applying PostgreSQL migrations..."
AWS_REGION="$REGION" \
DB_CLUSTER_ARN="$DB_CLUSTER_ARN" \
DB_SECRET_ARN="$DB_SECRET_ARN" \
DB_NAME="$DB_NAME" \
node "$SCRIPT_DIR/scripts/migrate.mjs"

if [[ -n "$ADMIN_EMAIL" ]]; then
  echo "Ensuring initial Cognito admin exists..."
  if aws cognito-idp admin-get-user \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$ADMIN_EMAIL" >/dev/null 2>&1; then
    echo "Admin user already exists."
  else
    aws cognito-idp admin-create-user \
      --region "$REGION" \
      --user-pool-id "$USER_POOL_ID" \
      --username "$ADMIN_EMAIL" \
      --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
      --desired-delivery-mediums EMAIL >/dev/null
    echo "Admin user created with a Cognito temporary-password flow."
  fi
fi

echo "Checking public health endpoint..."
HEALTH="$(curl -fsS "$EZWAY_API_BASE/health")"
printf '%s\n' "$HEALTH"

echo
echo="Frontend values (do not apply to production until smoke-test.sh passes):"
echo "$echo"
echo "VITE_EZWAY_API_URL=$EZWAY_API_BASE"
echo "VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "VITE_COGNITO_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID"
