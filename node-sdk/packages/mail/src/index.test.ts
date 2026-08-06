import { describe, expect, it, vi } from "vitest";
import { ConsoleEmailSender, type EmailMessage, type EmailSender } from "./index.js";

describe("ConsoleEmailSender", () => {
  const message: EmailMessage = {
    to: "user@example.com",
    subject: "Verify your email",
    body: "Open https://example.com/verify/token",
  };

  it("writes the delivery header and plain-text body in order", async () => {
    const lines: string[] = [];
    const sender: EmailSender = new ConsoleEmailSender((line) => {
      lines.push(line);
    });

    await sender.send(message);

    expect(lines).toEqual([
      '[email] to=user@example.com subject="Verify your email"',
      "Open https://example.com/verify/token",
    ]);
  });

  it("propagates output failures to the caller", async () => {
    const failure = new Error("console unavailable");
    const output = vi.fn<(line: string) => Promise<void>>().mockRejectedValue(failure);
    const sender: EmailSender = new ConsoleEmailSender(output);

    await expect(sender.send(message)).rejects.toBe(failure);
    expect(output).toHaveBeenCalledTimes(1);
  });

  it("does not write when delivery is already aborted", async () => {
    const output = vi.fn<(line: string) => void>();
    const sender: EmailSender = new ConsoleEmailSender(output);
    const controller = new AbortController();
    controller.abort(new Error("delivery cancelled"));

    await expect(sender.send(message, controller.signal)).rejects.toThrow("delivery cancelled");
    expect(output).not.toHaveBeenCalled();
  });
});
