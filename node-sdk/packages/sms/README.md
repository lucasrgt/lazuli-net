# @skiesjs/sms

A small vendor-neutral SMS delivery port and a zero-configuration console adapter. Provider integrations live in
separate packages and implement `SmsSender`.

```ts
import { ConsoleSmsSender, type SmsSender } from "@skiesjs/sms";

const sender: SmsSender = new ConsoleSmsSender();
await sender.send("+15551234567", "Your verification code is 123456", signal);
```

`ConsoleSmsSender` accepts an optional output function for capture or redirection. Output failures are deliberately
not swallowed: the returned promise rejects so the calling flow chooses whether a failed send is fatal.
