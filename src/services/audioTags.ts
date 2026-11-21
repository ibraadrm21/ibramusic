interface AudioTags {
  title?: string;
  artist?: string;
  albumName?: string;
  thumbnail?: string;
}

const syncSafe = (bytes: Uint8Array, start: number) =>
  ((bytes[start] & 127) << 21) | ((bytes[start + 1] & 127) << 14) | ((bytes[start + 2] & 127) << 7) | (bytes[start + 3] & 127);

export async function readAudioTags(file: Blob): Promise<AudioTags> {
  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (header.length < 10 || String.fromCharCode(...header.slice(0, 3)) !== "ID3" || ![3, 4].includes(header[3]) || header[5] !== 0) return {};
  const size = syncSafe(header, 6);
  if (size > 2_000_000) return {};
  const bytes = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
  const decoder = new TextDecoder("latin1");
  const view = new DataView(bytes.buffer);
  const tags: AudioTags = {};
  const textFields = { TIT2: "title", TPE1: "artist", TALB: "albumName" } as const;
  for (let offset = 0; offset + 10 <= bytes.length;) {
    const id = decoder.decode(bytes.subarray(offset, offset + 4));
    const length = header[3] === 4 ? syncSafe(bytes, offset + 4) : view.getUint32(offset + 4);
    const bodyOffset = offset + 10;
    if (!length || bodyOffset + length > bytes.length) break;
    const body = bytes.subarray(bodyOffset, bodyOffset + length);
    const field = textFields[id as keyof typeof textFields];
    if (field && length > 1) {
      const encoding = ["latin1", "utf-16", "utf-16be", "utf-8"][body[0]];
      if (encoding) tags[field] = new TextDecoder(encoding).decode(body.subarray(1)).replace(/\0.*$/s, "").trim().slice(0, 160);
    }
    if (id === "APIC" && !tags.thumbnail && (body[0] === 0 || body[0] === 3)) {
      const mimeEnd = body.indexOf(0, 1);
      const contentStart = mimeEnd > 0 ? body.indexOf(0, mimeEnd + 2) : -1;
      const mime = mimeEnd > 0 ? decoder.decode(body.subarray(1, mimeEnd)) : "";
      if (contentStart > 0 && /^image\/(jpeg|png)$/.test(mime) && length - contentStart <= 250000) {
        const encoded = Array.from(body.subarray(contentStart + 1), byte => String.fromCharCode(byte)).join("");
        tags.thumbnail = "data:" + mime + ";base64," + btoa(encoded);
      }
    }
    offset = bodyOffset + length;
  }
  return tags;
}
