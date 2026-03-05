
/**
 * Tries to fetch an image and convert it to a Base64 string.
 * For Ferragamo, we skip mirroring because their CDN is strictly protected by Referrer policies.
 * The UI uses no-referrer policy to display these images directly.
 */
export const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url || url.includes('placeholder') || url.includes('data:image')) {
    return `https://placehold.co/600x600/002D72/white?text=Image+Non+Disponible`;
  }

  // Si c'est du Ferragamo, on ne tente pas de proxy, l'URL directe est la plus fiable
  // une fois affichée avec no-referrer dans le navigateur de l'utilisateur.
  if (url.includes('ferragamo.com')) {
    return url;
  }

  const cleanUrl = url.split('?')[0].replace(/^https?:\/\//, '');

  const proxies = [
    `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=80`,
    `https://i0.wp.com/${cleanUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  const attemptFetch = async (targetUrl: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Proxy error');
    const blob = await response.blob();
    return blob;
  };

  const toBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  for (const proxy of proxies) {
    try {
      const blob = await attemptFetch(proxy);
      return await toBase64(blob);
    } catch (e) {
      continue;
    }
  }

  return url;
};
