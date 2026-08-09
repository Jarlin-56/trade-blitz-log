// Script to convert icon-512.png to ICO manually
const sharp = require('sharp');
const fs = require('fs');

async function createIco() {
  // Generate 256x256 PNG buffer
  const pngBuf = await sharp('public/icon-512.png')
    .resize(256, 256)
    .png()
    .toBuffer();

  // Save clean PNG for electron-builder to use
  fs.writeFileSync('public/icon-256.png', pngBuf);
  console.log('Clean 256x256 PNG saved.');

  // Build ICO file manually (single 256x256 PNG entry)
  // ICO format: header (6 bytes) + directory entry (16 bytes) + PNG data
  const headerSize = 6;
  const dirEntrySize = 16;
  const dataOffset = headerSize + dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type: 1 = ICO
  header.writeUInt16LE(1, 4);      // Number of images

  const dirEntry = Buffer.alloc(dirEntrySize);
  dirEntry.writeUInt8(0, 0);       // Width: 0 = 256
  dirEntry.writeUInt8(0, 1);       // Height: 0 = 256
  dirEntry.writeUInt8(0, 2);       // Color palette
  dirEntry.writeUInt8(0, 3);       // Reserved
  dirEntry.writeUInt16LE(1, 4);    // Color planes
  dirEntry.writeUInt16LE(32, 6);   // Bits per pixel
  dirEntry.writeUInt32LE(pngBuf.length, 8);  // Size of image data
  dirEntry.writeUInt32LE(dataOffset, 12);    // Offset to image data

  const ico = Buffer.concat([header, dirEntry, pngBuf]);
  fs.writeFileSync('public/icon.ico', ico);
  fs.copyFileSync('public/icon.ico', 'public/favicon.ico');
  console.log('ICO and favicon.ico created successfully!');
}

createIco().catch(console.error);
