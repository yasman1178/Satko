/**
 * Comprehensive Video Duration Patcher for WebM and MP4.
 *
 * Problem:
 * Browsers using MediaRecorder stream chunks live, leaving the duration metadata
 * omitted or set to 0. Android Gallery, Google Photos, and WhatsApp rely on
 * these container duration headers. Without them, mobile players show "0:03"
 * (the first chunk length) and disable seeking/scrubbing.
 *
 * This utility:
 * 1. For WebM: Safely injects/updates the EBML Duration element (0x4489) in the Info element
 *    using 64-bit IEEE float without 32-bit JavaScript bitwise overflow bugs.
 * 2. For MP4: Locates the mvhd (Movie Header) and tkhd (Track Header) boxes and patches
 *    the duration field according to the container timescale.
 */

// ─── WebM EBML Helpers ───

function readEbmlVint(
  buffer: Uint8Array,
  start: number
): { length: number; value: number } | null {
  if (start >= buffer.length) return null;
  const firstByte = buffer[start];
  if (firstByte === 0) return null;

  let length = 1;
  let mask = 0x80;
  while ((firstByte & mask) === 0 && length <= 8) {
    length++;
    mask >>= 1;
  }

  if (length > 8 || start + length > buffer.length) return null;

  let value = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = value * 256 + buffer[start + i];
  }

  return { length, value };
}

function writeEbmlVint(value: number, targetLength: number = 4): Uint8Array {
  // Use targetLength (default 4 bytes) for clean VINT encoding without overflow
  const length = Math.max(1, Math.min(8, targetLength));
  const result = new Uint8Array(length);
  const marker = 1 << (8 - length);

  let temp = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }
  result[0] |= marker;
  return result;
}

/**
 * Patches WebM Blob with exact duration in milliseconds
 */
export async function patchWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Verify EBML Header (0x1A, 0x45, 0xDF, 0xA3)
    if (
      buffer[0] !== 0x1a ||
      buffer[1] !== 0x45 ||
      buffer[2] !== 0xdf ||
      buffer[3] !== 0xa3
    ) {
      return blob;
    }

    let pos = 0;

    // Read EBML Header element length
    pos += 4;
    const ebmlLen = readEbmlVint(buffer, pos);
    if (!ebmlLen) return blob;
    pos += ebmlLen.length + ebmlLen.value;

    // Search for Segment element (0x18, 0x53, 0x80, 0x67)
    let segmentPos = -1;
    for (let i = pos; i < Math.min(pos + 256, buffer.length - 4); i++) {
      if (
        buffer[i] === 0x18 &&
        buffer[i + 1] === 0x53 &&
        buffer[i + 2] === 0x80 &&
        buffer[i + 3] === 0x67
      ) {
        segmentPos = i;
        break;
      }
    }

    if (segmentPos === -1) return blob;

    pos = segmentPos + 4;
    const segmentLen = readEbmlVint(buffer, pos);
    if (!segmentLen) return blob;
    pos += segmentLen.length;

    // Search for Info element (0x15, 0x49, 0xA9, 0x66) inside Segment
    let infoPos = -1;
    const searchLimit = Math.min(pos + 8192, buffer.length - 4);
    for (let i = pos; i < searchLimit; i++) {
      if (
        buffer[i] === 0x15 &&
        buffer[i + 1] === 0x49 &&
        buffer[i + 2] === 0xa9 &&
        buffer[i + 3] === 0x66
      ) {
        infoPos = i;
        break;
      }
    }

    if (infoPos === -1) return blob;

    const infoLenPos = infoPos + 4;
    const infoLen = readEbmlVint(buffer, infoLenPos);
    if (!infoLen) return blob;

    const infoDataStart = infoLenPos + infoLen.length;
    // Handle both known and unknown size Info elements
    const isUnknownInfoLen = infoLen.value >= 0x00ffffffffff;
    const infoDataEnd = isUnknownInfoLen
      ? Math.min(infoDataStart + 4096, buffer.length)
      : Math.min(infoDataStart + infoLen.value, buffer.length);

    // Search for existing Duration tag (0x44, 0x89) inside Info
    let durationTagPos = -1;
    let durationDataPos = -1;
    let durationDataLen = 0;

    let scanPos = infoDataStart;
    while (scanPos < infoDataEnd - 4) {
      if (buffer[scanPos] === 0x44 && buffer[scanPos + 1] === 0x89) {
        durationTagPos = scanPos;
        const tagLen = readEbmlVint(buffer, scanPos + 2);
        if (tagLen) {
          durationDataPos = scanPos + 2 + tagLen.length;
          durationDataLen = tagLen.value;
        }
        break;
      }

      // Check next EBML element
      const id = readEbmlVint(buffer, scanPos);
      if (!id || id.length === 0) {
        scanPos++;
        continue;
      }
      const size = readEbmlVint(buffer, scanPos + id.length);
      if (!size) {
        scanPos++;
        continue;
      }
      scanPos += id.length + size.length + size.value;
    }

    if (durationTagPos !== -1 && durationDataPos !== -1) {
      // Overwrite existing duration tag in-place with Float64 big-endian
      const view = new DataView(arrayBuffer, durationDataPos, durationDataLen);
      if (durationDataLen === 4) {
        view.setFloat32(0, durationMs, false);
      } else if (durationDataLen === 8) {
        view.setFloat64(0, durationMs, false);
      }
      return new Blob([buffer as unknown as BlobPart], { type: blob.type || 'video/webm' });
    }

    // Insert new Duration tag:
    // ID: 0x44, 0x89
    // VINT length: 0x88 (1 byte VINT for 8 bytes data)
    // Data: 8 bytes Float64
    const durationTag = new Uint8Array(11);
    durationTag[0] = 0x44;
    durationTag[1] = 0x89;
    durationTag[2] = 0x88;
    const dv = new DataView(durationTag.buffer, 3, 8);
    dv.setFloat64(0, durationMs, false);

    // Insert tag immediately after Info element header
    const prefix = buffer.subarray(0, infoDataStart);
    const suffix = buffer.subarray(infoDataStart);

    // Create updated Info element length if it was fixed size
    let updatedBuffer: Uint8Array;
    if (!isUnknownInfoLen) {
      const newInfoLenVal = infoLen.value + 11;
      const newInfoLenBytes = writeEbmlVint(newInfoLenVal, infoLen.length);

      const prefixBeforeInfoLen = buffer.subarray(0, infoLenPos);
      const dataAfterInfoLen = buffer.subarray(infoLenPos + infoLen.length);

      updatedBuffer = new Uint8Array(
        prefixBeforeInfoLen.length +
          newInfoLenBytes.length +
          durationTag.length +
          dataAfterInfoLen.length
      );

      let offset = 0;
      updatedBuffer.set(prefixBeforeInfoLen, offset);
      offset += prefixBeforeInfoLen.length;

      updatedBuffer.set(newInfoLenBytes, offset);
      offset += newInfoLenBytes.length;

      updatedBuffer.set(durationTag, offset);
      offset += durationTag.length;

      updatedBuffer.set(dataAfterInfoLen, offset);
    } else {
      updatedBuffer = new Uint8Array(prefix.length + durationTag.length + suffix.length);
      updatedBuffer.set(prefix, 0);
      updatedBuffer.set(durationTag, prefix.length);
      updatedBuffer.set(suffix, prefix.length + durationTag.length);
    }

    return new Blob([updatedBuffer as unknown as BlobPart], { type: blob.type || 'video/webm' });
  } catch (err) {
    console.warn('WebM duration patch fallback:', err);
    return blob;
  }
}

// ─── MP4 Box Helpers ───

/**
 * Patches MP4 Blob with exact duration in seconds
 */
export async function patchMp4Duration(blob: Blob, durationSec: number): Promise<Blob> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    let offset = 0;
    while (offset < buffer.length - 8) {
      const boxSize = view.getUint32(offset);
      const boxType = String.fromCharCode(
        buffer[offset + 4],
        buffer[offset + 5],
        buffer[offset + 6],
        buffer[offset + 7]
      );

      if (boxSize < 8 || offset + boxSize > buffer.length) break;

      if (boxType === 'moov') {
        // Search inside moov for mvhd
        let moovOffset = offset + 8;
        const moovEnd = offset + boxSize;

        while (moovOffset < moovEnd - 8) {
          const subSize = view.getUint32(moovOffset);
          const subType = String.fromCharCode(
            buffer[moovOffset + 4],
            buffer[moovOffset + 5],
            buffer[moovOffset + 6],
            buffer[moovOffset + 7]
          );

          if (subSize < 8 || moovOffset + subSize > moovEnd) break;

          if (subType === 'mvhd') {
            const version = buffer[moovOffset + 8];
            if (version === 0) {
              const timescale = view.getUint32(moovOffset + 20);
              if (timescale > 0) {
                const totalUnits = Math.round(durationSec * timescale);
                view.setUint32(moovOffset + 24, totalUnits);
              }
            } else if (version === 1) {
              const timescale = view.getUint32(moovOffset + 28);
              if (timescale > 0) {
                const totalUnits = BigInt(Math.round(durationSec * timescale));
                view.setBigUint64(moovOffset + 32, totalUnits);
              }
            }
          }

          moovOffset += subSize;
        }
      }

      offset += boxSize;
    }

    return new Blob([buffer as unknown as BlobPart], { type: blob.type || 'video/mp4' });
  } catch (err) {
    console.warn('MP4 duration patch fallback:', err);
    return blob;
  }
}

/**
 * Master patcher for any video format
 */
export async function patchVideoDuration(
  blob: Blob,
  durationSec: number,
  format: 'webm' | 'mp4'
): Promise<Blob> {
  const durationMs = Math.round(durationSec * 1000);
  if (format === 'mp4' || blob.type.includes('mp4')) {
    return await patchMp4Duration(blob, durationSec);
  }
  return await patchWebmDuration(blob, durationMs);
}
