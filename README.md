# fal.ai Style Transfer Demo

A Next.js application that demonstrates style transfer using fal.ai's Flux Kontext Dev LoRA model.

## Features

- Upload an image or select from examples
- Apply predefined styles (currently featuring Broccoli Hair style)
- Support for custom LoRA URLs
- Real-time image processing with fal.ai
- Clean, modern UI with fal.ai branding
- "Apply Another Style" feature to chain transformations

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the root directory:
   ```
   FAL_KEY=your_fal_api_key_here
   ```
   
   Get your API key from [fal.ai dashboard](https://fal.ai/dashboard/keys)

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- Next.js 15
- TypeScript
- ShadCN
- Tailwind CSS
- tRPC
- React Query
- fal.ai API

## Usage

1. Upload an image by clicking the upload area or dragging and dropping
2. Select a style or use a custom LoRA URL
3. Click "Generate" to apply the style
4. Use "Apply Another Style" to use the result as input for another transformation

## License

MIT 