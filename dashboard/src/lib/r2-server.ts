/**
 * Server-only Cloudflare R2 S3-compatible client (AWS SigV4 via Node crypto).
 * NEVER import this module from client components.
 */

import crypto from "node:crypto";

function getR2Config() {
  const endpointUrl = (process.env.R2_ENDPOINT_URL || "").replace(/\/$/, "");
  const bucket = (process.env.R2_BUCKET || "siri-dl").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  return { endpointUrl, bucket, accessKeyId, secretAccessKey };
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Uint8Array | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signR2Request(
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  objectKey: string,
  body: Uint8Array = new Uint8Array(0),
  contentType?: string,
) {
  const cfg = getR2Config();
  if (!cfg.endpointUrl || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("Credenciais Cloudflare R2 não configuradas.");
  }

  const parsed = new URL(cfg.endpointUrl);
  const host = parsed.host;
  const cleanKey = objectKey.replace(/^\/+/, "");
  const encodedKey = cleanKey
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const canonicalUri = `/${cfg.bucket}/${encodedKey}`;
  const targetUrl = `${parsed.protocol}//${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const payloadHash = sha256Hex(body);

  const headerEntries: [string, string][] = [
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];
  if (contentType) {
    headerEntries.push(["content-type", contentType]);
  }
  headerEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = headerEntries.map(([k]) => k).join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const headers: Record<string, string> = {
    Host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return { targetUrl, headers };
}

export async function getR2Object(objectKey: string): Promise<{
  ok: boolean;
  status: number;
  bytes?: ArrayBuffer;
  contentType?: string;
}> {
  const { targetUrl, headers } = signR2Request("GET", objectKey);
  const res = await fetch(targetUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  return {
    ok: true,
    status: res.status,
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}
