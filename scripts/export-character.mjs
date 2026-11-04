// Local Aseprite RGBA exporter for the supplied Sunnyside character.
// Format: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
import fs from 'node:fs';
import zlib from 'node:zlib';
const file = fs.readFileSync('assets-source/sunnyside_world_chatacter_anim_human_v1.0.aseprite');
const u16 = (p) => file.readUInt16LE(p);
const u32 = (p) => file.readUInt32LE(p);
const string = (p) => file.toString('utf8', p + 2, p + 2 + u16(p));
if (u16(4) !== 0xa5e0 || u16(12) !== 32) throw new Error('Expected RGBA Aseprite');
const width = u16(8), height = u16(10), frames = [], layers = [], tags = [];
let offset = 128;
for (let f = 0; f < u16(6); f++) {
  const end = offset + u32(offset);
  const count = u32(offset + 12) || u16(offset + 6);
  const frame = { duration: u16(offset + 8), cels: [] };
  let p = offset + 16;
  for (let c = 0; c < count; c++) {
    const size = u32(p), type = u16(p + 4), d = p + 6;
    if (type === 0x2004) layers.push({ flags: u16(d), type: u16(d + 2), level: u16(d + 4), blend: u16(d + 10), opacity: file[d + 12], name: string(d + 16) });
    if (type === 0x2005) {
      const cel = { layer: u16(d), x: file.readInt16LE(d + 2), y: file.readInt16LE(d + 4), opacity: file[d + 6], type: u16(d + 7) };
      if (cel.type === 1) cel.link = u16(d + 16);
      else if (cel.type === 0 || cel.type === 2) {
        cel.w = u16(d + 16); cel.h = u16(d + 18);
        const bytes = file.subarray(d + 20, p + size);
        cel.pixels = cel.type === 2 ? zlib.inflateSync(bytes) : bytes;
        if (cel.pixels.length !== cel.w * cel.h * 4) throw new Error('Invalid cel length');
      } else throw new Error(`Unsupported cel ${cel.type}`);
      frame.cels.push(cel);
    }
    if (type === 0x2018) {
      let t = d + 10;
      for (let i = 0; i < u16(d); i++) {
        tags.push({ from: u16(t), to: u16(t + 2), direction: file[t + 4], name: string(t + 17) });
        t += 19 + u16(t + 17);
      }
    }
    p += size;
  }
  frames.push(frame); offset = end;
}
if (process.argv.includes('--inspect')) { console.log(JSON.stringify({ width, height, frames: frames.length, layers, tags }, null, 2)); process.exit(0); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE(crc32(body), result.length - 4);
  return result;
}
function png(w, h, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  const scan = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(scan, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}
function pixelsFor(cel) {
  if (cel.type !== 1) return cel;
  const linked = frames[cel.link].cels.find(c => c.layer === cel.layer);
  if (!linked) throw new Error('Broken linked cel');
  return pixelsFor(linked);
}
const selectedTags = tags.filter(t => /idle|walk/i.test(t.name));
if (!selectedTags.length) throw new Error('No movement tags');
const indices = [...new Set(selectedTags.flatMap(t => Array.from({length:t.to-t.from+1},(_,i)=>i+t.from)))];
const columns = 8;
const sheetW = columns * width, sheetH = Math.ceil(indices.length / columns) * height;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (const [index, f] of indices.entries()) {
  for (const cel of frames[f].cels) {
    const layer = layers[cel.layer];
    if (!(layer.flags & 1) || layer.type !== 0 || ['bg', 'guide'].includes(layer.name)) continue;
    if (layer.blend !== 0) throw new Error(`Unsupported blend: ${layer.name}`);
    const source = pixelsFor(cel);
    for (let y=0; y<source.h; y++) for(let x=0; x<source.w; x++) {
      const cx=cel.x+x, cy=cel.y+y;
      if(cx<0 || cy<0 || cx>=width || cy>=height) continue;
      const s=(y*source.w+x)*4;
      const a=source.pixels[s+3]/255*cel.opacity/255*layer.opacity/255;
      if(!a) continue;
      const d=(((Math.floor(index/columns)*height+cy)*sheetW)+(index%columns)*width+cx)*4;
      const da=sheet[d+3]/255, out=a+da*(1-a);
      for(let k=0;k<3;k++) sheet[d+k]=Math.round((source.pixels[s+k]*a+sheet[d+k]*da*(1-a))/out);
      sheet[d+3]=Math.round(out*255);
    }
  }
}
fs.mkdirSync('public/assets/sunnyside', { recursive:true });
fs.writeFileSync('public/assets/sunnyside/character.png', png(sheetW,sheetH,sheet));
fs.writeFileSync('public/assets/sunnyside/character.json', JSON.stringify({width,height,tags:selectedTags.map(t=>({...t,frames:Array.from({length:t.to-t.from+1},(_,i)=>({frame:indices.indexOf(t.from+i),duration:frames[t.from+i].duration}))}))},null,2));
console.log(`Exported ${indices.length} movement frames from ${selectedTags.length} tags.`);
