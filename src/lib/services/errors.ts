/**
 * Shared error class for publish-related operations.
 * Lives in its own module to avoid circular deps between page-service and publish-pipeline.
 */
export class PublishError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PublishError";
  }
}
