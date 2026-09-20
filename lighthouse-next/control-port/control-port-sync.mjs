import {
  createCommandInputFile,
  createCommandOutputFile,
  createBoardProjectionFromOutput,
} from './command-file.mjs';

export function createLighthouseControlPortSync({ runtime, now = () => new Date().toISOString() } = {}) {
  if (!runtime || typeof runtime.receive !== 'function' || typeof runtime.outbox !== 'function') {
    throw new Error('LIGHTHOUSE_CONTROL_PORT_SYNC_RUNTIME_REQUIRED');
  }

  async function reconcile({
    pullInbox,
    pullInputFile,
    pushOutbox,
    pushOutputFile,
    pushBoardProjection,
    pushState,
  } = {}) {
    const report = {
      startedAt:now(),
      transport:'ONLINE',
      received:0,
      processed:0,
      pushedReceipts:0,
      inputFileId:null,
      outputFileId:null,
      boardProjection:false,
      snapshotFreshness:null,
      errors:[],
    };
    let inputFile = null;

    if (typeof pullInputFile === 'function') {
      try {
        inputFile = createCommandInputFile(await pullInputFile());
        report.inputFileId = inputFile.fileId;
        for (const command of inputFile.commands) {
          runtime.receive(command);
          report.received += 1;
        }
      } catch (error) {
        report.transport = 'OFFLINE';
        report.errors.push(String(error?.message || error || 'PULL_INPUT_FILE_FAILED'));
      }
    } else if (typeof pullInbox === 'function') {
      try {
        const remote = await pullInbox();
        const commands = Array.isArray(remote) ? remote : [];
        for (const command of commands) {
          runtime.receive(command);
          report.received += 1;
        }
      } catch (error) {
        report.transport = 'OFFLINE';
        report.errors.push(String(error?.message || error || 'PULL_FAILED'));
      }
    }

    try {
      const processed = await runtime.processPending();
      report.processed = processed.length;
    } catch (error) {
      report.errors.push(String(error?.message || error || 'PROCESS_PENDING_FAILED'));
    }

    let snapshot = null;
    try {
      snapshot = await runtime.refreshSnapshot();
      report.snapshotFreshness = snapshot.freshness;
    } catch (error) {
      report.errors.push(String(error?.message || error || 'SNAPSHOT_REFRESH_FAILED'));
      try {
        snapshot = await runtime.snapshotStatus();
        report.snapshotFreshness = snapshot.freshness;
      } catch {}
    }

    const receipts = runtime.outbox();
    if (typeof pushOutbox === 'function') {
      try {
        await pushOutbox(receipts);
        report.pushedReceipts = receipts.length;
      } catch (error) {
        report.transport = 'OFFLINE';
        report.errors.push(String(error?.message || error || 'PUSH_OUTBOX_FAILED'));
      }
    }

    if (inputFile) {
      try {
        const outputFile = createCommandOutputFile({
          fileId:'LH-OUT-' + inputFile.fileId,
          inputFileId:inputFile.fileId,
          packageId:inputFile.packageId,
          workId:inputFile.workId,
          results:receipts,
          createdAt:now(),
        });
        report.outputFileId = outputFile.fileId;
        if (typeof pushOutputFile === 'function') await pushOutputFile(outputFile);
        if (typeof pushBoardProjection === 'function') {
          await pushBoardProjection(createBoardProjectionFromOutput(outputFile));
          report.boardProjection = true;
        }
      } catch (error) {
        report.errors.push(String(error?.message || error || 'PUSH_OUTPUT_FILE_FAILED'));
      }
    }

    if (typeof pushState === 'function') {
      try {
        await pushState({
          work:runtime.workState(),
          snapshot,
          syncedAt:now(),
          outputFileId:report.outputFileId,
          boardProjection:report.boardProjection,
        });
      } catch (error) {
        report.transport = 'OFFLINE';
        report.errors.push(String(error?.message || error || 'PUSH_STATE_FAILED'));
      }
    }

    return Object.freeze({
      ...report,
      finishedAt:now(),
      errors:Object.freeze([...report.errors]),
    });
  }

  return Object.freeze({ reconcile });
}
