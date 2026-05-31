/**
 * SSE proxy: forwards events from the Python API to the browser.
 *
 * This route exists so the dashboard can connect to a same-origin SSE
 * endpoint regardless of where the Python API is running.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let pyResponse: Response | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        pyResponse = await fetch(`${API_URL}/api/events`, {
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
        });

        if (!pyResponse.ok || !pyResponse.body) {
          // Send error event and close
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Backend unavailable' })}\n\n`,
            ),
          );
          controller.close();
          return;
        }

        reader = pyResponse.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        // Send keepalive and close gracefully
        controller.enqueue(encoder.encode(': connection error\n\n'));
      } finally {
        reader?.cancel().catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
