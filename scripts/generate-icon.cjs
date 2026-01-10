const fs = require('fs');
const path = require('path');
const pngToIcoPkg = require('png-to-ico');
const pngToIco = pngToIcoPkg.default ?? pngToIcoPkg;

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const inputPng = path.join(projectRoot, 'assets', 'logo.png');
  const outputIco = path.join(projectRoot, 'assets', 'icon.ico');

  if (!fs.existsSync(inputPng)) {
    throw new Error(`Missing input image: ${inputPng}`);
  }

  // Keep this script dependency-light: convert the existing logo PNG directly.
  // If the PNG is large enough (>=256x256), electron-builder will accept it.
  const logoPng = fs.readFileSync(inputPng);
  let icoBuffer;
  try {
    icoBuffer = await pngToIco(logoPng);
  } catch {
    icoBuffer = await pngToIco([logoPng]);
  }
  fs.writeFileSync(outputIco, icoBuffer);

  console.log(`Wrote ${outputIco} (${icoBuffer.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
