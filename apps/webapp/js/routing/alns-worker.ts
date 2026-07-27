import { TimeDecayedAlnsWorkerKernel } from "./alns-worker-kernel";
import type {
  TimeDecayedAlnsWorkerRequest,
  TimeDecayedAlnsWorkerResponse,
} from "./alns-worker-protocol";
import { parseTimeDecayedAlnsWorkerRequest } from "./alns-worker-protocol";

interface WorkerScope {
  onmessage:
    | ((event: MessageEvent<TimeDecayedAlnsWorkerRequest>) => void)
    | null;
  postMessage(message: TimeDecayedAlnsWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const kernel = new TimeDecayedAlnsWorkerKernel((message) =>
  scope.postMessage(message),
);

scope.onmessage = (event) => {
  const request = parseTimeDecayedAlnsWorkerRequest(event.data);
  if (!request) return;
  if (request.type === "cancel") {
    kernel.cancel(request.jobId);
    return;
  }
  void kernel.start(request.jobId, request.problem);
};
