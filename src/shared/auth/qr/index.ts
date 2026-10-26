import { qrcodegen } from "./qrcodegen";

export function generateQrSvg(
  text: string,
  border = 4,
  lightColor = "#ffffff",
  darkColor = "#000000",
): string {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        parts.push(`M${x + border},${y + border}h1v1h-1z`);
      }
    }
  }

  const dim = qr.size + border * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" stroke="none"><rect width="100%" height="100%" fill="${lightColor}"/><path d="${parts.join(" ")}" fill="${darkColor}"/></svg>`;
}
