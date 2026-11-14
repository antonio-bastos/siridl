"""Centralized Cloudflare R2 object storage service (upload, get, replace, delete, presign)."""

from __future__ import annotations

import hashlib
import hmac
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:  # Optional boto3 client
    import boto3
except ImportError:  # pragma: no cover - optional runtime dependency
    boto3 = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "text/plain",
    "application/json",
}
MAX_OBJECT_BYTES = 20 * 1024 * 1024  # 20 MB


def load_env_local_if_needed() -> None:
    """Populate missing environment variables from .env.local if present."""
    for candidate in (PROJECT_ROOT / ".env.local", PROJECT_ROOT / "dashboard" / ".env.local"):
        if not candidate.exists():
            continue
        for raw_line in candidate.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def get_r2_config() -> dict[str, str]:
    load_env_local_if_needed()
    return {
        "endpoint_url": os.getenv("R2_ENDPOINT_URL", "").rstrip("/"),
        "bucket": os.getenv("R2_BUCKET", "siri-dl").strip() or "siri-dl",
        "access_key_id": os.getenv("R2_ACCESS_KEY_ID", "").strip(),
        "secret_access_key": os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        "prefix": (os.getenv("R2_PREFIX", "retrain_dataset").strip("/") or "retrain_dataset"),
    }


def _sigv4_sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _build_sigv4_headers(
    *,
    method: str,
    endpoint_url: str,
    bucket: str,
    object_key: str,
    body: bytes,
    content_type: Optional[str],
    access_key_id: str,
    secret_access_key: str,
    region: str = "auto",
) -> tuple[str, dict[str, str]]:
    parsed = urllib.parse.urlparse(endpoint_url)
    host = parsed.netloc
    clean_key = object_key.lstrip("/")
    encoded_key = "/".join(urllib.parse.quote(seg, safe="") for seg in clean_key.split("/"))
    canonical_uri = f"/{bucket}/{encoded_key}"
    target_url = f"{parsed.scheme}://{host}{canonical_uri}"

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()

    headers_map: dict[str, str] = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers_map["content-type"] = content_type

    sorted_keys = sorted(headers_map.keys())
    canonical_headers = "".join(f"{k}:{headers_map[k]}\n" for k in sorted_keys)
    signed_headers = ";".join(sorted_keys)

    canonical_request = "\n".join(
        [
            method.upper(),
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )

    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )

    k_date = _sigv4_sign(("AWS4" + secret_access_key).encode("utf-8"), date_stamp)
    k_region = _sigv4_sign(k_date, region)
    k_service = _sigv4_sign(k_region, "s3")
    k_signing = _sigv4_sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    req_headers: dict[str, str] = {
        "Host": host,
        "x-amz-date": amz_date,
        "x-amz-content-sha256": payload_hash,
        "Authorization": (
            f"AWS4-HMAC-SHA256 Credential={access_key_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        ),
    }
    if content_type:
        req_headers["Content-Type"] = content_type
    return target_url, req_headers


def validate_upload(body: bytes, content_type: str) -> None:
    if len(body) > MAX_OBJECT_BYTES:
        raise ValueError(f"Ficheiro excede o limite máximo de {MAX_OBJECT_BYTES // (1024 * 1024)} MB.")
    normalized = content_type.split(";")[0].strip().lower()
    if normalized not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Tipo MIME não suportado para armazenamento R2: {content_type}")


def upload_object(
    *,
    object_key: str,
    body: bytes,
    content_type: str,
    config: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Validate and upload an object to Cloudflare R2. Returns metadata dict."""
    validate_upload(body, content_type)
    cfg = config or get_r2_config()
    if not cfg["endpoint_url"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return {
            "ok": False,
            "error": "Credenciais R2 não configuradas.",
            "object_key": object_key,
        }

    clean_key = object_key.lstrip("/")
    sha256_hex = hashlib.sha256(body).hexdigest()

    if boto3 is not None:
        try:
            client = boto3.client(
                "s3",
                endpoint_url=cfg["endpoint_url"],
                aws_access_key_id=cfg["access_key_id"],
                aws_secret_access_key=cfg["secret_access_key"],
                region_name="auto",
            )
            client.put_object(
                Bucket=cfg["bucket"],
                Key=clean_key,
                Body=body,
                ContentType=content_type,
            )
            return {
                "ok": True,
                "bucket": cfg["bucket"],
                "object_key": clean_key,
                "mime_type": content_type,
                "file_size": len(body),
                "sha256": sha256_hex,
                "public_url": f"/api/media/{clean_key}",
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc), "object_key": clean_key}

    target_url, headers = _build_sigv4_headers(
        method="PUT",
        endpoint_url=cfg["endpoint_url"],
        bucket=cfg["bucket"],
        object_key=clean_key,
        body=body,
        content_type=content_type,
        access_key_id=cfg["access_key_id"],
        secret_access_key=cfg["secret_access_key"],
    )
    try:
        req = urllib.request.Request(target_url, data=body, method="PUT", headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            ok = 200 <= int(resp.status) < 300
            return {
                "ok": ok,
                "bucket": cfg["bucket"],
                "object_key": clean_key,
                "mime_type": content_type,
                "file_size": len(body),
                "sha256": sha256_hex,
                "public_url": f"/api/media/{clean_key}",
                "error": None if ok else f"HTTP {resp.status}",
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"HTTP {exc.code}: {exc.reason}", "object_key": clean_key}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "object_key": clean_key}


def head_object(object_key: str, config: Optional[dict[str, str]] = None) -> bool:
    """Return True if object_key exists in Cloudflare R2."""
    cfg = config or get_r2_config()
    if not cfg["endpoint_url"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return False
    clean_key = object_key.lstrip("/")
    target_url, headers = _build_sigv4_headers(
        method="HEAD",
        endpoint_url=cfg["endpoint_url"],
        bucket=cfg["bucket"],
        object_key=clean_key,
        body=b"",
        content_type=None,
        access_key_id=cfg["access_key_id"],
        secret_access_key=cfg["secret_access_key"],
    )
    try:
        req = urllib.request.Request(target_url, method="HEAD", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= int(resp.status) < 300
    except Exception:
        return False


def get_object_bytes(
    object_key: str,
    config: Optional[dict[str, str]] = None,
) -> tuple[Optional[bytes], Optional[str]]:
    """Fetch object bytes and content-type from Cloudflare R2."""
    cfg = config or get_r2_config()
    if not cfg["endpoint_url"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return None, None
    clean_key = object_key.lstrip("/")
    target_url, headers = _build_sigv4_headers(
        method="GET",
        endpoint_url=cfg["endpoint_url"],
        bucket=cfg["bucket"],
        object_key=clean_key,
        body=b"",
        content_type=None,
        access_key_id=cfg["access_key_id"],
        secret_access_key=cfg["secret_access_key"],
    )
    try:
        req = urllib.request.Request(target_url, method="GET", headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read(), resp.headers.get("Content-Type", "application/octet-stream")
    except Exception:
        return None, None


def delete_object(object_key: str, config: Optional[dict[str, str]] = None) -> bool:
    """Delete an object from Cloudflare R2."""
    cfg = config or get_r2_config()
    if not cfg["endpoint_url"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return False
    clean_key = object_key.lstrip("/")
    target_url, headers = _build_sigv4_headers(
        method="DELETE",
        endpoint_url=cfg["endpoint_url"],
        bucket=cfg["bucket"],
        object_key=clean_key,
        body=b"",
        content_type=None,
        access_key_id=cfg["access_key_id"],
        secret_access_key=cfg["secret_access_key"],
    )
    try:
        req = urllib.request.Request(target_url, method="DELETE", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= int(resp.status) < 300
    except Exception:
        return False


def replace_object(
    *,
    old_key: Optional[str],
    new_key: str,
    body: bytes,
    content_type: str,
    config: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Upload new_key and remove old_key (if different) so no orphaned objects remain."""
    res = upload_object(object_key=new_key, body=body, content_type=content_type, config=config)
    if res.get("ok") and old_key and old_key.lstrip("/") != new_key.lstrip("/"):
        delete_object(old_key, config=config)
    return res


def generate_presigned_get_url(
    object_key: str,
    *,
    expires_in: int = 3600,
    config: Optional[dict[str, str]] = None,
) -> Optional[str]:
    """Generate an AWS SigV4 presigned GET URL for temporary direct access to an R2 object."""
    cfg = config or get_r2_config()
    if not cfg["endpoint_url"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
        return None

    parsed = urllib.parse.urlparse(cfg["endpoint_url"])
    host = parsed.netloc
    clean_key = object_key.lstrip("/")
    encoded_key = "/".join(urllib.parse.quote(seg, safe="") for seg in clean_key.split("/"))
    canonical_uri = f"/{cfg['bucket']}/{encoded_key}"

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    region = "auto"
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"

    query_params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{cfg['access_key_id']}/{credential_scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires_in),
        "X-Amz-SignedHeaders": "host",
    }
    canonical_query = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in sorted(query_params.items())
    )
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query,
            f"host:{host}\n",
            "host",
            "UNSIGNED-PAYLOAD",
        ]
    )
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    k_date = _sigv4_sign(("AWS4" + cfg["secret_access_key"]).encode("utf-8"), date_stamp)
    k_region = _sigv4_sign(k_date, region)
    k_service = _sigv4_sign(k_region, "s3")
    k_signing = _sigv4_sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    return f"{parsed.scheme}://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"
