const chatInput = document.querySelector('#chat-input');
const chatSend = document.querySelector('#chat-send');
const chatForm = document.querySelector('#chat-form');

if (chatInput && chatSend && chatForm) {
  const syncSendState = () => {
    chatSend.disabled = !chatInput.value.trim();
  };

  chatInput.addEventListener('input', syncSendState);
  chatForm.addEventListener('submit', () => queueMicrotask(syncSendState));
  syncSendState();
}
