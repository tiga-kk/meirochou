export interface CancelableRequest<T> {
  readonly result: Promise<T>;
  cancel(): void;
}
