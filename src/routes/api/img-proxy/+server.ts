import type { RequestHandler } from '@sveltejs/kit';

const ALLOWED_PREFIX = 'https://games-phoenix-assets-prd.s3.us-east-1.amazonaws.com/images/connections/';

export const GET: RequestHandler = async ({ url }) => {
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl?.startsWith(ALLOWED_PREFIX)) {
    return new Response('Forbidden', { status: 400 });
  }

  try {
    const upstream = await fetch(imageUrl);

    if (!upstream.ok) {
      return new Response('Bad gateway', { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Failed to fetch image', { status: 502 });
  }
};