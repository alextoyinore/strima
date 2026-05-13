import { Jimp } from 'jimp';
import pngToIco from 'png-to-ico';
import fs from 'fs';

async function processImage() {
  console.log('Loading image...');
  const image = await Jimp.read('C:\\Users\\xtrades\\.gemini\\antigravity\\brain\\e9c71f2c-4e9e-44c0-baf2-33f91ba9443e\\app_icon_1778650933661.png');
  
  console.log('Processing transparency...');
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    // Simple chroma keying for white background
    const avg = (r + g + b) / 3;
    if (avg > 230) {
      const alpha = Math.max(0, 255 - ((avg - 230) * (255 / 25)));
      this.bitmap.data[idx + 3] = alpha;
    }
  });

  console.log('Saving PNG...');
  await image.write('assets/icon.png');
  
  console.log('Converting to ICO...');
  const buf = await pngToIco('assets/icon.png');
  fs.writeFileSync('assets/icon.ico', buf);
  
  console.log('Done!');
}

processImage().catch(console.error);
