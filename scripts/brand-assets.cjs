// Export the supplied PayBon logo at Chrome's required icon sizes.
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'extension-logo.png');

(async () => {
  for (const size of [16, 32, 48, 128]) {
    await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(root, 'extension', `icon-${size}.png`));
  }
  console.log('PayBon toolbar and sidebar icons exported from assets/extension-logo.png.');
})().catch(error => { console.error(error); process.exitCode = 1; });
