// Streaming ZIP writer (store method, no compression) with on-demand ZIP64.
// Stored entries keep CPU usage near zero on the small VPS; most large files
// (video, images, archives) are already compressed anyway.
import { createReadStream } from 'node:fs';
import { crc32 } from 'node:zlib';

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

function dosDateTime(ms, timeZone) {
  const parts = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  for (const p of fmt.formatToParts(new Date(ms))) parts[p.type] = Number(p.value);
  const year = Math.min(Math.max(parts.year, 1980), 2107);
  const time = (parts.hour << 11) | (parts.minute << 5) | Math.floor(parts.second / 2);
  const date = ((year - 1980) << 9) | (parts.month << 5) | parts.day;
  return { time, date };
}

function extendedTimestamp(ms) {
  const b = Buffer.alloc(9);
  b.writeUInt16LE(0x5455, 0);
  b.writeUInt16LE(5, 2);
  b.writeUInt8(1, 4);
  b.writeUInt32LE(Math.max(0, Math.floor(ms / 1000)) >>> 0, 5);
  return b;
}

/**
 * Write a ZIP archive to `out` (a writable stream such as an HTTP response).
 * entries: [{ name: 'dir/' | 'dir/file.txt', type: 'dir'|'file', abs?: string, size?: number, mtime: number }]
 * Returns a promise that resolves once everything is written.
 */
export async function writeZip(out, entries, { timeZone = 'UTC', signal } = {}) {
  let offset = 0;
  const central = [];

  const write = (buf) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('aborted'));
      offset += buf.length;
      if (out.write(buf)) resolve();
      else {
        const onDrain = () => {
          cleanup();
          resolve();
        };
        const onClose = () => {
          cleanup();
          reject(new Error('closed'));
        };
        const cleanup = () => {
          out.off('drain', onDrain);
          out.off('close', onClose);
        };
        out.on('drain', onDrain);
        out.on('close', onClose);
      }
    });

  for (const entry of entries) {
    const isDir = entry.type === 'dir';
    const nameBuf = Buffer.from(isDir && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name, 'utf8');
    const size = isDir ? 0 : entry.size;
    const { time, date } = dosDateTime(entry.mtime, timeZone);
    const localOffset = offset;
    const zip64 = size >= U32_MAX || localOffset >= U32_MAX;
    const flags = isDir ? 0x0800 : 0x0808; // UTF-8 names (+ data descriptor for files)
    const ext = extendedTimestamp(entry.mtime);

    let localExtra = ext;
    if (zip64 && !isDir) {
      const z = Buffer.alloc(20);
      z.writeUInt16LE(0x0001, 0);
      z.writeUInt16LE(16, 2); // uncompressed + compressed sizes (zeros; real ones in descriptor)
      localExtra = Buffer.concat([z, ext]);
    }

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(zip64 ? 45 : 20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(0, 8); // stored
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(zip64 && !isDir ? U32_MAX : 0, 18);
    header.writeUInt32LE(zip64 && !isDir ? U32_MAX : 0, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(localExtra.length, 28);
    await write(Buffer.concat([header, nameBuf, localExtra]));

    let crc = 0;
    if (!isDir) {
      let written = 0;
      if (size > 0) {
        const stream = createReadStream(entry.abs, { start: 0, end: size - 1, highWaterMark: 1 << 20 });
        try {
          for await (const chunk of stream) {
            crc = crc32(chunk, crc);
            written += chunk.length;
            await write(chunk);
          }
        } finally {
          stream.destroy();
        }
      }
      if (written !== size) throw new Error(`size changed while zipping: ${entry.name}`);
      const desc = Buffer.alloc(zip64 ? 24 : 16);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc >>> 0, 4);
      if (zip64) {
        desc.writeBigUInt64LE(BigInt(size), 8);
        desc.writeBigUInt64LE(BigInt(size), 16);
      } else {
        desc.writeUInt32LE(size, 8);
        desc.writeUInt32LE(size, 12);
      }
      await write(desc);
    }

    central.push({ nameBuf, isDir, size, crc, time, date, flags, localOffset, ext });
  }

  const cdStart = offset;
  for (const c of central) {
    const needSize = c.size >= U32_MAX;
    const needOffset = c.localOffset >= U32_MAX;
    const zipFields = [];
    if (needSize) zipFields.push(BigInt(c.size), BigInt(c.size));
    if (needOffset) zipFields.push(BigInt(c.localOffset));
    let extra = c.ext;
    if (zipFields.length) {
      const z = Buffer.alloc(4 + zipFields.length * 8);
      z.writeUInt16LE(0x0001, 0);
      z.writeUInt16LE(zipFields.length * 8, 2);
      zipFields.forEach((v, i) => z.writeBigUInt64LE(v, 4 + i * 8));
      extra = Buffer.concat([z, c.ext]);
    }
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(zipFields.length ? 45 : 20, 4); // made by: MS-DOS
    h.writeUInt16LE(zipFields.length ? 45 : 20, 6);
    h.writeUInt16LE(c.flags, 8);
    h.writeUInt16LE(0, 10);
    h.writeUInt16LE(c.time, 12);
    h.writeUInt16LE(c.date, 14);
    h.writeUInt32LE(c.crc >>> 0, 16);
    h.writeUInt32LE(needSize ? U32_MAX : c.size, 20);
    h.writeUInt32LE(needSize ? U32_MAX : c.size, 24);
    h.writeUInt16LE(c.nameBuf.length, 28);
    h.writeUInt16LE(extra.length, 30);
    h.writeUInt16LE(0, 32);
    h.writeUInt16LE(0, 34);
    h.writeUInt16LE(0, 36);
    h.writeUInt32LE(c.isDir ? 0x10 : 0x20, 38);
    h.writeUInt32LE(needOffset ? U32_MAX : c.localOffset, 42);
    await write(Buffer.concat([h, c.nameBuf, extra]));
  }
  const cdEnd = offset;
  const cdSize = cdEnd - cdStart;
  const count = central.length;
  const needZip64 = count >= U16_MAX || cdStart >= U32_MAX || cdSize >= U32_MAX;

  if (needZip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(44n, 4);
    rec.writeUInt16LE(45, 12);
    rec.writeUInt16LE(45, 14);
    rec.writeUInt32LE(0, 16);
    rec.writeUInt32LE(0, 20);
    rec.writeBigUInt64LE(BigInt(count), 24);
    rec.writeBigUInt64LE(BigInt(count), 32);
    rec.writeBigUInt64LE(BigInt(cdSize), 40);
    rec.writeBigUInt64LE(BigInt(cdStart), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(cdEnd), 8);
    loc.writeUInt32LE(1, 16);
    await write(Buffer.concat([rec, loc]));
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Math.min(count, U16_MAX), 8);
  eocd.writeUInt16LE(Math.min(count, U16_MAX), 10);
  eocd.writeUInt32LE(needZip64 ? U32_MAX : cdSize, 12);
  eocd.writeUInt32LE(needZip64 ? U32_MAX : cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  await write(eocd);
}
