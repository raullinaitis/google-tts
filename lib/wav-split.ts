// Slice a WAV blob into N segments client-side.
// Input: WAV blob (any sample rate / bit depth, mono or stereo — we re-use source format).
// Output: WAV blobs for each segment defined by [startSec, endSec] pairs.

type WavInfo = {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  blockAlign: number;
};

function parseWavHeader(buf: ArrayBuffer): WavInfo {
  const view = new DataView(buf);
  const readStr = (offset: number, len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };

  if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") {
    throw new Error("Not a WAV file");
  }

  // Walk chunks to find "fmt " and "data" (they're not always at fixed offsets).
  let offset = 12;
  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset < view.byteLength - 8) {
    const id = readStr(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") fmtOffset = offset + 8;
    else if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }

  if (fmtOffset < 0 || dataOffset < 0) throw new Error("Malformed WAV (missing fmt/data)");

  const numChannels = view.getUint16(fmtOffset + 2, true);
  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);
  const blockAlign = (numChannels * bitsPerSample) / 8;

  return { sampleRate, numChannels, bitsPerSample, dataOffset, dataSize, blockAlign };
}

function buildWav(info: WavInfo, pcm: Uint8Array): Blob {
  const { sampleRate, numChannels, bitsPerSample, blockAlign } = info;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer).set(pcm, 44);

  return new Blob([buffer], { type: "audio/wav" });
}

export async function sliceWav(
  source: Blob,
  ranges: { startSec: number; endSec: number }[],
): Promise<Blob[]> {
  const buf = await source.arrayBuffer();
  const info = parseWavHeader(buf);
  const pcm = new Uint8Array(buf, info.dataOffset, info.dataSize);
  const totalSamples = info.dataSize / info.blockAlign;
  const totalSec = totalSamples / info.sampleRate;

  return ranges.map(({ startSec, endSec }) => {
    const s = Math.max(0, Math.min(totalSec, startSec));
    const e = Math.max(s, Math.min(totalSec, endSec));
    const startByte = Math.floor(s * info.sampleRate) * info.blockAlign;
    const endByte = Math.floor(e * info.sampleRate) * info.blockAlign;
    const slice = pcm.slice(startByte, endByte);
    return buildWav(info, slice);
  });
}

export async function getWavDuration(source: Blob): Promise<number> {
  const buf = await source.arrayBuffer();
  const info = parseWavHeader(buf);
  return info.dataSize / info.blockAlign / info.sampleRate;
}
