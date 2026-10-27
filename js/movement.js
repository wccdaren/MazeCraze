// Browser key-repeat rates vary; this timer gives every keyboard the same pace.
export class HoldMovement {
  constructor(step, allowed, clock = globalThis) { this.step = step; this.allowed = allowed; this.clock = clock; this.key = null; this.timer = null; }
  stop() { this.clock.clearTimeout(this.timer); this.timer = null; this.key = null; }
  start(key, direction) {
    this.stop();
    if (!this.allowed()) return;
    this.key = key;
    const tick = () => {
      if (!this.key || !this.allowed() || this.step(...direction) === false) { this.stop(); return false; }
      return true;
    };
    if (!tick()) return;
    const repeat = () => { if (tick()) this.timer = this.clock.setTimeout(repeat, 200); };
    this.timer = this.clock.setTimeout(repeat, 300);
  }
  release(key) { if (key === this.key) this.stop(); }
}
