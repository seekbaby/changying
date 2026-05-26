/**
 * WebSocket 全员广播调度器
 */
let wss = null;

function setWss(server) { wss = server; }

function all(action, payload) {
  if (!wss) return;
  const message = JSON.stringify({
    action,
    timestamp: Date.now(),
    payload
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

function send(client, action, requestId, success, payload, error) {
  if (client.readyState !== 1) return;
  client.send(JSON.stringify({
    action: `${action}_${success ? 'ACK' : 'ERR'}`,
    requestId,
    success,
    error: error || null,
    payload: payload || {}
  }));
}

module.exports = { setWss, all, send };
