import { createHmac, timingSafeEqual } from "node:crypto";

export type CursorPayload = {
  tableId: string;
  sort: { fieldId: string; direction: "asc" | "desc"; value: unknown }[];
  recordId: string;
};

export function encodeCursor(payload: CursorPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

export function decodeCursor(cursor: string, secret: string): CursorPayload {
  const [body, signature] = cursor.split(".");
  if (!body || !signature) {
    throw new Error("Invalid cursor format");
  }

  const expected = sign(body, secret);
  const actualBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid cursor signature");
  }

  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
  if (!parsed.tableId || !parsed.recordId || !Array.isArray(parsed.sort)) {
    throw new Error("Invalid cursor payload");
  }
  return parsed;
}

function sign(body: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error("Cursor secret must be at least 32 characters");
  }
  return createHmac("sha256", secret).update(body).digest("base64url");
}
