class PerformanceTracker {
    constructor() {
        this.metrics = [];
    }

    recordToken(tps) {
        this.metrics.push({ time: Date.now(), tps });
        if (this.metrics.length > 50) this.metrics.shift();
    }

    getAverageTPS() {
        if (this.metrics.length === 0) return 0;
        const sum = this.metrics.reduce((acc, curr) => acc + parseFloat(curr.tps || 0), 0);
        return (sum / this.metrics.length).toFixed(1);
    }
}

window.performanceTracker = new PerformanceTracker();
