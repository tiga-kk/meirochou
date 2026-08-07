import type { EventRegistry } from "../domain/event-day-contracts";

export interface EventRegistryLoader {
  load(): Promise<EventRegistry>;
}

/** Loads the registry through an injected infrastructure adapter. */
export class LoadEventRegistryUseCase {
  constructor(private readonly loader: EventRegistryLoader) {}
  execute(): Promise<EventRegistry> {
    return this.loader.load();
  }
}
