import { describe, expect, it, vi } from "vitest";
import { ConsoleSmsSender, type SmsSender } from "./index.js";

describe("ConsoleSmsSender", () => {
  it("writes the recipient and message on one line", async () => {
    const lines: string[] = [];
    const sender: SmsSender = new ConsoleSmsSender((line) => {
      lines.push(line);
    });

    await sender.send("+15551234567", "Your verification code is 123456");

    expect(lines).toEqual(["[sms] to=+15551234567: Your verification code is 123456"]);
  });

  it("propagates output failures to the caller", async () => {
    const failure = new Error("console unavailable");
    const output = vi.fn<(line: string) => Promise<void>>().mockRejectedValue(failure);
    const sender: SmsSender = new ConsoleSmsSender(output);

    await expect(sender.send("+15551234567", "Your code is 123456")).rejects.toBe(failure);
    expect(output).toHaveBeenCalledTimes(1);
  });

  it("does not write when delivery is already aborted", async () => {
    const output = vi.fn<(line: string) => void>();
    const sender: SmsSender = new ConsoleSmsSender(output);
    const controller = new AbortController();
    controller.abort(new Error("delivery cancelled"));

    await expect(sender.send("+15551234567", "Your code is 123456", controller.signal)).rejects.toThrow(
      "delivery cancelled",
    );
    expect(output).not.toHaveBeenCalled();
  });
});
