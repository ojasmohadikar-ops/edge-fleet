// p2pBus.js — Simulated Decentralized P2P Message Bus
// Har robot ek independent agent hai; ye sirf message relay karta hai,
// koi central "decision maker" nahi hai. Har robot apna decision khud leta hai
// based on jo messages usne receive kiye.

const EventEmitter = require('events');

class P2PBus extends EventEmitter {
  constructor() {
    super();
    this.robotChannels = new Map(); // robotId -> last known broadcast
  }

  // Robot apni position + intent broadcast karta hai (jaise real mesh network mein)
  broadcast(robotId, payload) {
    this.robotChannels.set(robotId, { ...payload, ts: Date.now() });
    this.emit('robot-broadcast', { from: robotId, payload });
  }

  // Koi bhi robot dusre sab robots ka last known state padh sakta hai
  // (jaise real P2P mein har node apne neighbours ka state maintain karta hai)
  getNeighborStates(excludeId) {
    const states = {};
    for (const [id, data] of this.robotChannels.entries()) {
      if (id !== excludeId) states[id] = data;
    }
    return states;
  }
}

module.exports = new P2PBus(); // singleton bus — sab robots isी se judte hain
