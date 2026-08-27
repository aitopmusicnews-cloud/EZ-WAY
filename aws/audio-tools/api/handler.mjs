import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { normalizeJobRequest, pollHttpStatus, publicJobResponse } from './jobContract.mjs';

const JOBS_TABLE = process.env.JOBS_TABLE || 'ezway-audio-tools-jobs';
const TRACK_ANALYSIS_TABLE = process.env.TRACK_ANALYSIS_TABLE || 'ezway-track-analysis';
const QUEUE_URL = process.env.QUEUE_URL || '';
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'https://ezwaypro.theartistcut.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const sqs = new SQSClient({});

const requestOrigin = (event) => String(event?.headers?.origin || event?.headers?.Origin || '').trim();

const corsOrigin = (event) => {
  const origin = requestOrigin(event);
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || 'https://ezwaypro.theartistcut.com';
};

const response = (event, statusCode, body = null) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': corsOrigin(event),
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'Origin',
  },
  body: body === null ? '' : JSON.stringify(body),
});

const parseBody = (event) => {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw);
};

const nowIso = () => new Date().toISOString();

async function createJob(event) {
  if (!QUEUE_URL) return response(event, 503, { error: 'AWS Audio Tools queue is not configured.' });

  let request;
  try {
    request = normalizeJobRequest(parseBody(event));
  } catch (error) {
    return response(event, 400, { error: error?.message || String(error) });
  }

  const callId = randomUUID();
  const createdAt = nowIso();
  const item = {
    call_id: callId,
    job_id: callId,
    status: 'accepted',
    ...request,
    created_at: createdAt,
    updated_at: createdAt,
  };

  await documentClient.send(new PutCommand({ TableName: JOBS_TABLE, Item: item }));
  await sqs.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(item),
  }));

  return response(event, 202, publicJobResponse(item));
}

async function getJob(event, callId) {
  const result = await documentClient.send(new GetCommand({
    TableName: JOBS_TABLE,
    Key: { call_id: callId },
    ConsistentRead: true,
  }));

  if (!result.Item) return response(event, 404, { error: 'Audio Tools job not found.' });
  return response(event, pollHttpStatus(result.Item.status), publicJobResponse(result.Item));
}

async function getTrackAnalysis(event, trackId) {
  const result = await documentClient.send(new GetCommand({
    TableName: TRACK_ANALYSIS_TABLE,
    Key: { track_id: trackId },
    ConsistentRead: true,
  }));
  if (!result.Item) return response(event, 404, { error: 'Analysis record not found.' });
  return response(event, 200, { record: result.Item });
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || '';
  const rawPath = String(event?.rawPath || event?.path || '');

  if (method === 'OPTIONS') return response(event, 204);
  if (method === 'GET' && rawPath === '/health') {
    return response(event, 200, {
      status: 'ok',
      provider: 'aws',
      queue_configured: Boolean(QUEUE_URL),
      tools: ['analysis', 'lyrics', 'stems'],
    });
  }

  try {
    if (method === 'POST' && rawPath === '/jobs') return await createJob(event);

    if (method === 'GET' && rawPath.startsWith('/jobs/')) {
      const callId = String(event?.pathParameters?.callId || rawPath.slice('/jobs/'.length)).trim();
      if (!callId) return response(event, 400, { error: 'callId is required.' });
      return await getJob(event, callId);
    }

    if (method === 'GET' && rawPath.startsWith('/track-analysis/')) {
      const trackId = String(event?.pathParameters?.trackId || rawPath.slice('/track-analysis/'.length)).trim();
      if (!trackId) return response(event, 400, { error: 'trackId is required.' });
      return await getTrackAnalysis(event, trackId);
    }

    return response(event, 404, { error: 'Route not found.' });
  } catch (error) {
    console.error('[AwsAudioToolsApi] Request failed', error);
    return response(event, 500, { error: 'AWS Audio Tools request failed.' });
  }
};
