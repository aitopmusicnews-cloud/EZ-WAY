#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
};

const clusterArn = required('DB_CLUSTER_ARN');
const secretArn = required('DB_SECRET_ARN');
const database = required('DB_NAME');
const region = process.env.AWS_REGION || 'us-west-2';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../migrations');
const files = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort();

if (files.length === 0) {
  console.error(`No migration files found in ${migrationsDir}`);
  process.exit(1);
}

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  const statements = sql
    .split(/^\s*-- statement-breakpoint\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);

  console.log(`Applying ${file} (${statements.length} statements)...`);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const result = spawnSync('aws', [
      'rds-data', 'execute-statement',
      '--region', region,
      '--resource-arn', clusterArn,
      '--secret-arn', secretArn,
      '--database', database,
      '--sql', statement,
    ], { stdio: 'inherit' });

    if (result.error) {
      console.error(`Migration ${file} statement ${index + 1} could not start: ${result.error.message}`);
      process.exit(1);
    }

    if (result.status !== 0) {
      console.error(`Migration ${file} failed at statement ${index + 1}.`);
      process.exit(result.status || 1);
    }
  }
}

console.log('AWS app-data migrations complete.');
