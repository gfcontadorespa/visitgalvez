import QRCode from 'qrcode';

// Genera un PNG (Buffer) de un QR de Telegram.
// El deep-link apunta a t.me/bot?start=visita_XXXX
export async function generateQrDeepLink(
  botUsername: string,
  confirmCode: string
): Promise<string> {
  const username = botUsername.replace('@', '');
  return `https://t.me/${username}?start=visita_${confirmCode}`;
}

export async function qrPngBuffer(payload: string): Promise<Buffer> {
  return await QRCode.toBuffer(payload, {
    type: 'png',
    width: 480,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
