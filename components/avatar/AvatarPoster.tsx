/**
 * A still of the avatar, rendered from the hero camera by ?capture=1 (public/avatar-poster.webp).
 * It is in the server HTML, so the avatar is on screen with the first paint; the live 3D avatar
 * dissolves in over it once loaded. Where WebGL is missing it simply stays, and on CPU-drawn
 * WebGL it stays until the visitor first reaches for the hero (TalkingAvatar).
 *
 * Framed like the canvas: a vertical field of view centred on the avatar, so full height, centred.
 */
export function AvatarPoster({ fading = false }: { fading?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/avatar-poster.webp"
      alt=""
      aria-hidden
      width={900}
      height={1800}
      fetchPriority="high"
      className="pointer-events-none absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2 select-none transition-opacity duration-500 motion-reduce:transition-none"
      style={{ opacity: fading ? 0 : 1 }}
    />
  );
}
