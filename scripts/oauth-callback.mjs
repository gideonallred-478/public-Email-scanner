export function readOAuthCallbackCode(url, expectedState) {
  if (!expectedState || url.searchParams.get("state") !== expectedState) {
    throw new Error("OAuth callback state is missing or does not match.");
  }
  if (url.searchParams.has("error")) {
    throw new Error("OAuth authorization was declined or failed.");
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("OAuth callback is missing its authorization code.");
  return code;
}
