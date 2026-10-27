/**
 * The avatar's voice level, 0..1, written by the realtime chat each frame while audio plays and
 * read by anything that reacts to it (the hero name). A plain shared object: no React state, so
 * nothing re-renders at audio rate. `html[data-voice]` carries the chat status for CSS and for
 * starting and stopping readers.
 */
export const voice = { level: 0 };
