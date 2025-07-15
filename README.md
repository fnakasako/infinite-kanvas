# Infinite Kanvas - AI Image Editor Infinite Canvas (Powered by Flux Kontext Dev)

![Infinite Kanvas](./public/og-img-compress.png)

An interactive canvas application that leverages fal.ai's powerful AI models for real-time image manipulation and style transfer. Built with Next.js, React Konva, and tRPC.

## What is this?

Infinite Canvas is a web-based image editor that combines traditional canvas manipulation tools with cutting-edge AI capabilities. Users can drag images onto an infinite canvas, position them freely, and apply various AI transformations including style transfer, background removal, and object isolation.

## Key Features

- **Infinite Canvas**: Pan, zoom, and navigate through an unlimited workspace
- **Drag & Drop**: Import images via drag-and-drop or file upload
- **AI Style Transfer**: Apply predefined styles (Simpsons, Anime, Oil Painting, etc.) or custom LoRA models
- **Background Removal**: Remove backgrounds from images using AI
- **Object Isolation**: Extract specific objects from images using natural language descriptions
- **Real-time Streaming**: Watch AI transformations happen in real-time
- **Multi-selection**: Select and transform multiple images at once
- **Image Manipulation**: Crop, combine, duplicate, and arrange images
- **Persistent Storage**: Automatically saves your work to IndexedDB
- **Undo/Redo**: Full history support for all operations
- **Mobile Support**: Touch gestures for panning and zooming

## Technical Architecture

### Frontend Canvas Engine

The application uses React Konva (a React wrapper for Konva.js) to provide a performant 2D canvas. Key implementation details:

- **Virtual Viewport**: Only renders visible images for performance optimization
- **Custom Image Component**: Handles selection, dragging, and transformations
- **Streaming Updates**: Images update in real-time as AI processes them
- **Gesture Support**: Touch events for mobile, mouse events for desktop, with middle-click panning

### fal.ai Integration

The app integrates with fal.ai's API in several clever ways:

#### 1. Proxy Architecture

To bypass Vercel's 4.5MB request body limit, we implement a proxy pattern:

```typescript
// Client uploads through proxy
const uploadResult = await falClient.storage.upload(blob);

// Proxy endpoint at /api/fal handles the request
export const POST = route.POST; // fal.ai's Next.js proxy
```

This allows users to upload large images that would otherwise be rejected by Vercel's edge runtime.

#### 2. Rate Limiting

The application implements a three-tier rate limiting system for users without API keys:

```typescript
const limiter = {
  perMinute: createRateLimiter(10, "60 s"), // 10 requests per minute
  perHour: createRateLimiter(30, "60 m"), // 30 requests per hour
  perDay: createRateLimiter(100, "24 h"), // 100 requests per day
};
```

Users can bypass rate limits by adding their own fal.ai API key, which switches them to their own quota.

#### 3. Real-time Streaming

Image generation uses fal.ai's streaming API to provide live updates:

```typescript
// Server-side streaming with tRPC
const stream = await falClient.stream("fal-ai/flux-kontext-lora", {
  input: { image_url, prompt, loras },
});

for await (const event of stream) {
  yield tracked(eventId, { type: "progress", data: event });
}
```

The client receives these updates via a tRPC subscription and updates the canvas in real-time, creating a smooth user experience where images gradually appear as they're being generated.

### State Management

The application uses a combination of React state and IndexedDB for persistence:

- **Canvas State**: Images, positions, and transformations stored in React state
- **History**: Undo/redo stack maintained in memory
- **Persistence**: Auto-saves to IndexedDB with debouncing
- **Image Storage**: Original image data stored separately in IndexedDB to handle large files

### API Architecture

Built with tRPC for type-safe API calls:

- `removeBackground`: Uses fal.ai's Bria background removal model
- `isolateObject`: Leverages EVF-SAM for semantic object segmentation
- `generateTextToImage`: Text-to-image generation with Flux
- `generateImageStream`: Streaming image-to-image transformations

## How AI Features Work

### Style Transfer

Uses fal.ai's Flux Kontext LoRA model to apply artistic styles:

1. User selects an image and a style (or provides custom LoRA URL)
2. Image is uploaded to fal.ai storage via proxy
3. Streaming transformation begins, updating canvas in real-time
4. Final high-quality result replaces the preview

### Object Isolation

Powered by EVF-SAM (Enhanced Visual Foundation Segment Anything Model):

1. User describes object in natural language (e.g., "the red car")
2. EVF-SAM generates a segmentation mask
3. Server applies mask to original image using Sharp
4. Isolated object with transparent background returned to canvas

### Background Removal

Uses Bria's specialized background removal model:

1. Automatic subject detection
2. Clean edge preservation
3. Transparent PNG output

## Performance Optimizations

- **Viewport Culling**: Only renders visible images
- **Streaming Images**: Custom hook prevents flickering during updates
- **Debounced Saving**: Reduces IndexedDB writes
- **Image Resizing**: Automatically resizes large images before upload
- **Lazy Loading**: Default images load asynchronously

## Development

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Add your fal.ai API key to `.env.local`:

   ```
   FAL_KEY=your_fal_api_key_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Optional
   KV_REST_API_URL=
   ```

KV_REST_API_TOKEN=

```

4. Run development server: `npm run dev`

### Tech Stack

- **Next.js 15**: React framework with App Router
- **React Konva**: Canvas rendering engine
- **tRPC**: Type-safe API layer
- **fal.ai SDK**: AI model integration
- **Tailwind CSS**: Styling
- **IndexedDB**: Client-side storage
- **Sharp**: Server-side image processing

## Deployment

The app is optimized for Vercel deployment:

- Uses edge-compatible APIs
- Implements request proxying for large files
- Automatic image optimization disabled for canvas compatibility
- Bot protection via BotId integration

## License

MIT
```
