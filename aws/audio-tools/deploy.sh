#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STACK_NAME="${STACK_NAME:-ezway-audio-tools}"
ECR_REPO="${ECR_REPO:-ezway-audio-tools}"
PRODUCTION_ORIGIN="${PRODUCTION_ORIGIN:-https://ezwaypro.theartistcut.com}"
AMPLIFY_ORIGIN="${AMPLIFY_ORIGIN:-https://main.d1wu55zn1feotm.amplifyapp.com}"

command -v aws >/dev/null || { echo "AWS CLI is required." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
command -v sam >/dev/null || { echo "AWS SAM CLI is required." >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_HOST="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_HOST}/${ECR_REPO}:latest"

echo "AWS account: ${ACCOUNT_ID}"
echo "Region: ${REGION}"

if ! aws ecr describe-repositories --region "$REGION" --repository-names "$ECR_REPO" >/dev/null 2>&1; then
  aws ecr create-repository \
    --region "$REGION" \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true >/dev/null
fi

aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "$ECR_HOST"

docker build -f aws/audio-tools/Dockerfile -t "$ECR_REPO:latest" .
docker tag "$ECR_REPO:latest" "$IMAGE_URI"
docker push "$IMAGE_URI"

VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)}"

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "No default VPC found. Set VPC_ID and SUBNET_IDS before running this script." >&2
  exit 1
fi

SUBNET_IDS="${SUBNET_IDS:-$(aws ec2 describe-subnets \
  --region "$REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=map-public-ip-on-launch,Values=true \
  --query 'Subnets[].SubnetId' \
  --output text | tr '\t' ',')}"

if [[ -z "$SUBNET_IDS" || "$SUBNET_IDS" == "None" ]]; then
  echo "No public subnets found. Set SUBNET_IDS as a comma-separated list." >&2
  exit 1
fi

echo "VPC: ${VPC_ID}"
echo "Subnets: ${SUBNET_IDS}"

sam build --template-file aws/audio-tools/template.yaml
sam deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "WorkerImageUri=${IMAGE_URI}" \
    "VpcId=${VPC_ID}" \
    "SubnetIds=${SUBNET_IDS}" \
    "ProductionOrigin=${PRODUCTION_ORIGIN}" \
    "AmplifyOrigin=${AMPLIFY_ORIGIN}"

API_BASE="$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`AudioToolsApiBase`].OutputValue | [0]' \
  --output text)"

echo
echo "Verifying AWS Audio Tools health..."
curl --fail --silent --show-error "${API_BASE}/health" | python -m json.tool

echo
echo "AWS Audio Tools API: ${API_BASE}"
echo "After a real analysis job is verified, set this Amplify build variable:"
echo "VITE_AUDIO_TOOLS_URL=${API_BASE}"
