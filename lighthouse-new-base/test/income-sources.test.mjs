import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncomeSources } from '../src/income-sources.mjs';

function fakeRuntime() {
  const ledger = {};
  const ride = {};
  let revision = 0;
  return {
    async receiveCustomerPayment({ queueId, ledgerTransactionId, amountSatang }) {
      revision += 1;
      ledger[ledgerTransactionId] = { record: { recordId: ledgerTransactionId, type:'TRANSACTION', direction:'IN', subtype:'RECEIVABLE_PAYMENT', amountSatang, sourceRef:`CALENDAR/${queueId}` } };
    },
    async rideJob({ roundId, jobId, ledgerTransactionId, amountSatang, paymentMode, note }) {
      revision += 1;
      ride[jobId] = { record: { recordId:jobId, type:'JOB', roundId, amountSatang, paymentMode, note } };
      if (paymentMode === 'CASH') ledger[ledgerTransactionId] = { record: { recordId:ledgerTransactionId, type:'TRANSACTION', direction:'IN', subtype:'RIDE_CASH', amountSatang, sourceRef:`RIDE/${jobId}` } };
    },
    async readState() { return { revision, domains:{ LEDGER:{ records:ledger }, RIDE:{ records:ride } } }; },
  };
}

test('debtor payment enters Income only after Runtime proves the real incoming transaction', async () => {
  const sources = createIncomeSources({ runtime:fakeRuntime(), idFactory:()=> 'rcv-1' });
  const result = await sources.receiveDebtorPayment({ queueId:'Q-1', amountSatang:30000 });
  assert.equal(result.owner, 'income');
  assert.equal(result.kind, 'debtor-payment');
  assert.equal(result.cashIn, true);
  assert.equal(result.readback.direction, 'IN');
  assert.equal(result.readback.amountSatang, 30000);
});

test('cash ride job is Income and real cash-in while credit ride income remains non-cash until withdrawal', async () => {
  const ids = ['cash-1', 'credit-1'];
  const sources = createIncomeSources({ runtime:fakeRuntime(), idFactory:()=> ids.shift() });

  const cash = await sources.recordRideIncome({ roundId:'ROUND-1', amountSatang:42000, paymentMode:'CASH', note:'Lalamove' });
  assert.equal(cash.owner, 'income');
  assert.equal(cash.kind, 'ride-income');
  assert.equal(cash.cashIn, true);
  assert.equal(cash.ledger.amountSatang, 42000);

  const credit = await sources.recordRideIncome({ roundId:'ROUND-1', amountSatang:50000, paymentMode:'CREDIT', note:'Lalamove credit' });
  assert.equal(credit.owner, 'income');
  assert.equal(credit.cashIn, false);
  assert.equal(credit.ledger, null);
  assert.equal(credit.ride.amountSatang, 50000);
});
