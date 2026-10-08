#!/usr/bin/env node
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const host = readArg("host", "127.0.0.1");
const port = Number(readArg("port", "1025"));
const inbox = resolve(readArg("inbox", "smtp-inbox"));
await mkdir(inbox, { recursive: true });

function timestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replace(".", "-");
}

const server = createServer((socket) => {
  let buffer = "";
  let dataMode = false;
  let dataLines = [];
  let mailFrom = "";
  let recipients = [];

  const reply = (line) => socket.write(`${line}\r\n`);
  reply("220 localhost Security Email Scanner SMTP harness");

  socket.on("error", (error) => {
    if (error.code !== "ECONNRESET") {
      console.error(`SMTP client error: ${error.message}`);
    }
  });

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);

      if (dataMode) {
        if (line === ".") {
          dataMode = false;
          const message = `${dataLines.map((value) => value.startsWith("..") ? value.slice(1) : value).join("\r\n")}\r\n`;
          const filename = `${timestamp()}-${randomUUID().replaceAll("-", "")}.eml`;
          writeFile(resolve(inbox, filename), message, "utf8")
            .then(() => {
              console.log(`stored ${filename} from=${mailFrom} to=${recipients.join(",")}`);
              reply("250 2.0.0 Message accepted");
            })
            .catch((error) => {
              console.error(error);
              reply("451 4.3.0 Could not store message");
            });
          dataLines = [];
        } else {
          dataLines.push(line);
        }
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) reply("250-localhost\r\n250 8BITMIME");
      else if (upper.startsWith("MAIL FROM:")) { mailFrom = line.slice(10).trim(); recipients = []; reply("250 2.1.0 OK"); }
      else if (upper.startsWith("RCPT TO:")) { recipients.push(line.slice(8).trim()); reply("250 2.1.5 OK"); }
      else if (upper === "DATA") { dataMode = true; dataLines = []; reply("354 End data with <CR><LF>.<CR><LF>"); }
      else if (upper === "RSET") { mailFrom = ""; recipients = []; dataLines = []; reply("250 2.0.0 OK"); }
      else if (upper === "NOOP") reply("250 2.0.0 OK");
      else if (upper === "QUIT") { reply("221 2.0.0 Bye"); socket.end(); }
      else reply("502 5.5.2 Command not implemented");
    }
  });
});

server.on("error", (error) => {
  console.error(`SMTP harness failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`SMTP harness listening on ${host}:${port}; inbox=${inbox}`);
});
