const EventEmitter = require('events');

class P2PBus extends EventEmitter {
    constructor() {
        super();
        this.robotChannels = new Map();
    }

    broadcast(robotId, payload) {
        this.robotChannels.set(robotId, {
            ...payload,
            ts: Date.now()
        });

        this.emit('robot-broadcast', {
            from: robotId,
            payload
        });
    }

    getNeighborStates(excludeId) {
        const states = {};

        for (const [id, data] of this.robotChannels.entries()) {
            if (id !== excludeId) {
                states[id] = data;
            }
        }

        return states;
    }

    clearRobot(robotId) {
        this.robotChannels.delete(robotId);
    }

    clearAll() {
        this.robotChannels.clear();
    }
}

module.exports = new P2PBus();
