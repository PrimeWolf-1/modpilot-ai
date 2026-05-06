import { createServer, getServerPort } from "@devvit/web/server";
import { serverOnRequest } from "./server.ts";
import { Devvit } from "@devvit/public-api";

Devvit.addSettings([
  {
    type: "string",
    name: "GROQ_API_KEY",
    label: "Groq API Key",
    scope: "app",
    isSecret: true,
  },
]);

const server = createServer(serverOnRequest);
const port: number = getServerPort();

server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
