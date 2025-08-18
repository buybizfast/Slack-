# Descript Proxy

A Next.js 15 API proxy for extracting transcripts from Descript share URLs. Built with TypeScript, Tailwind v4, and edge runtime for optimal performance.

## API Endpoints

### GET /api/transcript?u=<DescriptShareUrl>[&expand=true]
### POST /api/transcript { "url": "<DescriptShareUrl>", "expand": true }

**Response Format:**
- **200 Success:** `{ ok: true, transcriptUrl, [transcript] }`
- **4xx/5xx Error:** `{ ok: false, error }`

**Parameters:**
- `u` (GET) / `url` (POST): Valid Descript share URL (e.g., `https://share.descript.com/view/ABC123`)
- `expand` (optional): When `true`, returns the full transcript JSON along with the transcript URL

### GET /api/health
Simple health check endpoint that returns `{ ok: true }`

## Make.com Integration

For quick Make.com wiring (map once and forget):

**HTTP Module Setup:**
- **URL:** `GET https://<your-deploy>/api/transcript?u={{1.descriptUrl}}`
- **Result:** `{ transcriptUrl }`

**For JSON in one hop:** Add `&expand=true` and map the `transcript` field.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
