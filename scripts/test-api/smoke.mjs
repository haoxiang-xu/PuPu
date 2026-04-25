import fs from "node:fs";
import { client } from "./client.mjs";

const log = (...a) => console.log("[smoke]", ...a);
const fail = (msg) => {
  console.error("[smoke] FAIL:", msg);
  process.exit(1);
};

(async () => {
  log("base url:", client.baseUrl());

  log("listing models...");
  const { models } = await client.GET("/catalog/models");
  if (!models?.length) fail("no models in catalog");
  const model_id = models[0].id;
  log("using model:", model_id);

  log("creating chat...");
  const { chat_id } = await client.POST("/chats", {
    title: "smoke-test",
    model: model_id,
  });
  log("chat_id:", chat_id);

  log("sending message...");
  const reply = await client.POST(`/chats/${chat_id}/messages`, {
    text: "Reply with the single word 'pong' and nothing else.",
  });
  log(
    "reply preview:",
    typeof reply.content === "string"
      ? reply.content.slice(0, 80)
      : "(non-string content)",
  );
  if (!reply.content) fail("empty assistant content");

  log("taking screenshot...");
  const png = await client.request("GET", "/debug/screenshot");
  fs.writeFileSync("/tmp/pupu-smoke.png", Buffer.from(png));
  log("screenshot -> /tmp/pupu-smoke.png");

  log("snapshot:");
  const state = await client.GET("/debug/state");
  console.log(JSON.stringify(state, null, 2));

  log("cleaning up...");
  await client.DELETE(`/chats/${chat_id}`);

  log("OK");
})().catch((e) => fail(e.message));
