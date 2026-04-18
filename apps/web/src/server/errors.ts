/**
 * Wraps a Next.js Response object in a real Error so that
 * `throw new ResponseError(...)` satisfies the `@typescript-eslint/only-throw-error` rule.
 *
 * Route handlers should catch it and return `err.response`:
 *   ```
 *   } catch (err) {
 *     if (err instanceof ResponseError) return err.response;
 *     ...
 *   }
 *   ```
 */
export class ResponseError extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super('HTTP error response');
    this.name = 'ResponseError';
    this.response = response;
  }
}
