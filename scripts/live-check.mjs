// Read-only live verification against the real MyFxBook API.
// Prints SHAPES and TYPES, never secrets. Run: node --env-file=.env scripts/live-check.mjs
import axios from "axios";

const BASE = "https://www.myfxbook.com/api";
const email = process.env.MYFXBOOK_EMAIL;
const password = process.env.MYFXBOOK_PASSWORD;

if (!email || !password) {
  console.error("Missing MYFXBOOK_EMAIL / MYFXBOOK_PASSWORD");
  process.exit(1);
}

const mask = (s) =>
  typeof s === "string" && s.length > 6 ? `${s.slice(0, 3)}…${s.slice(-2)}` : "***";

const typesOf = (obj) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? "array" : typeof v])
  );

async function main() {
  // 1. login (exactly how src/index.ts does it: GET with query params)
  const loginUrl = `${BASE}/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const loginRes = await axios.get(loginUrl);
  console.log("[login] error:", loginRes.data.error, "| message:", JSON.stringify(loginRes.data.message));
  if (loginRes.data.error) process.exit(1);
  const session = loginRes.data.session;
  console.log("[login] session:", mask(session), "| typeof:", typeof session);

  // 2. get-my-accounts
  const acc = await axios.get(`${BASE}/get-my-accounts.json?session=${session}`);
  console.log("\n[get-my-accounts] error:", acc.data.error, "| message:", JSON.stringify(acc.data.message));
  const accounts = acc.data.accounts || [];
  console.log("[get-my-accounts] top-level keys:", Object.keys(acc.data));
  console.log("[get-my-accounts] accounts count:", accounts.length);
  if (accounts.length) {
    console.log("[get-my-accounts] FIELD TYPES of accounts[0]:");
    console.log(JSON.stringify(typesOf(accounts[0]), null, 2));
    console.log("[get-my-accounts] id VALUE:", accounts[0].id, "| typeof id:", typeof accounts[0].id);
    console.log("[get-my-accounts] accountId:", accounts[0].accountId, "| typeof:", typeof accounts[0].accountId);
    console.log("[get-my-accounts] demo:", accounts[0].demo, "| typeof:", typeof accounts[0].demo);
  }

  const id = accounts[0]?.id;
  if (id === undefined) {
    console.log("\n(no accounts on this profile — skipping per-account endpoints)");
  } else {
    // 3. get-open-trades
    const ot = await axios.get(`${BASE}/get-open-trades.json?session=${session}&id=${id}`);
    console.log("\n[get-open-trades] error:", ot.data.error, "| message:", JSON.stringify(ot.data.message));
    console.log("[get-open-trades] top-level keys:", Object.keys(ot.data));
    console.log("[get-open-trades] openTrades count:", (ot.data.openTrades || []).length);
    if ((ot.data.openTrades || []).length) {
      console.log("[get-open-trades] FIELD TYPES:", JSON.stringify(typesOf(ot.data.openTrades[0])));
    }

    // 4. get-history  (measure payload size — relevant for MCP context blow-up)
    const h = await axios.get(`${BASE}/get-history.json?session=${session}&id=${id}`);
    const history = h.data.history || [];
    console.log("\n[get-history] error:", h.data.error, "| message:", JSON.stringify(h.data.message));
    console.log("[get-history] top-level keys:", Object.keys(h.data));
    console.log("[get-history] history count:", history.length);
    console.log("[get-history] serialized size (what the MCP tool returns):",
      JSON.stringify(history, null, 2).length.toLocaleString(), "chars");
    if (history.length) {
      console.log("[get-history] FIELD TYPES:", JSON.stringify(typesOf(history[0])));
    }
  }

  // 5. Invalid-session contract (drives the retry logic in src/index.ts)
  const bad = await axios.get(`${BASE}/get-my-accounts.json?session=BOGUS`);
  console.log("\n[invalid session] payload:", JSON.stringify(bad.data));
  console.log("[invalid session] message contains 'session'?:",
    String(bad.data.message).toLowerCase().includes("session"));

  // 6. Missing required field contract
  const miss = await axios.get(`${BASE}/get-open-trades.json?session=${session}`);
  console.log("\n[missing id] payload:", JSON.stringify(miss.data));
  console.log("[missing id] message contains 'session'?:",
    String(miss.data.message).toLowerCase().includes("session"));

  // 7. Does the id have to be a number? Try it as a string.
  if (id !== undefined) {
    const asString = await axios.get(`${BASE}/get-open-trades.json?session=${session}&id=${String(id)}`);
    console.log("\n[id as string] error:", asString.data.error, "| message:", JSON.stringify(asString.data.message));
  }

  // 8. Logout so we don't leak a live session
  const out = await axios.get(`${BASE}/logout.json?session=${session}`);
  console.log("\n[logout] payload:", JSON.stringify(out.data));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
