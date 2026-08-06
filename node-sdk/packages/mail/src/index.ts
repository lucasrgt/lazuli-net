/** An email with a plain-text body. */
export interface EmailMessage {
  /** The recipient address. */
  readonly to: string;
  /** The subject line. */
  readonly subject: string;
  /** The plain-text body. */
  readonly body: string;
}

/** The vendor-neutral port implemented by every email transport. */
export interface EmailSender {
  /** Deliver a message, rejecting when delivery fails or the operation is cancelled. */
  send(message: EmailMessage, signal?: AbortSignal): Promise<void>;
}

/** A console output function, injectable so applications and tests control where development mail is written. */
export type ConsoleOutput = (line: string) => void | Promise<void>;

const defaultOutput: ConsoleOutput = (line) => console.log(line);

/** A zero-configuration development sender that writes mail to console output instead of delivering it. */
export class ConsoleEmailSender implements EmailSender {
  /** Create a sender that writes through `output`, or through the console by default. */
  public constructor(private readonly output: ConsoleOutput = defaultOutput) {}

  /** Write the delivery header and body in order, without hiding output failures. */
  public async send(message: EmailMessage, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.output(`[email] to=${message.to} subject="${message.subject}"`);
    signal?.throwIfAborted();
    await this.output(message.body);
  }
}
