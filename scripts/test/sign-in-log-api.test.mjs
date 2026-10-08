import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { fetchSignInLog } from "../../src/auth/signInLogApi.js";
import { setAuthToken } from "../../src/api/apiClient.js";

const originalFetch = globalThis.fetch;
const originalSessionStorage = globalThis.sessionStorage;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.sessionStorage = originalSessionStorage;
});

function installSessionStorage() {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("sign-in log requests include the authenticated API token", async () => {
  installSessionStorage();
  setAuthToken("tracker-session-token");
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ ok: true, entries: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await fetchSignInLog();

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, "Bearer tracker-session-token");
});
