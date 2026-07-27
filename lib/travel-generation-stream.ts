import type { CashRequestRecord } from './travel-types';

export type TravelGenerationStreamEvent =
  | { type: 'step-start'; stepId: string }
  | { type: 'step-complete'; stepId: string }
  | { type: 'done'; record: CashRequestRecord }
  | { type: 'error'; message: string };

export async function readTravelGenerationStream(
  response: Response,
  onEvent: (event: TravelGenerationStreamEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('Flux de génération indisponible');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .map((part) => part.trim())
        .find((part) => part.startsWith('data: '));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(6)) as TravelGenerationStreamEvent);
    }
  }
}
