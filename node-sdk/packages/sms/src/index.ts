/** The vendor-neutral port implemented by every SMS transport. */
export interface SmsSender {
  /** Deliver a text message, rejecting when delivery fails or the operation is cancelled. */
  send(toPhone: string, message: string, signal?: AbortSignal): Promise<void>;
}

/** A console output function, injectable so applications and tests control where development SMS is written. */
export type ConsoleOutput = (line: string) => void | Promise<void>;

const defaultOutput: ConsoleOutput = (line) => console.log(line);

/** A zero-configuration development sender that writes SMS messages to console output. */
export class ConsoleSmsSender implements SmsSender {
  /** Create a sender that writes through `output`, or through the console by default. */
  public constructor(private readonly output: ConsoleOutput = defaultOutput) {}

  /** Write one delivery line without hiding output failures. */
  public async send(toPhone: string, message: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.output(`[sms] to=${toPhone}: ${message}`);
  }
}
