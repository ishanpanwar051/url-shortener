import React from 'react';
import { getQRUrl } from '../api/urls';

interface QRCodeSVGProps {
  url: string;
  shortCode: string;
  size?: number;
}

export function QRCodeSVG({ url, shortCode, size = 200 }: QRCodeSVGProps) {
  const qrUrl = getQRUrl(shortCode);

  return (
    <div>
      <img
        src={qrUrl}
        alt={`QR Code for ${url}`}
        width={size}
        height={size}
        style={{ borderRadius: '8px' }}
      />
    </div>
  );
}
