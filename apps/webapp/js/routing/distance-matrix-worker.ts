import { DistanceMatrixWorkerKernel } from "./distance-matrix-worker-kernel";
import type {
  DistanceMatrixWorkerRequest,
  DistanceMatrixWorkerResponse,
} from "./distance-matrix-worker-protocol";
import { parseDistanceMatrixWorkerRequest } from "./distance-matrix-worker-protocol";

interface WorkerScope {
  onmessage:
    | ((event: MessageEvent<DistanceMatrixWorkerRequest>) => void)
    | null;
  postMessage(message: DistanceMatrixWorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const kernel = new DistanceMatrixWorkerKernel((message) =>
  scope.postMessage(message),
);

scope.onmessage = (event) => {
  const request = parseDistanceMatrixWorkerRequest(event.data);
  if (!request) return;
  if (request?.type === "cancel") {
    kernel.cancel(request.jobId);
    return;
  }
  if (request?.type === "start") {
    kernel.start(request.jobId, request.input);
  }
};
