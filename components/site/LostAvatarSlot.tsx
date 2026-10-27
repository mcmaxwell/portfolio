"use client";

import dynamic from "next/dynamic";

// Browser-only (WebGL), and kept out of the 404's first paint.
export const LostAvatarSlot = dynamic(() => import("./LostAvatar").then((m) => m.LostAvatar), { ssr: false });
