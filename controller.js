import { applyCommand } from './domain.js';
import { commitState } from './vault.js';

export function createAppController({
  store,
  state,
  onChange = () => {},
  commandOptions = {},
}) {
  let currentState = structuredClone(state);
  let busy = false;

  return {
    getState() {
      return structuredClone(currentState);
    },

    isBusy() {
      return busy;
    },

    async dispatch(command) {
      if (busy) throw new Error('ระบบกำลังบันทึก กรุณารอสักครู่');
      busy = true;
      try {
        const proposed = applyCommand(currentState, command, commandOptions);
        const receipt = await commitState({
          store,
          proposed,
          action: command.type,
        });
        currentState = proposed;
        onChange(structuredClone(currentState), receipt);
        return receipt;
      } finally {
        busy = false;
      }
    },
  };
}
