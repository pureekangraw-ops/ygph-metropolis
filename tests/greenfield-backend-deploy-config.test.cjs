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

test('production deploy verifies the deployed endpoint after the Worker upload', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  const deployStep = deployJob.indexOf('- name: Deploy Worker');
  const smokeStep = deployJob.indexOf('- name: Verify production smoke');
  assert.ok(deployStep >= 0, 'production deploy step must exist');
  assert.ok(smokeStep > deployStep, 'production smoke verification must run after Deploy Worker');
});

test('production smoke checks health and the GO Client public surface assets', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deployJob, /base="https:\/\/ygph-metropolis\.pureekangraw\.workers\.dev"/);
  assert.match(deployJob, /\$base\/api\/v1\/health/);
  assert.match(deployJob, /x\.version!=="1"\|\|x\.status!=="ok"\|\|!x\.requestId/);
  assert.match(deployJob, /\$base\/\?surface=client/);
  assert.match(deployJob, /\$base\/ui\/go-client\.mjs/);
  assert.match(deployJob, /\$base\/go-client\.css/);
  assert.match(deployJob, /GO CLIENT/);
  assert.match(deployJob, /go-client-shell/);
});