import { WorkerEntrypoint } from 'cloudflare:workers';
import worker from './worker.mjs';
import { invokeGoview } from './go-adapter.mjs';
export default worker;
export class GoviewGoBridge extends WorkerEntrypoint {
  async invoke(name,args) { return invokeGoview(this.env,name,args); }
}
