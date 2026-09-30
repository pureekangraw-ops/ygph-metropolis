const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('LIGHTHOUSE deployment route is retired and PRISM cannot deploy a Worker', () => {
  assert.equal(fs.existsSync('.github/workflows/greenfield-deploy-gate.yml'), false);
  const workflow = fs.readFileSync('.github/workflows/prism-owner-build.yml', 'utf8');
  assert.doesNotMatch(workflow, /wrangler|cloudflare\/wrangler-action|CLOUDFLARE_API_TOKEN|Deploy Worker/);
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
  assert.match(script, /result\?\.response\?\.status/);
  assert.match(script, /result\?\.body\?\.errors/);
  assert.match(script, /error\?\.code/);
  assert.match(script, /error\?\.message/);
  assert.match(script, /slice\(0,\s*3\)/);
  assert.doesNotMatch(script, /JSON\.stringify\(result\.body\)/);
});
