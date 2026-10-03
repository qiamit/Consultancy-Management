/** Supabase Edge Function globals — import once per function entry file. */
export {}

declare global {
  const Deno: {
    serve(handler: (req: Request) => Response | Promise<Response>): void
    env: { get(key: string): string | undefined }
  }
}
