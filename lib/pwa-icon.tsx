import { ImageResponse } from 'next/og';

export function createPwaIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
          borderRadius: size * 0.22,
        }}
      >
        <div
          style={{
            fontSize: size * 0.48,
            fontWeight: 900,
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            letterSpacing: '-0.04em',
            marginTop: size * 0.02,
          }}
        >
          A
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
