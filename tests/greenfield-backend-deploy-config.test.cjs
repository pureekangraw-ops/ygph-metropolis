const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflowPath = path.join(process.cwd(), '.github/workflows/greenfield-deploy-gate.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('production deploy uses a Wrangler version that supports secrets.required', () => {
  assert.match(workflow, /wranglerVersion:\s*"4\.126\.0"/);
});

test('production deploy explicitly targets the top-level environment', () => {
  assert.match(workflow, /command:\s*deploy --env=""/);
});

test('safety gate validates Wrangler config before deployment', () => {
  assert.match(workflow, /npx --yes wrangler@4\.126\.0 deploy --dry-run --env=""/);
});

test('pull request verification never deploys a staging environment automatically', () => {
  assert.doesNotMatch(workflow, /Deploy Master Input candidate to staging/);
  assert.doesNotMatch(workflow, /command:\s*deploy --env staging/);
  assert.doesNotMatch(
    workflow,
    /github\.event_name\s*==\s*'pull_request'[\s\S]{0,1200}(?:wrangler-action|command:\s*deploy)/,
  );
});
