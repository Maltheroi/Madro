// Signs a long-lived HS256 API key (anon or service_role) for the local stack.
import { createHmac } from "node:crypto";

const [role, secret] = process.argv.slice(2);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const header = b64({ alg: "HS256", typ: "JWT" });
const now = Math.floor(Date.now() / 1000);
const payload = b64({ iss: "madro-local", role, iat: now, exp: now + 10 * 365 * 24 * 3600 });
const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
process.stdout.write(`${header}.${payload}.${sig}`);
