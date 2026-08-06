# @skiesjs/mail

A small vendor-neutral email delivery port and a zero-configuration console adapter. SaaS and SMTP integrations live
in separate packages and implement `EmailSender`.

```ts
import { ConsoleEmailSender, type EmailSender } from "@skiesjs/mail";

const sender: EmailSender = new ConsoleEmailSender();
await sender.send({ to: "user@example.com", subject: "Welcome", body: "Hello" }, signal);
```

`ConsoleEmailSender` accepts an optional output function for capture or redirection. Output failures are deliberately
not swallowed: the returned promise rejects so the calling flow chooses whether a failed send is fatal.
