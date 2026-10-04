import assert from "node:assert/strict"
import test from "node:test"
import { RpcPeer } from "./rpc.mjs"

test("stdio handles interleaved notifications and denies host writes", async () => {
  const child = `
    const readline = require('node:readline');
    const send = m => process.stdout.write(JSON.stringify(m) + '\\n');
    let request;
    readline.createInterface({input: process.stdin}).on('line', line => {
      const m = JSON.parse(line);
      if (m.method === 'initialize') {
        request = m.id;
        send({method: 'session/update', params: {update: {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: 'hello'}}}});
        send({id: 'host-write', method: 'fs/write_text_file', params: {path: '/must-not-be-written', content: 'test'}});
      } else if (m.id === 'host-write') {
        send({id: request, result: {hostDenied: m.error?.code === -32601}});
      }
    });`
  const peer = new RpcPeer(process.execPath, ["-e", child])
  let notifications = 0
  peer.onNotification = () => notifications++
  try {
    assert.deepEqual(await peer.request("initialize", {}), { hostDenied: true })
    assert.equal(notifications, 1)
    assert.equal(peer.deniedRequests, 1)
  } finally {
    peer.close()
  }
})

test("a silent protocol process times out and is terminated", async () => {
  const peer = new RpcPeer(process.execPath, ["-e", "process.stdin.resume()"])
  await assert.rejects(peer.request("initialize", {}, 50), /timeout_initialize/)
  assert.equal(peer.closed, true)
  assert.equal(peer.pending.size, 0)
})
