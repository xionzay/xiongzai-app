/** A synchronous gate, before React can render the disabled button. */
export class ChatSendScope {
  private active = true;
  private generation = 0;
  private busy = false;

  constructor(readonly key: string) {}

  activate() { this.active = true; }

  dispose() {
    this.active = false;
    this.generation++;
    this.busy = false;
  }

  begin() {
    if (!this.active || this.busy) return null;
    this.busy = true;
    const generation = this.generation;
    const isCurrent = () => this.active && generation === this.generation;
    return {
      isCurrent,
      finish: () => { if (isCurrent()) this.busy = false; }
    };
  }
}
