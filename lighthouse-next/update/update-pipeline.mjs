function need(owner, name) {
  if (!owner || typeof owner[name] !== 'function') throw new TypeError(`Missing method: ${name}`);
}

function checkDeps({ resolver, downloader, client, knownGood } = {}) {
  for (const name of ['check','resolve']) need(resolver, name);
  need(downloader, 'download');
  for (const name of ['verify','stage','test','activate','readback','rollback']) need(client, name);
  for (const name of ['beginCandidate','commitAfterReadback','abortCandidate']) need(knownGood, name);
}

export async function runUpdate(deps = {}) {
  checkDeps(deps);
  const { resolver, downloader, client, knownGood } = deps;
  const check = await resolver.check();
  if (!check?.available) return Object.freeze({ status: 'NO_UPDATE' });

  const resolved = await resolver.resolve(check);
  const payload = await downloader.download(resolved);
  const evidence = await client.verify(resolved?.manifest ?? resolved, payload);
  await knownGood.beginCandidate(evidence);

  let activationStarted = false;
  try {
    const staged = await client.stage(payload, evidence);
    await client.test(staged, evidence);
    activationStarted = true;
    await client.activate(staged, evidence);
    const readback = await client.readback(evidence);
    const state = await knownGood.commitAfterReadback(readback);
    return Object.freeze({ status: 'COMMITTED', release: evidence, state });
  } catch (error) {
    if (activationStarted) {
      try { await client.rollback(error); } catch (_) {}
    }
    try { await knownGood.abortCandidate(String(error?.message ?? error)); } catch (_) {}
    throw error;
  }
}
