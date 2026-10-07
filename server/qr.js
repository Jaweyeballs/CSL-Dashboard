import QRCode from 'qrcode';

export async function qrSvg(
  text,
  { size = 512, dark = '#071018', light = '#f4f7fb', margin = 2 } = {}
) {
  if (!text) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <rect width="100" height="100" rx="6" fill="${light}"/>
  <text x="50" y="52" text-anchor="middle" fill="${dark}" font-size="7" font-family="Segoe UI, sans-serif">No Jam link</text>
</svg>`;
  }

  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin,
    width: size,
    color: { dark, light },
  });
}
