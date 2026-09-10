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

test('production smoke checks the dedicated GO Client public document assets and API alias', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deployJob, /base="https:\/\/ygph-metropolis\.pureekangraw\.workers\.dev"/);
  assert.match(deployJob, /\$base\/client/);
  assert.match(deployJob, /\$base\/client\/assets\/ui\/go-client\.mjs/);
  assert.match(deployJob, /\$base\/client\/assets\/go-client\.css/);
  assert.match(deployJob, /\$base\/client\/api\/v1\/interpret/);
  assert.match(deployJob, /GO CLIENT/);
  assert.match(deployJob, /go-client-shell/);
  assert.match(deployJob, /INVALID_JSON/);
});

test('production smoke diagnostics expose only a sanitized redirect target', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deployJob, /--dump-header \"\$RUNNER_TEMP\/production-health\.headers\"/);
  assert.match(deployJob, /\^location:/i);
  assert.match(deployJob, /console\.log\(u\.origin\+u\.pathname\)/);
  assert.match(deployJob, /redirect=\$\{redirect_target:-none\}/);
  assert.doesNotMatch(deployJob, /u\.search/);
  assert.doesNotMatch(deployJob, /u\.hash/);
});

test('production smoke keeps legacy owner routes behind the exact Cloudflare Access boundary', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deployJob, /https:\/\/pureekangraw\.cloudflareaccess\.com/);
  assert.match(deployJob, /\/cdn-cgi\/access\/login\/ygph-metropolis\.pureekangraw\.workers\.dev/);
  assert.match(deployJob, /\$base\/api\/v1\/health/);
  assert.match(deployJob, /\$base\/\?surface=client/);
  assert.match(deployJob, /\$base\/ui\/go-client\.mjs/);
  assert.match(deployJob, /\$base\/go-client\.css/);
  assert.match(deployJob, /owner_access_valid=0/);
  assert.match(deployJob, /\[ \"\$owner_root_code\" = \"302\" \]/);
  assert.match(deployJob, /\[ \"\$owner_health_code\" = \"302\" \]/);
  assert.match(deployJob, /\[ \"\$owner_legacy_client_code\" = \"302\" \]/);
  assert.match(deployJob, /\[ \"\$owner_direct_asset_code\" = \"302\" \]/);
  assert.match(deployJob, /\[ \"\$owner_direct_css_code\" = \"302\" \]/);
});

test('production deploy installs a narrowly scoped GO Client Access bypass before smoke verification', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  const deployStep = deployJob.indexOf('- name: Deploy Worker');
  const accessStep = deployJob.indexOf('- name: Ensure GO Client public Access path');
  const smokeStep = deployJob.indexOf('- name: Verify production smoke');
  assert.ok(accessStep > deployStep, 'Access path configuration must happen after the Worker deploy');
  assert.ok(smokeStep > accessStep, 'production smoke must verify the configured Access split');
  assert.match(deployJob, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(deployJob, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(deployJob, /node scripts\/configure-go-client-access\.mjs/);
});

test('Access bypass provisioning is implemented in a syntax-checked create-only script', () => {
  const packageJson = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
  assert.match(packageJson, /node --check scripts\/configure-go-client-access\.mjs/);
  assert.ok(fs.existsSync(path.join(process.cwd(), 'scripts/configure-go-client-access.mjs')));
  const script = fs.existsSync(path.join(process.cwd(), 'scripts/configure-go-client-access.mjs'))
    ? fs.readFileSync(path.join(process.cwd(), 'scripts/configure-go-client-access.mjs'), 'utf8')
    : '';
  assert.match(script, /Access: Apps and Policies Write/);
  assert.match(script, /GO Client Public Path/);
  assert.match(script, /ygph-metropolis\.pureekangraw\.workers\.dev\/client/);
  assert.match(script, /ygph-metropolis\.pureekangraw\.workers\.dev\/client\/\*/);
  assert.match(script, /decision:\s*['"]bypass['"]/);
  assert.match(script, /everyone:\s*\{\}/);
  assert.match(script, /GET existing Access applications/i);
  assert.match(script, /conflicting existing GO Client Access application/i);
  assert.match(script, /POST create scoped Access application/i);
  assert.doesNotMatch(script, /method:\s*['"]PUT['"]/i);
  assert.doesNotMatch(script, /method:\s*['"]DELETE['"]/i);
});

test('Access API failures expose only bounded status, error codes, and messages for diagnosis', () => {
  const script = fs.readFileSync(path.join(process.cwd(), 'scripts/configure-go-client-access.mjs'), 'utf8');
  assert.match(script, /function cloudflareErrorSummary/);
  assert.match(script, /result\.response\.status/);
  assert.match(script, /result\.body\?\.errors/);
  assert.match(script, /error\?\.code/);
  assert.match(script, /error\?\.message/);
  assert.match(script, /slice\(0,\s*3\)/);
  assert.doesNotMatch(script, /JSON\.stringify\(result\.body\)/);
});

test('production smoke requires the public client path while owner surfaces remain Access-protected', () => {
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  assert.match(deployJob, /client_document_valid/);
  assert.match(deployJob, /api_valid/);
  assert.match(deployJob, /owner_root_code/);
  assert.match(deployJob, /owner_health_code/);
  assert.match(deployJob, /owner_direct_asset_code/);
  assert.match(deployJob, /\[ \"\$client_document_valid\" = \"1\" \]/);
  assert.match(deployJob, /\[ \"\$api_valid\" = \"1\" \]/);
  assert.match(deployJob, /\[ \"\$owner_access_valid\" = \"1\" \]/);
  assert.doesNotMatch(deployJob, /content_valid.*\|\|.*access_valid/);
});