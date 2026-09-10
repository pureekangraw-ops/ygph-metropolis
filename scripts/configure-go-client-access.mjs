const ACCESS_APP_NAME = 'GO Client Public Path';
const ACCESS_POLICY_NAME = 'Bypass GO Client public path';
const EXACT_DESTINATION = 'ygph-metropolis.pureekangraw.workers.dev/client';
const WILDCARD_DESTINATION = 'ygph-metropolis.pureekangraw.workers.dev/client/*';
const REQUIRED_PERMISSION = 'Access: Apps and Policies Write';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function publicDestinations(app) {
  return (Array.isArray(app?.destinations) ? app.destinations : [])
    .filter((destination) => destination?.type === 'public' && typeof destination?.uri === 'string')
    .map((destination) => destination.uri)
    .sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function includesEveryoneOnly(policy) {
  const include = Array.isArray(policy?.include) ? policy.include : [];
  if (include.length !== 1) return false;
  const everyone = include[0]?.everyone;
  return everyone && typeof everyone === 'object' && Object.keys(everyone).length === 0;
}

function sanitizeCloudflareField(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function cloudflareErrorSummary(result) {
  const status = Number(result?.response?.status || 0);
  const errors = Array.isArray(result?.body?.errors) ? result.body.errors.slice(0, 3) : [];
  const details = errors.map((error) => {
    const code = sanitizeCloudflareField(error?.code ?? 'unknown');
    const message = sanitizeCloudflareField(error?.message ?? 'unspecified');
    return `${code}:${message}`;
  });
  return `Cloudflare response status=${status}${details.length ? `; errors=${details.join(' | ')}` : ''}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function cloudflareRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return { response, body: await readJson(response) };
}

function requireSuccess(result, operation) {
  if (!result.response.ok || result.body?.success !== true) {
    throw new Error(`${operation} failed; ${cloudflareErrorSummary(result)}; ${REQUIRED_PERMISSION} is required`);
  }
  return result.body;
}

async function main() {
  const token = requiredEnv('CLOUDFLARE_API_TOKEN');
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const appsUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`;
  const desiredDestinations = [EXACT_DESTINATION, WILDCARD_DESTINATION].sort();

  // GET existing Access applications. Never mutate an existing app on drift.
  const listed = requireSuccess(
    await cloudflareRequest(`${appsUrl}?per_page=100`, token),
    'Reading Cloudflare Access applications',
  );
  if (!Array.isArray(listed.result)) throw new Error('INVALID_ACCESS_APPLICATION_LIST');
  if (Number(listed.result_info?.total_pages || 1) > 1) {
    throw new Error('conflicting existing GO Client Access application: pagination prevents complete conflict scan');
  }

  const namedApps = listed.result.filter((app) => app?.name === ACCESS_APP_NAME);
  const overlappingApps = listed.result.filter((app) =>
    app?.name !== ACCESS_APP_NAME && publicDestinations(app).some((uri) => desiredDestinations.includes(uri)),
  );
  if (namedApps.length > 1 || overlappingApps.length > 0) {
    throw new Error('conflicting existing GO Client Access application');
  }

  let appId;
  if (namedApps.length === 1) {
    const app = namedApps[0];
    if (app?.type !== 'self_hosted' || !sameStrings(publicDestinations(app), desiredDestinations) || !app?.id) {
      throw new Error('conflicting existing GO Client Access application');
    }
    appId = app.id;
  } else {
    // POST create scoped Access application. There is intentionally no PUT/DELETE recovery path.
    const payload = {
      name: ACCESS_APP_NAME,
      type: 'self_hosted',
      domain: EXACT_DESTINATION,
      destinations: [
        { type: 'public', uri: EXACT_DESTINATION },
        { type: 'public', uri: WILDCARD_DESTINATION },
      ],
      app_launcher_visible: false,
      policies: [
        {
          name: ACCESS_POLICY_NAME,
          decision: 'bypass',
          precedence: 1,
          include: [{ everyone: {} }],
        },
      ],
    };
    const created = requireSuccess(
      await cloudflareRequest(appsUrl, token, { method: 'POST', body: JSON.stringify(payload) }),
      'Creating scoped GO Client Access application',
    );
    if (!created.result?.id) throw new Error('INVALID_CREATED_ACCESS_APPLICATION');
    appId = created.result.id;
  }

  const policies = requireSuccess(
    await cloudflareRequest(`${appsUrl}/${encodeURIComponent(appId)}/policies?per_page=100`, token),
    'Reading GO Client Access application policy',
  );
  const policyList = Array.isArray(policies.result) ? policies.result : [];
  const validPolicy = policyList.length === 1
    && policyList[0]?.name === ACCESS_POLICY_NAME
    && policyList[0]?.decision === 'bypass'
    && includesEveryoneOnly(policyList[0]);
  if (!validPolicy) {
    throw new Error('conflicting existing GO Client Access application policy');
  }

  console.log('GO Client Access split is configured');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
