import type { MetadataRoute } from 'next';

/** The league mark and launch metadata used by browser install prompts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tony's Football",
    short_name: "Tony's Football",
    description: 'A private clubhouse that remembers.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5eddc',
    theme_color: '#1a1214',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
