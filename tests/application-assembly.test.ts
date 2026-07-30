import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  constructors: 0,
  workerFactories: [] as Array<(() => Worker) | undefined>,
}));

vi.mock("../apps/webapp/js/app.js", () => ({
  App: class {
    constructor(options: { alnsWorkerFactory?: () => Worker }) {
      mockState.constructors += 1;
      mockState.workerFactories.push(options.alnsWorkerFactory);
    }
    async start() {
      mockState.workerFactories[0]?.();
    }
    dispose() {}
  },
}));

import { assembleComiPathApplication } from "../apps/webapp/js/app/assemble-comipath-application";

describe("application assembly", () => {
  it("creates the legacy application and worker factory once", async () => {
    const createAlnsWorker = vi.fn(() => ({}) as Worker);
    const app = assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      createAlnsWorker,
    });
    expect(app).toMatchObject({
      start: expect.any(Function),
      stop: expect.any(Function),
    });
    await Promise.all([app.start(), app.start()]);
    expect(mockState.constructors).toBe(1);
    expect(mockState.workerFactories).toHaveLength(1);
    expect(createAlnsWorker).toHaveBeenCalledOnce();
  });
});
