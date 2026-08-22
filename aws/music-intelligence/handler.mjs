import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME || 'ezway-track-analysis';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const response = (statusCode, body = null) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'content-type,authorization,x-amz-date,x-amz-security-token,x-amz-content-sha256',
    'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
  },
  body: body === null ? '' : JSON.stringify(body),
});

const parseBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw);
};

const validStatus = new Set(['processing', 'ready', 'error']);

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || '';
  const trackId = String(event?.pathParameters?.trackId || '').trim();

  if (method === 'OPTIONS') return response(204);
  if (!trackId) return response(400, { error: 'trackId is required' });

  try {
    if (method === 'GET') {
      const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { track_id: trackId },
        ConsistentRead: true,
      }));

      if (!result.Item) return response(404, { error: 'Analysis record not found' });
      return response(200, { record: result.Item });
    }

    if (method === 'PUT') {
      const incoming = parseBody(event);
      if (!incoming || typeof incoming !== 'object') {
        return response(400, { error: 'A JSON analysis record is required' });
      }
      if (incoming.track_id && incoming.track_id !== trackId) {
        return response(409, { error: 'track_id does not match the URL trackId' });
      }
      if (!validStatus.has(incoming.status)) {
        return response(400, { error: 'status must be processing, ready, or error' });
      }
      if (!incoming.profile || typeof incoming.profile !== 'object') {
        return response(400, { error: 'profile is required' });
      }

      const now = new Date().toISOString();
      const record = {
        ...incoming,
        track_id: trackId,
        created_at: incoming.created_at || now,
        updated_at: now,
      };

      await client.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
      }));

      return response(200, { record });
    }

    if (method === 'DELETE') {
      await client.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { track_id: trackId },
      }));
      return response(200, { deleted: true, track_id: trackId });
    }

    return response(405, { error: `Unsupported method: ${method || 'unknown'}` });
  } catch (error) {
    console.error('[MusicIntelligenceAWS] Request failed', error);
    return response(500, { error: 'Music Intelligence storage request failed' });
  }
};