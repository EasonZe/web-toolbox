export type CacheContext = {
    waitUntil(promise: Promise<unknown>): void;
};
export type CacheState = "memory" | "edge" | "shared" | "miss";
export class ParserBusyError extends Error {
    status: number;
    code: string;
}
export function withAbortTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal): Promise<T>;
export function mediaCacheSeconds(url: string, maximum?: number, now?: number): number;
export function createVideoCache(origin: string, options?: {
    maxEntries?: number;
    maxPending?: number;
}): {
    remove(key: string): Promise<void>;
    resolve<T>(key: string, load: () => Promise<T>, ttl: number | ((value: T) => number), context?: CacheContext, options?: {
        force?: boolean;
        validate?: (value: unknown) => boolean;
    }): Promise<{
        value: T;
        state: CacheState;
    }>;
};
export function createParserTiming(): {
    cache(name: string, state: CacheState): void;
    wasCached(name: string): boolean;
    measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
    headers(): Record<string, string>;
};
