import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({});
const resourceArn = process.env.DB_CLUSTER_ARN || '';
const secretArn = process.env.DB_SECRET_ARN || '';
const database = process.env.DB_NAME || 'ezway';

const ensureConfigured = () => {
  if (!resourceArn || !secretArn) throw new Error('RDS Data API is not configured.');
};

export function sqlParameter(name, value) {
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  if (typeof value === 'boolean') return { name, value: { booleanValue: value } };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } };
  }
  return { name, value: { stringValue: String(value) } };
}

const decodeRows = (result) => {
  if (!result?.formattedRecords) return [];
  const parsed = JSON.parse(result.formattedRecords);
  return Array.isArray(parsed) ? parsed : [];
};

export async function execute(sql, params = [], options = {}) {
  ensureConfigured();
  const command = new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql,
    parameters: params.map(({ name, value }) => sqlParameter(name, value)),
    includeResultMetadata: false,
    formatRecordsAs: 'JSON',
    transactionId: options.transactionId,
  });
  return decodeRows(await client.send(command));
}

export async function executeTransaction(statements) {
  ensureConfigured();
  const begun = await client.send(new BeginTransactionCommand({ resourceArn, secretArn, database }));
  const transactionId = begun.transactionId;
  if (!transactionId) throw new Error('RDS Data API did not return a transaction id.');

  try {
    for (const statement of statements) {
      await execute(statement.sql, statement.params || [], { transactionId });
    }
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
  } catch (error) {
    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
    } catch (rollbackError) {
      console.error('[EzwayDataApi] Transaction rollback failed', rollbackError);
    }
    throw error;
  }
}
