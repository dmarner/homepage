import crypto from "node:crypto";

import cache from "memory-cache";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { asJson } from "utils/proxy/api-helpers";
import { httpProxy } from "utils/proxy/http";
import widgets from "widgets/widgets";

const logger = createLogger("ugosProxyHandler");

function encryptPassword(pubKeyB64, password) {
  const pubKeyDer = Buffer.from(pubKeyB64, "base64");
  let pubKey;
  try {
    pubKey = crypto.createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
  } catch {
    // Fallback: treat as PEM
    pubKey = crypto.createPublicKey(pubKeyDer.toString("utf-8"));
  }
  const encrypted = crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, "utf-8"),
  );
  return encrypted.toString("base64");
}

async function getToken(widget) {
  const cacheKey = `ugos__token__${widget.url}__${widget.username}`;
  const cached = cache.get(cacheKey);
  if (cached) return { token: cached };

  const baseUrl = widget.url.replace(/\/+$/, "");

  // Step 1: fetch RSA public key
  const [s1, , , h1] = await httpProxy(`${baseUrl}/ugreen/v1/verify/check?token=`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: widget.username }),
  });

  if (s1 !== 200) {
    return { error: `UGOS RSA key fetch failed: HTTP ${s1}` };
  }

  const pubKeyB64 = h1?.["x-rsa-token"];
  if (!pubKeyB64) {
    return { error: "UGOS: no x-rsa-token header in check response" };
  }

  // Step 2: encrypt password and login
  let encryptedPassword;
  try {
    encryptedPassword = encryptPassword(pubKeyB64, widget.password);
  } catch (err) {
    return { error: `UGOS RSA encryption failed: ${err.message}` };
  }

  const [s2, , d2] = await httpProxy(`${baseUrl}/ugreen/v1/verify/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      is_simple: true,
      keepalive: true,
      otp: false,
      username: widget.username,
      password: encryptedPassword,
    }),
  });

  if (s2 !== 200) {
    return { error: `UGOS login failed: HTTP ${s2}` };
  }

  const loginJson = asJson(d2);
  if (loginJson?.code !== 200) {
    return { error: `UGOS login error: ${loginJson?.msg ?? "unknown"}` };
  }

  const token = loginJson?.data?.token;
  if (!token) {
    return { error: "UGOS: no token in login response" };
  }

  cache.put(cacheKey, token, 30 * 60 * 1000);
  return { token };
}

export default async function ugosProxyHandler(req, res, map) {
  const { group, service, endpoint, index } = req.query;

  if (!group || !service) {
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const widget = await getServiceWidget(group, service, index);
  if (!widget) {
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  if (!endpoint) {
    return res.status(204).end();
  }

  const widgetDef = widgets[widget.type];
  const mapping = widgetDef?.mappings?.[endpoint];
  if (!mapping?.ugosPath) {
    logger.debug("UGOS: no ugosPath for endpoint %s", endpoint);
    return res.status(403).json({ error: "Unsupported endpoint" });
  }

  const { token, error: tokenError } = await getToken(widget);
  if (tokenError) {
    logger.error(tokenError);
    return res.status(401).json({ error: tokenError });
  }

  const baseUrl = widget.url.replace(/\/+$/, "");
  const sep = mapping.ugosPath.includes("?") ? "&" : "?";
  const url = `${baseUrl}${mapping.ugosPath}${sep}token=${token}`;

  const [status, contentType, data] = await httpProxy(url);

  if (status !== 200) {
    if (contentType) res.setHeader("Content-Type", contentType);
    return res.status(status).send(data);
  }

  const json = asJson(data);
  if (json?.code !== 200) {
    // Likely an expired token — evict cache so next request re-authenticates
    cache.del(`ugos__token__${widget.url}__${widget.username}`);
    logger.warn("UGOS API error (code %d): %s", json?.code, json?.msg);
    return res.status(401).json({ error: `UGOS API error: ${json?.msg ?? "unknown"}` });
  }

  let result = json.data ?? {};
  if (map) result = map(result);

  return res.status(200).json(result);
}
