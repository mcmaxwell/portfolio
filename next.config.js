/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
    experimental: {
        serverActions: true,
    },
    compiler: {
        // Enables the styled-components SWC transform
        styledComponents: true,
    },
}

module.exports = nextConfig
