// Ad-hoc sign the Mac app before it is packed into the DMG. Without any signature,
// macOS on Apple Silicon reports downloaded apps as "damaged". With an ad-hoc
// signature it shows the normal "unidentified developer" prompt instead (right-click → Open).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
