import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { transform } from "esbuild";

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { code } = await transform(source, {
    format: "esm",
    loader: "ts",
    target: "node20",
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const recovery = await loadTypeScript("../src/lib/gemini-recovery.ts");
const whatsappCloud = await loadTypeScript("../src/lib/whatsapp-cloud.ts");

test("retries temporary Gemini 503s with bounded exponential delays", async () => {
  let calls = 0;
  const delays = [];
  const value = await recovery.generateWithGeminiRecovery(
    async () => {
      calls += 1;
      if (calls < 3) throw { status: 503, message: "UNAVAILABLE" };
      return "ok";
    },
    { sleep: async (delay) => delays.push(delay) },
  );

  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1_000]);
});

test("does not retry quota or rate-limit errors", async () => {
  for (const failure of [
    { status: 429, message: "rate limit" },
    { status: 400, message: "RESOURCE_EXHAUSTED: quota exceeded" },
  ]) {
    let calls = 0;
    await assert.rejects(
      recovery.generateWithGeminiRecovery(async () => {
        calls += 1;
        throw failure;
      }),
      (error) => error.kind === "quota",
    );
    assert.equal(calls, 1);
  }
});

test("bounds Gemini timeout retries and classifies the final failure", async () => {
  let calls = 0;
  await assert.rejects(
    recovery.generateWithGeminiRecovery(
      (_signal) => {
        calls += 1;
        return new Promise((_, reject) => {
          _signal.addEventListener("abort", () => reject(_signal.reason), { once: true });
        });
      },
      { timeoutMs: 5, sleep: async () => undefined },
    ),
    (error) => error.kind === "timeout",
  );
  assert.equal(calls, 2);
});

test("does not retry permanent Gemini errors", async () => {
  let calls = 0;
  await assert.rejects(
    recovery.generateWithGeminiRecovery(async () => {
      calls += 1;
      throw { status: 400, message: "invalid request" };
    }),
    (error) => error.kind === "permanent",
  );
  assert.equal(calls, 1);
});

test("submits the localized WhatsApp fallback through the Cloud API request", async () => {
  let captured;
  const result = await whatsappCloud.submitWhatsAppText({
    phoneNumberId: "test-phone-id",
    accessToken: "test-token",
    to: "15550000000",
    reply: "Désolé, veuillez réessayer.",
    fetcher: async (url, options) => {
      captured = { url, options };
      return new Response('{"messages":[{"id":"wamid.test"}]}', { status: 200 });
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, 200);
  assert.equal(result.providerMessageIdPresent, true);
  assert.equal(captured.url, "https://graph.facebook.com/v21.0/test-phone-id/messages");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(captured.options.body), {
    messaging_product: "whatsapp",
    to: "15550000000",
    type: "text",
    text: { body: "Désolé, veuillez réessayer." },
  });
});

test("does not report a successful Graph request without an accepted message id", async () => {
  await assert.rejects(
    whatsappCloud.submitWhatsAppText({
      phoneNumberId: "test-phone-id",
      accessToken: "test-token",
      to: "15550000000",
      reply: "fallback",
      fetcher: async () => new Response('{"messages":[]}', { status: 200 }),
    }),
    (error) => error.kind === "invalid_response" && error.status === 200,
  );
});

test("does not expose WhatsApp credentials or content in Graph API errors", async () => {
  await assert.rejects(
    whatsappCloud.submitWhatsAppText({
      phoneNumberId: "test-phone-id",
      accessToken: "test-token",
      to: "15550000000",
      reply: "private fallback",
      fetcher: async () => new Response("{}", { status: 401 }),
    }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message.includes("test-token"), false);
      assert.equal(error.message.includes("private fallback"), false);
      return true;
    },
  );
});
