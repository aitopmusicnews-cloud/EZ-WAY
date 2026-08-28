# EZ-WAY AWS Audio Tools

This is the AWS-only runtime for Music Intelligence, synced lyrics, and stem separation. Production does not require Modal.

## Architecture

1. EZ-WAY uploads the master audio and calls `POST /jobs`.
2. API Gateway/Lambda stores an accepted job in DynamoDB and sends it to SQS.
3. The ECS Fargate worker long-polls SQS and runs the requested action.
4. Job status/results are written to DynamoDB.
5. Music Intelligence profiles are also written to the canonical track-analysis table.
6. Lyrics/stem files are written to private S3 and returned through expiring presigned URLs.
7. EZ-WAY polls `GET /jobs/{call_id}` until the result is terminal.

## Runtime actions

- `analysis`: All-In-One-Infer + CLAP + librosa
- `lyrics`: Demucs + faster-whisper on CPU/int8
- `stems`: Demucs on CPU

The first AWS version intentionally uses Fargate CPU. A later GPU worker can replace the task definition without changing the browser API.

## CloudShell deployment

From a checkout of the EZ-WAY repository in AWS CloudShell:

```bash
chmod +x aws/audio-tools/deploy.sh
./aws/audio-tools/deploy.sh
```

Defaults:

- Region: `us-west-2`
- Stack: `ezway-audio-tools`
- ECR repository: `ezway-audio-tools`
- CORS production origin: `https://ezwaypro.theartistcut.com`
- CORS Amplify origin: `https://main.d1wu55zn1feotm.amplifyapp.com`

The script builds/pushes the worker image, discovers the default VPC/public subnets, runs `sam build` and `sam deploy`, and calls the deployed `/health` endpoint.

If the account does not use the default VPC, provide existing public subnets explicitly:

```bash
VPC_ID=vpc-123456 \
SUBNET_IDS=subnet-111111,subnet-222222 \
./aws/audio-tools/deploy.sh
```

The worker has no inbound listener. It needs outbound internet access to fetch uploaded audio and first-use model files.

## Production verification before Amplify configuration

Do not point EZ-WAY at the endpoint merely because CloudFormation finished. First verify a real analysis job:

```bash
API_BASE="https://YOUR_API_ID.execute-api.us-west-2.amazonaws.com"
AUDIO_URL="https://YOUR_CLOUD_AUDIO_URL"

JOB_JSON="$(curl -fsS -X POST "$API_BASE/jobs" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ezwaypro.theartistcut.com' \
  -d "{\"action\":\"analysis\",\"file_url\":\"$AUDIO_URL\",\"track_id\":\"aws-smoke-test\",\"track_name\":\"AWS Smoke Test\"}")"

echo "$JOB_JSON" | python -m json.tool
CALL_ID="$(python -c 'import json,sys; print(json.load(sys.stdin)["call_id"])' <<<"$JOB_JSON")"

for i in {1..40}; do
  RESULT="$(curl -fsS "$API_BASE/jobs/$CALL_ID" -H 'Origin: https://ezwaypro.theartistcut.com')"
  echo "$RESULT" | python -m json.tool
  STATUS="$(python -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' <<<"$RESULT")"
  [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
  sleep 15
done
```

A successful analysis must return `status: completed` and a non-empty `profile`.

Then verify the canonical profile read:

```bash
curl -fsS "$API_BASE/track-analysis/aws-smoke-test" \
  -H 'Origin: https://ezwaypro.theartistcut.com' | python -m json.tool
```

Only after those checks succeed should Amplify build with:

```text
VITE_AUDIO_TOOLS_URL=<verified API base or verified custom domain>
```

The intended stable custom hostname is `https://audio-tools-api.theartistcut.com`, but the repository does not hard-code it until DNS, TLS, API mapping, and a real job are verified.

## Security

- No AWS keys belong in Vite variables or browser code.
- S3 generated outputs are private.
- The worker task role is limited to its queue, tables, and output bucket.
- CORS is restricted to the two EZ-WAY web origins in the stack parameters.
- CORS is not authentication. Before broad multi-user exposure, add API Gateway throttling/WAF and user-level authorization.
